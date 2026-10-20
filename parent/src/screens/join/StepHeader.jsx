import S from '../../strings.js';
import { T } from '../../styles.js';

// "Step 1 of 2 · Parent/Guardian" above each role step, then the step title.
export default function StepHeader({ label, title, children }) {
  return (
    <>
      <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: T.inkMuted }}>{label}</p>
      <h1 style={{ fontSize: 20, margin: '0 0 6px' }}>{title}</h1>
      {children && <p style={{ marginTop: 0 }}>{children}</p>}
    </>
  );
}
export const stepLabel = (index, total, roleLabel) => `${S.joinStepOf} ${index + 1} ${S.joinOf} ${total} · ${roleLabel}`;
