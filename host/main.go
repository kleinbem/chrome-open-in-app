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
	URL          string `json:"url"`
	AppID        string `json:"appId,omitempty"`
	UserDataDir  string `json:"userDataDir,omitempty"`
	ProfileDir   string `json:"profileDir,omitempty"`
	PreferAppURL bool   `json:"preferAppUrl,omitempty"`
}

type Response struct {
	Success  bool   `json:"success"`
	Launched string `json:"launched,omitempty"`
	AppID    string `json:"appId,omitempty"`
	IsPWA    bool   `json:"isPwa"`
	Error    string `json:"error,omitempty"`
}

var (
	appIDRegex    = regexp.MustCompile(`--app-id=([a-z0-9]+)`)
	nameRegex     = regexp.MustCompile(`(?m)^Name=(.*)$`)
	shortcutRegex = regexp.MustCompile(`--app-launch-url-for-shortcuts-menu-item=(https?://[^ \n"']+)`)
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

		if strings.Contains(cmdlineStr, "chrome") || strings.Contains(cmdlineStr, "chromium") {
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

		// Read parent PID from /proc/<pid>/status
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

func findInstalledPWA(targetURL string) (string, string) {
	if targetURL == "" {
		return "", ""
	}
	parsed, err := url.Parse(targetURL)
	if err != nil || parsed.Hostname() == "" {
		return "", ""
	}
	targetHost := strings.ToLower(parsed.Hostname())

	home, err := os.UserHomeDir()
	if err != nil {
		return "", ""
	}
	desktopPattern := filepath.Join(home, ".local", "share", "applications", "chrome-*-*.desktop")
	desktopFiles, err := filepath.Glob(desktopPattern)
	if err != nil || len(desktopFiles) == 0 {
		return "", ""
	}

	domainPrefix := strings.TrimPrefix(targetHost, "www.")
	if idx := strings.Index(domainPrefix, "."); idx != -1 {
		domainPrefix = domainPrefix[:idx]
	}

	type match struct {
		id   string
		name string
	}
	var candidate *match

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

		name := ""
		if nm := nameRegex.FindStringSubmatch(contentStr); len(nm) > 1 {
			name = strings.TrimSpace(nm[1])
		}

		// 1. Direct shortcut URL match
		shortcuts := shortcutRegex.FindAllStringSubmatch(contentStr, -1)
		for _, sm := range shortcuts {
			if len(sm) > 1 {
				if u, err := url.Parse(sm[1]); err == nil {
					if strings.ToLower(u.Hostname()) == targetHost {
						return appID, name
					}
				}
			}
		}

		// 2. Fallback: match by domain prefix in PWA Name
		if len(domainPrefix) > 2 && strings.Contains(strings.ToLower(name), domainPrefix) {
			if candidate == nil {
				candidate = &match{id: appID, name: name}
			}
		}
	}

	if candidate != nil {
		return candidate.id, candidate.name
	}
	return "", ""
}

func findChromeBinary() string {
	candidates := []string{
		"google-chrome-stable",
		"google-chrome",
		"chromium",
		"chromium-browser",
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

	if req.URL == "" {
		logDebug("No URL provided in request")
		_ = sendMessage(writer, Response{Success: false, Error: "No URL provided"})
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
	if appID == "" {
		pwaID, pwaName := findInstalledPWA(req.URL)
		if pwaID != "" {
			appID = pwaID
			isPWA = true
			logDebug("Matched PWA '%s' with ID: %s", pwaName, pwaID)
		}
	} else {
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
		args = append(args, fmt.Sprintf("--app-id=%s", appID))
	}
	if req.URL != "" {
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
		Launched: req.URL,
		AppID:    appID,
		IsPWA:    isPWA,
	})
}
