package main

import (
	"testing"
)

func TestGenerateAppID(t *testing.T) {
	tests := []struct {
		url      string
		expected string
	}{
		{"https://gemini.google.com/app", "gdfaincndogidkdcdkhapmbffkckdkhn"},
		{"https://mail.google.com/mail/?usp=installed_webapp", "fmgjjmmmlfnkbppncabfkddbjimcfncm"},
		{"https://www.youtube.com/?feature=ytca", "agimnkijcaahngcdmfeangaknmldooml"},
		{"https://claude.ai/", "fmpnliohjhemenmnlpbfagaolkdacoja"},
		{"https://web.whatsapp.com/", "hnpfjngllnobngcgfapefoaidbinmjnm"},
	}

	for _, tt := range tests {
		actual := generateAppID(tt.url)
		if actual != tt.expected {
			t.Errorf("generateAppID(%q) = %q, expected %q", tt.url, actual, tt.expected)
		}
	}
}

func TestListInstalledPWAsDiscovery(t *testing.T) {
	apps := listInstalledPWAs()
	if len(apps) == 0 {
		t.Skip("No desktop files found in test environment")
	}

	foundGemini := false
	for _, app := range apps {
		if app.ID == "gdfaincndogidkdcdkhapmbffkckdkhn" {
			foundGemini = true
			hasDomain := false
			for _, d := range app.Domains {
				if d == "gemini.google.com" {
					hasDomain = true
					break
				}
			}
			if !hasDomain {
				t.Errorf("Google Gemini app found but missing gemini.google.com in domains: %v", app.Domains)
			}
		}
	}

	if !foundGemini {
		t.Log("Google Gemini not installed in this environment")
	}
}

func TestFindInstalledPWA(t *testing.T) {
	pwa := findInstalledPWA("https://gemini.google.com/app/abc123")
	if pwa != nil {
		if pwa.ID != "gdfaincndogidkdcdkhapmbffkckdkhn" {
			t.Errorf("Expected Gemini ID gdfaincndogidkdcdkhapmbffkckdkhn, got %s", pwa.ID)
		}
		if pwa.Name != "Google Gemini" {
			t.Errorf("Expected name 'Google Gemini', got %s", pwa.Name)
		}
	}

	amazonPWA := findInstalledPWA("https://www.amazon.ie/dp/B09YTX4QPZ")
	if amazonPWA != nil {
		if amazonPWA.ID != "ndccmjlnaibhkkpkjlkhegjliobijdhg" {
			t.Errorf("Expected Amazon IE ID ndccmjlnaibhkkpkjlkhegjliobijdhg, got %s", amazonPWA.ID)
		}
		if amazonPWA.Name != "Amazon IE" {
			t.Errorf("Expected name 'Amazon IE', got %s", amazonPWA.Name)
		}
	}

	amazonPWANoWWW := findInstalledPWA("https://amazon.ie/dp/B09YTX4QPZ")
	if amazonPWANoWWW != nil {
		if amazonPWANoWWW.ID != "ndccmjlnaibhkkpkjlkhegjliobijdhg" {
			t.Errorf("Expected Amazon IE ID ndccmjlnaibhkkpkjlkhegjliobijdhg, got %s", amazonPWANoWWW.ID)
		}
	}
}

func TestExtractDisplayMode(t *testing.T) {
	tests := []struct {
		name     string
		chunk    []byte
		expected int
	}{
		{
			name:     "WebAppSpecifics user_display_mode BROWSER (tag 0x18 val 1)",
			chunk:    []byte("https://drive.google.com/\x12\x05Drive\x18\x01\x20\x00"),
			expected: 1,
		},
		{
			name:     "WebAppSpecifics user_display_mode STANDALONE (tag 0x18 val 3)",
			chunk:    []byte("https://youtube.com/\x12\x07YouTube\x18\x03\x20\x00"),
			expected: 3,
		},
		{
			name:     "WebAppProto display_mode BROWSER (tag 0x28 val 1)",
			chunk:    []byte("https://mail.google.com/\x12\x05Gmail\x28\x01\x30\x00"),
			expected: 1,
		},
		{
			name:     "WebAppProto display_mode TABBED (tag 0x28 val 6)",
			chunk:    []byte("https://chatgpt.com/\x12\x07ChatGPT\x28\x06\x30\x00"),
			expected: 6,
		},
		{
			name:     "No http url in chunk",
			chunk:    []byte("some_internal_data\x18\x01"),
			expected: 0,
		},
		{
			name:     "Empty chunk",
			chunk:    []byte{},
			expected: 0,
		},
	}

	for _, tt := range tests {
		actual := extractDisplayMode(tt.chunk)
		if actual != tt.expected {
			t.Errorf("%s: extractDisplayMode() = %d, expected %d", tt.name, actual, tt.expected)
		}
	}
}

func TestListInstalledPWAsFiltersTabApps(t *testing.T) {
	apps := listInstalledPWAs()
	for _, app := range apps {
		if !app.OpenInWindow {
			t.Errorf("App %s (%s) returned with OpenInWindow=false; all discovered apps must have OpenInWindow=true", app.Name, app.ID)
		}
		if app.ID == "aghbiahbpaijignceidepookljebhfak" {
			t.Errorf("Google Drive (%s) should have been filtered out because 'open in Window' is disabled", app.ID)
		}
		if app.ID == "fmgjjmmmlfnkbppncabfkddbjimcfncm" {
			t.Errorf("Gmail (%s) should have been filtered out because 'open in Window' is disabled", app.ID)
		}
	}
}
