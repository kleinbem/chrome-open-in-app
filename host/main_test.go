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
