import S from '../../strings.js';
import { T } from '../../styles.js';
import { Banner, Btn, Card, Field, Inp } from '../../components/ui.jsx';
import { toggleRole, joinSteps } from '../../lib/join.js';

export const ROLE_TEXT = {
  family: [S.joinFamily, S.joinFamilyHint],
  adviser: [S.joinAdviser, S.joinAdviserHint],
  subject_teacher: [S.joinSubject, S.joinSubjectHint],
};
const tag = { fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 999, border: `1px solid ${T.border}`, color: T.inkMuted };

function RoleCard({ option, onToggle }) {
  const checked = option.state === 'selected' || option.state === 'held';
  const locked = option.state === 'held' || option.state === 'blocked';
  const [title, hint] = ROLE_TEXT[option.key];
  // Only the box and title fade on a blocked card; the explanation keeps full contrast.
  const dim = option.state === 'blocked' ? 0.62 : 1;
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-disabled={locked} onClick={locked ? undefined : onToggle}
      style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12, alignItems: 'start', width: '100%', minHeight: 64, textAlign: 'left',
        padding: '12px 14px', borderRadius: T.radius, font: 'inherit', color: T.ink, cursor: locked ? 'default' : 'pointer',
        background: checked ? 'rgba(var(--t-primary-rgb),0.10)' : T.surface,
        border: `1.5px solid ${checked ? T.primary : T.border}` }}>
      <span aria-hidden="true" style={{ width: 24, height: 24, marginTop: 2, borderRadius: 7, display: 'grid', placeItems: 'center', fontWeight: 800,
        border: `2px solid ${checked ? T.primary : T.border}`, background: checked ? T.primary : 'transparent', color: T.onPrimary, opacity: dim }}>{checked ? '✓' : ''}</span>
      <span>
        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 16, opacity: dim }}>{title}</strong>
          {option.active && <span style={tag}>{S.joinActive}</span>}
          {!option.active && option.needsApproval && <span style={tag}>{S.joinNeedsApproval}</span>}
        </span>
        <span style={{ display: 'block', fontSize: 14, color: T.inkMuted, marginTop: 2 }}>{option.state === 'blocked' ? S.joinChooseOne : hint}</span>
      </span>
    </button>
  );
}

export default function RoleChooser({ name, setName, options, selected, setSelected, onContinue, onSkip, error }) {
  const steps = joinSteps(options);
  const anyApproval = options.some((o) => o.state === 'selected' && o.needsApproval);
  const ready = name.trim().length >= 2 && steps.length > 0;
  return (
    <Card>
      <h1 style={{ fontSize: 20, marginTop: 0 }}>{S.joinTitle}</h1>
      <p>{S.joinIntro}</p>
      {error && <Banner tone="danger">{error}</Banner>}
      <Field label={S.joinNameLabel} hint={S.joinNameHint}>
        <Inp autoComplete="name" autoCapitalize="words" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div role="group" aria-label={S.joinRolesLabel} style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        {options.map((o) => <RoleCard key={o.key} option={o} onToggle={() => setSelected(toggleRole(selected, o.key, options))} />)}
      </div>
      {anyApproval && <p style={{ fontSize: 13, color: T.inkMuted }}>{S.joinNeedsApprovalNote}</p>}
      <Btn onClick={onContinue} disabled={!ready} style={{ width: '100%' }}>
        {ready ? `${S.joinContinue} · ${steps.length} ${steps.length === 1 ? S.joinStep : S.joinSteps}` : S.joinContinue}
      </Btn>
      {onSkip && <Btn variant="ghost" onClick={onSkip} style={{ width: '100%', marginTop: 10 }}>{S.activateSkip}</Btn>}
    </Card>
  );
}
