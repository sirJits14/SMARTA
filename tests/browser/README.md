# Registrar browser regressions

Run from the repo root:

```powershell
npm exec vite -- --config tests/browser/registrar.config.mjs
```

Open http://127.0.0.1:5187/tests/browser/registrar-recovery.html.
The visible result must show ten PASS lines. This uses the real React components and DOM with synthetic resource hooks and intercepted data/Firebase modules. It never calls production services. Covers learner/section/schedule draft retention on retrieval error, keyboard section access, the beveled section button, and QR readiness on DOM detachment/remount, the ID card print queue (merged sheets, confirm-after-print, mark without printing), and coordinators never being asked to mark cards.

These browser checks are separate from `npm test`. The fixture does not validate authentication, real queries or production writes.
