import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { TEMP_PASS_LOGO_URL } from '../../components/TempPassPrintable.jsx';
import { fulfilTempPassRequests, issueTempPasses, markTempPassRequestsPrinted } from '../../data/tempPasses.js';
import { getStudentPhoto, photoDataUrl } from '../../data/photos.js';
import { fullName } from '../../lib/roster.js';
import { passSectionLine, mapWithLimit, loadImage, livePreviewCheck, ignoreWhenStale } from '../../lib/tempPass.js';

// The prepare → confirm → print → mark-as-printed flow shared by the Requests and
// Temporary passes tabs (spec 2026-11-27 requests).
const ISSUE_CHUNK = 200;
const PHOTO_CONCURRENCY = 4;
const QR_OPTIONS = { errorCorrectionLevel: 'M', margin: 2, width: 420 };
// How long Print may wait for the live passes to confirm the prepared ones.
const CONFIRM_TIMEOUT_MS = 15000;

const chunks = (list) => Array.from({ length: Math.ceil(list.length / ISSUE_CHUNK) }, (_, i) => list.slice(i * ISSUE_CHUNK, (i + 1) * ISSUE_CHUNK));

// targets: [{ studentId, requestId?, student, section }]. A learner with a waiting request goes
// through it (so a Lost request gets its new code); everyone else gets a plain pass. Each learner once.
export function splitTargets(targets) {
  const seen = new Set(); const requestIds = []; const studentIds = [];
  for (const target of targets) {
    if (!target?.studentId || seen.has(target.studentId)) continue;
    seen.add(target.studentId);
    if (target.requestId) requestIds.push(target.requestId); else studentIds.push(target.studentId);
  }
  return { requestIds, studentIds };
}

// Gathers everything a card needs, with every picture decoded before the preview appears. Photos come
// first: a learner whose photo is on record but cannot be loaded is skipped before the server is asked,
// so such a request is never prepared (a prepared request can only be marked printed, not declined).
// Each card is then built from the target the server answered for, and only when the server's learner
// is that target's learner.
// Returned instead of a result when the selection stopped being current before the server was asked.
export const PREPARE_ABORTED = undefined;
// started: { ticket, key } when Prepare was clicked; now: { mounted, ticket, key } at this moment.
export const stillCurrent = (started, now) => now.mounted && now.ticket === started.ticket && now.key === started.key;

// isCurrent() is checked before every server call: passes are never issued (a Lost request's old code is
// never replaced) for a selection that changed, a tab that was left or a page that was closed meanwhile.
export async function preparePasses({ targets, principalName, principalTitle }, { load = loadImage, isCurrent = () => true } = {}) {
  const notPrepared = [];
  const unique = [];
  const seen = new Set();
  for (const target of targets) {
    if (!target?.studentId || seen.has(target.studentId)) continue;
    seen.add(target.studentId);
    unique.push(target);
  }
  await load(TEMP_PASS_LOGO_URL);
  // No photo on record: the card prints a frame to attach one (photoSrc null, nothing fetched).
  const photos = await mapWithLimit(unique, PHOTO_CONCURRENCY, async ({ studentId, student, section }) => {
    if (!student || !section) return { skip: 'not-found' };
    if (!student.photo?.path) return { photoSrc: null };
    try {
      const photoSrc = photoDataUrl((await getStudentPhoto(studentId))?.photo);
      if (!photoSrc) return { skip: 'photo-unavailable' };
      await load(photoSrc);
      return { photoSrc };
    } catch { return { skip: 'photo-unavailable' }; }
  });
  const ready = [];
  unique.forEach((target, i) => {
    if (photos[i].skip) notPrepared.push({ studentId: target.studentId, requestId: target.requestId || null, reason: photos[i].skip });
    else ready.push({ ...target, photoSrc: photos[i].photoSrc });
  });

  const { requestIds, studentIds } = splitTargets(ready);
  const byRequest = new Map(ready.filter((t) => t.requestId).map((t) => [t.requestId, t]));
  const byStudent = new Map(ready.filter((t) => !t.requestId).map((t) => [t.studentId, t]));
  const issued = [];
  for (const ids of chunks(requestIds)) {
    if (!isCurrent()) return PREPARE_ABORTED;
    const result = await fulfilTempPassRequests(ids);
    for (const { requestId, studentId, code } of result?.issued ?? []) {
      const target = byRequest.get(requestId);
      if (target && target.studentId === studentId && code) issued.push({ target, code });
      else notPrepared.push({ studentId: target?.studentId ?? studentId, requestId, reason: 'not-found' });
    }
    // An out-of-scope request comes back without its learner: name it from the request asked about.
    for (const { requestId, studentId, reason } of result?.skipped ?? []) {
      notPrepared.push({ studentId: byRequest.get(requestId)?.studentId || studentId, requestId, reason });
    }
  }
  for (const ids of chunks(studentIds)) {
    if (!isCurrent()) return PREPARE_ABORTED;
    const result = await issueTempPasses(ids);
    for (const { studentId, code } of result?.issued ?? []) {
      const target = byStudent.get(studentId);
      if (target && code) issued.push({ target, code });
      else notPrepared.push({ studentId, requestId: null, reason: 'not-found' });
    }
    for (const { studentId, reason } of result?.skipped ?? []) notPrepared.push({ studentId, requestId: null, reason });
  }
  const cards = await mapWithLimit(issued, PHOTO_CONCURRENCY, async ({ target, code }) => {
    const { studentId, student, section, photoSrc } = target;
    const requestId = target.requestId || null;
    let qrSrc;
    try {
      qrSrc = await QRCode.toDataURL(code, QR_OPTIONS);
      await load(qrSrc);
    } catch { return { skip: 'qr-failed', studentId, requestId }; }
    return { studentId, requestId, code, name: fullName(student), sectionLine: passSectionLine(section), lrn: student.lrn,
      photoSrc, qrSrc, principalName, principalTitle };
  });
  for (const card of cards) if (card.skip) notPrepared.push({ studentId: card.studentId, requestId: card.requestId, reason: card.skip });
  return { items: cards.filter((card) => !card.skip), notPrepared };
}

// The requests that may be marked printed: those whose cards are in a preview that was
// confirmed live and then printed. Nothing else.
export const markableRequestIds = (preview, allLive) => (preview?.printed && allLive
  ? preview.items.map((item) => item.requestId).filter(Boolean)
  : []);

export function notifiedText(printed, asked) {
  const done = `${printed} ${printed === 1 ? 'adviser' : 'advisers'} notified.`;
  const left = asked - printed;
  return left > 0 ? `${done} ${left} could not be marked printed because their pass changed. Prepare them again.` : done;
}

// selectionKey names everything the preview was built from; any change discards it and any
// preparation still running. onMarked runs after requests were marked printed (to reload them).
export function usePassPrinting({ principalName, principalTitle, passesById, selectionKey, onPrepared, onMarked }) {
  const action = useAsyncAction();
  const [preview, setPreview] = useState(null);
  // Cleared with the preview; `done` (the mark-as-printed result) outlives the reload that follows it.
  const [stale, setStale] = useState('');
  const [done, setDone] = useState('');
  const run = useRef(0);
  const keyRef = useRef(selectionKey);
  keyRef.current = selectionKey;

  // Say so when a change (the user's, or a reloaded list) discards a preview that was shown.
  const shown = useRef(false);
  shown.current = !!preview;
  const firstKey = useRef(true);
  useEffect(() => {
    run.current += 1;
    if (firstKey.current) { firstKey.current = false; return; }
    setStale(shown.current ? 'The selection or a learner’s record changed, so the preview was cleared. Prepare the passes again.' : '');
    setPreview(null);
  }, [selectionKey]);

  // A prepared pass that stops being active with its code and LRN must not stay printable.
  const liveCheck = useMemo(() => (preview
    ? livePreviewCheck(preview.items, passesById, preview.confirmed)
    : null), [preview, passesById]);
  useEffect(() => {
    if (!liveCheck) return;
    if (liveCheck.stale) {
      setPreview(null);
      setStale('A prepared pass changed or is no longer active, so the preview was cleared. Prepare the passes again.');
      return;
    }
    if (liveCheck.confirmed.size !== preview.confirmed.size) setPreview((p) => (p ? { ...p, confirmed: liveCheck.confirmed } : p));
  }, [liveCheck, preview]);

  // Print stays disabled either way; after a while, say so instead of waiting silently.
  const [confirmTimedOut, setConfirmTimedOut] = useState(false);
  const previewItems = preview?.items;
  const waiting = !!previewItems?.length && !liveCheck?.allLive;
  useEffect(() => {
    setConfirmTimedOut(false);
    if (!waiting) return;
    const timer = setTimeout(() => setConfirmTimedOut(true), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [previewItems, waiting]);

  const printReady = !!preview && preview.items.length > 0 && !!liveCheck?.allLive;

  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // beforeIssue: optional async check run inside the same busy state (so every control preparing
  // disables stays disabled); returning false stops quietly. The selection is re-checked after it and
  // before every server call, so a changed selection, a left tab or a closed page never issues passes.
  const prepare = (targets, { beforeIssue } = {}) => {
    const started = { ticket: ++run.current, key: selectionKey };
    setPreview(null);
    setStale('');
    setDone('');
    const current = () => stillCurrent(started, { mounted: mounted.current, ticket: run.current, key: keyRef.current });
    const abandoned = () => {
      if (mounted.current) setStale('The selection changed while the passes were being prepared, so nothing was prepared. Prepare the passes again.');
    };
    return action.run('prepare', ignoreWhenStale(async () => {
      if (beforeIssue && !(await beforeIssue())) return;
      if (!current()) { abandoned(); return; }
      const result = await preparePasses({ targets, principalName, principalTitle }, { isCurrent: current });
      if (result === PREPARE_ABORTED || !current()) { abandoned(); return; }
      setPreview({ ...result, confirmed: new Set(), printed: false });
      onPrepared?.();
    }, current));
  };

  // Mark as printed is offered for this preview only after Print (the button or the browser's own).
  const print = () => {
    if (!printReady) return;
    setPreview((p) => (p ? { ...p, printed: true } : p));
    window.print();
  };
  useEffect(() => {
    if (!printReady || typeof window === 'undefined') return undefined;
    const printed = () => setPreview((p) => (p ? { ...p, printed: true } : p));
    window.addEventListener('afterprint', printed);
    return () => window.removeEventListener('afterprint', printed);
  }, [printReady]);

  const markIds = markableRequestIds(preview, !!liveCheck?.allLive);
  const markPrinted = () => {
    const ids = markIds;
    if (!ids.length) return undefined;
    const ticket = run.current;
    return action.run('mark', async () => {
      const result = await markTempPassRequestsPrinted(ids);
      setDone(notifiedText(Number(result?.printed) || 0, ids.length));
      // The sheet is done: its requests are closed, so it is not offered again.
      if (ticket === run.current) setPreview(null);
      await onMarked?.();
    });
  };

  return {
    preview, prepare, print, printReady, waiting, confirmTimedOut, notice: stale || done, action,
    preparing: action.pending.includes('prepare'), marking: action.pending.includes('mark'),
    // Offered when the preview holds a request's card; enabled once it was printed and confirmed live.
    markCount: preview ? preview.items.filter((item) => item.requestId).length : 0, canMark: markIds.length > 0, markPrinted,
  };
}
