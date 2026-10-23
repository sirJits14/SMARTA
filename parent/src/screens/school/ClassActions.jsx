import S from '../../strings.js';
import { Btn } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';

// The Class tab's secondary actions, under the summary card. A button appears only when its handler is
// given. `sf2Hint` disables the SF2 button and says why. The requests link shows how many learner requests
// are waiting for approval, or "Past requests" once every request has been decided.
export default function ClassActions({ onAddLearner, onSf2, sf2Hint = '', requestTotal = 0, requestWaiting = 0, onOpenRequests }) {
  if (!onAddLearner && !onSf2 && !requestTotal) return null;
  const waitingText = `${requestWaiting} ${requestWaiting === 1 ? S.requestsWaitingOne : S.requestsWaitingMany}`;
  return (
    <div className="class-actions" role="group" aria-label={S.classActions}>
      {onAddLearner && <Btn variant="ghost" onClick={onAddLearner}><Icon name="plusSquare" size={18} />{S.addLearnerButton}</Btn>}
      {onSf2 && <Btn variant="ghost" disabled={Boolean(sf2Hint)} onClick={onSf2}><Icon name="download" size={18} />{S.sf2Button}</Btn>}
      {sf2Hint && <span className="class-note">{sf2Hint}</span>}
      {requestTotal > 0 && <button type="button" className="class-link" onClick={onOpenRequests}>{requestWaiting > 0 ? waitingText : S.requestsPast}</button>}
    </div>
  );
}
