// ============================================================================
// Device fingerprint — raw per-OS identifiers (P1 macOS, P2 Windows)
// ----------------------------------------------------------------------------
// Collects the strong hardware identifiers and returns them as JSON. The Node
// layer (src/lib/license/fingerprint.ts) SALTS + HASHES them — the raw values
// never reach the license file or disk. Scaffolding; compiled on the targets.
//
//   macOS:   IOPlatformUUID (via ioreg)
//   Windows: MachineGuid (registry) + SMBIOS UUID (wmic/PowerShell)
// ============================================================================

use serde_json::json;

pub fn collect() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        // AU-7: fail loudly rather than return an empty UUID. An empty string is
        // a falsy "strong id" on the Node side (collision risk + opaque later
        // failure), so surface the collection failure at the shell boundary.
        let platform_uuid = mac_platform_uuid().filter(|s| !s.trim().is_empty());
        return match platform_uuid {
            Some(uuid) => Ok(json!({ "platformUuid": uuid }).to_string()),
            None => Err("could not read IOPlatformUUID (ioreg)".to_string()),
        };
    }

    #[cfg(target_os = "windows")]
    {
        let machine_guid = win_machine_guid().filter(|s| !s.trim().is_empty());
        let smbios = win_smbios_uuid().filter(|s| !s.trim().is_empty());
        // Require at least one strong identifier.
        if machine_guid.is_none() && smbios.is_none() {
            return Err("could not read a strong Windows device id (MachineGuid/SMBIOS)".to_string());
        }
        return Ok(json!({
            "machineGuid": machine_guid.unwrap_or_default(),
            "smbiosUuid": smbios.unwrap_or_default(),
        })
        .to_string());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        // Linux/dev: hostname only (weak; the Node layer requires a STRONG id, so
        // licensing is effectively macOS/Windows-only, as intended).
        Ok(json!({ "hostname": hostname() }).to_string())
    }
}

#[cfg(target_os = "macos")]
fn mac_platform_uuid() -> Option<String> {
    let out = std::process::Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    for line in text.lines() {
        if line.contains("IOPlatformUUID") {
            if let Some(start) = line.find("= \"") {
                let rest = &line[start + 3..];
                if let Some(end) = rest.find('"') {
                    return Some(rest[..end].to_string());
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn win_machine_guid() -> Option<String> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key = hklm.open_subkey("SOFTWARE\\Microsoft\\Cryptography").ok()?;
    key.get_value("MachineGuid").ok()
}

#[cfg(target_os = "windows")]
fn win_smbios_uuid() -> Option<String> {
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", "(Get-CimInstance Win32_ComputerSystemProduct).UUID"])
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() { None } else { Some(s) }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn hostname() -> String {
    std::env::var("HOSTNAME").unwrap_or_else(|_| "unknown".into())
}
