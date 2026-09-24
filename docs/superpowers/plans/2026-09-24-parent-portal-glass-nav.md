# Parent Portal Glass Floating Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the parent portal's edge-pinned text bottom bar with a frosted floating pill nav (sliding indigo chip, icon + label for the active tab, icon-only otherwise), and give cards/banners a light matching frost over a soft color-glow background.

**Architecture:** A pure `activeTab(routeName)` helper (unit-tested) decides which tab is lit. A new `glass.css` (imported once in `main.jsx`) holds everything inline styles can't express: `backdrop-filter`, `@supports` fallback, pseudo-element glows, `aria-current` selectors and a keyframe. `Shell.jsx` renders the nav and measures the active button to position one sliding chip. Inline SVG icons live in `Icon.jsx`.

**Tech Stack:** React 19, Vite 8, Vitest 4 (node environment, `src/**/*.test.js` only), plain CSS.

Spec: `docs/superpowers/specs/2026-09-24-parent-portal-glass-nav-design.md`

## Global Constraints

- Scope is `parent/` only; the registrar SIMS (`src/`) is untouched.
- No new npm dependencies. Icons are inline SVG.
- Initial-load bundle stays under 260 KB gzipped (`npm run size` in `parent/`).
- Keep 3 tabs: Home `/`, Inbox `/inbox`, Settings `/settings`. Labels reuse `S.navHome`, `S.navInbox`, `S.navSettings`. No FAB, no badge, no new routes.
- Active chip color `rgba(91,79,232,0.12)`; active icon/label `#5B4FE8` (`T.primary`); inactive icon `#6B6890` (`T.inkMuted`).
- Blur radii ≤ 18px. Browsers without `backdrop-filter` get solid white nav and cards.
- Slide/label motion 250ms; the existing global `prefers-reduced-motion` rule in `parent/src/main.jsx` must keep disabling it (don't remove that rule).
- Every tab keeps a text label in the DOM, `aria-current="page"` when active, and ≥ 48px tap height.
- All commands below run from `parent/` unless stated otherwise.

## File Map

| File | Change | Responsibility |
|---|---|---|
| `parent/src/lib/nav.js` | Create | `NAV_TABS`, `activeTab(routeName)` |
| `parent/src/lib/nav.test.js` | Create | Tests for `activeTab` |
| `parent/src/glass.css` | Create | Glows, glass surfaces, nav/chip/label styles, fallback |
| `parent/src/main.jsx` | Modify | Import `./glass.css` |
| `parent/src/components/Icon.jsx` | Create | `Icon({ name, filled, size })` |
| `parent/src/components/Shell.jsx` | Modify | Floating glass nav, drop page background, bigger bottom padding |
| `parent/src/components/ui.jsx` | Modify | `Card` → `glass-card` class; `Banner` → `glass` class + hairline |
| `parent/src/screens/SignIn.jsx` | Modify | Drop opaque page background so glows show |

---

### Task 1: `activeTab` route → tab mapping

**Files:**
- Create: `parent/src/lib/nav.js`
- Test: `parent/src/lib/nav.test.js`

**Interfaces:**
- Consumes: route names from `parent/src/lib/router.js` (`home`, `verify`, `consent`, `activate`, `learner`, `inbox`, `report`, `requestAccess`, `settings`, `notFound`).
- Produces:
  - `NAV_TABS: Array<{ key: 'home'|'inbox'|'settings', path: string }>` in display order.
  - `activeTab(routeName: string): 'home'|'inbox'|'settings'|null`.

- [ ] **Step 0: Install dependencies (worktree has no `node_modules`)**

Run: `npm install`
Expected: completes without errors.

- [ ] **Step 1: Write the failing test**

Create `parent/src/lib/nav.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { NAV_TABS, activeTab } from './nav.js';

describe('NAV_TABS', () => {
  it('lists Home, Inbox, Settings in order with their paths', () => {
    expect(NAV_TABS).toEqual([
      { key: 'home', path: '/' },
      { key: 'inbox', path: '/inbox' },
      { key: 'settings', path: '/settings' },
    ]);
  });
});

describe('activeTab', () => {
  it('lights Home for the home screen and a learner page', () => {
    expect(activeTab('home')).toBe('home');
    expect(activeTab('learner')).toBe('home');
  });
  it('lights Inbox for the inbox and a report opened from it', () => {
    expect(activeTab('inbox')).toBe('inbox');
    expect(activeTab('report')).toBe('inbox');
  });
  it('lights Settings for settings', () => {
    expect(activeTab('settings')).toBe('settings');
  });
  it('lights nothing on onboarding and unknown screens', () => {
    for (const name of ['verify', 'consent', 'activate', 'requestAccess', 'notFound', undefined]) {
      expect(activeTab(name)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nav.test.js`
Expected: FAIL — cannot resolve `./nav.js`.

- [ ] **Step 3: Write minimal implementation**

Create `parent/src/lib/nav.js`:

```js
// Bottom-nav tabs and which one a route lights up. Pulled out of Shell so
// the mapping is testable without rendering.
export const NAV_TABS = [
  { key: 'home', path: '/' },
  { key: 'inbox', path: '/inbox' },
  { key: 'settings', path: '/settings' },
];

const ROUTE_TAB = {
  home: 'home', learner: 'home',
  inbox: 'inbox', report: 'inbox', // a report is opened from an inbox item or its push
  settings: 'settings',
};

export const activeTab = (routeName) => ROUTE_TAB[routeName] ?? null;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/nav.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add parent/src/lib/nav.js parent/src/lib/nav.test.js
git commit -m "feat(parent): add activeTab route-to-tab mapping for the nav"
```

---

### Task 2: Floating glass nav (CSS, icons, Shell)

**Files:**
- Create: `parent/src/glass.css`
- Create: `parent/src/components/Icon.jsx`
- Modify: `parent/src/main.jsx` (add one import)
- Modify: `parent/src/components/Shell.jsx` (whole file shown below)

**Interfaces:**
- Consumes: `NAV_TABS`, `activeTab` from `parent/src/lib/nav.js` (Task 1).
- Produces:
  - `Icon({ name: 'home'|'inbox'|'settings', filled?: boolean, size?: number })` — default export of `Icon.jsx`.
  - CSS classes used by Task 3: `.glass` (blur only) and `.glass-card` (card surface incl. fallback).

- [ ] **Step 1: Create `parent/src/glass.css`**

```css
/* Glass layer for the parent portal. Lives in CSS (not inline styles)
   because backdrop-filter fallbacks, pseudo-element glows, aria-current
   selectors and keyframes can't be expressed inline. Colors mirror
   src/styles.js tokens. */

body { background: #F5F4FC; /* T.bg */ }

/* Soft color glows behind everything so frosted surfaces read as glass. */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(circle 42vmax at 0% 0%, rgba(91, 79, 232, 0.22), transparent 70%),
    radial-gradient(circle 36vmax at 100% 45%, rgba(167, 139, 250, 0.26), transparent 70%),
    radial-gradient(circle 40vmax at 8% 100%, rgba(249, 168, 212, 0.24), transparent 70%);
}

.glass {
  -webkit-backdrop-filter: blur(12px) saturate(160%);
  backdrop-filter: blur(12px) saturate(160%);
}

.glass-card {
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 4px 24px rgba(30, 27, 51, 0.06);
  -webkit-backdrop-filter: blur(12px) saturate(160%);
  backdrop-filter: blur(12px) saturate(160%);
}

/* ---- Floating pill nav ---- */
.gnav {
  position: fixed;
  left: 50%;
  bottom: calc(12px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: min(calc(100% - 32px), 360px);
  box-sizing: border-box;
  display: flex;
  padding: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 10px 30px rgba(70, 56, 194, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  -webkit-backdrop-filter: blur(18px) saturate(180%);
  backdrop-filter: blur(18px) saturate(180%);
  z-index: 10;
}

.gnav-chip {
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 0;
  border-radius: 999px;
  background: rgba(91, 79, 232, 0.12);
  pointer-events: none;
}
.gnav-chip--anim { transition: transform 250ms cubic-bezier(.2, .8, .2, 1), width 250ms cubic-bezier(.2, .8, .2, 1); }

.gnav-btn {
  position: relative; /* above the chip */
  flex: 1 1 0;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: transparent;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  color: #6B6890; /* T.inkMuted */
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.gnav-btn[aria-current="page"] { flex: 0 0 auto; color: #5B4FE8; /* T.primary */ }
.gnav-btn:focus-visible { outline: 2px solid #5B4FE8; outline-offset: 2px; }

/* Inactive labels stay in the DOM for screen readers but are visually hidden. */
.gnav-btn:not([aria-current="page"]) .gnav-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.gnav-btn[aria-current="page"] .gnav-label { white-space: nowrap; animation: gnav-label-in 250ms ease-out; }
@keyframes gnav-label-in { from { opacity: 0; transform: translateX(-4px); } }

/* No blur support: solid surfaces rather than unreadable see-through ones. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .gnav { background: #FFFFFF; border-color: #E7E5F5; }
  .glass-card { background: #FFFFFF; border-color: #E7E5F5; }
}
```

- [ ] **Step 2: Import it in `parent/src/main.jsx`**

Add after the `import App from './App.jsx';` line:

```js
import './glass.css';
```

Leave the existing `reducedMotion` `<style>` rule untouched; it already disables `.gnav-chip--anim` transitions and the label keyframe.

- [ ] **Step 3: Create `parent/src/components/Icon.jsx`**

```jsx
// Inline nav icons: outline when idle, filled when active (Iconly-style).
// Gear path adapted from Feather Icons (MIT). No icon dependency, so the
// eager bundle stays small.
const GEAR = 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z';
const HOUSE = 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5.5H9V20H5a1 1 0 0 1-1-1z';
const TRAY = 'M3 13.5 5.4 5.7a2 2 0 0 1 1.9-1.4h9.4a2 2 0 0 1 1.9 1.4L21 13.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';
const TRAY_LIP = 'M3 13.5h5l1.5 2.5h5l1.5-2.5h5';

export default function Icon({ name, filled = false, size = 24 }) {
  const fill = filled ? 'currentColor' : 'none';
  // Cut-out detail on a filled icon is drawn white so it reads on the indigo shape.
  const detail = filled ? '#FFFFFF' : 'currentColor';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {name === 'home' && <path d={HOUSE} fill={fill} />}
      {name === 'inbox' && <><path d={TRAY} fill={fill} /><path d={TRAY_LIP} stroke={detail} /></>}
      {name === 'settings' && <><path d={GEAR} fill={fill} /><circle cx="12" cy="12" r="3" fill={filled ? '#FFFFFF' : 'none'} stroke={detail} /></>}
    </svg>
  );
}
```

- [ ] **Step 4: Rewrite `parent/src/components/Shell.jsx`**

Replace the whole file with:

```jsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import S from '../strings.js';
import { T } from '../styles.js';
import { Banner } from './ui.jsx';
import Icon from './Icon.jsx';
import { useDoc } from '../hooks/useDoc.js';
import { NAV_TABS, activeTab } from '../lib/nav.js';

const LABEL = { home: S.navHome, inbox: S.navInbox, settings: S.navSettings };

// Frosted floating pill. One chip slides behind the active tab; its target is
// measured from the active button after layout (the layout itself switches
// instantly, only the chip and label animate).
function GlassNav({ route, navigate }) {
  const active = activeTab(route.name);
  const navRef = useRef(null);
  const btnRefs = useRef({});
  const [chip, setChip] = useState(null); // { x, w } or null when no tab is lit
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const el = active && btnRefs.current[active];
      setChip(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure); // rotation, font scaling
    ro.observe(navRef.current);
    return () => ro.disconnect();
  }, [active]);

  // Turn transitions on only after the first placement so the chip doesn't
  // fly in from the left edge on page load.
  useEffect(() => {
    if (!chip || animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [chip, animate]);

  return (
    <nav ref={navRef} aria-label="Main" className="gnav">
      {chip && <span aria-hidden="true" className={`gnav-chip${animate ? ' gnav-chip--anim' : ''}`} style={{ width: chip.w, transform: `translateX(${chip.x}px)` }} />}
      {NAV_TABS.map(({ key, path }) => {
        const on = key === active;
        return (
          <button key={key} ref={(el) => { btnRefs.current[key] = el; }} type="button" className="gnav-btn"
            onClick={() => navigate(path)} aria-current={on ? 'page' : undefined}>
            <Icon name={key} filled={on} size={22} />
            <span className="gnav-label">{LABEL[key]}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function Shell({ route, navigate, children }) {
  const portal = useDoc('settings/parent_portal').data;
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return (
    <div style={{ fontFamily: T.font, color: T.ink, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '14px 16px 0', maxWidth: 560, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>{S.appName}</div>
        {!online && <Banner tone="warn">{S.offlineBanner}</Banner>}
        {portal?.notificationsPaused && <Banner tone="warn">{S.pausedBanner}{portal.pauseNote ? `: ${portal.pauseNote}` : ''}</Banner>}
        {portal?.announcement && <Banner>{portal.announcement}</Banner>}
      </header>
      <main style={{ flex: 1, padding: '0 16px calc(96px + env(safe-area-inset-bottom))', maxWidth: 560, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>{children}</main>
      <GlassNav route={route} navigate={navigate} />
    </div>
  );
}
```

Note: the page background moved from this div to `body` in `glass.css`, so the glow layer shows through.

- [ ] **Step 5: Run the test suite and a production build**

Run: `npm test`
Expected: all tests PASS (including Task 1's).

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add parent/src/glass.css parent/src/main.jsx parent/src/components/Icon.jsx parent/src/components/Shell.jsx
git commit -m "feat(parent): frosted floating pill nav with sliding active chip"
```

---

### Task 3: Light frost on cards and banners

**Files:**
- Modify: `parent/src/components/ui.jsx:10` (`Card`) and the `Banner` definition
- Modify: `parent/src/screens/SignIn.jsx:20`

**Interfaces:**
- Consumes: `.glass` and `.glass-card` classes from `parent/src/glass.css` (Task 2).
- Produces: no new exports; `Card` and `Banner` keep their props (`Card` additionally honours a caller `className`).

- [ ] **Step 1: Update `Card` in `parent/src/components/ui.jsx`**

Replace:

```jsx
export const Card = ({ style, ...p }) => <section {...p} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 16, marginBottom: 12, ...style }} />;
```

with:

```jsx
// Surface (translucent white, hairline, blur, no-blur fallback) comes from .glass-card in glass.css.
export const Card = ({ style, className, ...p }) => <section {...p} className={className ? `glass-card ${className}` : 'glass-card'} style={{ borderRadius: T.radius, padding: 16, marginBottom: 12, ...style }} />;
```

- [ ] **Step 2: Update `Banner` in `parent/src/components/ui.jsx`**

In the `Banner` component, change the opening `<div role=... style={{ ...font, fontSize: 14, borderRadius: 10, padding: '10px 12px', ...` so that it gets `className="glass"` and a white hairline. The full replacement:

```jsx
export const Banner = ({ tone = 'info', children, action }) => (
  <div role={tone === 'danger' ? 'alert' : 'status'} className="glass" style={{ ...font, fontSize: 14, borderRadius: 10, padding: '10px 12px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between',
    border: '1px solid rgba(255,255,255,0.7)',
    background: tone === 'danger' ? 'rgba(220,38,38,0.08)' : tone === 'warn' ? 'rgba(180,83,9,0.10)' : 'rgba(91,79,232,0.08)',
    color: tone === 'danger' ? T.danger : tone === 'warn' ? T.warn : T.primaryDeep }}>
    <span>{children}</span>{action}
  </div>
);
```

- [ ] **Step 3: Let the glows show on the sign-in screen**

In `parent/src/screens/SignIn.jsx:20`, remove `background: T.bg, ` from the wrapper div's style (the body now paints `T.bg` plus glows). If `T` is then unused in that file, leave the import only if other lines still use `T` (they do: `T.font`).

The line becomes:

```jsx
    <div style={{ fontFamily: T.font, minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16 }}>
```

- [ ] **Step 4: Test and build**

Run: `npm test`
Expected: all PASS.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add parent/src/components/ui.jsx parent/src/screens/SignIn.jsx
git commit -m "feat(parent): light glass frost on cards and banners"
```

---

### Task 4: Verification (size budget + visual check)

**Files:** none changed unless a check fails.

- [ ] **Step 1: Bundle budget**

Run: `npm run build && npm run size`
Expected: last line `initial-load total: … KB gz (limit 260 KB)` and exit code 0.

- [ ] **Step 2: Visual check in the browser pane**

Start the dev server (`parent/` → `npm run dev`, port 5174) via a `.claude/launch.json` entry and `preview_start`. Emulate mobile (375×812). Check:
- Nav floats ~12px above the bottom, centered, frosted over the glows; Home chip shows filled house + "Home"; Inbox/Settings are outline icons only.
- Tap Inbox → chip slides right over ~250ms, label fades in, URL is `/inbox`. Tap Settings → same.
- Open a learner page from Home → Home tab stays lit.
- Scroll a long screen (Inbox or a learner History) → last item clears the nav; content blurs under the pill.
- Cards look frosted; banner text still clearly readable.

If the app can't reach Firebase locally (sign-in wall), check at least the SignIn screen glows/card and verify the nav by temporarily rendering it — do not commit any such temporary change.

- [ ] **Step 3: Reduced motion**

With reduced motion emulated (DevTools rendering setting or `matchMedia` check), switching tabs moves the chip instantly with no label animation.

- [ ] **Step 4: Final commit (only if fixes were needed)**

```bash
git add -A parent/src
git commit -m "fix(parent): glass nav polish from visual check"
```
