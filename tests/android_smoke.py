"""Destructive release checks on a disposable, rootable Android emulator only.

Requires an installed standalone APK, adb, and --reset-emulator. Evidence stays in
the explicitly selected external directory. Never use this against personal data.
"""
import argparse
import json
import re
import shlex
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path
import uiautomator2 as u2

PACKAGE = 'com.dartorange.focussessions'
COMPONENT = PACKAGE + '/.MainActivity'
DB = f'/data/user/0/{PACKAGE}/files/SQLite/focus-sessions.db'

class Device:
    def __init__(self, adb, serial, evidence):
        if not serial.startswith('emulator-'):
            raise ValueError('Only a disposable emulator is supported.')
        self.prefix = [adb, '-s', serial]
        self.evidence = Path(evidence)
        self.evidence.mkdir(parents=True, exist_ok=True)
        self.checks = []
        if self.shell('getprop ro.kernel.qemu').strip() != '1':
            raise ValueError('Target is not an Android emulator.')
        self.automation = u2.connect(serial)
        self.automation.jsonrpc.setConfigurator({'waitForIdleTimeout':0, 'waitForSelectorTimeout':0})

    def run(self, *args, binary=False):
        return subprocess.check_output(self.prefix + list(args), text=not binary, encoding=None if binary else 'utf-8', errors=None if binary else 'replace', timeout=35)

    def shell(self, command):
        return self.run('shell', command)

    def launch(self):
        self.shell(f'am start -W -n {COMPONENT}')
        time.sleep(1)

    def stop(self):
        self.shell(f'am force-stop {PACKAGE}')

    def ui(self):
        return ET.fromstring(self.automation.dump_hierarchy(compressed=False))

    def nodes(self):
        return list(self.ui().iter('node'))

    def has(self, label):
        return any(label.lower() in (n.get('text','')+' '+n.get('content-desc','')).lower() for n in self.nodes())

    def click(self, label, scroll=False):
        for attempt in range(5 if scroll else 1):
            nodes=self.nodes()
            for selector in [self.automation(description=label), self.automation(textMatches='(?i)^'+re.escape(label)+'$')]:
                if selector.exists:
                    info=selector.info
                    bounds=info.get('visibleBounds',info['bounds'])
                    if bounds['right']>bounds['left'] and bounds['bottom']>bounds['top']:
                        selector.click(timeout=1)
                        time.sleep(.5)
                        return
            if scroll:
                self.automation(scrollable=True).scroll.forward(steps=35)
        raise AssertionError(f'Control missing: {label}; UI: '+str([(n.get('text'),n.get('content-desc')) for n in nodes]))

    def field(self,label,value):
        self.click(label)
        self.shell('input keyevent KEYCODE_MOVE_END')
        self.shell('input keyevent --longpress KEYCODE_DEL')
        self.shell('input keyevent KEYCODE_DEL')
        self.shell('input keyevent KEYCODE_DEL')
        self.shell('input text '+str(value))
        self.shell('input keyevent KEYCODE_BACK')

    def screenshot(self,name):
        (self.evidence/(name+'.png')).write_bytes(self.run('exec-out','screencap','-p',binary=True))

    def sql(self,sql):
        return self.shell('sqlite3 '+shlex.quote(DB)+' '+shlex.quote(sql)).strip()

    def active(self):
        raw=self.sql("SELECT value FROM meta WHERE key='active'")
        return json.loads(raw) if raw else None

    def history(self):
        return [json.loads(line) for line in self.sql('SELECT doc FROM history ORDER BY rowid').splitlines() if line]

    def remaining_ui(self):
        for node in self.nodes():
            value=node.get('text','')
            if re.fullmatch(r'\d{2,3}:\d{2}',value):
                minutes,seconds=map(int,value.split(':'))
                return minutes*60+seconds
        raise AssertionError('Visible countdown missing')

    def record(self,name):
        self.checks.append(name)
        print('PASS: '+name,flush=True)
        (self.evidence/'checks.json').write_text(json.dumps(self.checks,indent=2)+'\n',encoding='utf-8')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adb',default='adb')
    parser.add_argument('--serial',default='emulator-5554')
    parser.add_argument('--evidence',required=True)
    parser.add_argument('--reset-emulator',action='store_true',required=True)
    args=parser.parse_args()
    d=Device(args.adb,args.serial,args.evidence)
    # The full scenario is invoked explicitly; never reset from an import.
    scenario(d)

def scenario(d):
    d.stop()
    d.shell(f'pm clear {PACKAGE}')
    d.shell('svc wifi disable');d.shell('svc data disable')
    d.shell('settings put global airplane_mode_on 1')
    d.launch();d.screenshot('01-timer')
    assert d.has('25:00')
    d.click('History');assert d.has('Your first session starts here.')
    d.screenshot('02-empty-history')
    d.record('Fresh offline launch, default duration and honest empty history')
    d.click('Settings'); d.field('Focus minutes',1); d.field('Short break minutes',1)
    d.click('Save durations',scroll=True);assert d.has('Durations saved on this device.')
    d.screenshot('03-settings');d.click('Timer');d.click('Start session')
    d.click('Pause session');paused=d.active();assert paused['status']=='paused'
    d.screenshot('04-paused');d.shell('input keyevent KEYCODE_HOME');time.sleep(3);d.launch()
    assert d.active()['elapsedMs']==paused['elapsedMs'];assert d.has('Resume session')
    d.stop();d.launch();assert d.active()['status']=='paused';assert d.active()['elapsedMs']==paused['elapsedMs']
    d.record('Settings persist; paused session survives background and process death without counting paused time')
    d.click('Resume session');running=d.active();before=d.remaining_ui()
    d.shell('input keyevent KEYCODE_HOME');d.shell('input keyevent KEYCODE_SLEEP')
    d.shell('dumpsys deviceidle force-idle');time.sleep(4);d.shell('dumpsys deviceidle unforce')
    d.shell('input keyevent KEYCODE_WAKEUP');d.shell('wm dismiss-keyguard');d.launch()
    assert d.active()['status']=='running'
    assert d.has('Pause session')
    assert d.remaining_ui()<=before-3
    d.screenshot('05-running')
    deadline=running['anchor']+running['plannedMs']-running['elapsedMs']
    # This is real time through the installed UI, not an injected short fixture.
    until=time.monotonic()+75
    while d.active() and time.monotonic()<until: time.sleep(1)
    assert d.active() is None
    first=d.history();assert len(first)==1;assert first[0]['status']=='completed';assert first[0]['actualMs']==60_000;assert first[0]['finishedAt']==deadline
    d.screenshot('06-completed');d.click('History');assert d.has('Completed');d.screenshot('07-history')
    d.stop();d.launch();assert len(d.history())==1
    d.record('Real one-minute UI session: start, pause, resume, background return, completion, history and relaunch')
    d.click('Short break');d.click('Start session');original=d.active()
    d.stop();time.sleep(2);d.launch();assert d.active()['id']==original['id'];assert d.has('Pause session')
    d.stop();deadline=original['anchor']+original['plannedMs']-original['elapsedMs']
    seconds=max(0,deadline/1000-float(d.shell('date +%s').strip()))+2
    time.sleep(min(65,seconds));d.launch()
    records=d.history();assert len(records)==2;second=next(r for r in records if r['id']==original['id']);assert second['finishedAt']==deadline;assert second['status']=='completed'
    for _ in range(2):d.stop();d.launch()
    assert len(d.history())==2
    d.record('Running process death before/after deadline; logical finish persisted once across repeated launches')
    d.click('Start session');active=d.active()
    d.click('Settings');d.field('Focus minutes',2);d.click('Save durations',scroll=True)
    assert d.active()['plannedMs']==60_000
    d.click('Timer');d.click('Short break');assert d.has('Change session mode?');d.click('Keep');assert d.active()['id']==active['id']
    d.click('Short break');d.click('Change mode');assert d.active() is None;assert d.history()[-1]['status']=='cancelled'
    d.click('Start session');d.click('Cancel & reset',scroll=True);d.click('Keep');assert d.active() is not None
    d.click('Cancel & reset',scroll=True);d.click('Cancel session');assert d.active() is None
    d.record('Duration changes leave active timer intact; mode replacement and cancellation require explicit confirmation')
    d.click('Start session');active=d.active();d.click('History');count=len(d.history())
    d.click('Clear history',scroll=True);d.click('Keep');assert len(d.history())==count
    d.click('Clear history',scroll=True);d.click('Clear history');assert d.history()==[];assert d.active()['id']==active['id']
    d.record('Clear-history cancellation and confirmation preserve the active session')
    d.click('Timer');d.click('Cancel & reset',scroll=True);d.click('Cancel session')
    kept=d.history();assert len(kept)==1
    d.stop();d.sql("UPDATE meta SET value='unreadable-synthetic-timer' WHERE key='active'");d.launch()
    assert d.has('Local storage needs attention');d.screenshot('08-corrupt-recovery')
    d.click('Repair local state');d.click('Repair');assert d.active() is None;assert d.history()==kept
    assert d.sql('SELECT count(*) FROM quarantine')=='1'
    d.record('Corrupt persisted timer repair retains valid history and creates no false completion')
    d.sql("CREATE TRIGGER qa_block BEFORE INSERT ON meta BEGIN SELECT RAISE(ABORT,'Synthetic write failure'); END;")
    d.click('Start session');assert d.has('Local storage needs attention');assert d.active() is None;assert d.history()==kept
    d.screenshot('09-failed-write');d.sql('DROP TRIGGER qa_block');d.click('Reload saved state');d.click('Start session');assert d.active() is not None
    d.click('Pause session');d.record('Native SQLite write failure does not acknowledge success; explicit reload restores usable commands')
    d.shell('wm size 900x1600');d.shell('settings put system font_scale 1.5');d.stop();d.launch()
    assert d.has('Take your time.');d.screenshot('10-small-large-text-timer');d.click('Resume session',scroll=True);d.click('Pause session',scroll=True)
    d.click('History');assert d.has('Session history');d.screenshot('11-small-large-text-history')
    d.click('Settings');d.screenshot('12-small-large-text-settings');d.click('Save durations',scroll=True)
    d.shell('wm size reset');d.shell('settings put system font_scale 1.0');d.stop();d.launch();d.click('Settings');assert d.has('Focus minutes')
    d.record('Small 343x610 dp screen at 150% font scale: timer controls, history and settings remain reachable')
    d.screenshot('13-final-settings')

if __name__=='__main__':
    main()
