# Parent portal — staged rollout checklist

Stop and fix (or roll back) whenever an exit criterion fails. Each stage's
outcome is recorded in this file with the date and who verified it.

## Prerequisites (console, one-time)
- [ ] Project on Blaze; budget PHP 1,500 with 50/100/200 % alerts (owner + registrar emails).
- [ ] Authentication → Sign-in method: Email/Password on, Google on, Anonymous still ON (turned off in step K4).
- [ ] Cloud Messaging → Web Push certificates → generate key pair → `VITE_FIREBASE_VAPID_KEY` in `parent/.env`.
- [ ] App Check → register the three web apps with reCAPTCHA v3 (one site key covering the three hostnames); enforcement OFF for now; debug tokens registered for dev machines.
- [ ] Hosting → add site `bnhs-parent`; `firebase target:apply hosting sims bnhs-sims`; `firebase target:apply hosting parent bnhs-parent`.
- [ ] Firestore → `settings/parent_portal` = `{ notificationsPaused: true, consentVersion: 1, privacyNoticeUrl: "<published notice URL>" }`.
- [ ] Privacy notice reviewed by the school head; focal person named in it.
- [ ] Create kiosk Auth users (`kiosk-<gate>@…`) per device; passwords in the office safe.

## Stage 0 — Emulator (dev)
- [ ] `npm run test:all` green.
- [ ] Throughput rehearsal: `node scripts/rehearsal.mjs` (seeds 8,000 scans over 15 simulated minutes against the emulator; script written during this stage from `functions/test/emulator/helpers.js`) → all projections exist; Emulator UI request counts recorded here: reads ____ writes ____.
- [ ] Manual walkthrough (Task 16 Step 2) completed on Android Chrome and iOS Safari (PWA installed).

## Kiosk migration (production, in this order — the gate never stops)
- [ ] K1 Deploy kiosk v2 (`npm run deploy` in the kiosk repo). Old rules still accept it.
- [ ] K2 Register each device (Guardians → Kiosk devices) and sign in at `/setup`. Verify one scan per device writes `scan_events`.
- [ ] K3 Deploy indexes + rules + functions: `npx firebase deploy --only firestore,functions`. Verify scanning at every gate immediately. Rollback = redeploy previous `firestore.rules`.
- [ ] K4 Disable Anonymous sign-in in the console.
- [ ] K5 After one clean school day (Scan log tab shows every gate; Functions logs show `scan_processed`, zero `scan_rejected:device`): App Check → enforce for Firestore, then Functions.

## Stage 1 — Internal staff test (3 school days)
- [ ] Deploy parent site: `npm --prefix parent run build && npx firebase deploy --only hosting:parent`.
- [ ] Issue slips for a test section containing staff members' own children or test learners; 5–10 staff activate.
- [ ] Portal settings → Resume notifications.
- [ ] Exit: 0 rejected events, `reconcile_missing` = 0 each night, pushes received on Android and iOS-PWA, kiosk offline test (unplug network, scan, reconnect) passed, Firestore reads/writes per day recorded: ____ / ____.

## Stage 2 — Consenting-parent pilot (~30 guardians, 5 school days)
- [ ] Advisers recruit ~30 parents; slips issued for those learners only (issue the section, hand out only the pilot slips, revoke the rest via Learner access → Revoke unused slip).
- [ ] Exit: ≥ 80 % activated, ≥ 60 % enabled push, every report resolved same day, no privacy incident, billing for the period ≤ PHP 50.

## Stage 3 — One section (2 weeks)
- [ ] Slips printed through the normal pipeline and handed out in homeroom.
- [ ] Exit: adviser confirms the handout worked; measured reads/writes per active guardian × 8,000 projects to ≤ PHP 600/month; registrar backlog (open requests + reports) ≤ 2 days.

## Stage 4 — School-wide, one grade level per week (7 → 12)
- [ ] Weekly review: Firestore usage vs ceilings (reads ≤ 60K/day, writes ≤ 35K/day, deletes ≤ 10K/day, retention nights excepted), cost, `pushes_failed`, report volume, registrar workload.
- [ ] Stop condition: any ceiling exceeded 2× on a normal day, or registrar backlog > 2 days → pause expansion, investigate.

## Stage 5 — Steady state
- [ ] Nightly jobs verified in Cloud Scheduler (3 jobs, last run success).
- [ ] SY-rollover rehearsal on the emulator before March (change `currentSchoolYear`, run `expireLinks`, confirm inbox notices).
- [ ] Decision on paid fallback (SMS/WhatsApp) taken only from measured push adoption and `pushes_failed` — not before.
