import { tempPassBlocker, isOfficialCardPrinted } from '../../shared/tempPass.js';

// Temporary ID pass helpers for the SIMS (spec 2026-11-27).
// 85 × 134.8 mm passes, two across and two down on A4 (spec 2026-11-27 requests).
export const PASSES_PER_SHEET = 4;

const row = (key, label, tone, printable) => ({ key, label, tone, printable });

// First match wins; see the status table in the plan's Task 6.
export function passRowStatus({ student, enrollment, section, schoolYear, pass }) {
  if (isOfficialCardPrinted(student)) return row('official', 'Official ID issued', 'neutral', false);
  const blocker = tempPassBlocker({ student, enrollment, section, schoolYear });
  if (blocker === 'inactive') return row('inactive', 'Not active', 'neutral', false);
  if (blocker === 'no-lrn') return row('no-lrn', 'No LRN', 'warning', false);
  // Not in the table: the tab lists only enrolled learners, but a record caught
  // mid-change must never look printable when the server would refuse it.
  if (blocker === 'not-enrolled' || blocker === 'not-found') return row('not-enrolled', 'Not enrolled', 'neutral', false);
  const thisYear = pass && pass.schoolYear === schoolYear;
  if (!blocker && thisYear && pass.status === 'active' && pass.lrn === student.lrn) return row('active', 'Active', 'success', true);
  if (thisYear && pass.status === 'revoked') return row('revoked', 'Revoked', 'danger', true);
  if (thisYear && pass.status === 'superseded') return row('superseded', 'Superseded', 'neutral', true);
  // A learner without a photo still prints: the card carries a frame to attach one.
  return student?.photo?.path ? row('ready', 'Ready', 'info', true) : row('ready', 'Ready · no photo', 'info', true);
}

// A rough width (0.66 em per character) decides whether to shrink; when it does,
// textLength makes the SVG renderer guarantee the fit whatever the real glyphs.
export function fitText(text, maxWidth, fontSize) {
  const length = String(text ?? '').length;
  if (!length || length * fontSize * 0.66 <= maxWidth) return { fontSize };
  return { fontSize: Math.max(fontSize * 0.6, maxWidth / (length * 0.66)), textLength: maxWidth };
}

export function chunkSheets(items) {
  const sheets = [];
  for (let i = 0; i < items.length; i += PASSES_PER_SHEET) sheets.push(items.slice(i, i + PASSES_PER_SHEET));
  return sheets;
}

export const passSectionLine = (section) =>
  `GRADE ${section.gradeLevel} – ${section.name}${section.strand ? ` · ${section.strand}` : ''}`.toUpperCase();

const SKIP_REASONS = {
  'not-found': 'learner record not found',
  'not-enrolled': 'not enrolled in a section this school year',
  inactive: 'learner is not active',
  'no-lrn': 'no LRN on record',
  'official-printed': 'official ID already issued',
  'out-of-scope': 'outside the grades you manage',
  'photo-unavailable': 'the photo could not be loaded',
  'qr-failed': 'the QR code could not be made',
  'not-pending': 'the request was already handled',
};
export const skipReasonText = (reason) => SKIP_REASONS[reason] ?? 'could not be prepared';

// Runs work over items at most `limit` at a time; results keep the input order.
export async function mapWithLimit(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Resolves once the browser has the picture. decode() can stay pending in a
// hidden tab, so the load event also counts, and a timeout ends the wait.
export function loadImage(src, { ImageCtor = globalThis.Image, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => finish(new Error('Image load timed out')), timeoutMs);
    const image = new ImageCtor();
    image.onload = () => finish();
    image.onerror = () => finish(new Error('Image failed to load'));
    image.src = src;
    if (typeof image.decode === 'function') {
      // A rejected decode is not final: the load or error event still decides.
      image.decode().then(() => finish(), () => {
        if (image.complete && image.naturalWidth > 0) finish();
      });
    }
  });
}

// items: [{ studentId, code, lrn }] from a prepared preview; livePasses: Map of
// the live temp_passes rows. A pass counts once it has been seen active with its
// code and the printed LRN (the listener can lag the callable), and the preview
// is stale as soon as a seen pass stops matching.
export function livePreviewCheck(items, livePasses, confirmed) {
  const next = new Set(confirmed);
  let stale = false;
  for (const { studentId, code, lrn } of items) {
    const live = livePasses.get(studentId);
    const matches = live?.status === 'active' && live.code === code && live.lrn === lrn;
    if (matches) next.add(studentId);
    else if (next.has(studentId)) stale = true;
  }
  return { confirmed: next, stale, allLive: !stale && items.every(({ studentId }) => next.has(studentId)) };
}

// Everything a prepared preview was built from: any change discards it.
// learners: [{ id, name, lrn, requestId?, photo?, sectionLine? }] for the selected learners, as they
// would print (photo: the record's photo path, so adding or removing one prepares the card again).
export const previewKey = ({ sectionId, learners, principalName, principalTitle }) =>
  JSON.stringify([sectionId ?? '', learners.map(({ id, name, lrn, requestId, photo, sectionLine }) =>
    [id, name, lrn, requestId ?? '', photo ?? '', sectionLine ?? '']), principalName, principalTitle]);

// Wraps work so a run that has been superseded (isCurrent() false) ends quietly
// instead of reporting its error against the newer selection.
export const ignoreWhenStale = (work, isCurrent) => async () => {
  try { return await work(); }
  catch (error) { if (isCurrent()) throw error; return undefined; }
};
