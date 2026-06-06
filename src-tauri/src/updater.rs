// ============================================================================
// VANTORA Offline — auto-update core
// ----------------------------------------------------------------------------
// Wraps `tauri-plugin-updater` with the two project-specific concerns the plugin
// has no opinion about:
//
//   1. Release channels (stable / beta) — selected by pointing the updater at a
//      channel-specific manifest URL, persisted in our own `updater.json`.
//   2. Pre-install backup of the Postgres data dir on MAJOR semver bumps, with
//      sanity guards + 3-major retention.
//
// The plugin still owns the cryptography (Ed25519 verify) and the binary swap.
// Admin fields (min_supported_version, denied_versions, release_notes) live in
// the manifest and are read here from `Update::raw_json`.
//
// See docs/offline/auto-update.md for the full design + threat model.
// ============================================================================

use std::path::{Path, PathBuf};
use std::{fs, io};

use semver::Version;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

// Config-driven endpoint. `{{target}}` (OS) and `{{arch}}` are substituted by the
// plugin; `{channel}` is injected here. We point at a per-channel *rolling*
// release tag (`updates-stable` / `updates-beta`) that CI force-updates on every
// publish, so each channel has one always-current URL — GitHub's
// `/releases/latest/` path excludes pre-releases and would never resolve beta.
// To move to a private update server later, change ONLY this template (and the
// tauri.conf.json default) — no other code changes. See doc §9.
const ENDPOINT_TEMPLATE: &str =
    "https://github.com/nabilhahaha/Kako/releases/download/updates-{channel}/latest-{{target}}-{{arch}}.json";

const APP_DIR_NAME: &str = "Kako";
const MAJOR_BACKUP_RETENTION: usize = 3;

// ── Channel persistence (updater.json beside the data dir) ──────────────────

#[derive(Serialize, Deserialize, Clone)]
struct UpdaterConfig {
    channel: String,
}

impl Default for UpdaterConfig {
    fn default() -> Self {
        Self { channel: "stable".into() }
    }
}

/// Coerce an arbitrary string to a known channel; unknown values fall back to
/// stable so a corrupted config can never point us at an unexpected endpoint.
fn valid_channel(c: &str) -> &'static str {
    if c == "beta" {
        "beta"
    } else {
        "stable"
    }
}

/// Resolve the offline home root, mirroring scripts/offline/lib.mjs `offlineHome`
/// (and its KAKO_OFFLINE_HOME override) so Rust and Node agree on the data dir.
fn offline_home() -> PathBuf {
    if let Ok(p) = std::env::var("KAKO_OFFLINE_HOME") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        return PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join(APP_DIR_NAME);
    }
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var("PROGRAMDATA")
            .or_else(|_| std::env::var("LOCALAPPDATA"))
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_default();
        return PathBuf::from(base).join(APP_DIR_NAME);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let base = std::env::var("XDG_DATA_HOME").unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_default();
            format!("{home}/.local/share")
        });
        PathBuf::from(base).join(APP_DIR_NAME)
    }
}

fn data_dir() -> PathBuf {
    offline_home().join("db")
}

fn backups_dir() -> PathBuf {
    offline_home().join("backups")
}

fn config_path() -> PathBuf {
    offline_home().join("updater.json")
}

fn read_config() -> UpdaterConfig {
    fs::read_to_string(config_path())
        .ok()
        .and_then(|s| serde_json::from_str::<UpdaterConfig>(&s).ok())
        .map(|mut c| {
            c.channel = valid_channel(&c.channel).into();
            c
        })
        .unwrap_or_default()
}

fn write_config(cfg: &UpdaterConfig) -> io::Result<()> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_vec_pretty(cfg).unwrap_or_default())
}

// ── Update info surfaced to the UI ──────────────────────────────────────────

#[derive(Serialize, Clone, Default)]
pub struct UpdateInfo {
    /// Version currently running.
    pub current_version: String,
    /// Channel the check ran against.
    pub channel: String,
    /// An installable, allowed, newer version exists.
    pub available: bool,
    /// Advertised version in the manifest (when one was fetched).
    pub version: Option<String>,
    /// Release notes (markdown) for the install dialog.
    pub release_notes: Option<String>,
    /// Publish timestamp from the manifest.
    pub pub_date: Option<String>,
    /// The advertised version is a MAJOR bump → a pre-install backup will run.
    pub is_major: bool,
    /// The running version is below `min_supported_version` (or deny-listed) →
    /// the app must update; the UI shows a blocking banner.
    pub must_update: bool,
    /// Why an otherwise-newer version is being withheld (deny-list), if any.
    pub blocked_reason: Option<String>,
}

fn parse_admin_fields(raw: &serde_json::Value) -> (Option<String>, Vec<String>, Option<String>) {
    let min_supported = raw
        .get("min_supported_version")
        .and_then(|v| v.as_str())
        .map(String::from);
    let denied = raw
        .get("denied_versions")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let release_notes = raw
        .get("release_notes")
        .and_then(|v| v.as_str())
        .map(String::from);
    (min_supported, denied, release_notes)
}

/// Build a channel-specific endpoint URL ({{target}}/{{arch}} still templated by
/// the plugin).
fn endpoint_for(channel: &str) -> String {
    ENDPOINT_TEMPLATE.replace("{channel}", valid_channel(channel))
}

// ── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_current_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn get_channel() -> String {
    read_config().channel
}

#[tauri::command]
pub fn set_channel(channel: String) -> Result<(), String> {
    let cfg = UpdaterConfig { channel: valid_channel(&channel).into() };
    write_config(&cfg).map_err(|e| format!("could not persist channel: {e}"))
}

/// Fetch the manifest for `channel` and evaluate all gates (downgrade
/// protection, deny-list, min-supported) locally. Returns structured info; never
/// downloads or installs.
#[tauri::command]
pub async fn check_for_update(app: AppHandle, channel: String) -> Result<UpdateInfo, String> {
    let channel = valid_channel(&channel).to_string();
    let current = app.package_info().version.to_string();
    let mut info = UpdateInfo {
        current_version: current.clone(),
        channel: channel.clone(),
        ..Default::default()
    };

    let endpoint = endpoint_for(&channel);
    let url = url::Url::parse(&endpoint).map_err(|e| format!("bad endpoint: {e}"))?;

    // Force the comparator to always yield the release so we can read the manifest
    // (raw_json + admin fields) and apply *our* gating — including downgrade
    // protection, which the default comparator would otherwise hide.
    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .version_comparator(|_current, _remote| true)
        .build()
        .map_err(|e| e.to_string())?;

    let update = match updater.check().await {
        Ok(Some(u)) => u,
        Ok(None) => return Ok(info), // no manifest entry for this target
        // Network failure on a box that may genuinely be offline is expected.
        Err(e) => return Err(format!("update check failed: {e}")),
    };

    let (min_supported, denied, raw_notes) = parse_admin_fields(&update.raw_json);
    info.version = Some(update.version.clone());
    info.pub_date = update.date.map(|d| d.to_string());
    info.release_notes = raw_notes.or_else(|| update.body.clone());

    // Downgrade protection: only a strictly-newer version is installable.
    let newer = match (Version::parse(&update.version), Version::parse(&current)) {
        (Ok(remote), Ok(cur)) => {
            info.is_major = remote.major > cur.major;
            remote > cur
        }
        _ => false,
    };

    // Deny-list: a deny-listed target is never offered; a deny-listed *current*
    // version forces an update.
    let denied_target = denied.iter().any(|d| d == &update.version);
    let denied_current = denied.iter().any(|d| d == &current);

    // min_supported_version: below it → must update.
    let below_min = min_supported
        .as_deref()
        .and_then(|m| Version::parse(m).ok())
        .zip(Version::parse(&current).ok())
        .map(|(min, cur)| cur < min)
        .unwrap_or(false);

    info.available = newer && !denied_target;
    info.must_update = below_min || denied_current;
    if newer && denied_target {
        info.blocked_reason = Some("This version is on the deny-list and was not offered.".into());
    }

    Ok(info)
}

/// Run the pre-install backup hook (if MAJOR), download + verify + install the
/// update for the persisted channel, then relaunch. The signature is verified
/// inside the plugin before the swap. Does not return on success (the process is
/// restarted); errors abort with the data dir untouched.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let channel = read_config().channel;
    let current = app.package_info().version.to_string();
    let url = url::Url::parse(&endpoint_for(&channel)).map_err(|e| e.to_string())?;

    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .version_comparator(|_c, _r| true)
        .build()
        .map_err(|e| e.to_string())?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("update check failed: {e}"))?
        .ok_or_else(|| "no update available for this target".to_string())?;

    // Re-validate the gates server-side of the UI: never install a non-newer or
    // deny-listed version even if the UI asked us to.
    let (_min, denied, _notes) = parse_admin_fields(&update.raw_json);
    let (remote_v, cur_v) = (
        Version::parse(&update.version).map_err(|e| format!("bad remote version: {e}"))?,
        Version::parse(&current).map_err(|e| format!("bad current version: {e}"))?,
    );
    if remote_v <= cur_v {
        return Err("refusing to install a non-newer version (downgrade protection)".into());
    }
    if denied.iter().any(|d| d == &update.version) {
        return Err("refusing to install a deny-listed version".into());
    }

    // Pre-install backup on MAJOR bumps only.
    if remote_v.major > cur_v.major {
        let path = backup_data_dir(&current, &update.version)?;
        // Surface the backup path before the swap so it lands in logs/UI even
        // though the process is about to relaunch.
        let _ = app.emit("update-backup-created", path.to_string_lossy().to_string());
    }

    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| format!("download/install failed: {e}"))?;

    // Swap done + signature verified by the plugin. Relaunch into the new build.
    app.restart();
}

// ── Pre-install backup ──────────────────────────────────────────────────────

/// ISO-8601 UTC timestamp safe for a directory name (colons → dashes).
fn iso_stamp() -> String {
    use time::format_description::well_known::Rfc3339;
    time::OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "unknown-time".into())
        .replace(':', "-")
}

fn dir_size(path: &Path) -> io::Result<u64> {
    let mut total = 0;
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let meta = entry.metadata()?;
        if meta.is_dir() {
            total += dir_size(&entry.path())?;
        } else {
            total += meta.len();
        }
    }
    Ok(total)
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

/// Free bytes available on the volume that holds `path` (best-effort; returns
/// None when unknown so callers can decide whether to proceed).
#[cfg(unix)]
fn free_space(path: &Path) -> Option<u64> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    let c = CString::new(path.as_os_str().as_bytes()).ok()?;
    // SAFETY: zeroed statvfs is a valid initial state; we only read on success.
    unsafe {
        let mut stat: libc::statvfs = std::mem::zeroed();
        if libc::statvfs(c.as_ptr(), &mut stat) == 0 {
            Some(stat.f_bavail as u64 * stat.f_frsize as u64)
        } else {
            None
        }
    }
}

#[cfg(not(unix))]
fn free_space(_path: &Path) -> Option<u64> {
    None // Windows free-space check is left to a later pass; backup still runs.
}

/// Snapshot the Postgres data dir before a MAJOR install. Returns the backup
/// path. Sanity-gated and abortable: any failure leaves the running app and its
/// data untouched (the caller propagates the error and skips the install).
pub fn backup_data_dir(from_version: &str, to_version: &str) -> Result<PathBuf, String> {
    let src = data_dir();
    if !src.exists() {
        return Err(format!("data dir not found, refusing to update: {}", src.display()));
    }
    let size = dir_size(&src).map_err(|e| format!("could not size data dir: {e}"))?;
    if size == 0 {
        return Err("data dir is empty — aborting update to avoid masking a problem".into());
    }

    let dest = backups_dir().join(format!("{}-{}-to-{}", iso_stamp(), from_version, to_version));
    // Source ≠ target guard (paranoia: backups/ lives under the home, db/ does not).
    if dest.starts_with(&src) || src.starts_with(&dest) {
        return Err("backup target overlaps the data dir — aborting".into());
    }

    // Require ~10% headroom over the source size when we can measure it.
    if let Some(free) = free_space(&offline_home()) {
        let needed = size + size / 10;
        if free < needed {
            return Err(format!(
                "not enough free space for backup: need ~{} MiB, have {} MiB",
                needed / (1024 * 1024),
                free / (1024 * 1024)
            ));
        }
    }

    fs::create_dir_all(backups_dir()).map_err(|e| format!("could not create backups dir: {e}"))?;
    copy_dir_recursive(&src, &dest).map_err(|e| {
        // Best-effort cleanup of a partial copy so a failed backup leaves no junk.
        let _ = fs::remove_dir_all(&dest);
        format!("backup copy failed: {e}")
    })?;

    prune_major_backups();
    Ok(dest)
}

/// Keep the most recent `MAJOR_BACKUP_RETENTION` backup directories (one is
/// created per MAJOR bump, so this is "last N majors"); delete older. ISO
/// timestamps sort chronologically, so a name sort is a time sort.
fn prune_major_backups() {
    let dir = backups_dir();
    let mut majors: Vec<PathBuf> = match fs::read_dir(&dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.is_dir() && p.file_name().map(|n| n.to_string_lossy().contains("-to-")).unwrap_or(false))
            .collect(),
        Err(_) => return,
    };
    majors.sort();
    if majors.len() > MAJOR_BACKUP_RETENTION {
        for old in &majors[..majors.len() - MAJOR_BACKUP_RETENTION] {
            let _ = fs::remove_dir_all(old);
        }
    }
}
