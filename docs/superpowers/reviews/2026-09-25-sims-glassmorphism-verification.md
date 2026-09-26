# SIMS glass redesign verification

Date: 2026-09-26 (Asia/Taipei)  
Branch/base: codex/sims-glassmorphism / 3de6353. Initial review range: 3de6353..d0e6469; all four Important findings were fixed and rechecked.  
Published: Firebase Hosting site bnhs-sims, https://bnhs-sims.web.app (version finalized and released 2026-09-26). Hosting-only; no Functions, Firestore rules, Parent site, or kiosk services deployed.

## Automated checks
- npm test: 17 files, 90 tests passed.
- npm run build: passed. Separate route/tab chunks remain. Existing large bundle warnings: app entry about 865 kB and ExcelJS about 930 kB minified.
- git diff --check: passed.
- Impeccable detector ran once. Its sole finding was an overused-font warning for Inter. Inter is explicitly approved in the design brief and remains.
- Five browser regressions passed in the synthetic Vite preview: learner, section and schedule drafts remain through resource error/retry; section details open from a keyboard button; print readiness resets after QR DOM detach/remount. Run npm exec vite -- --config tests/browser/registrar.config.mjs, then open http://127.0.0.1:5187/tests/browser/registrar-recovery.html.

## Browser review
A Vite fixture intercepted every Firebase/data module and generated synthetic learners, sections, attendance and settings. No production reads or writes occurred.
- At 1280 and 1440 CSS-pixel desktop viewports, all nine destinations rendered without document-width overflow.
- At 390px, dashboard and learner list rendered without document-wide horizontal overflow; learner dialog measured 358px. The sidebar drawer opened, Escape closed it, and focus returned to “Open navigation.”
- Dashboard showed 12 unassigned active learners, 7 sections without a record, 128 active learners, 116 enrolled learners, 8 current-year sections, and distinct record coverage 1/8 (13%).
- Error/retry and empty dashboard scenarios showed distinct feedback. “View all 7 sections” opened the named list dialog.
- Guardians had eight panels; Home/End keyboard selection and lazy panel content were checked.
- ID Cards enabled printing after all 15 fixture QR images reported loaded.
- After release, the live URL displayed the BNHS SIMS sign-in screen.

The browser review had no signed-in registrar session; no staff credentials were entered. It did not test Firestore integration, writes, permissions, 200% zoom, physical printer/SF2 output, throttled hardware performance, or high-contrast/reduced-transparency rendering. QR readiness was tested in-browser; physical pagination and QR scanability still need a printer/device check. A browser screenshot was inspected but not saved.

## Contrast estimate
For a conservative background bound, each channel used the minimum across the four configured page/radial colors, then composited the white glass fill over that bound (247,246,247 at 76% white). Calculated WCAG text ratios: body #25213b 14.3:1, muted #656078 5.6:1, nav text #625b79 5.9:1. Primary #5b4fe8 with white text is 5.6:1. The screen control border #8c869a against white is approximately 3.5:1. These are color-token calculations, not measurements at every browser gradient position. Status colors retain text labels.

## Review findings
No Critical findings. Four Important findings were fixed:
1. Students, Sections and Schedules resource failures removed modal drafts. Editors now stay mounted in an editor resource scope; dependent controls are disabled on failure/loading and remain closable.
2. Print readiness could remain bound to a detached QR container. It now observes the current committed DOM node and checks readiness before exposing print controls.
3. Selecting the active Attendance sidebar item used to remount AttendanceArea. Re-selecting it now preserves the session; explicit attendance entries still start a new one.
4. Section details had no keyboard entry. A named 44px keyboard accessible button is now in each section name cell.

Three Minor items deferred:
- Filtered learner results still use generic “No learners yet” copy.
- Attendance mode buttons still lack aria-pressed.
- Monthly Summary sticky identity headers still need an opaque fill while scrolling horizontally.

## Implementation rulings
- Used PowerShell for plan helper operations because the available helpers require bash. The plan-scoped ledger was retained; helper scripts were not run.
- Without an authenticated SIMS session, used an isolated synthetic preview with intercepted Firebase/data modules. This checks UI states but cannot demonstrate live registrar data/integration.
- Shared tested action locking/error handling in one hook instead of duplicating it. Guardian search controls remain outside query-result loading boundaries to preserve focus during typing.
