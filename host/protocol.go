package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
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
	OpenInWindow   bool     `json:"openInWindow,omitempty"`
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
