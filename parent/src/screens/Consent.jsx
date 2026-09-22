import { useState } from 'react';
import S from '../strings.js';
import { Btn, Card } from '../components/ui.jsx';
import { useDoc } from '../hooks/useDoc.js';

export default function Consent({ onAccepted }) {
  const portal = useDoc('settings/parent_portal').data;
  const [agreed, setAgreed] = useState(false);
  const version = portal?.consentVersion ?? 1;
  return (
    <Card>
      <h1 style={{ fontSize: 20 }}>{S.consentTitle}</h1>
      <p>{S.consentBody1}</p><p>{S.consentBody2}</p><p>{S.consentBody3}</p>
      {portal?.privacyNoticeUrl && <p><a href={portal.privacyNoticeUrl} target="_blank" rel="noreferrer">{S.consentLink}</a></p>}
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44, fontSize: 15 }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ width: 22, height: 22 }} />{S.consentCheckbox}
      </label>
      <Btn disabled={!agreed} onClick={() => onAccepted(version)} style={{ width: '100%', marginTop: 10 }}>{S.continue}</Btn>
    </Card>
  );
}
