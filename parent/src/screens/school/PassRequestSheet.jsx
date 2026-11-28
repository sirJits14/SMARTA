import { useEffect, useRef, useState } from 'react';
import S from '../../strings.js';
import { callable } from '../../firebase.js';
import { schoolError } from '../../lib/school.js';
import { usePassRequests } from '../../hooks/usePassRequests.js';
import {
  REPLACE_LABEL, STATUS_LABEL, blockerText, createOneAtATime, passItems, prunePicks, sendOutcome, unchosenCount,
} from '../../lib/passRequests.js';
import { MAX_PENDING_PASS_REQUESTS, PASS_NOTE_MAX, REPLACE_REASONS } from '../../../../shared/tempPassRequests.js';
import { Banner, Btn, Spinner } from '../../components/ui.jsx';
import Sheet from '../../components/Sheet.jsx';

// The class list with its choices, kept apart from the portal so it can be rendered on its own in tests.
// `loading` holds the send while the list is being refreshed.
export function PassRequestList({ learners, picks, note, busy, loading, error, onToggle, onChoose, onNote, onSend, onClose }) {
  const count = passItems(learners, picks).length;
  const unchosen = unchosenCount(learners, picks);
  const full = learners.filter((l) => !l.blocker && Object.hasOwn(picks, l.studentId)).length >= MAX_PENDING_PASS_REQUESTS;
  return (
    <>
      {learners.length === 0 ? <p className="class-note">{S.sf2NoLearners}</p> : (
        <ul className="pass-list" aria-label={S.passRequestChoose}>
          {learners.map(({ studentId, displayName, hasPhoto, hasActivePass, blocker }) => {
            const picked = !blocker && Object.hasOwn(picks, studentId);
            const locked = busy || Boolean(blocker) || (full && !picked);
            return (
              <li key={studentId} className="pass-row">
                <label className="pass-pick">
                  <input type="checkbox" checked={picked} disabled={locked} onChange={() => onToggle(studentId)} />
                  <span className="photo-row-body">
                    <span className="photo-row-name">{displayName}</span>
                    {blocker && <span className="photo-row-status">{blockerText(blocker)}</span>}
                  </span>
                  {!hasPhoto && <span className="class-chip class-chip--withdrawn">{S.passRequestNoPhoto}</span>}
                </label>
                {hasActivePass && !blocker && (
                  <fieldset className="pass-replace" disabled={locked}>
                    <legend><span className="sr-only">{displayName}: </span>{S.passRequestReplaceHint}</legend>
                    {REPLACE_REASONS.map((reason) => (
                      <label key={reason}>
                        <input type="radio" name={`pass-reason-${studentId}`} value={reason} disabled={locked}
                          checked={picked && picks[studentId] === reason} onChange={() => onChoose(studentId, reason)} />
                        <span>{REPLACE_LABEL[reason]}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <label className="p-field">
        <span className="p-field-label">{S.passRequestNote}</span>
        <textarea className="p-input" rows={3} maxLength={PASS_NOTE_MAX} value={note} disabled={busy} onChange={(e) => onNote(e.target.value)} />
        <span className="p-field-hint pass-count">{`${note.length}/${PASS_NOTE_MAX}`}</span>
      </label>
      <div className="pass-foot">
        {/* In the foot, so what holds the send back (or why it failed) is seen beside the button. */}
        {error && <Banner tone="danger">{error}</Banner>}
        {unchosen > 0 && <Banner tone="warn">{(unchosen === 1 ? S.passRequestChooseOne : S.passRequestChooseMany).replace('{n}', unchosen)}</Banner>}
        {full && <Banner>{S.passRequestLimit.replace('{n}', MAX_PENDING_PASS_REQUESTS)}</Banner>}
        <Btn variant="ghost" disabled={busy} onClick={onClose}>{S.requestsClose}</Btn>
        <Btn disabled={busy || loading || unchosen > 0 || count === 0} onClick={onSend}>{busy ? S.learnerSending : `${S.passRequestSend} (${count})`}</Btn>
      </div>
    </>
  );
}

// What came of the last send or withdrawal. `error` is given only when no button foot is on screen to show it.
export function PassRequestAnswer({ answer, error }) {
  return (
    <>
      {error && <Banner tone="danger">{error}</Banner>}
      {answer?.message && <Banner>{answer.message}</Banner>}
      {answer?.skipped.length > 0 && (
        <div role="alert" className="p-banner p-banner--warn pass-skipped">
          <span>{S.passRequestSkipped}</span>
          <ul>{answer.skipped.map((s) => <li key={s.studentId}>{s.name}: {s.text}</li>)}</ul>
        </div>
      )}
    </>
  );
}

// The adviser's requests for this class, newest first. A prepared pass is already being printed, so
// the server no longer lets it be withdrawn.
export function PassRequestHistory({ requests, busy, onWithdraw }) {
  if (requests.length === 0) return <p className="class-note">{S.passRequestEmpty}</p>;
  return (
    <ul className="request-list" aria-label={S.passRequestHistory}>
      {requests.map((request) => {
        const detail = [REPLACE_LABEL[request.reason], request.note].filter(Boolean).join(' · ');
        return (
          <li key={request.id} className="request-row">
            <div className="request-row-top">
              <span className="request-row-title">{request.displayName}</span>
              <span className={`class-chip class-chip--${request.status}`}>{STATUS_LABEL[request.status]}</span>
            </div>
            {detail && <div className="request-row-detail">{detail}</div>}
            {request.status === 'declined' && request.declineReason && <div className="request-row-reason">{S.requestReasonLabel}: {request.declineReason}</div>}
            {request.status === 'pending' && (request.prepared
              ? <div className="request-row-reason">{S.passRequestPreparing}</div>
              : <button type="button" className="class-link" disabled={busy} aria-label={`${S.passRequestWithdraw}: ${request.displayName}`} onClick={() => onWithdraw(request.id)}>{S.passRequestWithdraw}</button>)}
          </li>
        );
      })}
    </ul>
  );
}

// An adviser's temporary pass requests for one class: choose learners and send, or follow what was sent.
// The caller keys it by class, so choices never carry over to another one.
export default function PassRequestSheet({ sectionId, classLabel, onClose }) {
  const { learners, requests, loading, error: loadError, refresh } = usePassRequests(sectionId);
  const [view, setView] = useState('choose'); // 'choose' | 'sent'
  const [picks, setPicks] = useState({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); // why the last send or withdrawal failed
  const [answer, setAnswer] = useState(null); // { message, skipped }
  const [once] = useState(createOneAtATime);
  const answerBox = useRef(null);
  const choosing = view === 'choose';
  // A failed send shows beside the Send button. Without that foot (Sent requests, or no list) it joins the answer.
  const answerError = choosing && learners ? '' : error;
  useEffect(() => { if (learners) setPicks((current) => prunePicks(current, learners)); }, [learners]);
  // Send is at the foot of a long list and Withdraw far down a long history, so the answer at the top is brought into view.
  useEffect(() => { if (answer || answerError) answerBox.current?.scrollIntoView?.({ block: 'nearest' }); }, [answer, answerError]);

  const run = async (work) => {
    const outcome = await once(() => { setBusy(true); setError(''); setAnswer(null); return work(); }, refresh);
    if (!outcome) return;
    setBusy(false);
    if (outcome.error) setError(schoolError(outcome.error));
    else setAnswer(outcome.value);
  };
  const send = () => {
    const items = passItems(learners, picks);
    if (!items.length || unchosenCount(learners, picks)) return;
    run(async () => {
      const { data } = await callable('requestTempPassesFn')({ sectionId, items, note: note.trim() });
      setPicks({}); setNote('');
      const { sent, skipped } = sendOutcome(data, learners);
      return { message: sent ? S.passRequestSent : '', skipped };
    });
  };
  const withdraw = (requestId) => run(async () => {
    await callable('withdrawTempPassRequestFn')({ requestId });
    return { message: S.learnerRequestWithdrawn, skipped: [] };
  });

  const toggle = (studentId) => setPicks((current) => {
    const { [studentId]: choice, ...rest } = current;
    return choice === undefined ? { ...current, [studentId]: '' } : rest;
  });
  const choose = (studentId, reason) => setPicks((current) => ({ ...current, [studentId]: reason }));
  const show = (next) => { setView(next); setError(''); setAnswer(null); };

  return (
    <Sheet title={S.passRequestTitle} hint={choosing ? `${classLabel} · ${S.passRequestHint}` : classLabel} busy={busy} onClose={onClose}>
      <div className="class-session-switch pass-switch" role="group" aria-label={S.passRequestTitle}>
        <button type="button" aria-pressed={choosing} disabled={busy} onClick={() => show('choose')}>{S.passRequestChoose}</button>
        <button type="button" aria-pressed={!choosing} disabled={busy} onClick={() => show('sent')}>{S.passRequestHistory}</button>
      </div>
      <div ref={answerBox} className="pass-answer">
        <PassRequestAnswer answer={answer} error={answerError} />
      </div>
      {loadError && <Banner tone="danger" action={<Btn variant="ghost" onClick={refresh}>{S.passRequestRetry}</Btn>}>{loadError}</Banner>}
      {!learners && loading && <Spinner label={S.loading} />}
      {choosing && learners && (
        <PassRequestList learners={learners} picks={picks} note={note} busy={busy} loading={loading} error={error}
          onToggle={toggle} onChoose={choose} onNote={setNote} onSend={send} onClose={onClose} />
      )}
      {!choosing && requests && <PassRequestHistory requests={requests} busy={busy} onWithdraw={withdraw} />}
      {!(choosing && learners) && <Btn variant="ghost" disabled={busy} onClick={onClose} style={{ width: '100%', marginTop: 10 }}>{S.requestsClose}</Btn>}
    </Sheet>
  );
}
