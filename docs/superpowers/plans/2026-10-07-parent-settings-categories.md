# Parents App Settings Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Parents App's long Settings page into an iPhone-style list of grouped rows with colored icon tiles that drill into sub-pages, and add Install app, Help & Contact School (staff-editable), and About.

**Architecture:** The `settings` route gains an optional segment (`/settings/<section>`), so the same mounted `Settings` screen loads data once and either renders the main list or one sub-page component from a `PAGES` map. Pure logic (section order, row values, contact rows, install-prompt holder, build label) lives in small `lib/` modules with Vitest tests. Rendering uses three new list primitives (`SettingsGroup`, `SettingsRow`, `SwitchRow`). Firestore writes move into `lib/guardianWrites.js` so a browser preview harness can swap them for synthetic ones.

**Tech Stack:** React 19, Vite 8, Vitest 4 (node environment, no DOM library), Firebase JS SDK 12, plain CSS.

**Spec:** `docs/superpowers/specs/2026-10-07-parent-settings-categories-design.md`

## Global Constraints

- All Parents App copy lives in `parent/src/strings.js`. No string may contain "location", "tracking", or "live" (enforced by `parent/src/lib/strings.test.js`). Watch for hidden matches: "deliver", "alive", "allocation".
- `shared/theme/literals.test.js` forbids hex colors, `white`, and white `rgba(255,255,255…)` in any `.jsx` under `src/` or `parent/src/`, and any color literal in `parent/src/glass.css`. New colors become CSS variables in `shared/theme/theme.css`.
- `shared/theme/contrast.test.js` requires the `:root, .paper {` block and the `:root[data-theme="dark"] {` block to define the same `--t-*` tokens. Settings tile tokens therefore go in a **separate** `:root {` block, use the `--tile-*` / `--on-tile` / `--switch-*` names (not `--t-*`), and are the same in both themes.
- Settings stays a lazy route chunk. The eager entry grows only by `lib/installPrompt.js`, `lib/device.js`, and the new `Icon.jsx` glyphs. `npm run size` in `parent/` must still pass (260 KB gzipped limit).
- Tap targets are at least 44px; rows are at least 52px tall.
- Existing behavior is kept: the delete-account flow and confirm text, notification enable/disable logic, name validation (≥ 2 chars, unchanged name disables Save), and the reports query (`limit(10)`).
- Source files are checked out with CRLF line endings. Use the Edit tool for changes; don't use multi-line `sed`.
- Never kill `node` processes by name. Stop only the dev server you started, by its own PID or task.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Map

| File | Change | Responsibility |
| --- | --- | --- |
| `parent/src/lib/router.js` | Modify | `settings` route takes an optional `section` segment |
| `parent/src/lib/router.test.js`, `parent/src/lib/nav.test.js` | Modify | Route and tab-highlight tests |
| `parent/src/strings.js`, `parent/src/lib/strings.test.js` | Modify | New copy; remove the four strings the old screen alone used |
| `parent/src/lib/settingsSections.js` (+ `.test.js`) | Create | Section list and groups, row values, Help contact rows |
| `parent/src/lib/device.js` | Create | `isIOS()`, `isStandalone()` |
| `parent/src/lib/notifications.js` | Modify | Use `device.js` |
| `parent/src/lib/installPrompt.js` (+ `.test.js`) | Create | Holds Chrome/Android `beforeinstallprompt` |
| `parent/src/main.jsx` | Modify | Start the install-prompt listener at startup |
| `parent/vite.config.js` | Modify | `define` `__APP_BUILD__` (date + commit) |
| `parent/src/lib/buildInfo.js` (+ `.test.js`) | Create | `BUILD`, `versionLabel()` |
| `shared/theme/theme.css` | Modify | Tile and switch color tokens |
| `parent/src/components/Icon.jsx` | Modify | 13 new glyphs |
| `parent/src/glass.css` | Modify | Grouped-list styles |
| `parent/src/components/SettingsList.jsx` | Create | `SettingsGroup`, `SettingsRow`, `SwitchRow`, `IconTile` |
| `parent/src/lib/guardianWrites.js` | Create | Settings' Firestore/Auth writes in one place |
| `parent/tests/browser/settings.config.mjs`, `settings-fixture.js`, `settings-preview.html`, `settings-preview.jsx` | Create | Synthetic-data browser preview of Settings |
| `tests/browser/README.md` | Modify | How to run the preview |
| `parent/src/screens/Settings.jsx` | Rewrite | Data loading, main list, sub-page dispatch |
| `parent/src/screens/settings/*.jsx` | Create | `ProfilePage`, `NotificationsPage`, `AppearancePage`, `LearnersPage`, `ReportsPage`, `PrivacyPage`, `InstallPage`, `HelpPage`, `AboutPage` |
| `src/pages/guardians/portalContact.js` (+ `.test.js`) | Create | Staff contact-field cleaning and validation |
| `src/pages/guardians/PortalSettingsTab.jsx` | Modify | "School contact details" card |
| `functions/src/handlers/settingsAudit.js` | Modify | Audit the four contact fields |
| `functions/test/emulator/scheduled.test.js` | Modify | Audit test for a contact change |

Commands: Parents App tests run from `parent/` (`npm test`). SIMS tests run from the repo root (`npm test`). Functions emulator tests run from the repo root (`npm run test:functions`; needs the Firebase CLI and Java).

---

### Task 1: Settings route accepts a section

**Files:**
- Modify: `parent/src/lib/router.js:2-14` (ROUTES) and `:16-24` (matchRoute)
- Test: `parent/src/lib/router.test.js`, `parent/src/lib/nav.test.js`

**Interfaces:**
- Produces: `matchRoute('/settings/<key>')` → `{ name: 'settings', params: { section: '<key>' }, query }`; `matchRoute('/settings')` → `params: {}` (no `section` key at all).

- [ ] **Step 1: Write the failing tests**

Add to `parent/src/lib/router.test.js`, inside `describe('matchRoute', …)`:

```js
  it('matches the settings list and a settings section', () => {
    expect(matchRoute('/settings', '').params).toStrictEqual({});
    expect(matchRoute('/settings/notifications', '')).toEqual({ name: 'settings', params: { section: 'notifications' }, query: {} });
    expect(matchRoute('/settings/help/', '').params).toStrictEqual({ section: 'help' });
    expect(matchRoute('/settings/a/b', '').name).toBe('notFound');
  });
```

Add to `parent/src/lib/nav.test.js`, inside `describe('activeTab', …)`:

```js
  it('keeps Settings lit on a settings sub-page', () => {
    expect(activeTab(matchRoute('/settings/about').name)).toBe('settings');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (in `parent/`): `npx vitest run src/lib/router.test.js src/lib/nav.test.js`
Expected: FAIL. `/settings/notifications` returns `name: 'notFound'`.

- [ ] **Step 3: Implement**

In `parent/src/lib/router.js`, replace the settings entry:

```js
  ['settings', /^\/settings(?:\/([^/]+))?$/, ['section']],
```

Then make `matchRoute` skip optional groups that didn't match. Without this, `decodeURIComponent(undefined)` returns the string `"undefined"`:

```js
export function matchRoute(pathname, search = '') {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const query = Object.fromEntries(new URLSearchParams(search));
  for (const [name, re, keys = []] of ROUTES) {
    const m = path.match(re);
    // Optional segments that didn't match are left out of params.
    if (m) return { name, params: Object.fromEntries(keys.flatMap((k, i) => (m[i + 1] === undefined ? [] : [[k, decodeURIComponent(m[i + 1])]]))), query };
  }
  return { name: 'notFound', params: {}, query };
}
```

- [ ] **Step 4: Run all Parents App tests**

Run (in `parent/`): `npm test`
Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add parent/src/lib/router.js parent/src/lib/router.test.js parent/src/lib/nav.test.js
git commit -m "feat(parent): settings route takes an optional section

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Strings and the section model

**Files:**
- Modify: `parent/src/strings.js` (add keys before `navHome`)
- Modify: `parent/src/lib/strings.test.js`
- Create: `parent/src/lib/settingsSections.js`, `parent/src/lib/settingsSections.test.js`

**Interfaces:**
- Produces (`settingsSections.js`):
  - `SECTIONS: Array<{ key, group: 1|2|3, title: string, tile: string, icon: string }>`
  - `sectionGroups(hidden?: string[]): Array<Array<Section>>`
  - `notificationValue(state: string): string`
  - `openReportCount(reports?: Array<{status}>): number`
  - `contactRows(portal?: object): Array<{ key, label, value, href?, external?, tile, icon }>`
- Tile names used: `red indigo blue green orange teal grey`. Icon names used: `bell halfMoon download people envelope phone shield info globe clock` (Task 5 draws them).

- [ ] **Step 1: Write the failing tests**

Add to `parent/src/lib/strings.test.js`, inside `describe('strings', …)`:

```js
  it('has the settings category strings', () => {
    for (const k of ['settingsProfile', 'settingsInstall', 'settingsMyLearners', 'settingsReportsRequests', 'settingsHelp', 'settingsPrivacyAccount', 'settingsAbout',
      'settingsLearnersEmpty', 'settingsReportsEmpty', 'reportReviewed', 'notifShortOn', 'notifShortOff', 'notifShortBlocked', 'notifShortUnsupported', 'notifShortInstall',
      'notifRowScans', 'notifRowAnnouncements', 'notifHowToInstall', 'installBody', 'installButton', 'installDone', 'installIosHeader', 'installIosStep1', 'installIosStep2',
      'installIosStep3', 'installOther', 'helpPhone', 'helpEmail', 'helpFacebook', 'helpHours', 'helpEmpty', 'aboutVersion'])
      expect(typeof S[k], k).toBe('string');
  });
```

Create `parent/src/lib/settingsSections.test.js`:

```js
import { describe, it, expect } from 'vitest';
import S from '../strings.js';
import { SECTIONS, sectionGroups, notificationValue, openReportCount, contactRows } from './settingsSections.js';

const keys = (groups) => groups.map((g) => g.map((s) => s.key));

describe('sectionGroups', () => {
  it('lists the rows in three groups, top to bottom', () => {
    expect(keys(sectionGroups())).toEqual([
      ['notifications', 'appearance', 'install'],
      ['learners', 'reports'],
      ['help', 'privacy', 'about'],
    ]);
  });
  it('drops hidden rows and any group left empty', () => {
    expect(keys(sectionGroups(['install', 'learners', 'reports']))).toEqual([['notifications', 'appearance'], ['help', 'privacy', 'about']]);
  });
  it('gives every row a title, tile and icon', () => {
    for (const s of SECTIONS) {
      expect(s.title, s.key).toBeTruthy();
      expect(s.tile, s.key).toBeTruthy();
      expect(s.icon, s.key).toBeTruthy();
    }
  });
});

describe('notificationValue', () => {
  it('has a short label for every notificationState result', () => {
    expect(notificationValue('on')).toBe(S.notifShortOn);
    expect(notificationValue('off')).toBe(S.notifShortOff);
    expect(notificationValue('account_off')).toBe(S.notifShortOff);
    expect(notificationValue('blocked')).toBe(S.notifShortBlocked);
    expect(notificationValue('unsupported')).toBe(S.notifShortUnsupported);
    expect(notificationValue('ios_needs_install')).toBe(S.notifShortInstall);
    expect(notificationValue(undefined)).toBe('');
  });
});

describe('openReportCount', () => {
  it('counts only open reports', () => {
    expect(openReportCount([{ status: 'open' }, { status: 'resolved' }, { status: 'open' }])).toBe(2);
    expect(openReportCount(undefined)).toBe(0);
  });
});

describe('contactRows', () => {
  const portal = { contactPhone: ' +63 (44) 815-1234 ', contactEmail: 'registrar@example.test', contactFacebookUrl: 'https://www.facebook.com/example.school', officeHours: 'Mon–Fri, 7:30 AM – 4:30 PM' };
  it('builds tappable rows in a fixed order', () => {
    expect(contactRows(portal)).toEqual([
      { key: 'phone', label: S.helpPhone, value: '+63 (44) 815-1234', href: 'tel:+63448151234', tile: 'green', icon: 'phone' },
      { key: 'email', label: S.helpEmail, value: 'registrar@example.test', href: 'mailto:registrar@example.test', tile: 'blue', icon: 'envelope' },
      { key: 'facebook', label: S.helpFacebook, value: 'facebook.com/example.school', href: 'https://www.facebook.com/example.school', external: true, tile: 'indigo', icon: 'globe' },
      { key: 'hours', label: S.helpHours, value: 'Mon–Fri, 7:30 AM – 4:30 PM', tile: 'grey', icon: 'clock' },
    ]);
  });
  it('skips blank, missing and non-https values', () => {
    expect(contactRows({ contactPhone: '  ', contactEmail: '', contactFacebookUrl: 'http://facebook.com/x' })).toEqual([]);
    expect(contactRows(null)).toEqual([]);
    expect(contactRows(undefined)).toEqual([]);
  });
  it('shows a phone with no digits as plain text', () => {
    expect(contactRows({ contactPhone: 'Ask the guard' })[0].href).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (in `parent/`): `npx vitest run src/lib/strings.test.js src/lib/settingsSections.test.js`
Expected: FAIL. `settingsSections.js` doesn't exist and the new string keys are undefined.

- [ ] **Step 3: Add the strings**

In `parent/src/strings.js`, insert these lines immediately before `  navHome: 'Home',`:

```js
  settingsProfile: 'Profile',
  settingsInstall: 'Install app',
  settingsMyLearners: 'My Learners',
  settingsReportsRequests: 'Reports & Requests',
  settingsHelp: 'Help & Contact School',
  settingsPrivacyAccount: 'Privacy & Account',
  settingsAbout: 'About',
  settingsLearnersEmpty: 'No learners linked yet.',
  settingsReportsEmpty: 'No reports yet.',
  reportReviewed: 'Reviewed',
  notifShortOn: 'On',
  notifShortOff: 'Off',
  notifShortBlocked: 'Blocked',
  notifShortUnsupported: 'Not available',
  notifShortInstall: 'Needs install',
  notifRowScans: 'Gate scans',
  notifRowAnnouncements: 'School announcements',
  notifHowToInstall: 'How to install the app',
  installBody: 'Add this app to your Home Screen so it opens like a regular app and can send notifications.',
  installButton: 'Install',
  installDone: 'This app is installed on this device.',
  installIosHeader: 'On iPhone or iPad (Safari)',
  installIosStep1: 'Tap the Share button.',
  installIosStep2: 'Choose Add to Home Screen, then tap Add.',
  installIosStep3: 'Open the app from your Home Screen.',
  installOther: "Open your browser's menu and choose Install app or Add to Home screen.",
  helpPhone: 'Call',
  helpEmail: 'Email',
  helpFacebook: 'Facebook page',
  helpHours: 'Office hours',
  helpEmpty: "Contact the school office or your learner's adviser.",
  aboutVersion: 'Version',
```

- [ ] **Step 4: Create `parent/src/lib/settingsSections.js`**

```js
import S from '../strings.js';

// The main Settings list, top to bottom. `group` splits the rounded blocks,
// `tile` names a --tile-* color (shared/theme/theme.css), `icon` an Icon.jsx glyph.
export const SECTIONS = [
  { key: 'notifications', group: 1, title: S.settingsNotifications, tile: 'red', icon: 'bell' },
  { key: 'appearance', group: 1, title: S.themeTitle, tile: 'indigo', icon: 'halfMoon' },
  { key: 'install', group: 1, title: S.settingsInstall, tile: 'blue', icon: 'download' },
  { key: 'learners', group: 2, title: S.settingsMyLearners, tile: 'green', icon: 'people' },
  { key: 'reports', group: 2, title: S.settingsReportsRequests, tile: 'orange', icon: 'envelope' },
  { key: 'help', group: 3, title: S.settingsHelp, tile: 'teal', icon: 'phone' },
  { key: 'privacy', group: 3, title: S.settingsPrivacyAccount, tile: 'grey', icon: 'shield' },
  { key: 'about', group: 3, title: S.settingsAbout, tile: 'grey', icon: 'info' },
];

// Visible sections as one array per group, skipping `hidden` keys and empty groups.
export function sectionGroups(hidden = []) {
  const groups = new Map();
  for (const s of SECTIONS) {
    if (hidden.includes(s.key)) continue;
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push(s);
  }
  return [...groups.values()];
}

// Short right-hand value for the Notifications row, per notificationState().
const NOTIF_VALUE = {
  on: S.notifShortOn, off: S.notifShortOff, account_off: S.notifShortOff, blocked: S.notifShortBlocked,
  unsupported: S.notifShortUnsupported, ios_needs_install: S.notifShortInstall,
};
export const notificationValue = (state) => NOTIF_VALUE[state] ?? '';

export const openReportCount = (reports) => (reports || []).filter((r) => r.status === 'open').length;

// Help & Contact School rows from settings/parent_portal. Blank fields are
// skipped; a Facebook link must be https.
export function contactRows(portal) {
  const v = (k) => (typeof portal?.[k] === 'string' ? portal[k].trim() : '');
  const phone = v('contactPhone'), email = v('contactEmail'), facebook = v('contactFacebookUrl'), hours = v('officeHours');
  const dial = phone.replace(/[^\d+]/g, '');
  const rows = [];
  if (phone) rows.push({ key: 'phone', label: S.helpPhone, value: phone, ...(/\d/.test(dial) ? { href: `tel:${dial}` } : {}), tile: 'green', icon: 'phone' });
  if (email) rows.push({ key: 'email', label: S.helpEmail, value: email, href: `mailto:${email}`, tile: 'blue', icon: 'envelope' });
  if (facebook.startsWith('https://')) rows.push({ key: 'facebook', label: S.helpFacebook, value: facebook.replace(/^https:\/\/(www\.)?/, ''), href: facebook, external: true, tile: 'indigo', icon: 'globe' });
  if (hours) rows.push({ key: 'hours', label: S.helpHours, value: hours, tile: 'grey', icon: 'clock' });
  return rows;
}
```

- [ ] **Step 5: Run all Parents App tests**

Run (in `parent/`): `npm test`
Expected: PASS. This includes the forbidden-word check on the new strings.

- [ ] **Step 6: Commit**

```bash
git add parent/src/strings.js parent/src/lib/strings.test.js parent/src/lib/settingsSections.js parent/src/lib/settingsSections.test.js
git commit -m "feat(parent): settings section model and copy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Device checks and the install prompt holder

**Files:**
- Create: `parent/src/lib/device.js`
- Modify: `parent/src/lib/notifications.js` (imports and the `env` function)
- Create: `parent/src/lib/installPrompt.js`, `parent/src/lib/installPrompt.test.js`
- Modify: `parent/src/main.jsx`

**Interfaces:**
- Produces: `isIOS(): boolean`, `isStandalone(): boolean` from `lib/device.js`.
- Produces: `createInstallPrompt(target: EventTarget)` → `{ state(): 'idle'|'ready'|'installed', subscribe(fn): () => void, prompt(): Promise<'accepted'|'dismissed'|'unavailable'> }`, and `installPrompt()` → the app-wide instance bound to `window`. `state` and `subscribe` are stable functions, so they're safe to pass to `useSyncExternalStore`.

- [ ] **Step 1: Write the failing test**

Create `parent/src/lib/installPrompt.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createInstallPrompt } from './installPrompt.js';

function promptEvent(outcome) {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = vi.fn(async () => {});
  e.userChoice = Promise.resolve({ outcome });
  return e;
}
const setup = () => { const target = new EventTarget(); return { target, p: createInstallPrompt(target) }; };

describe('createInstallPrompt', () => {
  it('starts idle', () => {
    expect(setup().p.state()).toBe('idle');
  });
  it('holds the browser prompt instead of letting the browser show it', () => {
    const { target, p } = setup();
    const e = promptEvent('accepted');
    target.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(p.state()).toBe('ready');
  });
  it('shows the held prompt and reports an accepted install', async () => {
    const { target, p } = setup();
    const e = promptEvent('accepted');
    target.dispatchEvent(e);
    expect(await p.prompt()).toBe('accepted');
    expect(e.prompt).toHaveBeenCalledOnce();
    expect(p.state()).toBe('installed');
  });
  it('goes back to idle when the parent dismisses it', async () => {
    const { target, p } = setup();
    target.dispatchEvent(promptEvent('dismissed'));
    expect(await p.prompt()).toBe('dismissed');
    expect(p.state()).toBe('idle');
  });
  it('marks installed when the browser reports appinstalled', () => {
    const { target, p } = setup();
    target.dispatchEvent(promptEvent('accepted'));
    target.dispatchEvent(new Event('appinstalled'));
    expect(p.state()).toBe('installed');
  });
  it('returns unavailable when nothing is held', async () => {
    expect(await setup().p.prompt()).toBe('unavailable');
  });
  it('notifies subscribers until they unsubscribe', () => {
    const { target, p } = setup();
    const fn = vi.fn();
    const off = p.subscribe(fn);
    target.dispatchEvent(promptEvent('accepted'));
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    target.dispatchEvent(new Event('appinstalled'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (in `parent/`): `npx vitest run src/lib/installPrompt.test.js`
Expected: FAIL (cannot resolve `./installPrompt.js`).

- [ ] **Step 3: Create `parent/src/lib/installPrompt.js`**

```js
// Chrome and Android fire beforeinstallprompt once, shortly after load, and
// only show it if the page asks. main.jsx starts listening at startup so
// Settings > Install app can show it later.
export function createInstallPrompt(target) {
  let held = null;
  let installed = false;
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());
  target.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); held = e; emit(); });
  target.addEventListener('appinstalled', () => { held = null; installed = true; emit(); });
  return {
    state: () => (installed ? 'installed' : held ? 'ready' : 'idle'),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    async prompt() {
      if (!held) return 'unavailable';
      const e = held;
      held = null;
      await e.prompt();
      const { outcome } = await e.userChoice;
      if (outcome === 'accepted') installed = true;
      emit();
      return outcome;
    },
  };
}

let shared;
// The app-wide instance, bound to window on first use.
export const installPrompt = () => (shared ??= createInstallPrompt(window));
```

- [ ] **Step 4: Run the test to verify it passes**

Run (in `parent/`): `npx vitest run src/lib/installPrompt.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Create `parent/src/lib/device.js` and use it in notifications**

`parent/src/lib/device.js`:

```js
// Browser facts that Settings and the notification code both need.
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
```

In `parent/src/lib/notifications.js`, add after the `import { app, db } from '../firebase.js';` line:

```js
import { isIOS, isStandalone } from './device.js';
```

and replace the `env` function:

```js
const env = () => ({
  isIOS: isIOS(),
  isStandalone: isStandalone(),
  permission: typeof Notification === 'undefined' ? 'default' : Notification.permission,
});
```

- [ ] **Step 6: Start the listener at startup**

In `parent/src/main.jsx`, add after `import App from './App.jsx';`:

```js
import { installPrompt } from './lib/installPrompt.js';
```

and add this line immediately before `createRoot(…)`:

```js
installPrompt(); // catch beforeinstallprompt before any screen mounts
```

- [ ] **Step 7: Run tests and build**

Run (in `parent/`): `npm test && npm run build && npm run size`
Expected: tests PASS, build succeeds, size reports under the limit.

- [ ] **Step 8: Commit**

```bash
git add parent/src/lib/device.js parent/src/lib/notifications.js parent/src/lib/installPrompt.js parent/src/lib/installPrompt.test.js parent/src/main.jsx
git commit -m "feat(parent): hold the browser install prompt for Settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Build version for About

**Files:**
- Modify: `parent/vite.config.js`
- Create: `parent/src/lib/buildInfo.js`, `parent/src/lib/buildInfo.test.js`

**Interfaces:**
- Produces: `BUILD: { date: string, commit: string }` (both `'dev'` when undefined) and `versionLabel(b = BUILD): string`, e.g. `'2026-10-07 (960fb01)'`, or the date alone when `commit === 'dev'`.

- [ ] **Step 1: Write the failing test**

Create `parent/src/lib/buildInfo.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { BUILD, versionLabel } from './buildInfo.js';

describe('buildInfo', () => {
  it('takes the build date from the Vite define', () => {
    expect(BUILD.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('labels the version with the date and commit', () => {
    expect(versionLabel({ date: '2026-10-07', commit: '960fb01' })).toBe('2026-10-07 (960fb01)');
  });
  it('shows only the date without a commit', () => {
    expect(versionLabel({ date: '2026-10-07', commit: 'dev' })).toBe('2026-10-07');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (in `parent/`): `npx vitest run src/lib/buildInfo.test.js`
Expected: FAIL (cannot resolve `./buildInfo.js`).

- [ ] **Step 3: Implement**

Replace `parent/vite.config.js` with:

```js
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Shown in Settings > About: the build day (school time zone) and the commit.
function buildInfo() {
  let commit = 'dev';
  try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'; } catch {}
  return { date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), commit };
}

export default defineConfig({
  plugins: [react()],
  define: { __APP_BUILD__: JSON.stringify(buildInfo()) },
  server: { port: 5174 },
  build: { target: 'es2020', sourcemap: false },
  test: { environment: 'node', include: ['src/**/*.test.js'] },
});
```

Create `parent/src/lib/buildInfo.js`:

```js
/* global __APP_BUILD__ */
// __APP_BUILD__ is replaced at build time by vite.config.js `define`; the
// fallback covers any tool that loads this file without that define.
const raw = typeof __APP_BUILD__ === 'undefined' ? {} : __APP_BUILD__;
export const BUILD = { date: raw.date || 'dev', commit: raw.commit || 'dev' };
export const versionLabel = (b = BUILD) => (b.commit === 'dev' ? b.date : `${b.date} (${b.commit})`);
```

- [ ] **Step 4: Run tests and build**

Run (in `parent/`): `npm test && npm run build`
Expected: PASS, and the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add parent/vite.config.js parent/src/lib/buildInfo.js parent/src/lib/buildInfo.test.js
git commit -m "feat(parent): stamp build date and commit for Settings > About

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Settings list UI kit (tokens, icons, styles, components)

**Files:**
- Modify: `shared/theme/theme.css` (new `:root` block right before `@media screen {`)
- Modify: `parent/src/components/Icon.jsx`
- Modify: `parent/src/glass.css` (append)
- Create: `parent/src/components/SettingsList.jsx`

**Interfaces:**
- Consumes: tile names and icon names from Task 2.
- Produces:
  - `SettingsGroup({ header?, footer?, children })`
  - `IconTile({ tile, icon })`
  - `SettingsRow({ tile?, icon?, leading?, label, subtitle?, value?, onClick?, href?, external?, tone?: 'primary'|'danger', variant?: 'profile'|'center', disabled?, chevron? })`. `chevron` defaults to true when `onClick` or `href` is set. A `value` of `undefined` or `''` is not shown.
  - `SwitchRow({ label, checked, onChange(next: boolean), disabled? })`
  - CSS classes `settings-avatar`, `settings-avatar--small`, `settings-intro`
  - New `Icon` names: `bell halfMoon download people envelope phone shield info chevron share plusSquare globe clock`

These components aren't imported until Task 7. Vitest has no DOM, so this task's check is the existing suites (the color-literal and contrast tests cover the CSS and token changes). The components are rendered for real in Task 6/7's browser preview.

- [ ] **Step 1: Add color tokens**

In `shared/theme/theme.css`, insert immediately before the line `@media screen {`:

```css
/* Settings icon tiles and switches (Parents App): the same in both themes,
   as on iPhone. Kept out of the --t-* palettes above on purpose, so
   contrast.test.js's light/dark token parity doesn't apply to them. */
:root {
  --tile-red: #FF3B30;
  --tile-indigo: #5856D6;
  --tile-blue: #007AFF;
  --tile-green: #34C759;
  --tile-orange: #FF9500;
  --tile-teal: #007A72;
  --tile-grey: #8E8E93;
  --on-tile: #FFFFFF;
  --switch-knob: #FFFFFF;
  --switch-shadow: rgba(0,0,0,.25);
}
```

- [ ] **Step 2: Add icons**

In `parent/src/components/Icon.jsx`, change the header comment's second line to:

```js
// Gear and phone paths adapted from Feather Icons (MIT). No icon dependency, so the
```

add this constant after `const WAVES = …;`:

```js
const PHONE = 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z';
```

and add these lines inside the `<svg>`, after the `check` line:

```jsx
      {name === 'bell' && <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>}
      {name === 'halfMoon' && <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></>}
      {name === 'download' && <><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></>}
      {name === 'people' && <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8" /></>}
      {name === 'envelope' && <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>}
      {name === 'phone' && <path d={PHONE} />}
      {name === 'shield' && <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />}
      {name === 'info' && <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.5h.01" /></>}
      {name === 'chevron' && <path d="M9 6l6 6-6 6" />}
      {name === 'share' && <><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" /></>}
      {name === 'plusSquare' && <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" /></>}
      {name === 'globe' && <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" /></>}
      {name === 'clock' && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
```

- [ ] **Step 3: Add styles**

Append to `parent/src/glass.css`:

```css
/* ---- Settings: iOS-style grouped rows (components/SettingsList.jsx) ---- */
.settings-group-wrap { margin: 0 0 22px; }
.settings-group-header { margin: 0 16px 6px; color: var(--t-muted); font-size: 13px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.settings-group { border-radius: 14px; overflow: hidden; }
.settings-group-footer { margin: 6px 16px 0; color: var(--t-muted); font-size: 12.5px; line-height: 1.4; }
.settings-intro { margin: 0 4px 16px; color: var(--t-muted); font-size: 14px; line-height: 1.45; }
.settings-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  box-sizing: border-box;
  padding: 9px 14px;
  border: 0;
  background: transparent;
  color: var(--t-ink);
  font: inherit;
  font-size: 16px;
  text-align: left;
  text-decoration: none;
}
button.settings-row, a.settings-row { cursor: pointer; -webkit-tap-highlight-color: transparent; }
button.settings-row:active:not(:disabled), a.settings-row:active { background: rgba(var(--t-ink-rgb), 0.07); }
.settings-row:focus-visible { outline: 2px solid var(--t-focus); outline-offset: -2px; }
.settings-row:disabled { cursor: default; opacity: 0.5; }
/* Hairline between rows, inset past the icon tile like iOS. */
.settings-row + .settings-row::before { content: ''; position: absolute; top: 0; right: 0; left: 56px; border-top: 1px solid var(--t-border); }
.settings-row--plain::before { left: 14px !important; }
.settings-row--profile { min-height: 80px; }
.settings-row--profile .settings-row-label { font-size: 19px; font-weight: 700; }
.settings-row--center { justify-content: center; }
.settings-row--center .settings-row-text { flex: 0 1 auto; text-align: center; }
.settings-tile { display: grid; place-items: center; flex: 0 0 auto; width: 30px; height: 30px; border-radius: 8px; color: var(--on-tile); }
.settings-avatar { display: grid; place-items: center; flex: 0 0 auto; width: 58px; height: 58px; border-radius: 50%; background: rgba(var(--t-primary-rgb), 0.13); color: var(--t-primary-deep); font-size: 20px; font-weight: 800; }
.settings-avatar--small { width: 30px; height: 30px; font-size: 12px; }
.settings-row-text { display: flex; flex: 1 1 auto; flex-direction: column; gap: 2px; min-width: 0; }
.settings-row-label { overflow-wrap: anywhere; }
.settings-row-label--primary { color: var(--t-primary); }
.settings-row-label--danger { color: var(--t-danger-text); }
.settings-row-subtitle { color: var(--t-muted); font-size: 13.5px; overflow-wrap: anywhere; }
.settings-row-value { flex: 0 1 auto; max-width: 45%; overflow: hidden; color: var(--t-muted); font-size: 15px; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.settings-row-chevron { display: inline-flex; flex: 0 0 auto; margin-right: -4px; color: var(--t-muted); opacity: 0.6; }
.settings-switch { position: relative; flex: 0 0 auto; width: 51px; height: 31px; border-radius: 999px; background: rgba(var(--t-ink-rgb), 0.16); transition: background-color 0.2s; }
.settings-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 27px; height: 27px; border-radius: 50%; background: var(--switch-knob); box-shadow: 0 2px 4px var(--switch-shadow); transition: transform 0.2s; }
[aria-checked="true"] > .settings-switch { background: var(--tile-green); }
[aria-checked="true"] > .settings-switch::after { transform: translateX(20px); }
```

(`main.jsx` already turns transitions off under `prefers-reduced-motion`.)

- [ ] **Step 4: Create `parent/src/components/SettingsList.jsx`**

```jsx
import Icon from './Icon.jsx';

// iPhone Settings-style building blocks: a rounded group of rows, each with an
// optional colored icon tile, a value and a chevron. Styles in glass.css.

export function SettingsGroup({ header, footer, children }) {
  return (
    <section className="settings-group-wrap">
      {header && <h2 className="settings-group-header">{header}</h2>}
      <div className="glass-card settings-group">{children}</div>
      {footer && <p className="settings-group-footer">{footer}</p>}
    </section>
  );
}

export const IconTile = ({ tile, icon }) => (
  <span className="settings-tile" style={{ background: `var(--tile-${tile})` }} aria-hidden="true"><Icon name={icon} size={18} /></span>
);

// Rows without a tile or avatar get a hairline that starts at the text, not past the tile.
const rowClass = (inset, variant) => `settings-row${inset ? '' : ' settings-row--plain'}${variant ? ` settings-row--${variant}` : ''}`;

// `onClick` makes a button, `href` a link, neither a static row. `leading`
// replaces the tile (e.g. an avatar). `tone`: 'primary' | 'danger'.
// `variant`: 'profile' (tall) | 'center' (centered label, e.g. Sign out).
export function SettingsRow({ tile, icon, leading, label, subtitle, value, onClick, href, external, tone, variant, disabled, chevron = Boolean(onClick || href) }) {
  const body = (
    <>
      {leading ?? (tile && <IconTile tile={tile} icon={icon} />)}
      <span className="settings-row-text">
        <span className={`settings-row-label${tone ? ` settings-row-label--${tone}` : ''}`}>{label}</span>
        {subtitle && <span className="settings-row-subtitle">{subtitle}</span>}
      </span>
      {value !== undefined && value !== '' && <span className="settings-row-value">{value}</span>}
      {chevron && <span className="settings-row-chevron"><Icon name="chevron" size={18} /></span>}
    </>
  );
  const className = rowClass(Boolean(leading || tile), variant);
  if (href) return <a className={className} href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{body}</a>;
  if (onClick) return <button type="button" className={className} onClick={onClick} disabled={disabled}>{body}</button>;
  return <div className={className}>{body}</div>;
}

// The whole row is the switch, so the tap target is the full row.
export function SwitchRow({ label, checked, onChange, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={rowClass(false)} disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="settings-row-text"><span className="settings-row-label">{label}</span></span>
      <span className="settings-switch" aria-hidden="true" />
    </button>
  );
}
```

- [ ] **Step 5: Run the token and literal checks and the Parents App tests**

Run (repo root): `npx vitest run shared/theme`
Expected: PASS (`literals.test.js`, `contrast.test.js`, `theme.test.js`, `boot.test.js`).

Run (in `parent/`): `npm test && npm run build`
Expected: PASS, and the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add shared/theme/theme.css parent/src/components/Icon.jsx parent/src/glass.css parent/src/components/SettingsList.jsx
git commit -m "feat(parent): grouped settings rows, icon tiles and switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Settings writes module and the browser preview

**Files:**
- Create: `parent/src/lib/guardianWrites.js`
- Modify: `parent/src/screens/Settings.jsx` (the current screen, behavior unchanged)
- Create: `parent/tests/browser/settings.config.mjs`, `parent/tests/browser/settings-fixture.js`, `parent/tests/browser/settings-preview.html`, `parent/tests/browser/settings-preview.jsx`
- Modify: `tests/browser/README.md` (append a section)

**Interfaces:**
- Produces (`guardianWrites.js`): `saveDisplayName(user, name): Promise`, `setGuardianPrefs(uid, fields): Promise`, `deleteMyAccount(): Promise`, `signOutNow(): Promise`.
- Produces (the preview): served at `http://127.0.0.1:5189/tests/browser/settings-preview.html`, with the scenarios `normal no-contact no-learners ios installed blocked notifications-off`. Clicks are recorded in a write log shown under "Preview controls".

- [ ] **Step 1: Create `parent/src/lib/guardianWrites.js`**

```js
import { signOut, updateProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db, callable } from '../firebase.js';

// Settings' account writes in one place, so the browser preview
// (parent/tests/browser/settings.config.mjs) can swap them for synthetic ones.
export async function saveDisplayName(user, name) {
  await updateDoc(doc(db, 'guardians', user.uid), { displayName: name });
  updateProfile(user, { displayName: name }).catch(() => {});
}
export const setGuardianPrefs = (uid, fields) => updateDoc(doc(db, 'guardians', uid), fields);
export async function deleteMyAccount() {
  await callable('deleteGuardianAccountFn')({});
  await signOut(auth);
}
export const signOutNow = () => signOut(auth);
```

- [ ] **Step 2: Point the current Settings screen at it (no visible change)**

In `parent/src/screens/Settings.jsx`:

Replace lines 2-4 (the `firebase/auth`, `firebase/firestore` and `../firebase.js` imports) with:

```js
import { collection, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase.js';
import { saveDisplayName, setGuardianPrefs, deleteMyAccount, signOutNow } from '../lib/guardianWrites.js';
```

Replace the body of `saveName`'s `try`/`catch` line with:

```js
    try { await saveDisplayName(user, name.trim()); setNameSaved(true); }
```

Replace `toggleAccount`, `toggleAnnouncements` and `remove` with:

```js
  const toggleAccount = () => setGuardianPrefs(user.uid, { notificationsEnabled: !accountEnabled }).catch(() => setErr(S.reportFailed));
  const toggleAnnouncements = () => setGuardianPrefs(user.uid, { announcementPushEnabled: !announcementPush }).catch(() => setErr(S.reportFailed));
```

```js
  const remove = async () => { setBusy(true); try { await deleteMyAccount(); } catch { setErr(S.reportFailed); setBusy(false); } };
```

and change the sign-out button's `onClick={() => signOut(auth)}` to `onClick={signOutNow}`.

- [ ] **Step 3: Create the preview config `parent/tests/browser/settings.config.mjs`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Browser preview of the Settings screen with synthetic data. Real components
// and CSS; hooks, writes and device checks come from settings-fixture.js.
const FIXTURE = '/tests/browser/settings-fixture.js';
const STUBS = {
  '/src/hooks/useDoc.js': `export { useDoc, useQuery } from "${FIXTURE}";`,
  '/src/hooks/useLinks.js': `export { useLinks } from "${FIXTURE}";`,
  '/src/lib/notifications.js': `export { useDeviceStatus, enableOnThisDevice, disableOnThisDevice } from "${FIXTURE}";`,
  '/src/lib/guardianWrites.js': `export { saveDisplayName, setGuardianPrefs, deleteMyAccount, signOutNow } from "${FIXTURE}";`,
  '/src/lib/device.js': `export { isIOS, isStandalone } from "${FIXTURE}";`,
  '/src/firebase.js': 'export const app = {}, db = {}, auth = {}; export const appCheckReady = Promise.resolve(); export const callable = () => async () => ({});',
};

export default defineConfig({
  plugins: [{
    name: 'settings-preview-data', enforce: 'pre',
    load(id) {
      const path = id.replaceAll('\\', '/');
      for (const [end, code] of Object.entries(STUBS)) if (path.endsWith(`/parent${end}`)) return code;
    },
  }, react()],
  define: { __APP_BUILD__: JSON.stringify({ date: '2026-10-07', commit: 'preview' }) },
  server: { host: '127.0.0.1', port: 5189, strictPort: true },
  cacheDir: 'node_modules/.vite-settings-preview',
});
```

- [ ] **Step 4: Create `parent/tests/browser/settings-fixture.js`**

```js
import { useSyncExternalStore } from 'react';

// Synthetic data for the Settings browser preview. settings.config.mjs swaps
// these in for the real hooks, writes and device checks; nothing calls Firebase.
export const SCENARIOS = ['normal', 'no-contact', 'no-learners', 'ios', 'installed', 'blocked', 'notifications-off'];
const CONTACT = {
  contactPhone: '+63 (44) 815 1234', contactEmail: 'registrar@example.test',
  contactFacebookUrl: 'https://www.facebook.com/example.school', officeHours: 'Mon–Fri, 7:30 AM – 4:30 PM',
};
let state;
let revision = 0;
const listeners = new Set();
const writes = [];
const notify = () => { revision += 1; listeners.forEach((fn) => fn()); };
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const useRevision = () => useSyncExternalStore(subscribe, () => revision);

export function setScenario(name) {
  state = {
    profile: { displayName: 'Ana Santos', notificationsEnabled: name !== 'notifications-off', announcementPushEnabled: true },
    portal: { privacyNoticeUrl: 'https://example.test/privacy', ...(name === 'no-contact' ? {} : CONTACT) },
    links: name === 'no-learners' ? [] : [
      { id: 'l1', studentId: 'S1', learnerName: 'Maria Santos', relationship: 'Mother' },
      { id: 'l2', studentId: 'S2', learnerName: 'Jose Santos Jr.', relationship: 'Mother' },
    ],
    reports: [
      { id: 'r1', reason: 'Scan time looks wrong', status: 'open' },
      { id: 'r2', reason: 'Missing exit scan', status: 'resolved', resolutionNote: 'Added the 4:05 PM exit.' },
    ],
    device: { supported: name !== 'ios', permission: name === 'blocked' ? 'denied' : 'granted', isIOS: name === 'ios', isStandalone: name === 'installed', registered: true },
  };
  writes.length = 0;
  notify();
}
setScenario('normal');

export function useProfile() { useRevision(); return state.profile; }
export function useWrites() { useRevision(); return writes; }

export function useDoc() { useRevision(); return { data: state.portal, error: null }; }
export function useQuery() { useRevision(); return { rows: state.reports, error: null }; }
export function useLinks() { useRevision(); return { links: state.links }; }
export function useDeviceStatus() { useRevision(); return { ...state.device, refresh: () => {} }; }
export const isIOS = () => state.device.isIOS;
export const isStandalone = () => state.device.isStandalone;

const record = (entry) => { writes.push(entry); notify(); };
export async function enableOnThisDevice() { state.device = { ...state.device, registered: true }; record(['enableOnThisDevice']); }
export async function disableOnThisDevice() { state.device = { ...state.device, registered: false }; record(['disableOnThisDevice']); }
export async function saveDisplayName(user, name) { state.profile = { ...state.profile, displayName: name }; record(['saveDisplayName', name]); }
export async function setGuardianPrefs(uid, fields) { state.profile = { ...state.profile, ...fields }; record(['setGuardianPrefs', fields]); }
export async function deleteMyAccount() { record(['deleteMyAccount']); }
export async function signOutNow() { record(['signOutNow']); }
```

- [ ] **Step 5: Create `parent/tests/browser/settings-preview.html`**

```html
<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Parents Settings preview</title>
<script>
  // Same rule as index.html's theme-boot script, so the saved theme applies before paint.
  try { var v = localStorage.getItem('bnhs-theme'); var d = matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', v === 'dark' || ((v !== 'light') && d) ? 'dark' : 'light'); } catch (e) {}
</script>
</head><body><div id="root"></div><script type="module" src="./settings-preview.jsx"></script></body></html>
```

- [ ] **Step 6: Create `parent/tests/browser/settings-preview.jsx`**

```jsx
import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../shared/theme/theme.css';
import '../../src/glass.css';
import Settings from '../../src/screens/Settings.jsx';
import { matchRoute } from '../../src/lib/router.js';
import { installPrompt } from '../../src/lib/installPrompt.js';
import { SCENARIOS, setScenario, useProfile, useWrites } from './settings-fixture.js';

installPrompt();
const user = { uid: 'preview-parent', email: 'ana.santos@example.test', displayName: 'Ana Santos' };

// Simulates Chrome's beforeinstallprompt so the Install button can be checked.
function fireInstallPrompt() {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = async () => {};
  e.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(e);
}

function Preview() {
  const [path, setPath] = useState('/settings');
  const navigate = useCallback((to) => { setPath(to); window.scrollTo(0, 0); }, []);
  const profile = useProfile();
  const writes = useWrites();
  const route = matchRoute(path);
  return (
    <main style={{ padding: '0 16px 96px', maxWidth: 560, margin: '0 auto', boxSizing: 'border-box' }}>
      <details style={{ margin: '12px 0', fontSize: 12 }}>
        <summary>Preview controls · synthetic data · {path}</summary>
        <select aria-label="Preview scenario" onChange={(e) => setScenario(e.target.value)}>{SCENARIOS.map((s) => <option key={s}>{s}</option>)}</select>{' '}
        <button type="button" onClick={fireInstallPrompt}>Fire install prompt</button>
        <pre data-testid="writes">{writes.map((w) => JSON.stringify(w)).join('\n')}</pre>
      </details>
      {route.name === 'settings'
        ? <Settings user={user} profile={profile} route={route} navigate={navigate} />
        : <p>Left Settings for {path}. <button type="button" onClick={() => navigate('/settings')}>Back to Settings</button></p>}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Preview />);
```

- [ ] **Step 7: Document the preview**

Append to `tests/browser/README.md`:

````markdown

## Parents App Settings preview

Run from `parent/`:

```powershell
npm exec vite -- --config tests/browser/settings.config.mjs
```

Open http://127.0.0.1:5189/tests/browser/settings-preview.html. It renders the real Settings screen and sub-pages with synthetic data: the hooks, account writes, device checks and Firebase are swapped out by `parent/tests/browser/settings.config.mjs`, so it never calls production services. Use "Preview controls" to switch scenarios (no contact details, no learners, iPhone, installed, blocked, notifications off), fire a fake install prompt, and read the write log.
````

- [ ] **Step 8: Verify the preview renders the current screen**

Start the preview server in the background (in `parent/`): `npm exec vite -- --config tests/browser/settings.config.mjs`. Keep its PID or task ID.

Open http://127.0.0.1:5189/tests/browser/settings-preview.html in the browser pane.

Expected: today's Settings cards render with "Ana Santos" and two learners, and there are no console errors. Click the "Send me a notification for new gate scans" checkbox. The write log then shows `["setGuardianPrefs",{"notificationsEnabled":false}]`.

Stop only the server you started.

- [ ] **Step 9: Run tests and build**

Run (in `parent/`): `npm test && npm run build`
Expected: PASS, and the build succeeds. The preview files are outside `src/`, so they're neither tested nor bundled.

- [ ] **Step 10: Commit**

```bash
git add parent/src/lib/guardianWrites.js parent/src/screens/Settings.jsx parent/tests/browser tests/browser/README.md
git commit -m "test(parent): synthetic browser preview for Settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Rebuild Settings as a grouped list with drill-in pages

**Files:**
- Rewrite: `parent/src/screens/Settings.jsx`
- Create: `parent/src/screens/settings/ProfilePage.jsx`, `NotificationsPage.jsx`, `AppearancePage.jsx`, `LearnersPage.jsx`, `ReportsPage.jsx`, `PrivacyPage.jsx`
- Modify: `parent/src/strings.js` (remove the keys `settingsAccount`, `settingsAccountToggle`, `settingsAnnouncementToggle`, `settingsLearners`)

**Interfaces:**
- Consumes: `matchRoute` params (Task 1); `SECTIONS`, `sectionGroups`, `notificationValue`, `openReportCount` (Task 2); `isStandalone` (Task 3); `SettingsGroup`, `SettingsRow`, `SwitchRow` (Task 5); `guardianWrites` (Task 6).
- Produces: every sub-page is `({ ctx, back }) => JSX`, where `ctx = { user, profile, navigate, links, device, portal, reports, accountEnabled, announcementPush, state, savedName }`. Task 8 adds pages to `PAGES` and the `about` value.
- Main-list rows whose section has no page in `PAGES` are hidden. In this task that means Install, Help and About until Task 8. An unknown `/settings/<x>` redirects to `/settings`.

- [ ] **Step 1: Rewrite `parent/src/screens/Settings.jsx`**

```jsx
import { useEffect } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase.js';
import S from '../strings.js';
import PageHeader from '../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../components/SettingsList.jsx';
import { useLinks } from '../hooks/useLinks.js';
import { useQuery, useDoc } from '../hooks/useDoc.js';
import { useTheme } from '../hooks/useTheme.js';
import { THEME_LABEL } from '../lib/themeLabels.js';
import { notificationState } from '../lib/notificationState.js';
import { useDeviceStatus } from '../lib/notifications.js';
import { isStandalone } from '../lib/device.js';
import { signOutNow } from '../lib/guardianWrites.js';
import { initials } from '../lib/format.js';
import { SECTIONS, sectionGroups, notificationValue, openReportCount } from '../lib/settingsSections.js';
import ProfilePage from './settings/ProfilePage.jsx';
import NotificationsPage from './settings/NotificationsPage.jsx';
import AppearancePage from './settings/AppearancePage.jsx';
import LearnersPage from './settings/LearnersPage.jsx';
import ReportsPage from './settings/ReportsPage.jsx';
import PrivacyPage from './settings/PrivacyPage.jsx';

// Sub-pages by route segment (/settings/<key>). A main-list row with no page
// here is hidden, and an unknown segment falls back to the list.
const PAGES = {
  profile: ProfilePage, notifications: NotificationsPage, appearance: AppearancePage,
  learners: LearnersPage, reports: ReportsPage, privacy: PrivacyPage,
};

// One mounted screen for the list and every sub-page (same route name), so
// the listeners below are set up once while the parent moves between them.
export default function Settings({ user, profile, route, navigate }) {
  const { links } = useLinks(user.uid);
  const device = useDeviceStatus(user.uid);
  const portal = useDoc('settings/parent_portal').data;
  const { rows: reports } = useQuery(() => query(collection(db, 'reports'), where('guardianUid', '==', user.uid), limit(10)), [user.uid]);
  const accountEnabled = profile?.notificationsEnabled !== false;
  const ctx = {
    user, profile, navigate, links, device, portal, reports, accountEnabled,
    announcementPush: profile?.announcementPushEnabled !== false,
    state: notificationState({ ...device, accountEnabled }),
    savedName: profile?.displayName || user.displayName || '',
  };
  const section = route.params.section;
  const Page = section ? PAGES[section] : null;
  useEffect(() => { if (section && !Page) navigate('/settings', { replace: true }); }, [section, Page, navigate]);
  if (Page) return <Page ctx={ctx} back={() => navigate('/settings')} />;
  return <SettingsHome ctx={ctx} />;
}

function SettingsHome({ ctx }) {
  const { user, navigate, links, reports, state, savedName } = ctx;
  const { pref } = useTheme();
  const hidden = SECTIONS.filter((s) => !PAGES[s.key] || (s.key === 'install' && isStandalone())).map((s) => s.key);
  const values = {
    notifications: notificationValue(state),
    appearance: THEME_LABEL[pref],
    learners: links ? String(links.length) : '',
    reports: openReportCount(reports) || '',
  };
  return (
    <>
      <PageHeader title={S.settingsTitle} />
      <SettingsGroup>
        <SettingsRow variant="profile" leading={<span className="settings-avatar" aria-hidden="true">{initials(savedName || user.email)}</span>}
          label={savedName || user.email} subtitle={savedName ? user.email : undefined} onClick={() => navigate('/settings/profile')} />
      </SettingsGroup>
      {sectionGroups(hidden).map((group) => (
        <SettingsGroup key={group[0].key}>
          {group.map((s) => <SettingsRow key={s.key} tile={s.tile} icon={s.icon} label={s.title} value={values[s.key]} onClick={() => navigate(`/settings/${s.key}`)} />)}
        </SettingsGroup>
      ))}
      <SettingsGroup>
        <SettingsRow variant="center" tone="danger" label={S.signOut} chevron={false} onClick={signOutNow} />
      </SettingsGroup>
    </>
  );
}
```

- [ ] **Step 2: Create `parent/src/screens/settings/ProfilePage.jsx`**

```jsx
import { useState } from 'react';
import S from '../../strings.js';
import { Btn, Card, Banner, Field, Inp } from '../../components/ui.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList.jsx';
import { saveDisplayName } from '../../lib/guardianWrites.js';

export default function ProfilePage({ ctx, back }) {
  const { user, profile, savedName } = ctx;
  const [name, setName] = useState(savedName);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    setBusy(true); setErr(null); setSaved(false);
    try { await saveDisplayName(user, name.trim()); setSaved(true); } catch { setErr(S.reportFailed); }
    setBusy(false);
  };
  return (
    <>
      <PageHeader title={S.settingsProfile} avatarName={savedName || user.email} onBack={back} />
      {err && <Banner tone="danger">{err}</Banner>}
      <SettingsGroup>
        <SettingsRow label={S.signedInAs} subtitle={user.email} />
      </SettingsGroup>
      {profile && (
        <Card>
          <Field label={S.yourName} hint={S.yourNameHint}>
            <Inp autoComplete="name" autoCapitalize="words" maxLength={120} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
          </Field>
          {saved && <Banner>{S.settingsNameSaved}</Banner>}
          <Btn variant="ghost" onClick={save} disabled={busy || name.trim().length < 2 || name.trim() === savedName}>{S.settingsNameSave}</Btn>
        </Card>
      )}
    </>
  );
}
```

- [ ] **Step 3: Create `parent/src/screens/settings/NotificationsPage.jsx`**

```jsx
import { useState } from 'react';
import S from '../../strings.js';
import { Banner } from '../../components/ui.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow, SwitchRow } from '../../components/SettingsList.jsx';
import { enableOnThisDevice, disableOnThisDevice } from '../../lib/notifications.js';
import { setGuardianPrefs } from '../../lib/guardianWrites.js';

const STATE_TEXT = { on: S.notifOn, off: S.notifOff, blocked: S.notifBlocked, unsupported: S.notifUnsupported, ios_needs_install: S.notifIosInstall, account_off: S.notifOff };

export default function NotificationsPage({ ctx, back }) {
  const { user, navigate, device, accountEnabled, announcementPush, state } = ctx;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const setPref = (fields) => setGuardianPrefs(user.uid, fields).catch(() => setErr(S.reportFailed));
  const enable = async () => { setBusy(true); setErr(null); try { await enableOnThisDevice(user.uid); } catch { setErr(S.notifBlockedHelp); } device.refresh(); setBusy(false); };
  const disable = async () => { setBusy(true); await disableOnThisDevice(user.uid); device.refresh(); setBusy(false); };
  return (
    <>
      <PageHeader title={S.settingsNotifications} onBack={back} />
      {err && <Banner tone="danger">{err}</Banner>}
      <SettingsGroup footer={S.pushDisclaimer}>
        <SwitchRow label={S.notifRowScans} checked={accountEnabled} onChange={(on) => setPref({ notificationsEnabled: on })} />
        <SwitchRow label={S.notifRowAnnouncements} checked={accountEnabled && announcementPush} disabled={!accountEnabled} onChange={(on) => setPref({ announcementPushEnabled: on })} />
      </SettingsGroup>
      <SettingsGroup header={S.settingsThisDevice} footer={state === 'blocked' ? S.notifBlockedHelp : undefined}>
        <SettingsRow label={STATE_TEXT[state]} />
        {state === 'ios_needs_install' && <SettingsRow label={S.notifHowToInstall} tone="primary" onClick={() => navigate('/settings/install')} />}
        {state === 'off' && <SettingsRow label={S.notifTurnOn} tone="primary" chevron={false} disabled={busy} onClick={enable} />}
        {state === 'on' && <SettingsRow label={S.notifTurnOff} tone="primary" chevron={false} disabled={busy} onClick={disable} />}
      </SettingsGroup>
    </>
  );
}
```

(Today's condition `(state === 'off' || state === 'account_off') && accountEnabled` is equivalent to `state === 'off'`. `notificationState` returns `account_off` only when the account switch is off.)

- [ ] **Step 4: Create `parent/src/screens/settings/AppearancePage.jsx`**

```jsx
import S from '../../strings.js';
import PageHeader from '../../components/PageHeader.jsx';
import ThemeControl from '../../components/ThemeControl.jsx';
import { SettingsGroup } from '../../components/SettingsList.jsx';

export default function AppearancePage({ back }) {
  return (
    <>
      <PageHeader title={S.themeTitle} onBack={back} />
      <SettingsGroup footer={S.themeSavedHere}>
        <div style={{ padding: 14 }}><ThemeControl /></div>
      </SettingsGroup>
    </>
  );
}
```

- [ ] **Step 5: Create `parent/src/screens/settings/LearnersPage.jsx`**

```jsx
import S from '../../strings.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList.jsx';
import { initials } from '../../lib/format.js';

export default function LearnersPage({ ctx, back }) {
  const { links, navigate } = ctx;
  return (
    <>
      <PageHeader title={S.settingsMyLearners} onBack={back} />
      <SettingsGroup footer={S.settingsRemoveHint}>
        {links?.length === 0 && <SettingsRow label={S.settingsLearnersEmpty} />}
        {(links || []).map((l) => (
          <SettingsRow key={l.id} leading={<span className="settings-avatar settings-avatar--small" aria-hidden="true">{initials(l.learnerName || l.relationship)}</span>}
            label={l.learnerName || l.relationship} subtitle={l.learnerName ? l.relationship : undefined} onClick={() => navigate(`/learner/${l.studentId}`)} />
        ))}
        <SettingsRow label={S.activateAnother} tone="primary" onClick={() => navigate('/activate')} />
      </SettingsGroup>
    </>
  );
}
```

- [ ] **Step 6: Create `parent/src/screens/settings/ReportsPage.jsx`**

```jsx
import S from '../../strings.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList.jsx';

const statusText = (r) => [r.status === 'open' ? S.requestOpen : S.reportReviewed, r.resolutionNote].filter(Boolean).join(': ');

export default function ReportsPage({ ctx, back }) {
  const { reports, navigate } = ctx;
  return (
    <>
      <PageHeader title={S.settingsReportsRequests} onBack={back} />
      {reports && (
        <SettingsGroup header={S.settingsReports}>
          {reports.length === 0 && <SettingsRow label={S.settingsReportsEmpty} />}
          {reports.map((r) => <SettingsRow key={r.id} label={r.reason} subtitle={statusText(r)} />)}
        </SettingsGroup>
      )}
      <SettingsGroup>
        <SettingsRow label={S.settingsRequests} tone="primary" onClick={() => navigate('/request-access')} />
      </SettingsGroup>
    </>
  );
}
```

- [ ] **Step 7: Create `parent/src/screens/settings/PrivacyPage.jsx`**

```jsx
import { useState } from 'react';
import S from '../../strings.js';
import { Btn, Card, Banner } from '../../components/ui.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList.jsx';
import { deleteMyAccount } from '../../lib/guardianWrites.js';

export default function PrivacyPage({ ctx, back }) {
  const url = ctx.portal?.privacyNoticeUrl;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const remove = async () => { setBusy(true); setErr(null); try { await deleteMyAccount(); } catch { setErr(S.reportFailed); setBusy(false); } };
  return (
    <>
      <PageHeader title={S.settingsPrivacyAccount} onBack={back} />
      {err && <Banner tone="danger">{err}</Banner>}
      <SettingsGroup>
        {url && <SettingsRow label={S.settingsPrivacy} href={url} external />}
        <SettingsRow label={S.settingsDelete} tone="danger" chevron={false} disabled={confirm} onClick={() => setConfirm(true)} />
      </SettingsGroup>
      {confirm && (
        <Card>
          <p style={{ marginTop: 0 }}>{S.settingsDeleteConfirm}</p>
          <div style={{ display: 'grid', gap: 10 }}>
            <Btn variant="danger" onClick={remove} disabled={busy}>{S.settingsDeleteButton}</Btn>
            <Btn variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>{S.cancel}</Btn>
          </div>
        </Card>
      )}
    </>
  );
}
```

- [ ] **Step 8: Remove the strings only the old screen used**

Confirm nothing else uses them. Run (repo root): `git grep -n "settingsAccount\b\|settingsAccountToggle\|settingsAnnouncementToggle\|settingsLearners\b" -- parent/src`

Expected: matches only in `parent/src/strings.js`. Delete those four lines from `parent/src/strings.js`.

- [ ] **Step 9: Run tests and build**

Run (in `parent/`): `npm test && npm run build && npm run size`
Expected: PASS, the build succeeds, and size is under the limit.

- [ ] **Step 10: Check it in the preview (375px, light and dark)**

Start the preview (in `parent/`): `npm exec vite -- --config tests/browser/settings.config.mjs`. Keep its PID or task ID. Open http://127.0.0.1:5189/tests/browser/settings-preview.html with the browser pane resized to the `mobile` preset.

Check each item:
- Main list: profile card ("AS" avatar, Ana Santos, email). Group 1 shows Notifications "On" and Appearance with the theme label. Group 2 shows My Learners "2" and Reports & Requests "1". Group 3 shows Privacy & Account. A red centered Sign out sits at the bottom. Install, Help and About are absent for now. Every tile is a colored rounded square with a white glyph, and the hairlines start after the tile.
- Tap each row. Its page opens with the large title and a back arrow, and back returns to the list.
- Notifications: flipping "Gate scans" off logs `setGuardianPrefs {notificationsEnabled:false}` and dims and disables "School announcements". Scenario `blocked` shows the blocked help footnote. Scenario `ios` shows the install-help text and a "How to install the app" row; tapping it returns to the list until Task 8.
- Profile: edit the name and save. The write log shows `saveDisplayName`, the banner appears, and back shows the new name on the profile card.
- Privacy: Delete shows the confirm card, and Cancel hides it.
- Sign out logs `signOutNow`.
- Switch the theme to Dark on the Appearance page and repeat a quick pass. Text, tiles and switches must stay readable.
- The console has no errors.

Stop only the server you started.

- [ ] **Step 11: Commit**

```bash
git add parent/src/screens/Settings.jsx parent/src/screens/settings parent/src/strings.js
git commit -m "feat(parent): phone-style categorized Settings with drill-in pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Install app, Help & Contact School, and About pages

**Files:**
- Create: `parent/src/screens/settings/InstallPage.jsx`, `HelpPage.jsx`, `AboutPage.jsx`
- Modify: `parent/src/screens/Settings.jsx` (imports, `PAGES`, `values`)

**Interfaces:**
- Consumes: `installPrompt()` (Task 3), `isIOS`/`isStandalone` (Task 3), `contactRows` (Task 2), `BUILD`/`versionLabel` (Task 4), `SettingsGroup`/`SettingsRow` (Task 5).

- [ ] **Step 1: Create `parent/src/screens/settings/InstallPage.jsx`**

```jsx
import { useSyncExternalStore } from 'react';
import S from '../../strings.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList.jsx';
import { installPrompt } from '../../lib/installPrompt.js';
import { isIOS, isStandalone } from '../../lib/device.js';

// Chrome/Android: a real Install button (the browser's own prompt).
// iPhone: Safari's Share > Add to Home Screen steps. Others: a menu hint.
export default function InstallPage({ back }) {
  const prompt = installPrompt();
  const state = useSyncExternalStore(prompt.subscribe, prompt.state);
  const ios = isIOS();
  return (
    <>
      <PageHeader title={S.settingsInstall} onBack={back} />
      {state === 'installed' || isStandalone() ? (
        <SettingsGroup><SettingsRow tile="green" icon="check" label={S.installDone} /></SettingsGroup>
      ) : (
        <>
          <p className="settings-intro">{S.installBody}</p>
          {state === 'ready' && (
            <SettingsGroup><SettingsRow tile="blue" icon="download" label={S.installButton} tone="primary" chevron={false} onClick={() => prompt.prompt()} /></SettingsGroup>
          )}
          {state !== 'ready' && ios && (
            <SettingsGroup header={S.installIosHeader}>
              <SettingsRow tile="blue" icon="share" label={S.installIosStep1} />
              <SettingsRow tile="grey" icon="plusSquare" label={S.installIosStep2} />
              <SettingsRow tile="teal" icon="home" label={S.installIosStep3} />
            </SettingsGroup>
          )}
          {state !== 'ready' && !ios && <SettingsGroup><SettingsRow label={S.installOther} /></SettingsGroup>}
        </>
      )}
    </>
  );
}
```

- [ ] **Step 2: Create `parent/src/screens/settings/HelpPage.jsx`**

```jsx
import S from '../../strings.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList.jsx';
import { contactRows } from '../../lib/settingsSections.js';

// Contact details staff set in SIMS > Guardians > Portal Settings.
export default function HelpPage({ ctx, back }) {
  const rows = contactRows(ctx.portal);
  return (
    <>
      <PageHeader title={S.settingsHelp} onBack={back} />
      {rows.length === 0 ? <p className="settings-intro">{S.helpEmpty}</p> : (
        <SettingsGroup>
          {rows.map((r) => <SettingsRow key={r.key} tile={r.tile} icon={r.icon} label={r.label} subtitle={r.value} href={r.href} external={r.external} />)}
        </SettingsGroup>
      )}
    </>
  );
}
```

- [ ] **Step 3: Create `parent/src/screens/settings/AboutPage.jsx`**

```jsx
import S from '../../strings.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList.jsx';
import { versionLabel } from '../../lib/buildInfo.js';

export default function AboutPage({ back }) {
  return (
    <>
      <PageHeader title={S.settingsAbout} onBack={back} />
      <SettingsGroup>
        <SettingsRow label={S.appName} subtitle={S.tagline} />
        <SettingsRow label={S.aboutVersion} value={versionLabel()} />
      </SettingsGroup>
    </>
  );
}
```

- [ ] **Step 4: Register them in `parent/src/screens/Settings.jsx`**

Add after `import PrivacyPage from './settings/PrivacyPage.jsx';`:

```js
import InstallPage from './settings/InstallPage.jsx';
import HelpPage from './settings/HelpPage.jsx';
import AboutPage from './settings/AboutPage.jsx';
import { BUILD } from '../lib/buildInfo.js';
```

Replace the `PAGES` constant:

```js
const PAGES = {
  profile: ProfilePage, notifications: NotificationsPage, appearance: AppearancePage, install: InstallPage,
  learners: LearnersPage, reports: ReportsPage, help: HelpPage, privacy: PrivacyPage, about: AboutPage,
};
```

and add `about` to `values` in `SettingsHome`:

```js
    reports: openReportCount(reports) || '',
    about: BUILD.date,
```

- [ ] **Step 5: Run tests, build and size**

Run (in `parent/`): `npm test && npm run build && npm run size`
Expected: PASS, the build succeeds, and size is under the limit.

- [ ] **Step 6: Check it in the preview (375px, light and dark)**

Start the preview again (in `parent/`). Keep its PID or task ID.
- `normal`: Install app appears in group 1, and Help & Contact School and About (value `2026-10-07`) appear in group 3.
- Install (desktop Chrome, not iOS): shows the menu hint. Click "Fire install prompt" in the controls. The page switches to an Install row, and tapping it changes the page to "This app is installed on this device."
- Scenario `ios`: the Install page shows the three Share → Add to Home Screen → Open steps with tiles. Notifications → "How to install the app" opens this page.
- Scenario `installed`: the Install row is gone from the main list.
- Help (`normal`): Call, Email, Facebook page and Office hours rows. The Call link is `tel:+63448151234` and Facebook opens in a new tab (check `target="_blank"` with `read_page`). Scenario `no-contact` shows the "Contact the school office…" message.
- About: app name with tagline, and Version `2026-10-07 (preview)`.
- Dark theme: quick pass over these three pages.

Stop only the server you started.

- [ ] **Step 7: Commit**

```bash
git add parent/src/screens/Settings.jsx parent/src/screens/settings/InstallPage.jsx parent/src/screens/settings/HelpPage.jsx parent/src/screens/settings/AboutPage.jsx
git commit -m "feat(parent): Install app, Help & Contact School and About in Settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Staff-editable school contact details

**Files:**
- Create: `src/pages/guardians/portalContact.js`, `src/pages/guardians/portalContact.test.js`
- Modify: `src/pages/guardians/PortalSettingsTab.jsx`
- Modify: `functions/src/handlers/settingsAudit.js:3`
- Modify: `functions/test/emulator/scheduled.test.js` (the `auditSettingsChange` describe)

**Interfaces:**
- Produces: `CONTACT_FIELDS = ['contactPhone', 'contactEmail', 'contactFacebookUrl', 'officeHours']`; `cleanContact(values) → { [field]: trimmed string }`; `contactError(cleaned) → string | null`.
- Writes the four fields to `settings/parent_portal`, the same document and field names Task 2's `contactRows` reads.

- [ ] **Step 1: Write the failing test**

Create `src/pages/guardians/portalContact.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { CONTACT_FIELDS, cleanContact, contactError } from './portalContact.js';

describe('cleanContact', () => {
  it('trims every field and fills missing ones with blanks', () => {
    expect(cleanContact({ contactPhone: ' 0917 123 4567 ', officeHours: 'Mon–Fri ' })).toEqual({ contactPhone: '0917 123 4567', contactEmail: '', contactFacebookUrl: '', officeHours: 'Mon–Fri' });
    expect(Object.keys(cleanContact(null))).toEqual(CONTACT_FIELDS);
  });
});

describe('contactError', () => {
  const ok = cleanContact({});
  it('accepts all blanks and valid values', () => {
    expect(contactError(ok)).toBeNull();
    expect(contactError({ ...ok, contactEmail: 'registrar@bnhs.edu.ph', contactFacebookUrl: 'https://www.facebook.com/bnhs' })).toBeNull();
  });
  it('rejects a malformed email', () => {
    expect(contactError({ ...ok, contactEmail: 'registrar' })).toMatch(/email/i);
  });
  it('rejects a Facebook link that is not https', () => {
    expect(contactError({ ...ok, contactFacebookUrl: 'facebook.com/bnhs' })).toMatch(/https:\/\//);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (repo root): `npx vitest run src/pages/guardians/portalContact.test.js`
Expected: FAIL (cannot resolve `./portalContact.js`).

- [ ] **Step 3: Create `src/pages/guardians/portalContact.js`**

```js
// School contact details staff set for the Parents App's
// Settings > Help & Contact School page (stored on settings/parent_portal).
export const CONTACT_FIELDS = ['contactPhone', 'contactEmail', 'contactFacebookUrl', 'officeHours'];

export const cleanContact = (values) => Object.fromEntries(CONTACT_FIELDS.map((k) => [k, String(values?.[k] ?? '').trim()]));

export function contactError({ contactEmail, contactFacebookUrl }) {
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return 'Enter a valid email address, or leave Email blank.';
  if (contactFacebookUrl && !contactFacebookUrl.startsWith('https://')) return 'The Facebook page link must start with https://';
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (repo root): `npx vitest run src/pages/guardians/portalContact.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the card to `src/pages/guardians/PortalSettingsTab.jsx`**

Add after the `updatePortalSettings` import:

```js
import { cleanContact, contactError } from './portalContact.js';
```

After the line declaring `note`, `announcement`, `url` and `consentVersion` state, add:

```js
  const [contact, setContact] = useState(() => cleanContact({}));
```

In the initializing `useEffect`, change `setConsentVersion(portal?.consentVersion ?? 1); }` to:

```js
setConsentVersion(portal?.consentVersion ?? 1); setContact(cleanContact(portal)); }
```

After `const paused = portal?.notificationsPaused === true;`, add:

```js
  const contactClean = cleanContact(contact);
  const contactProblem = contactError(contactClean);
  const editContact = (key) => (e) => setContact((c) => ({ ...c, [key]: e.target.value }));
```

Insert this card after the closing `</Card>` of the "Portal banner and privacy notice" card, before the closing `</>`:

```jsx
      <Card style={{ padding: 20, marginTop: 16 }}>
        <h2 style={S.h2}>School contact details (shown in the Parents App)</h2>
        <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>Parents see these under Settings → Help &amp; Contact School. Leave a field blank to hide it.</p>
        <Field label="Phone"><Inp value={contact.contactPhone} onChange={editContact('contactPhone')} placeholder="e.g. (044) 123 4567" /></Field>
        <Field label="Email"><Inp type="email" value={contact.contactEmail} onChange={editContact('contactEmail')} placeholder="e.g. registrar@school.edu.ph" /></Field>
        <Field label="Facebook page link"><Inp value={contact.contactFacebookUrl} onChange={editContact('contactFacebookUrl')} placeholder="https://www.facebook.com/…" /></Field>
        <Field label="Office hours"><Inp value={contact.officeHours} onChange={editContact('officeHours')} placeholder="e.g. Mon–Fri, 7:30 AM – 4:30 PM" /></Field>
        {contactProblem && <p role="alert" style={{ fontFamily: T.body, fontSize: 13, color: T.absent }}>{contactProblem}</p>}
        <Btn disabled={action.busy || Boolean(contactProblem)} onClick={() => action.run('saveContact', () => updatePortalSettings(contactClean, me))}>Save contact details</Btn>
      </Card>
```

- [ ] **Step 6: Audit the new fields**

In `functions/src/handlers/settingsAudit.js`, replace the `FIELDS` line:

```js
const FIELDS = ['notificationsPaused', 'pausedBy', 'pauseNote', 'announcement', 'consentVersion', 'privacyNoticeUrl', 'contactPhone', 'contactEmail', 'contactFacebookUrl', 'officeHours'];
```

In `functions/test/emulator/scheduled.test.js`, inside `describe('auditSettingsChange', …)`, add:

```js
  it('records school contact detail changes', async () => {
    await auditSettingsChange(db(), { before: { contactPhone: '' }, after: { contactPhone: '+63 44 815 1234', officeHours: 'Mon–Fri', updatedBy: 'admin@bnhs.edu' } });
    const rows = await db().collection('audit_log').where('action', '==', 'portal.settings_changed').get();
    const details = rows.docs.map((d) => d.data().details).find((d) => d.after.contactPhone);
    expect(details).toMatchObject({ before: { contactPhone: '' }, after: { contactPhone: '+63 44 815 1234', officeHours: 'Mon–Fri' } });
  });
```

- [ ] **Step 7: Run SIMS, functions and emulator tests**

Run (repo root): `npm test`
Expected: PASS.

Run (repo root): `npm --prefix functions test`
Expected: PASS.

Run (repo root): `npm run test:functions`
Expected: PASS, including "records school contact detail changes". If the emulator can't start (no Java or Firebase CLI), record the exact error and report it. Don't skip silently.

- [ ] **Step 8: Build the SIMS**

Run (repo root): `npm run build`
Expected: the build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/pages/guardians/portalContact.js src/pages/guardians/portalContact.test.js src/pages/guardians/PortalSettingsTab.jsx functions/src/handlers/settingsAudit.js functions/test/emulator/scheduled.test.js
git commit -m "feat(guardians): staff-editable school contact details for the Parents App

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Final verification and spec status

**Files:**
- Modify: `docs/superpowers/specs/2026-10-07-parent-settings-categories-design.md` (status line and a short "Implementation notes")

- [ ] **Step 1: Run every suite**

Run (repo root): `npm test`, then `npm --prefix parent test`, `npm --prefix functions test`, and `npm run test:rules`.
Expected: all PASS. Note any suite that can't run here (emulators) and why.

- [ ] **Step 2: Build and size**

Run (in `parent/`): `npm run build && npm run size`
Expected: build OK, size under 260 KB. Record the reported size.

- [ ] **Step 3: Full preview pass at 375px in light and dark**

Start the preview (in `parent/`). Keep its PID or task ID. Walk all seven scenarios through the main list and all nine pages, using the checks listed in Task 7 Step 10 and Task 8 Step 6. Take one screenshot of the main list in light and one in dark for the summary. Stop only the server you started.

- [ ] **Step 4: Update the spec**

In the spec, change the `Status:` line to:

```
Status: implemented on branch claude/parents-app-settings-categories-203f26
```

and add this section before `## Testing`:

```markdown
## Implementation notes

- Tile and switch colors are `--tile-*`, `--on-tile`, `--switch-knob` and
  `--switch-shadow` in their own `:root` block in `shared/theme/theme.css`
  (not `--t-*`), so the light/dark token-parity test doesn't apply to them.
- The main list hides any row whose section has no page in `PAGES`; there is
  no separate `isSection` helper.
- Settings' writes live in `parent/src/lib/guardianWrites.js`, which lets the
  synthetic browser preview (`parent/tests/browser/settings-*`) swap them out.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-10-07-parent-settings-categories-design.md
git commit -m "docs(parent): mark settings categories spec implemented

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
