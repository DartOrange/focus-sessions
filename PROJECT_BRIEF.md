# Focus Sessions

A calm, offline Android timer for someone who wants to focus without creating an account.

## Release scope

One active focus or short-break session, configurable whole-minute durations (focus 1–180, break 1–60), pause/resume, explicit replacement/cancellation, durable history and preferences. Defaults: 25 minutes of focus, 5 minutes of rest. History contains only actual use and retains the newest 500 records. No accounts, network services, alarms, notifications, foreground service, analytics, or iOS release.

## Platform and implementation

React Native and TypeScript with Expo native generation and a local Gradle release build. SQLite commits timer state, transitions and unique history together. A serialized command queue publishes state only after commit. Locally bundled DM Sans and DM Mono provide the visual identity. Android is the sole delivery target; exact verified API/ABI and artifact hash are recorded with the demo.

## Timer contract

Refresh callbacks only redraw. A monotonic clock within one process derives elapsed time; saved wall timestamps recover time across process death. Pause freezes elapsed time. Completion uses the logical deadline and a stable session ID, once. A backward wall-clock change across restarts contributes zero elapsed time and reanchors the timer; a forward change can complete it. Across device/process restarts there is no trusted external clock. No alarm is promised while away; completion reconciles on return.

## Observable acceptance

- Install the signed APK and use it offline with no Metro, Expo Go, account or backend.
- Configure, start, pause, resume, complete a real short session and inspect its history after relaunch.
- Recover running/paused sessions across backgrounding and process termination. Repeated recovery never duplicates a result.
- Confirm cancellation, mode replacement and history deletion. Settings never resize an active timer.
- Safely hydrate validated local state, preserve valid history during recovery, expose failed saves and provide retry.
- Inspect the installed Android UI at normal and larger text sizes; controls remain reachable by scrolling.
- Pass formatting, lint, strict types, deterministic domain/persistence tests, release build and signature checks.
