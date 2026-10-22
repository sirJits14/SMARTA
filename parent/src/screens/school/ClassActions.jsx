import S from '../../strings.js';
import { Btn } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';

// The Class tab's secondary actions, under the summary card. A button appears only when its handler is
// given; `sf2Hint` disables the SF2 button and says why.
export default function ClassActions({ onSf2, sf2Hint = '' }) {
  if (!onSf2) return null;
  return (
    <div className="class-actions" role="group" aria-label={S.classActions}>
      <Btn variant="ghost" disabled={Boolean(sf2Hint)} onClick={onSf2}><Icon name="download" size={18} />{S.sf2Button}</Btn>
      {sf2Hint && <span className="class-note">{sf2Hint}</span>}
    </div>
  );
}
