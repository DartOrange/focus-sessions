# Standalone Android demo

Install **[focus-sessions-1.0.0.apk](focus-sessions-1.0.0.apk)** and launch **Focus Sessions**. The 46,993,831-byte release APK runs with no internet, Metro, Expo Go, development client, account, or backend. It includes Hermes JavaScript and local fonts. No input file is needed.

On an ARM64 Android phone, copy/download the APK, open it, and allow installation from that source if prompted. Build minimum: Android 7 / API 24; included native ABIs: `arm64-v8a` and `x86_64`. Only the emulator target below has been tested; minimum API and ARM64 inclusion are build metadata, not a claim of physical-device validation. To replace an installation signed with another key, uninstall it first; that deletes its local data.

## Verified emulator and launch

- AVD: **FocusSessions_API36**, Pixel 6 device profile, Google APIs x86_64 system image.
- Android **16 / API 36**, runtime ABI **x86_64**.
- Android Emulator **37.2.13.0**, WHPX on Windows x64, software graphics.
- Normal screen: 1080 × 2400 px, 420 dpi (about 411 × 914 dp).
- Additional layout: 900 × 1600 px at the same density (about 343 × 610 dp), 150% font scale.
- Package: `com.dartorange.focussessions`; activity: `.MainActivity`.

With Android SDK tools installed, create the same AVD using the official CLI tools and `system-images;android-36;google_apis;x86_64`, then:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA/Android/Sdk" # Use your SDK path if different.
& "$env:ANDROID_HOME/emulator/emulator.exe" -avd FocusSessions_API36
# In another terminal, from this repository:
& "$env:ANDROID_HOME/platform-tools/adb.exe" install -r demo/focus-sessions-1.0.0.apk
& "$env:ANDROID_HOME/platform-tools/adb.exe" shell am start -n com.dartorange.focussessions/.MainActivity
```

Turn off Wi-Fi/mobile data to demonstrate offline operation. Open Settings, save a one-minute focus duration, start, pause, resume, and wait for completion. Inspect History, then close and reopen the app. A running timer keeps elapsed time while away; a paused timer stays paused. There is **no background alarm**. Do not expect an audible notification while closed.

## Artifact identity

SHA-256:

```text
faee5aac68ab0260e9de71cd8b8b4382b32c27069df231ccf409bdebbf0f8586
```

The same value is in [SHA256SUMS](SHA256SUMS). Verify on Windows with `Get-FileHash demo/focus-sessions-1.0.0.apk -Algorithm SHA256`.

Dedicated demo signing certificate SHA-256: `986b3e6e414a575b7188b64327313d91ec9b9f223d8323491b1a1ebac7cd1870`. Signature schemes v2 and v3 were verified with Android `apksigner`; this is not an app-store release or a production signing identity.

[BUILD_PROVENANCE.json](BUILD_PROVENANCE.json) records tool versions, package ID, ABIs and hashes of source inputs checked against the native build working copy. Rebuild instructions are in [development](../docs/DEVELOPMENT.md). [Verification](../docs/VERIFICATION.md) describes actual runtime checks and limits. Redistribution notices accompany the APK in this directory and [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
