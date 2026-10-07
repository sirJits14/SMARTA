# Parents App Settings, organized like phone Settings

Date: 2026-10-07
Status: implemented on branch claude/parents-app-settings-categories-203f26

## Goal

The Parents App Settings screen is one long page of six untitled-looking cards
(theme, name, notifications, learners, reports, privacy/delete/sign out). It
reads as disorganized. Rebuild it like iPhone Settings: a short main list of
rounded groups, each row with a colored icon tile, an optional value, and a
`>` chevron that drills into its own page. Add three new rows: Install app,
Help & Contact School, and About.

## Decisions

| Question | Decision |
| --- | --- |
| Layout | **Drill-in pages**: main list of grouped rows; each row opens a sub-page with a back button |
| Icon style | **Colored tiles**: white line glyph on a rounded square, a different color per category |
| New rows | **About**, **Help & Contact School**, **Install app** |
| Contact details source | **Staff-editable** in the SIMS Portal Settings tab, stored on `settings/parent_portal` |
| Install row visibility | **Only when not installed**; Android/Chrome gets a real Install button, iPhone gets steps |
| Navigation | Real routes (`/settings/<section>`), so Android back / browser back go up one level |

## Out of scope

- Language selection, per-learner notification settings, or any new preference.
- A sign-out confirmation (today's one-tap sign out stays).
- Changing what any existing setting does; this is a reorganization plus three
  new read-only rows.
- The SIMS staff app's own Settings screens, beyond the four new Portal
  Settings fields.

## Main Settings page (`/settings`)

Large-title `PageHeader` ("Settings"), then four groups and a sign-out button:

| Group | Row | Tile color / glyph | Right-side value | Opens |
| --- | --- | --- | --- | --- |
| 1 | **Profile card**: initials avatar (large), display name, email underneath | (avatar, no tile) | — | `profile` |
| 2 | Notifications | red / bell | short state: On, Off, Blocked, Not supported, Needs install | `notifications` |
| 2 | Appearance | indigo / half-moon | Auto, Light, Dark (`THEME_LABEL`) | `appearance` |
| 2 | Install app (hidden when running installed) | blue / download | — | `install` |
| 3 | My Learners | green / people | number of linked learners | `learners` |
| 3 | Reports & Requests | orange / envelope | number of open reports, hidden when 0 | `reports` |
| 4 | Help & Contact School | teal / phone | — | `help` |
| 4 | Privacy & Account | grey / shield | — | `privacy` |
| 4 | About | grey / info | build version | `about` |

Below the groups: **Sign Out** as a full-width red text button inside its own
single-row group (iOS style), calling `signOut(auth)` as today.

The profile card's name is `profile.displayName || user.displayName`, falling
back to the email alone when there is no name.

## Sub-pages (`/settings/<section>`)

Every sub-page uses `PageHeader` with the row's title and `onBack` →
`navigate('/settings')`. Each shows its own error `Banner`. Content moves from
today's `Settings.jsx` unchanged in behavior unless noted.

- **profile**: "Signed in as" email row, the name `Field`/`Inp`, Save name
  button and "Name saved." banner (today's Account card).
- **notifications**: two **switch** rows replacing the checkboxes: "New gate
  scans" (`notificationsEnabled`) and "School announcements"
  (`announcementPushEnabled`, disabled and dimmed when the first is off).
  A "This device" group shows the device state text, the blocked help text,
  and the Turn on / Turn off button exactly as today. `pushDisclaimer` is the
  group footnote.
- **appearance**: the existing `ThemeControl` plus the `themeSavedHere`
  footnote.
- **install**: see "Install app" below.
- **learners**: one row per link (learner name + relationship as subtitle)
  opening `/learner/<studentId>`; an "Activate another learner" row (primary
  color, no tile) opening `/activate`; `settingsRemoveHint` as footnote.
- **reports**: one row per report (reason, status Open/Reviewed, resolution
  note as subtitle); "—" empty state; a "My access requests" row opening
  `/request-access`.
- **help**: see "Help & Contact School" below.
- **privacy**: "Privacy notice" row (external link, only when
  `privacyNoticeUrl` is set); a red "Delete my account" row that reveals the
  existing confirm text and Yes/Cancel buttons; the delete flow is unchanged.
- **about**: rows for app name (`S.appName`), version, and build date.

An unknown section (`/settings/foo`) renders the main list and replaces the
URL with `/settings`. Changing section scrolls to the top.

## Install app

- `parent/src/lib/installPrompt.js` (loaded in the eager entry, a few lines):
  listens for `beforeinstallprompt`, calls `preventDefault()`, keeps the event,
  exposes `canPrompt()` and `promptInstall()`, and clears the event on
  `appinstalled`. It must run at startup because the browser fires the event
  once, before a parent ever opens Settings.
- The row is hidden when running installed. The `isIOS` / `isStandalone`
  checks inside `env()` in `lib/notifications.js` move into a small shared
  `lib/device.js` that both files import.
- The page shows:
  - **Install button** when `canPrompt()`; after the prompt resolves the page
    shows "Installed" or stays as is if dismissed.
  - **iPhone/iPad steps** when `isIOS`: Share icon → "Add to Home Screen" →
    open from the Home Screen, with the note that notifications need this.
  - **Other browsers**: a one-line "Use your browser's menu → Install app or
    Add to Home screen."
  - If reached while already installed (deep link): "This app is installed."

## Help & Contact School

New optional fields on `settings/parent_portal`, all strings:
`contactPhone`, `contactEmail`, `contactFacebookUrl`, `officeHours`.

- **Parents App** page: one row per filled field: Phone (`tel:` link), Email
  (`mailto:` link), Facebook page (opens in a new tab), Office hours (plain
  text, no chevron). Empty fields are hidden. With none filled, the page shows
  "Contact the school office or your learner's adviser."
- **SIMS** `src/pages/guardians/PortalSettingsTab.jsx`: a new "School contact
  details (shown in the Parents App)" card with the four `Field`s and its own
  Save, written through the existing `updatePortalSettings`. Values are
  trimmed. Save is disabled while the email is not blank and lacks `@`, or the
  Facebook URL is not blank and doesn't start with `https://`.
- **Rules**: unchanged. `settings/parent_portal` is already readable by any
  non-anonymous user and writable by admins only.
- **Audit**: add the four fields to `FIELDS` in
  `functions/src/handlers/settingsAudit.js` so changes appear in the audit log.

## About / version

`parent/vite.config.js` defines `__APP_BUILD__` at build time:
`{ date: 'YYYY-MM-DD', commit: '<short git hash>' }`, read with
`child_process.execSync('git rev-parse --short HEAD')` inside a try/catch
(falls back to `'dev'`). The About row value shows the date; the page shows
"Version <date> (<commit>)". Vitest gets the same define so imports don't
throw.

## Architecture

### Routing

One route, an optional segment: `['settings', /^\/settings(?:\/([^/]+))?$/, ['section']]`.
The route name stays `settings`, so `nav.js` (tab highlight, own-header set)
and `App.jsx` (profile gate, screen switch) need no changes, and moving
between the list and a sub-page keeps the same mounted `Settings` component,
so its Firestore listeners are not re-created. `params.section` is
`undefined` for the list.

### Units

| File | Purpose |
| --- | --- |
| `parent/src/lib/settingsSections.js` | Pure: the ordered section list (key, title string, tile color token, icon name, group), `isSection(key)`, and value helpers (`notificationValue(state)`, `openReportCount(reports)`). Unit-tested. |
| `parent/src/components/SettingsList.jsx` | `SettingsGroup` (rounded group, optional header/footnote), `SettingsRow` (tile, label, optional subtitle, value, chevron; renders a `<button>` or `<a>`), `IconTile`, and `Switch` (`<button role="switch" aria-checked>`, 44px hit area). |
| `parent/src/screens/Settings.jsx` | Loads shared data once (links, device status, portal, reports, profile), renders the main list or dispatches to a sub-page by `route.params.section`. |
| `parent/src/screens/settings/*.jsx` | One small component per sub-page (`Profile`, `Notifications`, `Appearance`, `Install`, `Learners`, `Reports`, `Help`, `Privacy`, `About`), receiving data and handlers as props. Bundled into the existing lazy Settings chunk. |
| `parent/src/lib/installPrompt.js` | The `beforeinstallprompt` holder described above. |
| `parent/src/components/Icon.jsx` | New glyphs: `bell`, `halfMoon`, `download`, `people`, `envelope`, `phone`, `shield`, `info`, `chevron`, `share`, `plusSquare`. |
| `parent/src/strings.js` | New row titles, short notification states, install, help and about copy. |

### Styling

- Colors go through tokens, per the dark-mode spec: tile colors become CSS
  variables (`--tile-red`, `--tile-indigo`, `--tile-blue`, `--tile-green`,
  `--tile-orange`, `--tile-teal`, `--tile-grey`) referenced from `T`, the
  same value in light and dark (as iOS does), with white glyphs.
- Groups use the existing glass surface and radius; row separators are an
  inset hairline starting after the tile, as in iOS. Rows are at least 52px
  tall. Value text and chevron use `T.inkMuted`.
- Tiles are decorative (`aria-hidden`); the row label is the accessible name,
  and the value is included (e.g. "Notifications, On").
- No new dependency. The eager entry grows only by `installPrompt.js`;
  `npm run size` must stay under the 260 KB limit.

## Edge cases

- Profile not loaded yet (`profile` null): the main list still renders; the
  profile page hides the name field as today.
- `portal` doc missing: Help shows the empty message; privacy row has no link.
- Notifications state `ios_needs_install`: the row value reads "Needs install"
  and the Notifications page links to the Install page.
- Delete confirm is open and the parent taps back: confirm state resets.
- Deep link to `/settings/install` while installed: shows "This app is installed."

## Implementation notes

- Tile and switch colors are `--tile-*`, `--on-tile`, `--switch-knob` and
  `--switch-shadow` in their own `:root` block in `shared/theme/theme.css`
  (not `--t-*`), so the light/dark token-parity test doesn't apply to them.
- The main list hides any row whose section has no page in `PAGES`; there is
  no separate `isSection` helper.
- Settings' writes live in `parent/src/lib/guardianWrites.js`, which lets the
  synthetic browser preview (`parent/tests/browser/settings-*`) swap them out.

## Testing

- `router.test.js`: `/settings` → section undefined; `/settings/notifications`
  → section `notifications`; trailing slash; `/settings/a/b` → notFound.
- `nav.test.js`: the Settings tab stays active on `/settings/<section>`.
- `settingsSections.test.js`: section order and groups, `isSection`, value
  helpers for every notification state and report mix.
- `strings.test.js`: the new keys exist; the forbidden-word check covers them.
- `installPrompt` test with a fake `window` event target.
- SIMS: existing tests still pass. `functions/test/emulator/scheduled.test.js`
  already exercises `portal.settings_changed`; extend it to assert a contact
  field change lands in the audit `details`.
- Manual browser check (Parents App dev server) at 375px, light and dark:
  main list, every sub-page, back navigation, switches, Install row hidden in
  standalone mode, Help with no fields and with all fields.
- `npm test` and `npm run size` in `parent/`; root `npm test`.
