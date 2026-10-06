# Registrar browser regressions

Run from the repo root:

```powershell
npm exec vite -- --config tests/browser/registrar.config.mjs
```

Open http://127.0.0.1:5187/tests/browser/registrar-recovery.html.
The visible result must show ten PASS lines. This uses the real React components and DOM with synthetic resource hooks and intercepted data/Firebase modules. It never calls production services. Covers learner/section/schedule draft retention on retrieval error, keyboard section access, and QR readiness on DOM detachment/remount, the ID card saved batch (merged sheets in print order, unenrolled learners set aside, fill meter, search and add, confirm-after-print, clear), and coordinators never being asked to mark cards.

These browser checks are separate from `npm test`. The fixture does not validate authentication, real queries or production writes.
