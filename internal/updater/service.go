package updater

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"watermark-01/internal/config"

	"github.com/creativeprojects/go-selfupdate"
	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	checkInterval = 6 * time.Hour
	githubOwner   = "Kezlo98"
	githubRepo    = "watermark"
)

// UpdaterService checks GitHub Releases for updates, downloads, verifies,
// and applies binary replacements. All public methods are Wails bindings.
type UpdaterService struct {
	version string // injected at build time via -ldflags
	repo    string // "owner/repo"

	ctx       context.Context    // Wails runtime context (for events)
	mu        sync.RWMutex
	latest    *selfupdate.Release // cached latest release
	configSvc *config.ConfigService
	changelog []ReleaseNote // cached parsed changelog
}

// NewUpdaterService creates a new updater. version should be the build-time
// injected version string (e.g. "v1.0.0" or "dev").
func NewUpdaterService(version string, configSvc *config.ConfigService) *UpdaterService {
	return &UpdaterService{
		version:   version,
		repo:      githubOwner + "/" + githubRepo,
		configSvc: configSvc,
	}
}

// SetContext receives the Wails runtime context for emitting events.
func (u *UpdaterService) SetContext(ctx context.Context) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.ctx = ctx
}

// GetCurrentVersion returns the build-time version string.
func (u *UpdaterService) GetCurrentVersion() string {
	return u.version
}

// CheckForUpdate queries GitHub Releases and returns update info.
func (u *UpdaterService) CheckForUpdate() UpdateInfo {
	info := UpdateInfo{
		Available:  false,
		CurrentVer: u.version,
	}

	// Skip check in dev mode
	if u.version == "dev" || u.version == "" {
		return info
	}

	source, err := selfupdate.NewGitHubSource(selfupdate.GitHubConfig{})
	if err != nil {
		log.Printf("updater: github source error: %v", err)
		return info
	}

	updater, err := selfupdate.NewUpdater(selfupdate.Config{
		Source:    source,
		Validator: &selfupdate.ChecksumValidator{UniqueFilename: "checksums.txt"},
		// Universal macOS binary is named "darwin_all" — match it for any darwin arch
		Filters: []string{"darwin_all"},
	})
	if err != nil {
		log.Printf("updater: create updater error: %v", err)
		return info
	}

	release, found, err := updater.DetectLatest(
		context.Background(),
		selfupdate.NewRepositorySlug(githubOwner, githubRepo),
	)
	if err != nil {
		log.Printf("updater: detect latest error: %v", err)
		return info
	}
	if !found {
		return info
	}

	// Cache latest release for ApplyUpdate; invalidate changelog if version changed
	u.mu.Lock()
	if u.latest == nil || u.latest.Version() != release.Version() {
		u.changelog = nil
	}
	u.latest = release
	u.mu.Unlock()

	// Compare versions — release.LessOrEqual returns true when
	// current version is >= latest (i.e. no update needed)
	if release.LessOrEqual(u.version) {
		return info
	}

	info.Available = true
	info.LatestVer = release.Version()
	info.ReleaseURL = release.URL
	info.ReleaseNotes = release.ReleaseNotes
	if !release.PublishedAt.IsZero() {
		info.PublishedAt = release.PublishedAt.Format(time.RFC3339)
	}

	// Mark as skipped if user previously chose to skip this version
	if u.configSvc != nil {
		skipped := u.configSvc.GetSkippedVersion()
		if skipped != "" && strings.TrimPrefix(skipped, "v") == strings.TrimPrefix(release.Version(), "v") {
			info.Skipped = true
		}
	}

	return info
}

// ApplyUpdate downloads and applies the latest update.
// Emits "update:progress" Wails events during the process.
func (u *UpdaterService) ApplyUpdate() error {
	// Emit progress helper
	emit := func(phase string, progress float64, errMsg string) {
		if app := application.Get(); app != nil {
			app.Event.Emit("update:progress", UpdateStatus{
				Phase:    phase,
				Progress: progress,
				Error:    errMsg,
			})
		}
	}

	emit("checking", 0.0, "")

	if u.version == "dev" || u.version == "" {
		return fmt.Errorf("cannot update in dev mode")
	}

	u.mu.RLock()
	cachedRelease := u.latest
	u.mu.RUnlock()

	if cachedRelease == nil {
		// Re-check if no cached release
		info := u.CheckForUpdate()
		if !info.Available {
			return fmt.Errorf("no update available")
		}
		u.mu.RLock()
		cachedRelease = u.latest
		u.mu.RUnlock()
		if cachedRelease == nil {
			return fmt.Errorf("failed to detect update")
		}
	}

	emit("downloading", 0.2, "")

	source, err := selfupdate.NewGitHubSource(selfupdate.GitHubConfig{})
	if err != nil {
		emit("error", 0, err.Error())
		return fmt.Errorf("updater: github source: %w", err)
	}

	updater, err := selfupdate.NewUpdater(selfupdate.Config{
		Source:    source,
		Validator: &selfupdate.ChecksumValidator{UniqueFilename: "checksums.txt"},
		// Universal macOS binary is named "darwin_all" — match it for any darwin arch
		Filters: []string{"darwin_all"},
	})
	if err != nil {
		emit("error", 0, err.Error())
		return fmt.Errorf("updater: create updater: %w", err)
	}

	emit("downloading", 0.5, "")

	execPath, err := os.Executable()
	if err != nil {
		emit("error", 0, err.Error())
		return fmt.Errorf("updater: get executable path: %w", err)
	}

	emit("applying", 0.7, "")

	if err := updater.UpdateTo(context.Background(), cachedRelease, execPath); err != nil {
		emit("error", 0, err.Error())
		return fmt.Errorf("updater: apply update: %w", err)
	}

	// Re-sign on macOS (Phase 3)
	emit("re-signing", 0.9, "")
	if err := reSignOnMacOS(); err != nil {
		log.Printf("updater: re-sign warning (non-fatal): %v", err)
	}

	emit("done", 1.0, "")

	return nil
}

// StartPeriodicCheck runs a background goroutine that checks for updates
// every 6 hours and emits "update:available" Wails events when found.
func (u *UpdaterService) StartPeriodicCheck() {
	u.mu.RLock()
	ctx := u.ctx
	u.mu.RUnlock()

	if ctx == nil {
		return
	}

	// Wait for the initial delay but honour early shutdown
	select {
	case <-ctx.Done():
		return
	case <-time.After(10 * time.Second):
	}

	u.checkAndEmit()

	ticker := time.NewTicker(checkInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			u.checkAndEmit()
		}
	}
}

// checkAndEmit performs a check and emits an event if an update is available and not skipped.
func (u *UpdaterService) checkAndEmit() {
	info := u.CheckForUpdate()
	// Suppress banner for skipped versions on auto-check
	if info.Available && !info.Skipped {
		if app := application.Get(); app != nil {
			app.Event.Emit("update:available", info)
			log.Printf("updater: new version available: %s → %s", info.CurrentVer, info.LatestVer)
		}
	}
}

// reSignOnMacOS performs ad-hoc code signing after binary replacement.
// Only runs on macOS; silently skips on other platforms.
func reSignOnMacOS() error {
	if runtime.GOOS != "darwin" {
		return nil
	}

	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("cannot find executable: %w", err)
	}

	appBundle := findAppBundle(execPath)
	if appBundle == "" {
		// Not running from a .app bundle (e.g. dev mode) — skip
		return nil
	}

	cmd := exec.Command("codesign", "--force", "--deep", "--sign", "-", appBundle)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("codesign failed: %s: %w", string(out), err)
	}
	return nil
}

// findAppBundle extracts the .app bundle path from an executable path.
// e.g. "/Applications/Watermark.app/Contents/MacOS/Watermark" → "/Applications/Watermark.app"
func findAppBundle(execPath string) string {
	const marker = "/Contents/MacOS/"
	idx := strings.Index(execPath, marker)
	if idx == -1 {
		return ""
	}
	return execPath[:idx]
}
