import S from '../../strings.js';
import { T } from '../../styles.js';
import { Btn, Card } from '../../components/ui.jsx';
import { nameCase } from '../../lib/format.js';
import { ROLE_TEXT } from './RoleChooser.jsx';

const line = (role, result) => {
  const title = ROLE_TEXT[role][0];
  if (!result) return `${title} · ${S.summarySkipped}`;
  if (result.outcome === 'pending') return `${title} · ${S.summaryPending}`;
  if (role === 'family') return `${S.summaryLinked} ${nameCase(result.detail)}`;
  if (role === 'adviser') return `${S.summaryAdviser} ${result.detail}`;
  return `${S.summarySubject} ${result.detail}`;
};

export default function JoinSummary({ steps, results, onRetry, onOpen }) {
  return (
    <Card>
      <h1 style={{ fontSize: 20, marginTop: 0 }}>{S.summaryTitle}</h1>
      <ul style={{ listStyle: 'none', margin: '0 0 16px', padding: 0 }}>
        {steps.map((role) => {
          const result = results[role];
          const done = result?.outcome === 'active';
          return (
            <li key={role} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderTop: `1px solid ${T.border}` }}>
              <span><span aria-hidden="true" style={{ marginRight: 8, color: done ? T.ok : T.inkMuted }}>{done ? '✓' : '•'}</span>{line(role, result)}</span>
              {!result && <Btn variant="ghost" onClick={() => onRetry(role)} aria-label={`${S.summaryRetry}: ${ROLE_TEXT[role][0]}`}>{S.summaryRetry}</Btn>}
            </li>
          );
        })}
      </ul>
      <Btn onClick={onOpen} style={{ width: '100%' }}>{S.summaryContinue}</Btn>
    </Card>
  );
}
