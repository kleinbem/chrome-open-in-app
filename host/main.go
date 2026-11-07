package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

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
				isPWA = true
				break
			}
		}
		if matchedApp == nil {
			logDebug("AppID %s is not among window-enabled PWAs; falling back to URL launch", appID)
			appID = ""
		}
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
