# Logo Refresh (SMARTA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old SIMS logo and the Parents App icons with the new SMARTA artwork: a dark-tile white S favicon for SIMS, the SMARTA wordmark in the SIMS sidebar, Login and Change Password screens, and a teal S on white for every Parents App icon.

**Architecture:** A one-off Pillow script (`scripts/build-logos.py`) turns three committed source PNGs in `design/logos/` into small, trimmed, resized PNGs. The SIMS outputs go to `src/assets/`. The Parents outputs overwrite the existing `parent/public/icons/` files, so the Parents App needs no code changes. Then the SIMS components swap their `sims-logo.png` import for the new files.

**Tech Stack:** Python 3 + Pillow 12 (asset generation only), React 19 + Vite, plain CSS (`src/registrar.css`), Vitest (Node environment, `src/**/*.test.js`), and the browser regression harness in `tests/browser/`.

Spec: `docs/superpowers/specs/2026-10-05-logo-refresh-design.md`

## Global Constraints

- Brand alt text everywhere is exactly `SMARTA`.
- Favicon tile fill is `#12313a`; the tile is 64×64 with radius 14, and the white S fits a 48×48 box.
- Wordmark file is 480px wide (height 142 from the trimmed 1844×545 artwork); it displays at most 188px wide in the sidebar, 240×71 on Login and 200×59 on Change Password.
- Collapsed-sidebar mark is the standalone teal S from `phone-app.png` at 64×64, displayed at 32×32. Don't crop it from the wordmark: the "M" overlaps the S there and leaves a notch.
- Parents icons are opaque RGB on white `#ffffff`: `icon-192.png` and `icon-512.png` hold the S in the middle 80%, `icon-maskable-512.png` in the middle 60%.
- Don't change app names or titles, the Parents theme color `#00A79D`, the kiosk app, or any other untracked file in the main checkout's `src/assets/`.
- When you start a dev server, stop only that server, by its own task or PID. Never kill `node` processes by name; other sessions run servers on this machine.

## File Map

| File | Change | Task |
|---|---|---|
| `design/logos/phone-app.png`, `dashboard-app.png`, `project-name.png` | Create (copied sources) | 1 |
| `scripts/build-logos.py` | Create | 1 |
| `src/assets/sims-favicon.png`, `smarta-wordmark.png`, `smarta-mark.png` | Create (generated) | 1 |
| `parent/public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Overwrite (generated) | 1 |
| `src/assets/logos.test.js` | Create | 1, 2 |
| `index.html` | Modify line 7 | 2 |
| `src/components/Shell.jsx` | Modify lines 8, 31–32 | 2 |
| `src/registrar.css` | Modify lines 21–22 | 2 |
| `src/components/Login.jsx` | Modify lines 7, 24–25 | 2 |
| `src/components/ChangePassword.jsx` | Modify lines 8, 35 | 2 |
| `src/assets/sims-logo.png` | Delete | 2 |
| `DESIGN.md` | Modify line 6 | 2 |
| `tests/browser/registrar-recovery.jsx`, `tests/browser/README.md` | Modify | 2 |

---

### Task 1: Logo sources, generator and generated assets

**Files:**
- Create: `design/logos/phone-app.png`, `design/logos/dashboard-app.png`, `design/logos/project-name.png`
- Create: `scripts/build-logos.py`
- Create: `src/assets/logos.test.js`
- Create (generated): `src/assets/sims-favicon.png`, `src/assets/smarta-wordmark.png`, `src/assets/smarta-mark.png`
- Overwrite (generated): `parent/public/icons/icon-192.png`, `parent/public/icons/icon-512.png`, `parent/public/icons/icon-maskable-512.png`

**Interfaces:**
- Consumes: the three source PNGs, which are untracked in the **main checkout** at
  `C:/Users/jitsb/OneDrive - Department of Education/Desktop/APPS/bnhs-sims/src/assets/`
  (`PHONE APP.png`, `Dashboard APP.png`, `Project Name.png`; 2000×2000 RGBA, transparent background).
- Produces: `src/assets/smarta-wordmark.png` (480×142 RGBA), `src/assets/smarta-mark.png` (64×64 RGBA), `src/assets/sims-favicon.png` (64×64 RGBA). Task 2 imports the first two and links the third.

- [ ] **Step 1: Write the failing asset test**

Create `src/assets/logos.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// PNG IHDR: width at byte 16, height at 20 (big-endian), colour type at 25 (2 = RGB, 6 = RGBA).
const png = path => { const b = readFileSync(path); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] }; };

describe('SMARTA logo assets', () => {
  it.each([
    ['src/assets/sims-favicon.png', 64, 64],
    ['src/assets/smarta-mark.png', 64, 64],
    ['src/assets/smarta-wordmark.png', 480, 142],
  ])('%s is %ix%i with transparency', (path, width, height) => {
    expect(png(path)).toEqual({ width, height, colorType: 6 });
  });

  // Opaque so iOS "Add to Home Screen" never fills transparent corners with black.
  it.each([
    ['parent/public/icons/icon-192.png', 192],
    ['parent/public/icons/icon-512.png', 512],
    ['parent/public/icons/icon-maskable-512.png', 512],
  ])('%s is an opaque %ipx square', (path, size) => {
    expect(png(path)).toEqual({ width: size, height: size, colorType: 2 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/assets/logos.test.js`
Expected: FAIL. The three `src/assets/...` cases fail with `ENOENT: no such file or directory`. The parent cases may already pass, because the old seal icons are also opaque RGB at those sizes. That's fine: Step 6 regenerates them.

- [ ] **Step 3: Copy the sources into the repo**

```bash
mkdir -p design/logos
SRC="C:/Users/jitsb/OneDrive - Department of Education/Desktop/APPS/bnhs-sims/src/assets"
cp "$SRC/PHONE APP.png" design/logos/phone-app.png
cp "$SRC/Dashboard APP.png" design/logos/dashboard-app.png
cp "$SRC/Project Name.png" design/logos/project-name.png
ls -la design/logos
```

Expected: three files of roughly 1063 KB, 730 KB and 305 KB.

- [ ] **Step 4: Write the generator**

Create `scripts/build-logos.py`:

```python
"""Builds the SMARTA logo PNGs from the sources in design/logos/.

Run from the repo root:  python scripts/build-logos.py   (needs Pillow)
Spec: docs/superpowers/specs/2026-10-05-logo-refresh-design.md
"""
from pathlib import Path
from PIL import Image, ImageDraw

SRC = Path('design/logos')
SIMS = Path('src/assets')
PARENT = Path('parent/public/icons')
INK = (0x12, 0x31, 0x3a, 255)  # sidebar ink, behind the white S on the favicon
WHITE = (255, 255, 255, 255)


def trimmed(name):
    """Open a source and crop it to the visible artwork (alpha bounding box)."""
    im = Image.open(SRC / name).convert('RGBA')
    return im.crop(im.getchannel('A').getbbox())


def fit(im, box):
    """Scale im so it fits inside a box x box square, keeping its aspect ratio."""
    scale = min(box / im.width, box / im.height)
    return im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)


def on_canvas(art, size, box, fill=(0, 0, 0, 0)):
    """Centre art (fit into box) on a size x size canvas filled with fill."""
    canvas = Image.new('RGBA', (size, size), fill)
    art = fit(art, box)
    canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas


def save(im, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, optimize=True)
    print(f'{path}  {im.width}x{im.height}  {im.mode}')


def favicon():
    tile = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    ImageDraw.Draw(tile).rounded_rectangle((0, 0, 63, 63), radius=14, fill=INK)
    s = fit(trimmed('dashboard-app.png'), 48)
    tile.alpha_composite(s, ((64 - s.width) // 2, (64 - s.height) // 2))
    return tile


def wordmark():
    word = trimmed('project-name.png')
    return word.resize((480, round(word.height * 480 / word.width)), Image.LANCZOS)


def parent_icon(size, share):
    # Opaque RGB so iOS never fills transparent corners with black.
    return on_canvas(trimmed('phone-app.png'), size, round(size * share), WHITE).convert('RGB')


if __name__ == '__main__':
    save(favicon(), SIMS / 'sims-favicon.png')
    save(wordmark(), SIMS / 'smarta-wordmark.png')
    save(on_canvas(trimmed('phone-app.png'), 64, 64), SIMS / 'smarta-mark.png')
    save(parent_icon(192, 0.8), PARENT / 'icon-192.png')
    save(parent_icon(512, 0.8), PARENT / 'icon-512.png')
    save(parent_icon(512, 0.6), PARENT / 'icon-maskable-512.png')
```

- [ ] **Step 5: Run the generator**

Run: `python scripts/build-logos.py`
Expected output (Windows prints backslashes):

```
src\assets\sims-favicon.png  64x64  RGBA
src\assets\smarta-wordmark.png  480x142  RGBA
src\assets\smarta-mark.png  64x64  RGBA
parent\public\icons\icon-192.png  192x192  RGB
parent\public\icons\icon-512.png  512x512  RGB
parent\public\icons\icon-maskable-512.png  512x512  RGB
```

If `ModuleNotFoundError: No module named 'PIL'`, run `python -m pip install Pillow` and retry.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/assets/logos.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 7: Inspect the outputs by eye**

Open each of the six generated PNGs with the Read tool. Confirm:
- `sims-favicon.png`: a white ribbon S on a dark rounded square; nothing clipped.
- `smarta-wordmark.png`: the full teal S + "SMARTA" + tagline, with no empty margins.
- `smarta-mark.png`: a complete teal S with no flat notch on its right edge.
- Parents icons: the teal S centered on white. The maskable one has visibly more padding.

Then send them to the user with `SendUserFile` (`display: "render"`), with a caption asking them to confirm before you continue. Wait for a yes.

- [ ] **Step 8: Commit**

```bash
git add design/logos scripts/build-logos.py src/assets/logos.test.js src/assets/sims-favicon.png src/assets/smarta-wordmark.png src/assets/smarta-mark.png parent/public/icons
git commit -m "feat(brand): SMARTA logo sources, generator and generated icons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Use the SMARTA logos in the SIMS App

**Files:**
- Modify: `tests/browser/registrar-recovery.jsx` (line 3 imports; the end of the `tests` array, line 55)
- Modify: `tests/browser/README.md` (line 10)
- Modify: `src/assets/logos.test.js` (add a `describe` block)
- Modify: `index.html:7`
- Modify: `src/components/Shell.jsx:8`, `src/components/Shell.jsx:31-32`
- Modify: `src/registrar.css:21-22`
- Modify: `src/components/Login.jsx:7`, `src/components/Login.jsx:24-25`
- Modify: `src/components/ChangePassword.jsx:8`, `src/components/ChangePassword.jsx:35`
- Modify: `DESIGN.md:6`
- Delete: `src/assets/sims-logo.png`

**Interfaces:**
- Consumes: `src/assets/smarta-wordmark.png`, `src/assets/smarta-mark.png`, `src/assets/sims-favicon.png` from Task 1.
- Produces: the CSS class `.sims-wordmark` on the expanded sidebar logo `<img>`. The browser test below relies on it, along with `alt="SMARTA"` and the `.sims-brand img` selector.

- [ ] **Step 1: Write the failing reference test**

Append to `src/assets/logos.test.js`:

```js
import { readdirSync } from 'node:fs';

describe('SMARTA logo references', () => {
  it('index.html uses the dark-tile favicon', () => {
    expect(readFileSync('index.html', 'utf8')).toContain('href="/src/assets/sims-favicon.png"');
  });

  it('nothing references the old sims-logo.png', () => {
    const files = readdirSync('src', { recursive: true })
      .filter(f => /\.(jsx?|css)$/.test(f) && !f.endsWith('.test.js'))
      .map(f => `src/${f}`.replaceAll('\\', '/'));
    const offenders = ['index.html', ...files].filter(f => readFileSync(f, 'utf8').includes('sims-logo.png'));
    expect(offenders).toEqual([]);
  });
});
```

Move the new `readdirSync` import up so the file has a single `node:fs` import line: `import { readFileSync, readdirSync } from 'node:fs';`.

- [ ] **Step 2: Write the failing browser test**

In `tests/browser/registrar-recovery.jsx`, add this import at the end of line 3 (after the `IDCardsPage` import):

```js
import Shell from '/src/components/Shell.jsx';
```

The `tests` array ends on line 55 with:

```js
  assert(Math.abs(control.offsetWidth-inner)<=1,'Button does not fill the cell: '+control.offsetWidth+' vs '+inner);}]];
```

Replace that line with the same assertion followed by a new test entry:

```js
  assert(Math.abs(control.offsetWidth-inner)<=1,'Button does not fill the cell: '+control.offsetWidth+' vs '+inner);}],
['Sidebar brand is the SMARTA wordmark, S mark when collapsed',async()=>{try{localStorage.setItem('sims.sidebar.collapsed','false')}catch{}
  try{await render(<Shell me={{...admin,name:'Admin'}} page="dashboard" setPage={()=>{}} schoolYear="2026-2027" onLogout={()=>{}}><p>Body</p></Shell>);
  const logo=()=>host.querySelector('.sims-brand img');
  assert(logo()?.alt==='SMARTA','Brand alt is '+logo()?.alt);
  assert(logo().classList.contains('sims-wordmark')&&logo().src.includes('smarta-wordmark'),'Expanded brand is not the wordmark: '+logo().src);
  assert(!host.querySelector('.sims-brand strong'),'Old BNHS SIMS text still shown');
  assert(logo().getBoundingClientRect().width<=188,'Wordmark wider than its 188px slot: '+logo().getBoundingClientRect().width);
  await click(host.querySelector('button[aria-label="Collapse sidebar"]'));
  assert(logo()?.alt==='SMARTA'&&logo().src.includes('smarta-mark'),'Collapsed brand is not the S mark: '+logo()?.src);
  }finally{try{localStorage.removeItem('sims.sidebar.collapsed')}catch{}}}]];
```

The test sets the collapse preference to `false`, so it starts expanded at any desktop width. It needs a viewport at least 768px wide, because below that the sidebar becomes a drawer with no collapse button.

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npx vitest run src/assets/logos.test.js`
Expected: FAIL. `index.html uses the dark-tile favicon` fails because the file still has `sims-logo.png`. `nothing references the old sims-logo.png` fails and lists `index.html`, `src/components/ChangePassword.jsx`, `src/components/Login.jsx` and `src/components/Shell.jsx`.

Start the harness server as a background task and remember its task ID:

```bash
npm exec vite -- --config tests/browser/registrar.config.mjs
```

Open `http://127.0.0.1:5187/tests/browser/registrar-recovery.html` in the in-app browser at a desktop width (≥1024px) and read the page text.
Expected: 10 PASS lines plus `FAIL Sidebar brand is the SMARTA wordmark, S mark when collapsed: Brand alt is BNHS SIMS logo`. Leave the server running.

- [ ] **Step 4: Switch the favicon**

`index.html` line 7, change:

```html
    <link rel="icon" type="image/png" href="/src/assets/sims-logo.png" />
```

to:

```html
    <link rel="icon" type="image/png" href="/src/assets/sims-favicon.png" />
```

- [ ] **Step 5: Update the sidebar brand**

`src/components/Shell.jsx` line 8, replace:

```js
import simsLogo from '../assets/sims-logo.png';
```

with:

```js
import smartaWordmark from '../assets/smarta-wordmark.png';
import smartaMark from '../assets/smarta-mark.png';
```

Then replace the two brand lines (currently 31–32 before the import change, 32–33 after it):

```jsx
    <div className="sims-brand"><img src={simsLogo} alt="BNHS SIMS logo" width="32" height="32" />
      {!collapsed && <div><strong>BNHS SIMS</strong><small>Learner records</small></div>}</div>
```

with:

```jsx
    <div className="sims-brand">{collapsed
      ? <img src={smartaMark} alt="SMARTA" width="32" height="32" />
      : <img className="sims-wordmark" src={smartaWordmark} alt="SMARTA" width="188" height="56" />}</div>
```

- [ ] **Step 6: Update the brand CSS**

`src/registrar.css` lines 21–22, replace:

```css
  .sims-ui .sims-brand strong { font-size:15px; display:block; }
  .sims-ui .sims-brand small { color:var(--sims-muted); display:block; font-size:11px; margin-top:4px; }
```

with:

```css
  .sims-ui .sims-wordmark { display:block; width:100%; max-width:188px; height:auto; }
```

188px is the room inside the expanded sidebar: 232 − 2×14 sidebar padding − 2×8 brand padding. The mobile drawer is wider (up to 300px), so no extra `@media` rule is needed.

- [ ] **Step 7: Update the Login screen**

`src/components/Login.jsx` line 7, replace `import simsLogo from '../assets/sims-logo.png';` with:

```js
import smartaWordmark from '../assets/smarta-wordmark.png';
```

Replace lines 24–25:

```jsx
        <img src={simsLogo} alt="BNHS SIMS logo" width={40} height={40} style={{ marginBottom: 16 }} />
        <h1 style={{ fontFamily: T.display, color: T.ink, fontSize: 22, margin: '0 0 2px', fontWeight: 700 }}>BNHS SIMS</h1>
```

with:

```jsx
        <h1 style={{ margin: '0 0 6px', lineHeight: 0 }}><img src={smartaWordmark} alt="SMARTA" width={240} height={71} style={{ display: 'block' }} /></h1>
```

The next line, the "Staff sign-in" paragraph, doesn't change.

- [ ] **Step 8: Update the Change Password screen**

`src/components/ChangePassword.jsx` line 8, replace `import simsLogo from '../assets/sims-logo.png';` with:

```js
import smartaWordmark from '../assets/smarta-wordmark.png';
```

Replace line 35:

```jsx
        <img src={simsLogo} alt="BNHS SIMS logo" width={40} height={40} style={{ marginBottom: 16 }} />
```

with:

```jsx
        <img src={smartaWordmark} alt="SMARTA" width={200} height={59} style={{ display: 'block', marginBottom: 16 }} />
```

The `<h1>Set a new password</h1>` below it doesn't change.

- [ ] **Step 9: Delete the old logo and update DESIGN.md**

```bash
git rm src/assets/sims-logo.png
```

In `DESIGN.md` line 6, replace the exact text:

```
The SIMS logo (`src/assets/sims-logo.png`, also the favicon) and Inter are the brand anchors.
```

with:

```
The SMARTA wordmark (`src/assets/smarta-wordmark.png`; S mark and dark-tile favicon alongside, all generated by `scripts/build-logos.py`) and Inter are the brand anchors.
```

- [ ] **Step 10: Update the browser test README**

In `tests/browser/README.md` line 10, change `The visible result must show ten PASS lines.` to `The visible result must show eleven PASS lines.`. In the same paragraph, change `and coordinators never being asked to mark cards.` to `coordinators never being asked to mark cards, and the SMARTA sidebar brand (wordmark expanded, S mark collapsed).`.

- [ ] **Step 11: Run all tests to verify they pass**

Run: `npm test`
Expected: all test files pass, including the 8 tests in `src/assets/logos.test.js`.

Reload `http://127.0.0.1:5187/tests/browser/registrar-recovery.html` (desktop width) and read the page text.
Expected: 11 PASS lines and no FAIL lines, including `PASS Sidebar brand is the SMARTA wordmark, S mark when collapsed`.

Take a screenshot while the Shell test's brand is visible, or zoom on the sidebar in the next step's check, to confirm the wordmark looks right at 188px.

Stop the harness server by its own task ID (never by process name).

- [ ] **Step 12: Visual check of Login and Change Password**

Start the app dev server as a background task: `npm run dev`. Open the URL it prints in the in-app browser.
- Signed out, the Login screen shows the SMARTA wordmark at the top left of the card, with "Staff sign-in" below it and no "BNHS SIMS" heading.
- The browser tab shows the white S on a dark tile.
- Zoom on the card at mobile width (`resize_window` preset `mobile`) and confirm the wordmark fits. Reset to `desktop` afterwards.

You can't reach Change Password without a signed-in account that has `mustChangePassword`. The code change there is a straight image swap, so a code read is enough; don't sign in to check it.

Stop the dev server by its own task ID.

- [ ] **Step 13: Commit**

```bash
git add index.html src/components/Shell.jsx src/components/Login.jsx src/components/ChangePassword.jsx src/registrar.css src/assets/logos.test.js DESIGN.md tests/browser/registrar-recovery.jsx tests/browser/README.md
git commit -m "feat(brand): SMARTA wordmark, mark and favicon in the SIMS app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git rm` in Step 9 already staged the deletion of `src/assets/sims-logo.png`.)

---

### Task 3: Parents App check and final verification

**Files:** none changed. This task only verifies. If a check fails, fix it in the task that owns the file and re-run.

- [ ] **Step 1: Run every unit suite that the change touches**

```bash
npm test
npm --prefix parent test
```

Expected: both pass. The Parents App code is unchanged; only its icon files changed.

- [ ] **Step 2: Build both apps**

```bash
npm run build
npm --prefix parent run build
npm --prefix parent run size
```

Expected: both builds succeed. `dist/assets/` contains hashed `smarta-wordmark-*.png` and `smarta-mark-*.png`. `parent/dist/icons/` holds the three new icons. The size check passes, since the icons aren't part of the measured JS bundle.

- [ ] **Step 3: Parents App visual check**

Start the Parents dev server as a background task: `npm --prefix parent run dev`. Open the URL it prints in the in-app browser.
- The browser tab icon is the teal S on white.
- The Sign-in screen shows the 48px teal S icon at the top.

The Home header needs a signed-in guardian; it uses the same `/icons/icon-192.png`, so the Sign-in check covers the file. Don't sign in.

Stop the Parents dev server by its own task ID.

- [ ] **Step 4: Confirm nothing outside scope changed**

```bash
git diff --stat master...HEAD
```

Expected: only the files in this plan's File Map, plus the spec and plan docs. Specifically, no changes under `kiosk/`, `parent/src/`, `parent/index.html` or `parent/public/manifest.webmanifest`.
