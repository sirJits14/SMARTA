import { GRADES } from '../lib/constants.js';
export default function GradeBarChart({ counts }) {
  const max = Math.max(1,...GRADES.map(g=>counts[g]||0));
  return <div className="sims-grade-chart" role="list" aria-label="Enrollment by grade">
    {GRADES.map(g=><div className="sims-grade-column" role="listitem" key={g} aria-label={`Grade ${g}: ${counts[g]||0} enrolled learners`}>
      <strong>{(counts[g]||0).toLocaleString()}</strong>
      <div className="sims-grade-track"><div className="sims-grade-bar" style={{height:Math.round((counts[g]||0)/max*160)}} aria-hidden="true"/></div>
      <span>Grade {g}</span>
    </div>)}
  </div>;
}
