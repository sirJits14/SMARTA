import { useState } from 'react';
import { Btn, Card, Modal } from '../ui.jsx';
import NavIcon from '../NavIcon.jsx';
export default function AttentionPanel({ unassigned, pendingSections, date, totalSections, onUnassigned, onSection, showUnassigned = true }) {
  const [open,setOpen] = useState(false);
  const day = new Date(date + 'T12:00:00').getDay();
  const pendingLabel = day === 0 || day === 6 ? 'No records for this date' : 'No attendance record today';
  const sectionButton = section => <button className="sims-attention-row" key={section.id} onClick={() => onSection(section)}>
    <span><strong>{section.name}</strong><small>Grade {section.gradeLevel}{section.strand ? ` · ${section.strand}` : ''}</small></span>
    <span className="sims-row-action">Open attendance <NavIcon name="arrow" size={16}/></span>
  </button>;
  return <>
    <div className="sims-section-label"><h2>Needs attention</h2><span>Start with what needs your input</span></div>
    <div className="sims-dashboard-pair">
      {showUnassigned && (<Card surface="summary" className="sims-attention-card">
        <div className="sims-card-label"><NavIcon name="students"/><span>Learner assignment</span></div>
        <div className="sims-attention-value">{unassigned.toLocaleString()}</div>
        <h3>{unassigned ? 'Learners without a section' : 'All active learners are assigned'}</h3>
        <p>{unassigned ? 'Review active learners who are not enrolled in a section this school year.' : 'There are no unassigned active learners to review.'}</p>
        <Btn variant={unassigned ? 'solid' : 'ghost'} onClick={onUnassigned}>Review learners <NavIcon name="arrow" size={16}/></Btn>
      </Card>)}
      <Card surface="summary" className="sims-attendance-attention">
        <div className="sims-card-label"><NavIcon name="attendance"/><span>{pendingLabel}</span><strong className="sims-count-badge">{pendingSections.length}</strong></div>
        {pendingSections.length ? <div className="sims-attention-list">{pendingSections.slice(0,5).map(sectionButton)}</div> :
          <p className="sims-caught-up">{totalSections ? 'Every enrolled section has an attendance record today.' : 'No enrolled sections. Enroll learners to begin recording attendance.'}</p>}
        {pendingSections.length > 5 && <Btn variant="ghost" onClick={() => setOpen(true)}>View all {pendingSections.length} sections</Btn>}
      </Card>
    </div>
    {open && <Modal title="Sections without attendance records" onClose={() => setOpen(false)} width={640}>
      <p style={{color:'#55706F'}}>Records for {date}</p>
      {pendingSections.length ? pendingSections.map(sectionButton) : <p>Every enrolled section now has a record.</p>}
      <Btn variant="ghost" onClick={() => setOpen(false)} style={{ marginTop:16 }}>Close</Btn>
    </Modal>}
  </>;
}
