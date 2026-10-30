import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import * as SQLite from 'expo-sqlite';
import { requireNativeModule } from 'expo';
import { Controller } from './src/controller';
import { HydrationError, SQLiteStore, type Database } from './src/storage';
import {
  createClock,
  elapsed,
  remaining,
  type Mode,
  type State,
  type Command,
} from './src/domain';
import { styles, colors } from './src/theme';
import { Button, Icon, type Tab } from './src/components';
const nativeClock = requireNativeModule<{ elapsedRealtime(): number }>(
  'SessionClock',
);
const clock = createClock(Date.now, () => nativeClock.elapsedRealtime());
const newId = () =>
  `s-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
const modeName = (mode: Mode) => (mode === 'focus' ? 'Focus' : 'Short break');
const duration = (ms: number) =>
  `${Math.floor(ms / 60_000)}m ${Math.floor(ms / 1000) % 60}s`;
const time = (ms: number) =>
  `${Math.floor(Math.ceil(ms / 1000) / 60)
    .toString()
    .padStart(
      2,
      '0',
    )}:${(Math.ceil(ms / 1000) % 60).toString().padStart(2, '0')}`;
function Product() {
  const [fonts, fontError] = useFonts({
    Sans: require('./assets/fonts/DMSans.ttf'),
    Mono: require('./assets/fonts/DMMono.ttf'),
  });
  const [state, setState] = useState<State | null>(null);
  const [tab, setTab] = useState<Tab>('Timer');
  const [mode, setMode] = useState<Mode>('focus');
  const [now, setNow] = useState(clock());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [repairable, setRepairable] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const [focus, setFocus] = useState('25');
  const [rest, setRest] = useState('5');
  const [saved, setSaved] = useState(false);
  const [finished, setFinished] = useState(false);
  const store = useRef<SQLiteStore | null>(null);
  const controller = useRef<Controller | null>(null);
  const mounted = useRef(true);
  const { width, fontScale } = useWindowDimensions();
  const report = (e: unknown) => {
    if (!mounted.current) return;
    setError(
      e instanceof HydrationError
        ? e.message
        : 'We could not save your latest action. Reload your saved sessions to continue.',
    );
    setRepairable(e instanceof HydrationError && e.repairable);
  };
  const load = async () => {
    setBusy(true);
    setError('');
    try {
      if (!store.current) {
        const db = await SQLite.openDatabaseAsync('focus-sessions.db');
        store.current = new SQLiteStore(db as unknown as Database);
      }
      if (!controller.current) {
        await store.current.init();
        controller.current = new Controller(store.current, clock, (s) => {
          if (mounted.current) setState(s);
        });
      }
      await controller.current.load();
      const s = controller.current.state!;
      if (mounted.current) {
        setFocus(String(s.preferences.focus));
        setRest(String(s.preferences.break));
        setSkipped(store.current.skipped);
        if (s.active) setMode(s.active.mode);
      }
    } catch (e) {
      report(e);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    // Initial hydration synchronizes this component with the local database.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const act = async (command: Command): Promise<boolean> => {
    if (busy || error) return false;
    setBusy(true);
    try {
      await controller.current!.dispatch(command);
      setNow(clock());
      return true;
    } catch (e) {
      report(e);
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  useEffect(() => {
    const tick = () => {
      setNow(clock());
      const s = controller.current?.state?.active;
      if (s?.status === 'running' && remaining(s, clock()) === 0)
        void controller
          .current!.dispatch({ type: 'reconcile' })
          .then(() => {
            if (mounted.current) setFinished(true);
          })
          .catch(report);
    };
    const interval = setInterval(tick, 250);
    const listener = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        tick();
        if (controller.current?.state)
          void controller.current.dispatch({ type: 'reconcile' }).catch(report);
      }
    });
    return () => {
      clearInterval(interval);
      listener.remove();
    };
  }, []);
  const active = state?.active;
  const shownMode = active?.mode ?? mode;
  const planned =
    active?.plannedMs ?? (state?.preferences[mode] ?? 25) * 60_000;
  const left = active ? remaining(active, now) : planned;
  const progress = active ? elapsed(active, now) / planned : 0;
  const ring = Math.min(width - 96, 286);
  const radius = (ring - 18) / 2;
  const circumference = 2 * Math.PI * radius;
  const confirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    action = 'Confirm',
  ) =>
    Alert.alert(title, message, [
      { text: 'Keep', style: 'cancel' },
      { text: action, style: 'destructive', onPress: onConfirm },
    ]);
  const chooseMode = (next: Mode) => {
    if (next === shownMode) return;
    if (active)
      confirm(
        'Change session mode?',
        'This cancels the current session and records its elapsed time. The new mode will be ready to start.',
        () => {
          void act({ type: 'cancel' }).then((ok) => {
            if (ok) {
              setMode(next);
              setFinished(false);
            }
          });
        },
        'Change mode',
      );
    else {
      setMode(next);
      setFinished(false);
    }
  };
  const start = () => {
    setFinished(false);
    void act({
      type: 'start',
      mode,
      id: newId(),
    });
  };
  const repair = () =>
    confirm(
      'Repair local state?',
      'The unreadable timer will be removed without a history result. Valid history stays. Invalid preferences reset to 25 and 5 minutes.',
      () => {
        setBusy(true);
        void store
          .current!.repair()
          .then(load)
          .catch(report)
          .finally(() => setBusy(false));
      },
      'Repair',
    );
  if (!fonts && !fontError)
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.mint} />
        <Text style={styles.body}>Preparing your space…</Text>
      </SafeAreaView>
    );
  return (
    <SafeAreaView
      style={styles.safe}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.brandMark}>
          <View style={styles.markLine} />
          <View style={[styles.markLine, { height: 22 }]} />
          <View style={styles.markLine} />
        </View>
        <Text style={styles.brand}>focus sessions</Text>
        <View style={styles.localPill}>
          <View style={styles.dot} />
          <Text style={styles.localText}>OFFLINE</Text>
        </View>
      </View>
      <ScrollView
        key={tab}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <View style={styles.error} accessibilityLiveRegion="polite">
            <Text style={styles.cardTitle}>Local storage needs attention</Text>
            <Text style={styles.body}>{error}</Text>
            <Button
              title="Reload saved state"
              onPress={() => void load()}
              disabled={busy}
              secondary
            />
            {repairable && (
              <Button
                title="Repair local state"
                onPress={repair}
                disabled={busy}
              />
            )}
          </View>
        ) : null}
        {!state && !error ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.mint} />
            <Text style={styles.body}>Reading saved sessions…</Text>
          </View>
        ) : null}
        {state && tab === 'Timer' ? (
          <>
            <Text style={styles.eyebrow}>A LITTLE SPACE TO DO YOUR BEST</Text>
            <Text style={styles.title}>
              {active?.status === 'paused'
                ? 'Take your time.'
                : finished && !active
                  ? 'Nicely done.'
                  : 'One thing at a time.'}
            </Text>
            <Text style={styles.subtitle}>
              {active?.status === 'paused'
                ? 'Your session is saved. Resume when you’re ready.'
                : finished && !active
                  ? 'Your session is saved in history. Take a breath.'
                  : 'Settle in. Give this moment your attention.'}
            </Text>
            <View style={styles.segment}>
              {(['focus', 'break'] as const).map((m) => (
                <Pressable
                  key={m}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: shownMode === m }}
                  onPress={() => chooseMode(m)}
                  disabled={busy || !!error}
                  style={[styles.mode, shownMode === m && styles.modeSelected]}
                >
                  <Text
                    style={[
                      styles.modeText,
                      shownMode === m && { color: colors.bg },
                    ]}
                  >
                    {modeName(m)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <LinearGradient
              colors={['#1D3339', '#14252D']}
              style={styles.timerCard}
            >
              <View style={styles.timerMeta}>
                <Text style={styles.eyebrow}>
                  {modeName(shownMode).toUpperCase()}
                </Text>
                <Text style={styles.timerState}>
                  {busy
                    ? 'SAVING'
                    : active?.status === 'paused'
                      ? 'PAUSED'
                      : active
                        ? 'IN PROGRESS'
                        : 'READY'}
                </Text>
              </View>
              <View
                style={{
                  width: ring,
                  height: ring,
                  alignSelf: 'center',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginVertical: 18,
                }}
                accessibilityLabel={`${time(left)} remaining`}
              >
                <Svg width={ring} height={ring} style={StyleSheet.absoluteFill}>
                  <Circle
                    cx={ring / 2}
                    cy={ring / 2}
                    r={radius}
                    stroke="#2E474C"
                    strokeWidth={6}
                    fill="none"
                  />
                  <Circle
                    cx={ring / 2}
                    cy={ring / 2}
                    r={radius}
                    stroke={
                      active?.status === 'paused' ? colors.coral : colors.mint
                    }
                    strokeWidth={6}
                    fill="none"
                    strokeDasharray={`${circumference}`}
                    strokeDashoffset={circumference * (1 - progress)}
                    strokeLinecap="round"
                    rotation={-90}
                    origin={`${ring / 2}, ${ring / 2}`}
                  />
                  <Circle cx={ring / 2} cy={9} r={4} fill={colors.mint} />
                </Svg>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[
                    styles.digits,
                    { fontSize: fontScale > 1.2 ? 44 : 52 },
                  ]}
                >
                  {time(left)}
                </Text>
                <Text style={styles.ringCaption}>
                  {active?.status === 'paused'
                    ? 'TIME TO BREATHE'
                    : 'MINUTES REMAINING'}
                </Text>
              </View>
              <Button
                title={
                  !active
                    ? 'Start session'
                    : active.status === 'paused'
                      ? 'Resume session'
                      : 'Pause session'
                }
                onPress={() =>
                  active
                    ? void act({
                        type: active.status === 'paused' ? 'resume' : 'pause',
                      })
                    : start()
                }
                disabled={busy || !!error}
              />
              {active ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    confirm(
                      'Cancel this session?',
                      'Elapsed time will be saved as cancelled. Paused time is excluded.',
                      () => void act({ type: 'cancel' }),
                      'Cancel session',
                    )
                  }
                  disabled={busy || !!error}
                  style={styles.textButton}
                >
                  <Text style={styles.link}>Cancel & reset</Text>
                </Pressable>
              ) : (
                <Text style={styles.cardFoot}>
                  {Math.round(planned / 60_000)} min · just you and your next
                  step
                </Text>
              )}
            </LinearGradient>
            <View style={styles.awayNote}>
              <Text style={styles.noteSymbol}>↗</Text>
              <Text style={[styles.body, { flex: 1 }]}>
                Time keeps moving while you’re away. Return to record
                completion. No background alarm.
              </Text>
            </View>
            <View style={styles.bottomTip}>
              <Text style={styles.eyebrow}>MAKE ROOM FOR FOCUS</Text>
              <Text style={styles.tip}>
                A clear intention. A quiet screen.{'\n'}A small beginning.
              </Text>
            </View>
          </>
        ) : null}
        {state && tab === 'History' ? (
          <>
            <Text style={styles.eyebrow}>YOUR TIME, KEPT SIMPLY</Text>
            <Text style={styles.title}>Session history</Text>
            <Text style={styles.subtitle}>
              A record of showing up. Stored only on this device.
            </Text>
            <View style={styles.summary}>
              <Text style={styles.summaryNumber}>
                {Math.floor(
                  state.history
                    .filter((r) => r.mode === 'focus')
                    .reduce((a, r) => a + r.actualMs, 0) / 60_000,
                )}
                <Text style={styles.summaryUnit}> min</Text>
              </Text>
              <Text style={styles.body}>Focus time in retained history</Text>
            </View>
            {skipped > 0 && (
              <Text style={styles.warning}>
                {skipped} unreadable history record(s) hidden. Valid records are
                available; unreadable data has not been repaired or removed.
              </Text>
            )}
            {state.history.length === 0 ? (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Icon kind="History" color={colors.mint} />
                </View>
                <Text style={styles.cardTitle}>
                  Your first session starts here.
                </Text>
                <Text style={[styles.body, { textAlign: 'center' }]}>
                  Completed and cancelled sessions will appear here. There’s no
                  rush.
                </Text>
                <Button
                  title="Go to timer"
                  onPress={() => setTab('Timer')}
                  secondary
                />
              </View>
            ) : (
              <>
                <Text style={[styles.eyebrow, { marginBottom: 12 }]}>
                  RECENT SESSIONS · {state.history.length}
                </Text>
                {state.history.map((r) => (
                  <View key={r.id} style={styles.historyRow}>
                    <View style={styles.historyTop}>
                      <Text style={styles.cardTitle}>{modeName(r.mode)}</Text>
                      <Text
                        style={[
                          styles.badge,
                          {
                            color:
                              r.status === 'completed'
                                ? colors.mint
                                : colors.coral,
                          },
                        ]}
                      >
                        {r.status === 'completed' ? 'Completed' : 'Cancelled'}
                      </Text>
                    </View>
                    <Text style={styles.date}>
                      {new Date(r.finishedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}{' '}
                      ·{' '}
                      {new Date(r.finishedAt).toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                    <Text style={styles.historyDetail}>
                      {duration(r.actualMs)} elapsed / {r.plannedMs / 60_000}{' '}
                      min planned
                    </Text>
                  </View>
                ))}
              </>
            )}
            {(state.history.length > 0 || skipped > 0) && (
              <Button
                title="Clear history"
                secondary
                disabled={busy || !!error}
                onPress={() =>
                  confirm(
                    'Clear all history?',
                    'All completed and cancelled records, including unreadable history, will be deleted. Your active timer and preferences stay.',
                    () =>
                      void act({ type: 'clear' }).then((ok) => {
                        if (ok) setSkipped(0);
                      }),
                    'Clear history',
                  )
                }
              />
            )}
            <Text style={styles.footnote}>
              The newest 500 sessions are retained. Totals include completed and
              cancelled focus time; breaks and paused time are excluded.
            </Text>
          </>
        ) : null}
        {state && tab === 'Settings' ? (
          <>
            <Text style={styles.eyebrow}>FIND YOUR OWN RHYTHM</Text>
            <Text style={styles.title}>A pace that fits.</Text>
            <Text style={styles.subtitle}>
              Choose the length of your next session.
            </Text>
            <View style={styles.settingsCard}>
              <Text style={styles.cardTitle}>Session lengths</Text>
              <Text style={styles.fieldLabel}>Focus · 1–180 minutes</Text>
              <TextInput
                accessibilityLabel="Focus minutes"
                keyboardType="number-pad"
                maxLength={3}
                value={focus}
                onChangeText={(v) => {
                  setFocus(v);
                  setSaved(false);
                }}
                style={styles.input}
                editable={!busy && !error}
              />
              <Text style={styles.fieldLabel}>Short break · 1–60 minutes</Text>
              <TextInput
                accessibilityLabel="Short break minutes"
                keyboardType="number-pad"
                maxLength={2}
                value={rest}
                onChangeText={(v) => {
                  setRest(v);
                  setSaved(false);
                }}
                style={styles.input}
                editable={!busy && !error}
              />
              <Button
                title="Save durations"
                disabled={busy || !!error}
                onPress={() => {
                  Keyboard.dismiss();
                  if (
                    !/^\d+$/.test(focus) ||
                    !/^\d+$/.test(rest) ||
                    Number(focus) < 1 ||
                    Number(focus) > 180 ||
                    Number(rest) < 1 ||
                    Number(rest) > 60
                  ) {
                    Alert.alert(
                      'Check durations',
                      'Use whole minutes: focus 1–180, short break 1–60.',
                    );
                    return;
                  }
                  void act({
                    type: 'preferences',
                    preferences: { focus: Number(focus), break: Number(rest) },
                  }).then((ok) => {
                    if (ok) setSaved(true);
                  });
                }}
              />
              {saved && (
                <Text accessibilityLiveRegion="polite" style={styles.saved}>
                  Durations saved on this device.
                </Text>
              )}
              <Text style={styles.footnote}>
                Changes apply to the next session. An active session keeps its
                original duration.
              </Text>
            </View>
            <View style={styles.about}>
              <Text style={styles.cardTitle}>Room to disconnect.</Text>
              <Text style={styles.body}>
                No account. No analytics. No connection needed. Your sessions
                stay on this device.
              </Text>
              <Text style={styles.body}>
                There is no alarm when the app is closed. Running sessions
                reconcile when you return; paused sessions stay paused.
              </Text>
              <Text style={styles.footnote}>
                Changing the device clock after closing the app can affect
                recovered time. Keep automatic date and time enabled for
                consistent results.
              </Text>
              <Text style={styles.eyebrow}>FOCUS SESSIONS / 1.0</Text>
            </View>
          </>
        ) : null}
      </ScrollView>
      <View style={styles.nav}>
        {(['Timer', 'History', 'Settings'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityLabel={t}
            accessibilityState={{ selected: tab === t }}
            onPress={() => {
              Keyboard.dismiss();
              setTab(t);
            }}
            style={styles.navItem}
          >
            <Icon kind={t} color={tab === t ? colors.mint : colors.muted} />
            <Text
              style={[
                styles.navText,
                { color: tab === t ? colors.mint : colors.muted },
              ]}
            >
              {t}
            </Text>
            {tab === t && <View style={styles.navDot} />}
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <Product />
    </SafeAreaProvider>
  );
}
