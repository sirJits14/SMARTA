# Section Bevel Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Sections page, replace the underlined section-name link with a full-width, soft-raised, pressable button that ends in a `›` arrow.

**Architecture:** Restyle the existing `.sims-section-link` CSS class in `src/registrar.css` and split the button's text into a name span plus an `aria-hidden` arrow span in `src/pages/SectionsPage.jsx`. Nothing else changes: the row stays clickable, and the button keeps its `aria-label` and `stopPropagation` click handler.

**Tech Stack:** React 19, Vite, plain CSS (`src/registrar.css`), and the browser regression harness in `tests/browser/` (real components with synthetic data, run in a browser via a Vite dev server).

Spec: `docs/superpowers/specs/2026-10-05-section-bevel-button-design.md`

## Global Constraints

- Only the Sections page table changes. No other screens and no shared `Btn` variant.
- Keep `aria-label={`View ${s.name} section details`}` exactly as it is. Two existing browser tests query it.
- Keep the button's `onClick` (`event.stopPropagation(); setDetailSection(s);`) and the row's `onClick={() => setDetailSection(s)}`.
- The new CSS stays inside `@media screen` so printing is unaffected.
- Colors: text `#154854`, arrow `#007a72`, border `#b9dcd7`, fill `linear-gradient(#f3fbfa,#dff1ee)`, hover fill `linear-gradient(#f7fdfc,#e6f5f2)`.
- Minimum size: `min-width:160px`, `min-height:44px`.

## Running the browser tests

The worktree has no `node_modules`. Install once from the worktree root:

```bash
npm ci
```

Start the harness server (it keeps running, so start it in the background):

```bash
npm exec vite -- --config tests/browser/registrar.config.mjs
```

Open `http://127.0.0.1:5187/tests/browser/registrar-recovery.html` in the browser pane. Wait until `#results` has `data-done="true"`, then read the PASS and FAIL lines (for example with `get_page_text`). Reload the page after each code change.

---

### Task 1: Beveled section button with arrow

**Files:**
- Modify: `tests/browser/registrar-recovery.jsx` (line 2 for the import, and the end of the `tests` array on line 41)
- Modify: `tests/browser/README.md` (PASS count)
- Modify: `src/pages/SectionsPage.jsx:191`
- Modify: `src/registrar.css:146`

**Interfaces:**
- Consumes: the existing harness helpers in `registrar-recovery.jsx` (`scenario`, `render`, `assert`, `host`, `admin`) and the fixture section `Acacia` (`sec0`, Grade 7).
- Produces: the `.sims-section-link` button, which now contains two child spans in this order: `<span>{name}</span>` and `<span aria-hidden="true">›</span>`.

- [ ] **Step 1: Load the app stylesheet in the harness**

At the top of `tests/browser/registrar-recovery.jsx`, insert a new line 2 directly after the first `import React,...` line:

```js
import '/src/registrar.css';
```

This is safe for the other tests. Every screen rule in `registrar.css` is scoped to `.sims-ui` except `.sims-dialog`, and the only `display:none` rules are inside `@media print`.

- [ ] **Step 2: Write the failing test**

In `tests/browser/registrar-recovery.jsx`, the `tests` array currently ends on line 41 with:

```js
  assert(!dialogText().includes('print correctly'),'Coordinator was asked to mark cards');}finally{print.restore()}}]];
```

Replace that line with:

```js
  assert(!dialogText().includes('print correctly'),'Coordinator was asked to mark cards');}finally{print.restore()}}]
,['Section name is a full-width beveled button with an arrow',async()=>{await scenario('normal');
  await render(<div className="sims-ui"><SectionsPage me={admin} schoolYear="2026-2027"/></div>);
  const control=host.querySelector('button[aria-label="View Acacia section details"]');assert(control,'Section detail button absent');
  const [name,arrow]=control.children;
  assert(name?.textContent==='Acacia','Name span missing');
  assert(arrow?.textContent==='›'&&arrow.getAttribute('aria-hidden')==='true','Arrow must be an aria-hidden › span');
  const css=getComputedStyle(control);
  assert(css.display==='flex','Button is not flex: '+css.display);
  assert(css.textDecorationLine==='none','Button is still underlined');
  assert(css.boxShadow!=='none','Button has no bevel shadow');
  const cell=control.closest('td');const cellCss=getComputedStyle(cell);
  const inner=cell.clientWidth-parseFloat(cellCss.paddingLeft)-parseFloat(cellCss.paddingRight);
  assert(Math.abs(control.offsetWidth-inner)<=1,'Button does not fill the cell: '+control.offsetWidth+' vs '+inner);}]];
```

- [ ] **Step 3: Run the tests and confirm the new one fails**

Reload `http://127.0.0.1:5187/tests/browser/registrar-recovery.html`.
Expected: 9 PASS lines, plus `FAIL Section name is a full-width beveled button with an arrow: Name span missing`.

- [ ] **Step 4: Split the button text into a name and an arrow**

In `src/pages/SectionsPage.jsx`, line 191 is currently:

```jsx
                    <td style={{ ...S.td, fontWeight: 600 }}><button className="sims-section-link" aria-label={`View ${s.name} section details`} onClick={(event) => { event.stopPropagation(); setDetailSection(s); }}>{s.name}</button></td>
```

Replace it with:

```jsx
                    <td style={{ ...S.td, fontWeight: 600 }}><button className="sims-section-link" aria-label={`View ${s.name} section details`} onClick={(event) => { event.stopPropagation(); setDetailSection(s); }}><span>{s.name}</span><span aria-hidden="true">›</span></button></td>
```

- [ ] **Step 5: Replace the link style with the soft-raised bevel**

In `src/registrar.css`, line 146 is currently:

```css
@media screen { .sims-ui .sims-section-link { border:0; padding:10px 0; min-height:44px; font:inherit; font-weight:600; text-align:left; background:transparent; color:#154854; cursor:pointer; text-decoration:underline; text-underline-offset:3px; } }
```

Replace it with:

```css
@media screen {
  .sims-ui .sims-section-link { display:flex; justify-content:space-between; align-items:center; gap:12px; width:100%; min-width:160px; min-height:44px; box-sizing:border-box; padding:9px 16px; font:inherit; font-weight:600; color:#154854; text-align:left; text-decoration:none; overflow-wrap:anywhere; border:1px solid #b9dcd7; border-radius:10px; background:linear-gradient(#f3fbfa,#dff1ee); box-shadow:inset 0 1px 0 #fff, 0 2px 0 #b9dcd7, 0 3px 6px rgba(21,72,84,.12); cursor:pointer; transition:transform 80ms ease-out, box-shadow 80ms ease-out; }
  .sims-ui .sims-section-link:hover { background:linear-gradient(#f7fdfc,#e6f5f2); }
  .sims-ui .sims-section-link:active { transform:translateY(2px); box-shadow:inset 0 2px 3px rgba(21,72,84,.15), 0 0 0 #b9dcd7; }
  .sims-ui .sims-section-link > span[aria-hidden] { color:#007a72; flex-shrink:0; }
}
```

There is no focus rule on purpose. The global `.sims-ui :focus-visible` outline on line 12 applies.

- [ ] **Step 6: Run the tests and confirm all ten pass**

Reload `http://127.0.0.1:5187/tests/browser/registrar-recovery.html`.
Expected: 10 PASS lines and no FAIL lines. This includes `PASS Section details have a keyboard button` and `PASS Coordinator section print never asks to mark`, which confirms the `aria-label` still works.

- [ ] **Step 7: Update the README count**

In `tests/browser/README.md`, change:

```
The visible result must show nine PASS lines.
```

to:

```
The visible result must show ten PASS lines.
```

In the same paragraph, change `Covers learner/section/schedule draft retention on retrieval error, keyboard section access,` to `Covers learner/section/schedule draft retention on retrieval error, keyboard section access, the beveled section button,`.

- [ ] **Step 8: Run the unit tests**

```bash
npm test
```

Expected: every test passes. This change touches no unit-tested logic, but the run catches syntax mistakes in the edited JSX.

- [ ] **Step 9: Commit**

```bash
git add src/pages/SectionsPage.jsx src/registrar.css tests/browser/registrar-recovery.jsx tests/browser/README.md
git commit -m "feat(sections): section name is a beveled button with an arrow" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Visual check in the browser pane

This task commits nothing. It covers the spec's checks that a computed-style test can't: hover, press, focus, a long name and phone width. The real app needs a production sign-in, so use a temporary preview page in the harness instead.

**Files:**
- Create (temporary, deleted in Step 5): `tests/browser/section-button-preview.html`
- Create (temporary, deleted in Step 5): `tests/browser/section-button-preview.jsx`

**Interfaces:**
- Consumes: the `.sims-section-link` markup and CSS from Task 1, and the synthetic fixture (`useCollection` swapped by `registrar.config.mjs`).
- Produces: nothing that persists.

- [ ] **Step 1: Create the preview page**

`tests/browser/section-button-preview.html`:

```html
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f9f8"><div id="root"></div><script type="module" src="./section-button-preview.jsx"></script></body></html>
```

`tests/browser/section-button-preview.jsx`:

```jsx
import React from 'react';import {createRoot} from 'react-dom/client';import '/src/registrar.css';
import SectionsPage from '/src/pages/SectionsPage.jsx';
window.previewScenario='normal';
createRoot(document.getElementById('root')).render(<div className="sims-ui" style={{padding:16}}><SectionsPage me={{role:'admin',email:'admin@bnhs'}} schoolYear="2026-2027"/></div>);
```

- [ ] **Step 2: Check the desktop look and states**

Open `http://127.0.0.1:5187/tests/browser/section-button-preview.html` in the browser pane and take a screenshot. Check:
- Section buttons are equal width, pale teal and raised, with `›` on the right.
- Hovering a button lightens it (use `computer` `hover`, then `zoom`).
- Pressing Tab until a section button is focused shows the teal focus outline. Enter then opens the section details dialog. Close it with Escape.
- Clicking the Strand cell of a row also opens the section details dialog.

- [ ] **Step 3: Check a long name**

With `javascript_tool`, run `document.querySelector('.sims-section-link span').textContent='STEM – Albert Einstein Integrated Science Honors'` and take a screenshot. Expected: the name wraps onto a second line inside the button, the `›` stays on the right, and the button doesn't overflow its cell. (This edits the DOM only and is lost on reload.)

- [ ] **Step 4: Check phone width**

Use `resize_window` with preset `mobile`, reload, and screenshot. Expected: the page itself doesn't scroll sideways; any overflow scrolls inside the table region. Then use `resize_window` with preset `desktop`.

- [ ] **Step 5: Delete the preview files**

```bash
rm tests/browser/section-button-preview.html tests/browser/section-button-preview.jsx
git status --short
```

Expected: `git status --short` prints nothing.

The press state (`:active`) can't be held in a screenshot. It was tried in the brainstorming mockup, and the CSS above matches that mockup exactly.
