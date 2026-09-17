package main

import (
	"bufio"
	"context"
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
	"time"
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
	userDataRegex = regexp.MustCompile(`--user-data-dir=([^ \x00\t\r\n]+)`)
	profileRegex  = regexp.MustCompile(`--profile-directory=([^ \x00\t\r\n]+)`)
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
	lf := logFile()
	if lf == "" {
		return
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

		if strings.Contains(cmdlineStr, "chrome") || strings.Contains(cmdlineStr, "chromium") || strings.Contains(cmdlineStr, "brave") {
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

type pwaMapping struct {
	keyword string
	domain  string
}

var knownPwaNames = []pwaMapping{
	{"youtube music", "music.youtube.com"},
	{"youtube", "youtube.com"},
	{"gemini", "gemini.google.com"},
	{"chatgpt", "chatgpt.com"},
	{"claude", "claude.ai"},
	{"deepseek", "chat.deepseek.com"},
	{"gmail", "mail.google.com"},
	{"calendar", "calendar.google.com"},
	{"whatsapp", "web.whatsapp.com"},
	{"ai studio", "aistudio.google.com"},
	{"cloud shell", "shell.cloud.google.com"},
	{"instagram", "instagram.com"},
	{"kindle", "read.amazon.com"},
	{"amazon", "amazon.co.uk"},
	{"slack", "app.slack.com"},
	{"discord", "discord.com"},
	{"spotify", "open.spotify.com"},
	{"notion", "notion.so"},
	{"github", "github.com"},
	{"figma", "figma.com"},
	{"zee5", "zee5.com"},
	{"dunnes", "dunnesstoresgrocery.com"},
	{"firebase", "studio.firebase.google.com"},
	{"messages", "messages.google.com"},
	{"meet", "meet.google.com"},
	{"drive", "drive.google.com"},
	{"keep", "keep.google.com"},
	{"maps", "maps.google.com"},
}

// loadPreferencesInstallURLs attempts to extract web_app.app_id.install_url from Chrome Preferences
func loadPreferencesInstallURLs() map[string][]string {
	result := make(map[string][]string)
	home, err := os.UserHomeDir()
	if err != nil {
		return result
	}

	userDataDir, profileDir := detectChromeContext()
	candidatePaths := []string{}
	if userDataDir != "" && profileDir != "" {
		candidatePaths = append(candidatePaths, filepath.Join(userDataDir, profileDir, "Preferences"))
	}
	candidatePaths = append(candidatePaths,
		filepath.Join(home, ".config", "google-chrome", "Default", "Preferences"),
		filepath.Join(home, ".config", "chromium", "Default", "Preferences"),
		filepath.Join(home, ".config", "BraveSoftware", "Brave-Browser", "Default", "Preferences"),
	)

	for _, p := range candidatePaths {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}

		var prefMap struct {
			WebApp struct {
				AppID struct {
					InstallURL map[string][]string `json:"install_url"`
				} `json:"app_id"`
			} `json:"web_app"`
		}
		if err := json.Unmarshal(data, &prefMap); err == nil {
			for aid, urls := range prefMap.WebApp.AppID.InstallURL {
				for _, rawURL := range urls {
					if u, err := url.Parse(rawURL); err == nil && u.Hostname() != "" {
						h := strings.ToLower(u.Hostname())
						result[aid] = append(result[aid], h)
					}
				}
			}
			if len(result) > 0 {
				break
			}
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

	prefInstallURLs := loadPreferencesInstallURLs()

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

		// 3. Extract from Chrome Preferences install_url
		if prefHosts, ok := prefInstallURLs[appID]; ok {
			for _, h := range prefHosts {
				if !domainSet[h] {
					domainSet[h] = true
					domains = append(domains, h)
				}
			}
		}

		// 4. Fallback: map by known application names
		cleanName := strings.ToLower(name)
		for _, m := range knownPwaNames {
			if strings.Contains(cleanName, m.keyword) {
				if !domainSet[m.domain] {
					domainSet[m.domain] = true
					domains = append(domains, m.domain)
				}
				break
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
		})
	}

	return apps
}

func findInstalledPWA(targetURL string) (string, string) {
	if targetURL == "" {
		return "", ""
	}
	parsed, err := url.Parse(targetURL)
	if err != nil || parsed.Hostname() == "" {
		return "", ""
	}
	targetHost := strings.ToLower(parsed.Hostname())

	apps := listInstalledPWAs()
	for _, app := range apps {
		for _, d := range app.Domains {
			if targetHost == d || strings.HasSuffix(targetHost, "."+d) {
				return app.ID, app.Name
			}
		}
	}

	// Exact domain match based on known PWA naming heuristics without ambiguous substrings
	domainPrefix := strings.TrimPrefix(targetHost, "www.")
	if idx := strings.Index(domainPrefix, "."); idx != -1 {
		domainPrefix = domainPrefix[:idx]
	}
	// Avoid short or common ambiguous tokens (like "app", "web", "api", "mail")
	ambiguous := map[string]bool{"app": true, "web": true, "api": true, "auth": true, "my": true, "dashboard": true}
	if len(domainPrefix) >= 4 && !ambiguous[domainPrefix] {
		for _, app := range apps {
			cleanName := strings.ToLower(strings.ReplaceAll(app.Name, " ", ""))
			if strings.Contains(cleanName, domainPrefix) {
				return app.ID, app.Name
			}
		}
	}

	return "", ""
}

// findChromeBinary dynamically resolves the running browser binary from parent PID
func findChromeBinary() string {
	// 1. Check if parent process points directly to browser binary
	currentPID := os.Getppid()
	for step := 0; step < 5 && currentPID > 1; step++ {
		exePath := fmt.Sprintf("/proc/%d/exe", currentPID)
		if target, err := os.Readlink(exePath); err == nil && target != "" {
			base := strings.ToLower(filepath.Base(target))
			if strings.Contains(base, "chrome") || strings.Contains(base, "chromium") || strings.Contains(base, "brave") {
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
	if appID == "" && req.URL != "" {
		pwaID, pwaName := findInstalledPWA(req.URL)
		if pwaID != "" {
			appID = pwaID
			isPWA = true
			logDebug("Matched PWA '%s' with ID: %s for %s", pwaName, pwaID, req.URL)
		}
	} else if appID != "" {
		isPWA = true
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
	} else if req.URL != "" {
		args = append(args, fmt.Sprintf("--app=%s", req.URL))
	}

	logDebug("Executing: %s %s", chromeBin, strings.Join(args, " "))

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, chromeBin, args...)
	out, err := cmd.CombinedOutput()
	logDebug("Process executed. Result: %s (err: %v)", strings.TrimSpace(string(out)), err)

	_ = sendMessage(writer, Response{
		Success:  true,
		Action:   "LAUNCH",
		Launched: req.URL,
		AppID:    appID,
		IsPWA:    isPWA,
	})
}
