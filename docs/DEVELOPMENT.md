# Development

Use Node 26 (Node 22.13+ is the Expo SDK minimum), npm with the committed lockfile, Microsoft OpenJDK 17, Android SDK platform 37.0/build tools 37.0.0, NDK 27.1.12297006 and CMake 3.22.1. Native directories are generated and ignored. Do not edit them as the source of product configuration.

```powershell
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
```

Tests use Node's built-in SQLite on the host for real SQL transaction/rollback coverage; the Android adapter is verified separately in the installed release. Unit tests drive longer durations and clock boundaries without waiting in real time.

The packaged UI/lifecycle scenario is `tests/android_smoke.py`. Install `tests/requirements-android.txt` in an isolated Python environment and run it against a disposable, rootable emulator with `--adb <adb.exe> --serial emulator-5554 --evidence <external-directory> --reset-emulator`. It intentionally clears only this app's data and uses synthetic SQL faults. It refuses physical-device serials. UIAutomator2 observes real Android accessibility trees over adb with idle waiting disabled so an updating countdown cannot produce stale UI snapshots. No test server is included in the product APK. Start the emulator and run `adb root` before the fault-injection checks.

## Local standalone build

Set `JAVA_HOME` and `ANDROID_HOME` to your JDK/SDK. Add Java to this shell's PATH. Accept the official SDK licenses and install the tools in a user-scoped SDK. No cloud account or EAS build is used.

On Windows, build from a short **physical** checkout path such as `D:/FocusSessionsBuild`. Ninja's Windows path limit can be exceeded by React Native codegen at a deep checkout path. A substituted drive can also mix canonical roots during autolinking; use a real short checkout/copy with its own `npm ci`. The build script limits CMake object paths as an additional precaution. The verified build used a source-identical short working copy; runtime source hashes are listed in the demo provenance.

Create your own dedicated demo keystore **outside this repository**, using `keytool -genkeypair` with RSA 3072 or stronger. Keep passwords in private environment inputs, never source files or command logs. Export:

```powershell
$env:FOCUS_KEYSTORE = '<absolute private keystore path>'
$env:FOCUS_KEY_ALIAS = '<your alias>'
# Supply FOCUS_STORE_PASSWORD and FOCUS_KEY_PASSWORD privately in this shell.
npm run android:build
```

The PowerShell script runs Expo prebuild, removes template debug signing assignments, calls Gradle `assembleRelease` for `arm64-v8a,x86_64`, aligns the unsigned APK, signs through environment password inputs, verifies the signature and writes SHA-256. APK output is `demo/focus-sessions-1.0.0.apk`. Do not substitute a Metro-dependent debug build. Rebuilds need development dependencies/network for uncached artifacts; installed app use does not.

Expo SDK 58 pairs React Native 0.88 with React 19.3. Compile SDK 37 and build tools 37.0.0 follow the SDK compatibility requirements; target SDK remains 36. The SDK manager's package name is `platforms;android-37.0`. Zod is overridden to patched 4.6.7 for the Expo CLI dependency. The remaining npm audit advisory affects unpatched `deepmerge` in Expo build/config tooling; product code never merges untrusted objects with it. Do not apply a forced downgrade to Expo 51 as an audit fix.

Regenerate the original icon with `python scripts/generate-icon.py` (Pillow required). `node scripts/collect-notices.mjs` collects installed package notices, including development tools as a conservative superset. Fonts retain their bundled SIL OFL notices. Native runtime notices are supplied separately in `demo/NATIVE_LICENSES.txt`.

Official references checked for this release: [Expo SDK compatibility](https://docs.expo.dev/versions/latest/), [local native builds](https://docs.expo.dev/guides/local-app-development/), [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/), [React Native AppState](https://reactnative.dev/docs/appstate), [Android activity lifecycle](https://developer.android.com/guide/components/activities/activity-lifecycle), [Android emulator CLI](https://developer.android.com/studio/run/emulator-commandline).

The Android clock bridge follows the [Expo local modules API](https://docs.expo.dev/modules/get-started/) and uses [SystemClock.elapsedRealtime](<https://developer.android.com/reference/android/os/SystemClock#elapsedRealtime()>), which includes deep sleep. It supplies timestamps, not a background worker or alarm.
