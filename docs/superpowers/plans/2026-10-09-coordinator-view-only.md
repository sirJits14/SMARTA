# Coordinator View-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Section ID/QR printing becomes Administrator-only, and tests pin down that coordinators stay view-only for learners, sections, and enrollment.

**Architecture:** Every SIMS permission decision lives in `src/lib/access.js`; pages ask it. Printing joins Edit/Delete behind `isAdmin(me)` in `SectionsPage`, and the now-unused `canPrintSectionQr` is removed. `SectionDetailModal` already hides Print/Edit when their callbacks are absent.

**Tech Stack:** React 18, Vite, Vitest (node environment, `react-dom/server` for render tests), Firestore rules (unchanged).

Spec: `docs/superpowers/specs/2026-10-09-coordinator-view-only-design.md`

## Global Constraints

- Coordinators keep every view and search they have today, plus attendance save, SF2 export, and announcements.
- No `firestore.rules` change.

---

### Task 1: Access tests pin the coordinator boundary

**Files:**
- Modify: `src/lib/access.test.js`

**Interfaces:**
- Consumes: `isAdmin(me)`, `canOpen(me, page)` from `src/lib/access.js` (existing).

- [ ] **Step 1: Add the tests** inside `describe('pages', ...)`:

```js
  it('no coordinator role is an administrator or reaches admin-only pages', () => {
    for (const me of [jhs, { role: 'shs_coord' }, glc8]) {
      expect(isAdmin(me)).toBe(false);
      for (const page of ['enroll', 'idcards', 'guardians', 'settings', 'accounts']) expect(canOpen(me, page)).toBe(false);
    }
  });
  it('a profile with no role is still an administrator (pre-roles accounts)', () => {
    expect(isAdmin({})).toBe(true);
    expect(isAdmin({ role: '' })).toBe(true);
  });
```

- [ ] **Step 2: Run** `npx vitest run src/lib/access.test.js` — expected PASS (characterization of existing behavior).

### Task 2: Section detail renders Print/Edit only when given the actions

**Files:**
- Create: `src/pages/SectionDetailModal.test.js`

- [ ] **Step 1: Write the test**

```js
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import SectionDetailModal from './SectionDetailModal.jsx';

const h = React.createElement;
const section = { id: 's1', gradeLevel: 7, name: 'Rizal' };
const roster = [{ id: 'a', lrn: '123456789012', firstName: 'Ana', lastName: 'Cruz', sex: 'F' }];

describe('SectionDetailModal', () => {
  it('is view-only without print or edit actions (coordinators)', () => {
    const html = renderToStaticMarkup(h(SectionDetailModal, { section, roster, onClose: vi.fn() }));
    expect(html).toContain('Cruz');
    expect(html).not.toContain('Print QR Codes');
    expect(html).not.toContain('>Edit<');
  });
  it('shows Print and Edit when the actions are given (administrator)', () => {
    const html = renderToStaticMarkup(h(SectionDetailModal, { section, roster, onClose: vi.fn(), onPrint: vi.fn(), printReady: true, onEditStudent: vi.fn() }));
    expect(html).toContain('Print QR Codes');
    expect(html).toContain('>Edit<');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/pages/SectionDetailModal.test.js` — expected PASS.

### Task 3: Printing becomes Administrator-only

**Files:**
- Modify: `src/pages/SectionsPage.jsx:18,84,214,221`
- Modify: `src/lib/access.js:10`
- Modify: `docs/superpowers/specs/2026-10-04-staff-accounts-and-roles-design.md:174`

- [ ] **Step 1:** In `SectionsPage.jsx`, drop `canPrintSectionQr` from the import, delete `const canPrint = canPrintSectionQr(me);`, and replace the two `canPrint` uses with `admin`:

```jsx
<SectionDetailModal printReady={printReady} onPrint={admin ? () => printAndConfirm(detailRosterDeped) : undefined}
...
{admin && detailSection && <div ref={printRoot}><IdCardsPrintSheets entries={detailEntries} printOnly /></div>}
```

- [ ] **Step 2:** Delete the `canPrintSectionQr` line from `src/lib/access.js`.
- [ ] **Step 3:** In the staff-roles spec, Sections row: `Section detail roster viewable; ID/QR printing and per-student Edit hidden (admin-only).`
- [ ] **Step 4: Verify** `grep -rn canPrintSectionQr src` returns nothing; `npm test` passes; `npx vite build` succeeds.
- [ ] **Step 5: Commit**

```bash
git add src docs
git commit -m "feat(sims): make section ID/QR printing administrator-only"
```
