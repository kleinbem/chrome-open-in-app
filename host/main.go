package main

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

type Request struct {
	Action       string `json:"action,omitempty"`
	URL          string `json:"url,omitempty"`
	AppID        string `json:"appId,omitempty"`
	UserDataDir  string `json:"userDataDir,omitempty"`
	ProfileDir   string `json:"profileDir,omitempty"`
	PreferAppURL bool   `json:"preferAppUrl,omitempty"`
}

type PWAInfo struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Icon           string   `json:"icon,omitempty"`
	StartupWMClass string   `json:"startupWmClass,omitempty"`
	Domains        []string `json:"domains,omitempty"`
	DesktopFile    string   `json:"desktopFile,omitempty"`
	UserDataDir    string   `json:"userDataDir,omitempty"`
	ProfileDir     string   `json:"profileDir,omitempty"`
}

type Response struct {
	Success  bool      `json:"success"`
	Action   string    `json:"action,omitempty"`
	Apps     []PWAInfo `json:"apps,omitempty"`
	Launched string    `json:"launched,omitempty"`
	AppID    string    `json:"appId,omitempty"`
	IsPWA    bool      `json:"isPwa"`
	Error    string    `json:"error,omitempty"`
}

var (
	appIDRegex    = regexp.MustCompile(`--app-id=([a-z0-9]+)`)
	nameRegex     = regexp.MustCompile(`(?m)^Name=(.*)$`)
	iconRegex     = regexp.MustCompile(`(?m)^Icon=(.*)$`)
	wmClassRegex  = regexp.MustCompile(`(?m)^StartupWMClass=(.*)$`)
	shortcutRegex = regexp.MustCompile(`--app-launch-url-for-shortcuts-menu-item=(https?://[^ \n"']+)`)
	urlRegex      = regexp.MustCompile(`https?://[a-zA-Z0-9\.\-]+[^\s"']*`)
	userDataRegex = regexp.MustCompile(`--user-data-dir=([^ \x00\t\r\n"']+)`)
	profileRegex  = regexp.MustCompile(`--profile-directory=([^ \x00\t\r\n"']+)`)
	leveldbAppRe  = regexp.MustCompile(`web_apps-dt-([a-p0-9]{32})`)
	leveldbURLRe  = regexp.MustCompile(`https?://[a-zA-Z0-9\.\-_]+(/[^\s"'\x00-\x1f\x7f-\xff<>]*)?`)
)

func logFile() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	dir := filepath.Join(home, ".local", "share")
	_ = os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "chrome-open-in-app.log")
}

func logDebug(format string, a ...interface{}) {
	if os.Getenv("OPEN_IN_APP_DEBUG") != "1" {
		return
	}
	lf := logFile()
	if lf == "" {
		return
	}
	if fi, err := os.Stat(lf); err == nil && fi.Size() > 1024*1024 {
		_ = os.Truncate(lf, 0)
	}
	f, err := os.OpenFile(lf, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	msg := fmt.Sprintf(format, a...)
	_, _ = fmt.Fprintln(f, msg)
}

func readMessage(r io.Reader) (*Request, error) {
	var length uint32
	if err := binary.Read(r, binary.LittleEndian, &length); err != nil {
		return nil, err
	}
	if length == 0 {
		return nil, fmt.Errorf("empty message length")
	}

	buf := make([]byte, length)
	if _, err := io.ReadFull(r, buf); err != nil {
		return nil, fmt.Errorf("reading message body: %w", err)
	}

	var req Request
	if err := json.Unmarshal(buf, &req); err != nil {
		return nil, fmt.Errorf("unmarshaling request: %w", err)
	}
	return &req, nil
}

func sendMessage(w io.Writer, resp Response) error {
	data, err := json.Marshal(resp)
	if err != nil {
		return err
	}
	length := uint32(len(data))
	if err := binary.Write(w, binary.LittleEndian, length); err != nil {
		return err
	}
	_, err = w.Write(data)
	return err
}

func detectChromeContext() (string, string) {
	userDataDir := ""
	profileDir := "Default"
	currentPID := os.Getppid()

	for step := 0; step < 10 && currentPID > 1; step++ {
		cmdlinePath := fmt.Sprintf("/proc/%d/cmdline", currentPID)
		raw, err := os.ReadFile(cmdlinePath)
		if err != nil {
			break
		}
		cmdlineStr := string(raw)

		cmdlineLower := strings.ToLower(cmdlineStr)
		if strings.Contains(cmdlineLower, "chrome") ||
			strings.Contains(cmdlineLower, "chromium") ||
			strings.Contains(cmdlineLower, "brave") ||
			strings.Contains(cmdlineLower, "edge") ||
			strings.Contains(cmdlineLower, "msedge") ||
			strings.Contains(cmdlineLower, "vivaldi") ||
			strings.Contains(cmdlineLower, "opera") {
			if match := userDataRegex.FindStringSubmatch(cmdlineStr); len(match) > 1 {
				userDataDir = match[1]
			}
			if match := profileRegex.FindStringSubmatch(cmdlineStr); len(match) > 1 {
				profileDir = match[1]
			}
			if userDataDir != "" {
				return userDataDir, profileDir
			}
		}

		statusPath := fmt.Sprintf("/proc/%d/status", currentPID)
		statusRaw, err := os.ReadFile(statusPath)
		if err != nil {
			break
		}
		nextPID := 0
		for _, line := range strings.Split(string(statusRaw), "\n") {
			if strings.HasPrefix(line, "PPid:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					nextPID, _ = strconv.Atoi(fields[1])
				}
				break
			}
		}
		if nextPID <= 1 || nextPID == currentPID {
			break
		}
		currentPID = nextPID
	}

	return userDataDir, profileDir
}

// generateAppID computes Chromium's double-SHA256 App ID for a given start URL or manifest ID
func generateAppID(manifestIDOrURL string) string {
	h1 := sha256.Sum256([]byte(manifestIDOrURL))
	h2 := sha256.Sum256(h1[:])
	var sb strings.Builder
	sb.Grow(32)
	for i := 0; i < 16; i++ {
		b := h2[i]
		sb.WriteByte('a' + (b >> 4))
		sb.WriteByte('a' + (b & 0x0f))
	}
	return sb.String()
}

// testURLAppIDMatch mathematically verifies if rawURL (or its origin / path root) derives targetAid
func testURLAppIDMatch(rawURL, targetAid string) bool {
	if rawURL == "" || targetAid == "" {
		return false
	}
	if generateAppID(rawURL) == targetAid {
		return true
	}
	u, err := url.Parse(rawURL)
	if err != nil || u.Hostname() == "" {
		return false
	}
	if generateAppID(fmt.Sprintf("%s://%s/", u.Scheme, u.Hostname())) == targetAid {
		return true
	}
	if generateAppID(fmt.Sprintf("%s://%s", u.Scheme, u.Hostname())) == targetAid {
		return true
	}
	if u.Path != "" && u.Path != "/" {
		if generateAppID(fmt.Sprintf("%s://%s%s", u.Scheme, u.Hostname(), u.Path)) == targetAid {
			return true
		}
	}
	return false
}

// loadPWAAppIdToDomains dynamically extracts app ID -> domain mappings from browser Preferences, Sync LevelDB, and History
func loadPWAAppIdToDomains(desktopFiles []string) map[string][]string {
	appMap := make(map[string]map[string]bool)
	addDomain := func(appID, rawURL string) {
		if appID == "" || rawURL == "" {
			return
		}
		if u, err := url.Parse(rawURL); err == nil && u.Hostname() != "" {
			host := strings.ToLower(u.Hostname())
			if strings.Contains(host, "clients2.google.com") || strings.Contains(host, "gstatic.com") {
				return
			}
			if appMap[appID] == nil {
				appMap[appID] = make(map[string]bool)
			}
			appMap[appID][host] = true
			if strings.HasPrefix(host, "www.") {
				appMap[appID][strings.TrimPrefix(host, "www.")] = true
			}
		}
	}

	installedAppIDs := make(map[string]bool)
	for _, df := range desktopFiles {
		if c, err := os.ReadFile(df); err == nil {
			if m := appIDRegex.FindStringSubmatch(string(c)); len(m) > 1 {
				installedAppIDs[m[1]] = true
			}
		}
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return make(map[string][]string)
	}

	candidateDirs := []string{
		filepath.Join(home, ".config", "google-chrome"),
		filepath.Join(home, ".gemini", "antigravity-browser-profile"),
		filepath.Join(home, ".config", "google-chrome-beta"),
		filepath.Join(home, ".config", "chromium"),
		filepath.Join(home, ".config", "BraveSoftware", "Brave-Browser"),
		filepath.Join(home, ".config", "BraveSoftware", "Brave-Browser-Beta"),
		filepath.Join(home, ".config", "microsoft-edge"),
		filepath.Join(home, ".config", "microsoft-edge-beta"),
		filepath.Join(home, ".config", "microsoft-edge-dev"),
		filepath.Join(home, ".config", "vivaldi"),
		filepath.Join(home, ".config", "opera"),
	}

	userDataDir, _ := detectChromeContext()
	if userDataDir != "" {
		candidateDirs = append(candidateDirs, userDataDir)
	}

	for _, df := range desktopFiles {
		if c, err := os.ReadFile(df); err == nil {
			if m := userDataRegex.FindStringSubmatch(string(c)); len(m) > 1 {
				candidateDirs = append(candidateDirs, m[1])
			}
		}
	}

	seenDirs := make(map[string]bool)
	for _, baseDir := range candidateDirs {
		if baseDir == "" || seenDirs[baseDir] {
			continue
		}
		seenDirs[baseDir] = true

		// 1. Scan Preferences files across profiles (Default, Profile 1, etc.)
		prefFiles, _ := filepath.Glob(filepath.Join(baseDir, "*", "Preferences"))
		if singlePref := filepath.Join(baseDir, "Preferences"); len(prefFiles) == 0 {
			prefFiles = append(prefFiles, singlePref)
		}
		for _, pf := range prefFiles {
			data, err := os.ReadFile(pf)
			if err != nil {
				continue
			}
			var root struct {
				WebApps struct {
					DailyMetrics map[string]struct {
						Installed bool `json:"installed"`
					} `json:"daily_metrics"`
				} `json:"web_apps"`
			}
			if err := json.Unmarshal(data, &root); err == nil {
				for rawURL, metric := range root.WebApps.DailyMetrics {
					if metric.Installed {
						aid := generateAppID(rawURL)
						addDomain(aid, rawURL)
					}
				}
			}
		}

		// 2. Scan Sync Data LevelDB files (*.ldb and *.log)
		ldbFiles, _ := filepath.Glob(filepath.Join(baseDir, "*", "Sync Data", "LevelDB", "*.ldb"))
		logFiles, _ := filepath.Glob(filepath.Join(baseDir, "*", "Sync Data", "LevelDB", "*.log"))
		allDBFiles := append(ldbFiles, logFiles...)
		for _, dbf := range allDBFiles {
			content, err := os.ReadFile(dbf)
			if err != nil || len(content) == 0 {
				continue
			}

			// 2A. Scan with web_apps-dt- prefix
			matches := leveldbAppRe.FindAllSubmatchIndex(content, -1)
			for _, loc := range matches {
				if len(loc) >= 4 {
					aid := string(content[loc[2]:loc[3]])
					endIdx := loc[1] + 400
					if endIdx > len(content) {
						endIdx = len(content)
					}
					sub := content[loc[1]:endIdx]
					if urlMatch := leveldbURLRe.Find(sub); urlMatch != nil {
						addDomain(aid, string(urlMatch))
					}
				}
			}

			// 2B. Direct scan for known installed app IDs (which may not have web_apps-dt- prefix in sync records)
			for aid := range installedAppIDs {
				baid := []byte(aid)
				pos := 0
				for {
					idx := bytes.Index(content[pos:], baid)
					if idx == -1 {
						break
					}
					matchIdx := pos + idx
					endIdx := matchIdx + len(baid) + 250
					if endIdx > len(content) {
						endIdx = len(content)
					}
					window := content[matchIdx:endIdx]
					if cutoff := bytes.Index(window, []byte("sessions-dt-")); cutoff != -1 {
						window = window[:cutoff]
					}
					if cutoff2 := bytes.Index(window, []byte("bookmarks-dt-")); cutoff2 != -1 {
						window = window[:cutoff2]
					}

					urlMatches := leveldbURLRe.FindAllIndex(window, -1)
					for _, loc := range urlMatches {
						rawU := string(window[loc[0]:loc[1]])
						if testURLAppIDMatch(rawU, aid) || (loc[0] < 60 && len(appMap[aid]) == 0) {
							addDomain(aid, rawU)
						}
					}
					pos = matchIdx + len(baid)
				}
			}
		}

		// 3. Scan History database files for any installed apps still missing domains
		missingIDs := make(map[string]bool)
		for aid := range installedAppIDs {
			if len(appMap[aid]) == 0 {
				missingIDs[aid] = true
			}
		}
		if len(missingIDs) > 0 {
			historyFiles, _ := filepath.Glob(filepath.Join(baseDir, "*", "History"))
			for _, hf := range historyFiles {
				if hdata, err := os.ReadFile(hf); err == nil && len(hdata) > 0 {
					urls := leveldbURLRe.FindAll(hdata, -1)
					for _, uBytes := range urls {
						rawU := string(uBytes)
						if strings.Count(rawU, "/") <= 5 {
							calcID := generateAppID(rawU)
							if missingIDs[calcID] {
								addDomain(calcID, rawU)
								delete(missingIDs, calcID)
								if len(missingIDs) == 0 {
									break
								}
							}
						}
					}
				}
			}
		}
	}

	result := make(map[string][]string)
	for aid, doms := range appMap {
		for d := range doms {
			result[aid] = append(result[aid], d)
		}
	}
	return result
}

// listInstalledPWAs dynamically scans desktop launchers across browsers (Chrome, Brave, Chromium, Edge)
func listInstalledPWAs() []PWAInfo {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	appDir := filepath.Join(home, ".local", "share", "applications")

	// Support chrome-*, brave-*, chromium-*, and any PWA desktop launcher with app-id
	pattern := filepath.Join(appDir, "*-[a-z0-9]*-*.desktop")
	desktopFiles, err := filepath.Glob(pattern)
	if err != nil {
		return nil
	}

	appIdToDomains := loadPWAAppIdToDomains(desktopFiles)

	seenIDs := make(map[string]bool)
	var apps []PWAInfo

	for _, file := range desktopFiles {
		content, err := os.ReadFile(file)
		if err != nil {
			continue
		}
		contentStr := string(content)

		appIDMatch := appIDRegex.FindStringSubmatch(contentStr)
		if len(appIDMatch) < 2 {
			continue
		}
		appID := appIDMatch[1]
		if seenIDs[appID] {
			continue
		}

		name := ""
		if nm := nameRegex.FindStringSubmatch(contentStr); len(nm) > 1 {
			name = strings.TrimSpace(nm[1])
		}

		icon := ""
		if ic := iconRegex.FindStringSubmatch(contentStr); len(ic) > 1 {
			icon = strings.TrimSpace(ic[1])
		}

		wmClass := ""
		if wm := wmClassRegex.FindStringSubmatch(contentStr); len(wm) > 1 {
			wmClass = strings.TrimSpace(wm[1])
		}

		userDataDir := ""
		if ud := userDataRegex.FindStringSubmatch(contentStr); len(ud) > 1 {
			userDataDir = strings.TrimSpace(ud[1])
		}

		profileDir := ""
		if pd := profileRegex.FindStringSubmatch(contentStr); len(pd) > 1 {
			profileDir = strings.TrimSpace(pd[1])
		}

		var domains []string
		domainSet := make(map[string]bool)

		// 1. Extract shortcut URLs
		shortcuts := shortcutRegex.FindAllStringSubmatch(contentStr, -1)
		for _, sm := range shortcuts {
			if len(sm) > 1 {
				if u, err := url.Parse(sm[1]); err == nil && u.Hostname() != "" {
					h := strings.ToLower(u.Hostname())
					if !domainSet[h] {
						domainSet[h] = true
						domains = append(domains, h)
					}
				}
			}
		}

		// 2. Extract any other URLs in the desktop file
		allUrls := urlRegex.FindAllString(contentStr, -1)
		for _, rawURL := range allUrls {
			if u, err := url.Parse(rawURL); err == nil && u.Hostname() != "" {
				h := strings.ToLower(u.Hostname())
				if !domainSet[h] {
					domainSet[h] = true
					domains = append(domains, h)
				}
			}
		}

		// 3. Extract from dynamic Preferences / Sync LevelDB extraction
		if dynamicDomains, ok := appIdToDomains[appID]; ok {
			for _, h := range dynamicDomains {
				if !domainSet[h] {
					domainSet[h] = true
					domains = append(domains, h)
				}
			}
		}

		seenIDs[appID] = true
		apps = append(apps, PWAInfo{
			ID:             appID,
			Name:           name,
			Icon:           icon,
			StartupWMClass: wmClass,
			Domains:        domains,
			DesktopFile:    filepath.Base(file),
			UserDataDir:    userDataDir,
			ProfileDir:     profileDir,
		})
	}

	return apps
}

func findInstalledPWA(targetURL string) *PWAInfo {
	if targetURL == "" {
		return nil
	}
	parsed, err := url.Parse(targetURL)
	if err != nil || parsed.Hostname() == "" {
		return nil
	}
	targetHost := strings.ToLower(parsed.Hostname())

	apps := listInstalledPWAs()
	for _, app := range apps {
		for _, d := range app.Domains {
			if targetHost == d || strings.HasSuffix(targetHost, "."+d) {
				appCopy := app
				return &appCopy
			}
		}
	}

	return nil
}

// findChromeBinary dynamically resolves the running browser binary from parent PID
func findChromeBinary() string {
	// 1. Check if parent process points directly to browser binary
	currentPID := os.Getppid()
	for step := 0; step < 5 && currentPID > 1; step++ {
		exePath := fmt.Sprintf("/proc/%d/exe", currentPID)
		if target, err := os.Readlink(exePath); err == nil && target != "" {
			base := strings.ToLower(filepath.Base(target))
			if strings.Contains(base, "chrome") ||
				strings.Contains(base, "chromium") ||
				strings.Contains(base, "brave") ||
				strings.Contains(base, "edge") ||
				strings.Contains(base, "msedge") ||
				strings.Contains(base, "vivaldi") ||
				strings.Contains(base, "opera") {
				return target
			}
		}

		// Read parent PID
		statusPath := fmt.Sprintf("/proc/%d/status", currentPID)
		statusRaw, err := os.ReadFile(statusPath)
		if err != nil {
			break
		}
		nextPID := 0
		for _, line := range strings.Split(string(statusRaw), "\n") {
			if strings.HasPrefix(line, "PPid:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					nextPID, _ = strconv.Atoi(fields[1])
				}
				break
			}
		}
		if nextPID <= 1 || nextPID == currentPID {
			break
		}
		currentPID = nextPID
	}

	// 2. Fallback to CHROME_BIN environment variable
	if envBin := os.Getenv("CHROME_BIN"); envBin != "" {
		if path, err := exec.LookPath(envBin); err == nil && path != "" {
			return path
		}
	}

	// 3. Fallback to standard PATH candidates
	candidates := []string{
		"google-chrome-stable",
		"google-chrome",
		"chromium",
		"chromium-browser",
		"brave-browser",
		"brave",
		"microsoft-edge-stable",
		"microsoft-edge",
		"msedge",
		"vivaldi",
		"opera",
	}
	for _, bin := range candidates {
		if path, err := exec.LookPath(bin); err == nil && path != "" {
			return bin
		}
	}
	return "google-chrome-stable"
}

func main() {
	logDebug("=== chrome-open-in-app-host (Go binary) started ===")

	reader := bufio.NewReader(os.Stdin)
	writer := bufio.NewWriter(os.Stdout)
	defer writer.Flush()

	req, err := readMessage(reader)
	if err != nil {
		logDebug("Failed to read message: %v", err)
		_ = sendMessage(writer, Response{Success: false, Error: err.Error()})
		return
	}

	// Dynamic PWA Query Action
	if req.Action == "LIST_APPS" || (req.URL == "" && req.AppID == "") {
		apps := listInstalledPWAs()
		logDebug("Listing installed PWAs: found %d apps", len(apps))
		_ = sendMessage(writer, Response{
			Success: true,
			Action:  "LIST_APPS",
			Apps:    apps,
		})
		return
	}

	if req.URL == "" && req.AppID == "" {
		logDebug("No URL or AppID provided in launch request")
		_ = sendMessage(writer, Response{Success: false, Error: "No URL or AppID provided"})
		return
	}

	userDir := req.UserDataDir
	profDir := req.ProfileDir
	appID := req.AppID

	detectedUserDir, detectedProfDir := detectChromeContext()
	logDebug("Detected context: user_data_dir=%s, profile_dir=%s", detectedUserDir, detectedProfDir)
	if userDir == "" && detectedUserDir != "" {
		userDir = detectedUserDir
	}
	if profDir == "" && detectedProfDir != "" {
		profDir = detectedProfDir
	}

	isPWA := false
	var matchedApp *PWAInfo

	if appID != "" {
		for _, a := range listInstalledPWAs() {
			if a.ID == appID {
				appCopy := a
				matchedApp = &appCopy
				break
			}
		}
		isPWA = true
	} else if req.URL != "" {
		matchedApp = findInstalledPWA(req.URL)
		if matchedApp != nil {
			appID = matchedApp.ID
			isPWA = true
			logDebug("Matched PWA '%s' with ID: %s for %s", matchedApp.Name, appID, req.URL)
		}
	}

	if matchedApp != nil {
		if profDir == "" && matchedApp.ProfileDir != "" {
			profDir = matchedApp.ProfileDir
		}
	}

	chromeBin := findChromeBinary()
	var args []string
	if userDir != "" {
		args = append(args, fmt.Sprintf("--user-data-dir=%s", userDir))
	}
	if profDir != "" {
		args = append(args, fmt.Sprintf("--profile-directory=%s", profDir))
	}

	if appID != "" {
		args = append(args, "--new-window", fmt.Sprintf("--app-id=%s", appID))
		if req.URL != "" {
			args = append(args, fmt.Sprintf("--app-launch-url-for-shortcuts-menu-item=%s", req.URL))
		}
	} else if req.URL != "" {
		args = append(args, fmt.Sprintf("--app=%s", req.URL))
	}

	logDebug("Executing: %s %s", chromeBin, strings.Join(args, " "))

	cmd := exec.Command(chromeBin, args...)
	if err := cmd.Start(); err != nil {
		logDebug("Failed to start process: %v", err)
		_ = sendMessage(writer, Response{
			Success: false,
			Error:   err.Error(),
		})
		return
	}
	_ = cmd.Process.Release()
	logDebug("Process successfully started in background")

	_ = sendMessage(writer, Response{
		Success:  true,
		Action:   "LAUNCH",
		Launched: req.URL,
		AppID:    appID,
		IsPWA:    isPWA,
	})
}
