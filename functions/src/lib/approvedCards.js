import { FieldValue } from 'firebase-admin/firestore';

// New learners waiting for their first card in SIMS ID Cards > Recently approved (plan 2026-10-30).
// One document per learner, keyed by student id. Only the server creates them; administrators read
// and delete them. The card's name, LRN and section are read live when the tab renders.
export const APPROVED_CARDS = 'id_card_approved';

export const approvedCardEntry = ({ requestId, schoolYear, approvedByName, approvedAt = FieldValue.serverTimestamp() }) =>
  ({ approvedAt, approvedByName: approvedByName || '', requestId, schoolYear });
