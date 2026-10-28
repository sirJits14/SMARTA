import { useState } from 'react';
import S from '../../strings.js';
import { Banner, Btn, Sel } from '../../components/ui.jsx';
import Sheet from '../../components/Sheet.jsx';

// The sheet's content, kept apart from the portal so it can be rendered on its own in tests.
// Once `file` is prepared the main button becomes Save, so a phone that refused the share can be given a fresh tap.
export function Sf2Form({ months, busy, error, file = null, onDownload, onSave, onMonthChange, onClose }) {
  const [month, setMonth] = useState(months[0]?.value || '');
  const choose = (value) => { setMonth(value); onMonthChange?.(); };
  return (
    <>
      {error && <Banner tone="danger">{error}</Banner>}
      {months.length === 0 ? <p className="class-note">{S.sf2NoMonths}</p> : (
        <label className="p-field">
          <span className="p-field-label">{S.sf2Month}</span>
          <Sel value={month} disabled={busy} onChange={(e) => choose(e.target.value)}>
            {months.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Sel>
        </label>
      )}
      {file && <p className="class-note">{S.sf2Ready}</p>}
      <Btn disabled={busy || !month} onClick={() => (file ? onSave?.() : onDownload(month))} style={{ width: '100%' }}>{busy ? S.sf2Preparing : file ? S.sf2Save : S.sf2Download}</Btn>
      <Btn variant="ghost" disabled={busy} onClick={onClose} style={{ width: '100%', marginTop: 10 }}>{S.sf2Close}</Btn>
    </>
  );
}

// Pick a month, then download this class's SF2 (the same Excel file SIMS exports).
export default function Sf2Sheet({ sectionLabel, months, busy, error, file, onDownload, onSave, onMonthChange, onClose }) {
  return (
    <Sheet title={S.sf2Title} hint={`${sectionLabel} · ${S.sf2Hint}`} busy={busy} onClose={onClose}>
      <Sf2Form months={months} busy={busy} error={error} file={file} onDownload={onDownload} onSave={onSave} onMonthChange={onMonthChange} onClose={onClose} />
    </Sheet>
  );
}
