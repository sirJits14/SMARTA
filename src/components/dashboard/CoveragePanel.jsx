import { Card } from '../ui.jsx';
export default function CoveragePanel({ recordedCount, totalSections, percent }) {
  return <Card surface="summary" className="sims-coverage">
    <h2>Attendance record coverage</h2>
    <p>Sections with attendance records</p>
    {totalSections ? <>
      <div className="sims-coverage-number">{percent}<span>%</span></div>
      <progress aria-label="Sections with attendance records" max={totalSections} value={recordedCount}/>
      <strong>{recordedCount} of {totalSections} enrolled sections</strong>
    </> : <div className="sims-no-sections">No enrolled sections</div>}
    <p className="sims-coverage-note">Records may come from registrar entry or kiosk activity. This does not indicate completed review or learner presence.</p>
  </Card>;
}
