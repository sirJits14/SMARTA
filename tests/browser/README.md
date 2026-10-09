# Registrar browser regressions

Run from the repo root:

```powershell
npm exec vite -- --config tests/browser/registrar.config.mjs
```

Open http://127.0.0.1:5187/tests/browser/registrar-recovery.html.
The visible result must show twelve PASS lines. This uses the real React components and DOM with synthetic resource hooks and intercepted data/Firebase modules. It never calls production services. Covers learner/section/schedule draft retention on retrieval error, keyboard section access, the beveled section button, and QR readiness on DOM detachment/remount, the ID card saved batch (merged sheets in print order, unenrolled learners set aside, fill meter, search and add, confirm-after-print, clear), coordinators never being asked to mark cards, and the SMARTA sidebar brand (wordmark expanded, S mark collapsed).

These browser checks are separate from `npm test`. The fixture does not validate authentication, real queries or production writes.

## Enrollment preview and regressions

```powershell
npm exec vite -- --config tests/browser/enrollment.config.mjs
```

Open http://127.0.0.1:5188/tests/browser/enrollment-preview.html for the responsive preview with synthetic learners and sections. Add `?checks` for six browser checks covering grade/search filtering, deduplicated current-year rosters, drawer prefill and focus restoration, destination changes, failed saves and retries, move/withdraw confirmation, and draft retention during resource errors. The fixture intercepts enrollment writes locally and never calls production services.

## Parents App Settings preview

Run from `parent/`:

```powershell
npm exec vite -- --config tests/browser/settings.config.mjs
```

Open http://127.0.0.1:5189/tests/browser/settings-preview.html. It renders the real Settings screen and sub-pages with synthetic data: the hooks, account writes, device checks and Firebase are swapped out by `parent/tests/browser/settings.config.mjs`, so it never calls production services. Use "Preview controls" to switch scenarios (no contact details, no learners, iPhone, installed, blocked, notifications off), fire a fake install prompt, and read the write log.
