# Release verification

Verified on 2026-10-30 using the installed standalone release APK. This is Android emulator evidence, not a browser preview, Expo Go run, physical-phone test or iOS validation.

## Artifact and target

- Artifact: `demo/focus-sessions-1.0.0.apk`, 46,993,831 bytes.
- SHA-256: `faee5aac68ab0260e9de71cd8b8b4382b32c27069df231ccf409bdebbf0f8586`.
- The installed `base.apk` SHA-256 was read back through adb and matched this exact hash.
- Package `com.dartorange.focussessions`, version 1.0.0 / code 1; min SDK 24, target 36, compile 37.
- Android Emulator 37.2.13.0; AVD `FocusSessions_API36`, Pixel 6 profile, Google APIs x86_64, Android 16 / API 36, WHPX on Windows x64.
- Runtime ABI x86_64. The same APK includes ARM64 libraries, but ARM64 execution was not tested.
- 1080 × 2400 px at 420 dpi; additional 900 × 1600 px at 420 dpi with 150% font scaling. Insets, navigation and keyboard behavior were exercised in the actual app.

Wi-Fi and mobile data were disabled and airplane mode enabled. No Metro listener was running. Manifest inspection found no INTERNET permission. The APK contains a bundled Hermes JavaScript asset and local font resources; its ZIP inventory contains no database, environment file or signing key. Android `apksigner` verified embedded v2 and v3 signatures from the dedicated RSA 3072 demo identity.

## Packaged-runtime results

All nine scenario groups in [runtime-checks.json](runtime-checks.json) passed using `tests/android_smoke.py`, UIAutomator2 3.7.1 and adb. Root access was used only on the disposable emulator to inspect synthetic test state and inject storage faults. No test-only route, seed, accelerated duration or debug client exists inside the APK.

| Scenario                                                        | Observed result                                                                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh offline launch                                            | 25-minute default, working Start action, honest empty history                                                                                                             |
| Configure, pause, resume, background, finish, history, relaunch | A real one-minute session completed through the packaged UI; actual time was 60,000 ms excluding pauses                                                                   |
| Paused lifecycle recovery                                       | Backgrounding and process termination/relaunch preserved paused state and the exact accumulated time                                                                      |
| Running background recovery                                     | Countdown advanced during a screen-off interval; a forced-idle command was also issued before returning                                                                   |
| Process termination before and after deadline                   | Same session ID recovered before its deadline; afterward one completion used the exact stored logical deadline; repeated launches kept the result count unchanged         |
| Settings and cancellation                                       | Preferences survived relaunch and repair; changing focus duration did not resize an active session; mode replacement and cancellation both honored Keep/Confirm decisions |
| Clear history                                                   | Dismissing the dialog kept all results; confirming removed results while preserving the active ID                                                                         |
| Corrupt timer                                                   | Synthetic malformed active JSON blocked actions; confirmed repair quarantined the raw value, retained valid history and created no completion                             |
| Failed write                                                    | A synthetic SQLite trigger aborted a real save; no active session/result was acknowledged; removing the fault and explicitly reloading restored usable commands           |
| Smaller screen and large text                                   | Timer controls, readable history rows, numeric inputs and Save remained reachable by scrolling; navigation stayed available                                               |

The Android crash buffer and error-level AndroidRuntime, ReactNativeJS, SQLiteLog and SQLiteDatabase logs had no entries after the final scenario run. Forced process stops are intentional tests, not crashes. A screen-off/idle-emulator check is not physical suspend, battery or power-management validation.

## Source and build checks

Passed: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test` (20 tests), local Gradle `assembleRelease` including `lintVitalRelease` and R8, zip alignment, signature verification, installation and runtime checks against the packaged artifact. The final native build completed successfully in 3m 33s in its warm local toolchain; this is an observed build, not a build-time benchmark.

The deterministic tests cover elapsed/deadline clamping, pause exclusion, idempotent completion, pause/cancel exactly at a deadline, explicit replacement, unchanged active duration, history clearing and retention, clock discontinuities, validated hydration, real SQLite rollback, malformed/unknown schema recovery, unreadable history preservation, ordered asynchronous writes and ambiguous acknowledgement/reload behavior. Longer durations and clock changes were driven deterministically, not waited out on Android.

Native builds use a short physical Windows working copy to avoid Ninja path limits. `scripts/package-demo.mjs` checked all recorded source input hashes against that copy before packaging. [Build provenance](../demo/BUILD_PROVENANCE.json) records exact tool and dependency versions. The remaining npm audit findings are the unpatched low-severity deepmerge issue in Expo configuration/build tooling, as described in development documentation.

## Visual review and limits

Actual installed-APK screenshots were reviewed for default, running, paused, completed, empty/history, settings, corrupt-state recovery, failed-save, small-screen and large-text states. No horizontal clipping or unreachable core control was found. At 150% font scale on the smaller target, long text wraps and vertical scrolling is expected.

Representative images: [timer](screenshots/timer.png), [history](screenshots/history.png), [empty history](screenshots/empty-history.png), [settings](screenshots/settings.png), [repair](screenshots/repair.png), [large-text timer controls](screenshots/large-text-timer.png), [large-text history](screenshots/large-text-history.png), [large-text settings](screenshots/large-text-settings.png). All session data shown comes from synthetic QA use of the real timer. It is not seeded into installations.

No physical device, ARM64 runtime, minimum-API device, active-session device reboot, OEM battery restriction, notification/sound, accessibility screen-reader session or iOS build was validated. Device wall-clock changes across process/device restarts retain the documented recovery limits. No alarm or continuous JavaScript execution is promised while closed.
