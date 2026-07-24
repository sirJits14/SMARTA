import { GRADES } from '../lib/constants.js';
import { T } from '../styles.js';

export default function GradeBarChart({ counts }) {
  const max = Math.max(1, ...GRADES.map((g) => counts[g] || 0));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 160, padding: '8px 4px' }}>
      {GRADES.map((g) => {
        const value = counts[g] || 0;
        const heightPct = (value / max) * 100;
        return (
          <div key={g} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ ...T.num, fontSize: 12, fontWeight: 700, color: T.ink }}>{value}</span>
            <div style={{ width: '100%', height: `${Math.max(heightPct, 4)}%`, background: T.primary, borderRadius: '6px 6px 0 0', minHeight: 4 }} />
            <span style={{ fontFamily: T.body, fontSize: 11, color: T.inkMuted, fontWeight: 600 }}>G{g}</span>
          </div>
        );
      })}
    </div>
  );
}
