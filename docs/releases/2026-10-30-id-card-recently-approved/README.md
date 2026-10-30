# Release — ID Cards: Recently approved (2026-10-30)

Plan: `docs/superpowers/plans/2026-10-30-id-card-recently-approved.md`

## What ships

- `firestore.rules`: `id_card_approved` readable and deletable by administrators only.
- Function `resolveLearnerRequest`: approving an add that creates a new learner logs them in `id_card_approved`.
- SIMS: a third ID Cards tab, **Recently approved**. Printing a card by any route also clears its log entry.
- Script `functions/scripts/backfillApprovedCards.mjs`, run once.

Parent App: no change. Do not deploy `hosting:parent`.

## Order (must be followed)

1. **Rules first.** The new SIMS bundle deletes `id_card_approved/{id}` whenever it marks a card printed. Without the rule, marking printed fails.

   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Function.**

   ```bash
   firebase deploy --only functions:resolveLearnerRequestFn
   ```

3. **Backfill.** Dry run, read the counts, then apply.

   ```bash
   node functions/scripts/backfillApprovedCards.mjs <projectId>
   ```

   ```bash
   node functions/scripts/backfillApprovedCards.mjs <projectId> --apply
   ```

4. **SIMS hosting**, through the documented SIMS release tree, not a root build. Port these files onto the current live release base: `src/data/idCards.js`, `src/lib/idCardQueue.js`, `src/pages/IDCardsPage.jsx`, `src/pages/idCards/RecentlyApprovedTab.jsx`. Before publishing, confirm the bundle contains the reCAPTCHA site key. Then deploy `hosting:sims` only.

5. Record the source revision, the backfill counts and the live byte check under `docs/audits/deployments/2026-10-30-id-card-recently-approved/`.

## Live checks

- As an admin: ID Cards → **Recently approved** lists the backfilled learners.
- Approve a test add request for a new LRN. The learner appears within seconds, with "Approved by …".
- **Add to saved batch** moves them. **Print selected** → **Yes, mark as printed** clears them. **Dismiss** asks, then clears.
- By section → print → mark printed also clears any of those learners from Recently approved.
- As a coordinator: ID Cards is still unreachable.
