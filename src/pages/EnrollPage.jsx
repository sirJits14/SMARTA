import { useMemo, useState } from 'react';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { useCollectionResource } from '../hooks/useCollection.js';
import { fullName, depedSort } from '../lib/roster.js';
import { sectionMatches } from '../lib/search.js';
import { enrollStudent, withdrawEnrollment } from '../data/enrollments.js';
import { ENROLL_TYPE } from '../lib/constants.js';
import { T } from '../styles.js';
import { ActionFeedback, ResourceState, EditorResources, Btn, Inp, Sel, Field, Card, Modal, Confirm, EmptyState } from '../components/ui.jsx';
import GradePills from '../components/GradePills.jsx';
import NavIcon from '../components/NavIcon.jsx';
import '../enrollment.css';

const sectionLabel = section => section
  ? `${section.name} · Grade ${section.gradeLevel}${section.strand ? ` · ${section.strand}` : ''}` : '—';

export default function EnrollPage({ schoolYear }) {
  const action = useAsyncAction();
  const studentsResource = useCollectionResource('students');
  const sectionsResource = useCollectionResource('sections');
  const enrollmentsResource = useCollectionResource('enrollments');
  const resources = [studentsResource, sectionsResource, enrollmentsResource];
  const ready = resources.every(resource => !resource.loading && !resource.error);
  const students = studentsResource.data;
  const sections = sectionsResource.data;
  const enrollments = enrollmentsResource.data;
  const sectionsSY = useMemo(() => sections.filter(section => section.schoolYear === schoolYear)
    .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' })), [sections, schoolYear]);
  const studentsSorted = useMemo(() => depedSort(students), [students]);
  const gradeOptions = useMemo(() => {
    const counts = new Map();
    sectionsSY.forEach(section => counts.set(Number(section.gradeLevel), (counts.get(Number(section.gradeLevel)) || 0) + 1));
    return [...counts].map(([value, count]) => ({ value, label: `Grade ${value}`, count }));
  }, [sectionsSY]);
  const rosters = useMemo(() => {
    const studentSections = new Map();
    enrollments.filter(enrollment => enrollment.schoolYear === schoolYear && enrollment.status === 'enrolled').forEach(enrollment => {
      if (!studentSections.has(enrollment.studentId)) studentSections.set(enrollment.studentId, new Set());
      studentSections.get(enrollment.studentId).add(enrollment.sectionId);
    });
    const lists = new Map(sectionsSY.map(section => [section.id, []]));
    studentsSorted.forEach(student => studentSections.get(student.id)?.forEach(sectionId => lists.get(sectionId)?.push(student)));
    return lists;
  }, [enrollments, studentsSorted, sectionsSY, schoolYear]);

  const [pickedGrade, setPickedGrade] = useState(null);
  const [query, setQuery] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const activeGrade = gradeOptions.some(option => option.value === pickedGrade) ? pickedGrade : gradeOptions[0]?.value;
  const visibleSections = sectionsSY.filter(section => Number(section.gradeLevel) === activeGrade && sectionMatches(query, section));
  const selectedSection = sectionsSY.find(section => section.id === selectedSectionId && Number(section.gradeLevel) === activeGrade);
  const classList = rosters.get(selectedSection?.id) || [];
  const chooseGrade = grade => { setPickedGrade(grade); setSelectedSectionId(''); setQuery(''); };
  const chooseSection = section => { setSelectedSectionId(section.id); setTargetSectionId(section.id); setTargetGrade(Number(section.gradeLevel)); };

  const [enrollmentOpen, setEnrollmentOpen] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [type, setType] = useState(ENROLL_TYPE[0]);
  const [targetGrade, setTargetGrade] = useState(null);
  const [targetSectionId, setTargetSectionId] = useState('');
  const [confirmMove, setConfirmMove] = useState(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(null);
  const [notice, setNotice] = useState('');
  const targetSection = sectionsSY.find(section => section.id === targetSectionId);
  const destinationGrade = targetSection ? Number(targetSection.gradeLevel)
    : gradeOptions.some(option => option.value === targetGrade) ? targetGrade : activeGrade;
  const selectedStudent = students.find(student => student.id === studentId);
  const enrollmentFor = id => enrollments.find(enrollment => enrollment.studentId === id && enrollment.schoolYear === schoolYear && enrollment.status === 'enrolled');

  const openEnrollment = () => {
    setTargetSectionId(selectedSection?.id || '');
    setTargetGrade(activeGrade ?? null);
    setEnrollmentOpen(true);
  };
  const saveEnrollment = async (student, section) => {
    if (!ready || !students.some(current => current.id === student.id) || !sectionsSY.some(current => current.id === section.id)) {
      throw new Error('The learner or section is unavailable.');
    }
    await enrollStudent({ student, section, schoolYear, type });
    setSelectedSectionId(section.id);
    setPickedGrade(Number(section.gradeLevel));
    setQuery('');
    setStudentId('');
    setType(ENROLL_TYPE[0]);
    setEnrollmentOpen(false);
    setNotice(`${fullName(student)} enrolled in ${section.name}.`);
  };
  const doEnroll = async event => {
    event.preventDefault();
    if (!ready || action.busy || !selectedStudent || !targetSection) return;
    const existing = enrollmentFor(studentId);
    if (existing) {
      setConfirmMove({ student: selectedStudent, section: targetSection, existingSection: sections.find(section => section.id === existing.sectionId) });
    } else {
      await action.run('enroll', () => saveEnrollment(selectedStudent, targetSection));
    }
  };

  return <div className="sims-enrollment">
    <div className="sims-heading">
      <div><h1>Enrollment</h1><p className="sims-enrollment-intro">Browse sections and manage class lists.</p></div>
      <Btn onClick={openEnrollment} disabled={!ready || !students.length || !sectionsSY.length}>
        <NavIcon name="enroll" size={18} /> Enroll a learner
      </Btn>
    </div>
    {notice && <p role="status" className="sims-enrollment-notice">{notice}</p>}
    <ResourceState resources={resources}>
      <div className="sims-enrollment-layout">
        <Card as="aside" className="sims-enrollment-browser" aria-label="Section browser">
          <div className="sims-enrollment-panel-heading"><h2>Sections</h2><span>{sectionsSY.length} total</span></div>
          {!sectionsSY.length ? <EmptyState title="No sections yet" hint={`Add a section for SY ${schoolYear} on the Sections page.`} /> : <>
            <div className="sims-enrollment-grades"><GradePills options={gradeOptions} value={activeGrade} onChange={chooseGrade} label="Section grade level" /></div>
            <Field label="Search sections"><Inp type="search" value={query} placeholder={`Search Grade ${activeGrade} sections`} onChange={event => setQuery(event.target.value)} /></Field>
            <div className="sims-enrollment-directory-heading"><span>Grade {activeGrade}</span><span>{visibleSections.length} sections</span></div>
            <div className="sims-enrollment-section-list" role="region" aria-label={`Grade ${activeGrade} sections`} tabIndex={0}>
              {visibleSections.length ? visibleSections.map(section => {
                const count = rosters.get(section.id)?.length || 0;
                return <button type="button" key={section.id} className="sims-enrollment-section" aria-pressed={section.id === selectedSection?.id} onClick={() => chooseSection(section)}>
                  <span className="sims-enrollment-section-text"><strong>{section.name}</strong>{section.strand && <small>{section.strand}</small>}</span>
                  <span className="sims-enrollment-section-count" aria-label={`${count} learners`}>{count}<span aria-hidden="true">›</span></span>
                </button>;
              }) : <p role="status" className="sims-enrollment-no-results">No sections match “{query}”. Try another name.</p>}
            </div>
          </>}
        </Card>
        <Card className="sims-enrollment-roster">
          <div className="sims-enrollment-panel-heading">
            <div><h2>{selectedSection?.name || 'Class list'}</h2>{selectedSection && <p>Grade {selectedSection.gradeLevel}{selectedSection.strand ? ` · ${selectedSection.strand}` : ''}</p>}</div>
            {selectedSection && <span className="sims-enrollment-roster-count">{classList.length} {classList.length === 1 ? 'learner' : 'learners'}</span>}
          </div>
          {!selectedSection ? <EmptyState title="Choose a section" hint="Select a grade and section to view its class list." /> : !classList.length ? <div className="sims-enrollment-roster-empty">
            <EmptyState title="No learners enrolled yet" hint={students.length ? 'Add the first learner to this section.' : 'Add learners on the Students page before enrolling them.'} />
            <Btn onClick={openEnrollment} disabled={!students.length}>Enroll a learner</Btn>
          </div> : <div className="sims-table-scroll" role="region" aria-label={`${selectedSection.name} class list`} tabIndex={0}>
            <table>
              <thead><tr><th scope="col">#</th><th scope="col">Learner</th><th scope="col"><span className="sims-enrollment-sr-only">Actions</span></th></tr></thead>
              <tbody>{classList.map((student, index) => <tr key={student.id}>
                <td className="sims-enrollment-row-number">{index + 1}</td>
                <td><strong>{fullName(student)}</strong>{student.lrn && <small>LRN {student.lrn}</small>}</td>
                <td className="sims-enrollment-row-action"><Btn variant="ghost" style={{ color: T.absent, borderColor: T.absent }} onClick={() => setConfirmWithdraw({ student, section: selectedSection })}>Withdraw</Btn></td>
              </tr>)}</tbody>
            </table>
          </div>}
        </Card>
      </div>
    </ResourceState>

    <EditorResources resources={resources}>
      {enrollmentOpen && <Modal title="Enroll a learner" width={480} overlayClassName="sims-enrollment-drawer" onClose={() => setEnrollmentOpen(false)} dismissible={!action.busy && !confirmMove}>
        <button type="button" className="sims-icon-button sims-enrollment-drawer-close" aria-label="Close enrollment form" disabled={action.busy || !!confirmMove} onClick={() => setEnrollmentOpen(false)}><NavIcon name="close" /></button>
        <p className="sims-enrollment-drawer-intro">SY {schoolYear}. Choose a learner and destination section.</p>
        <ActionFeedback action={action} />
        <form onSubmit={doEnroll}>
          <fieldset disabled={action.busy || !!confirmMove} className="sims-enrollment-fields">
            <Field label="Learner"><Sel value={selectedStudent?.id || ''} onChange={event => setStudentId(event.target.value)} required>
              <option value="">Choose a learner</option>
              {studentsSorted.map(student => {
                const enrollment = enrollmentFor(student.id);
                return <option key={student.id} value={student.id}>{fullName(student)}{enrollment ? ` — enrolled in ${sectionLabel(sections.find(section => section.id === enrollment.sectionId))}` : ''}</option>;
              })}
            </Sel></Field>
            <Field label="Enrollment type"><Sel value={type} onChange={event => setType(event.target.value)}>{ENROLL_TYPE.map(value => <option key={value} value={value}>{value}</option>)}</Sel></Field>
            <Field label="Destination grade"><Sel value={destinationGrade ?? ''} onChange={event => { setTargetGrade(Number(event.target.value)); setTargetSectionId(''); }}>
              {gradeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Sel></Field>
            <Field label="Destination section"><Sel value={targetSection?.id || ''} onChange={event => setTargetSectionId(event.target.value)} required>
              <option value="">Choose a section</option>
              {sectionsSY.filter(section => Number(section.gradeLevel) === destinationGrade).map(section => <option key={section.id} value={section.id}>{section.name}{section.strand ? ` · ${section.strand}` : ''}</option>)}
            </Sel></Field>
            {targetSection && <p className="sims-enrollment-destination"><strong>Destination</strong><span>{sectionLabel(targetSection)}</span></p>}
            <div className="sims-enrollment-drawer-actions"><Btn variant="ghost" type="button" onClick={() => setEnrollmentOpen(false)}>Cancel</Btn><Btn type="submit" disabled={!ready || !selectedStudent || !targetSection}>{action.busy ? 'Enrolling…' : 'Enroll learner'}</Btn></div>
          </fieldset>
        </form>
      </Modal>}
    </EditorResources>
    {confirmWithdraw && <Confirm
      message={`Withdraw ${fullName(confirmWithdraw.student)} from ${sectionLabel(confirmWithdraw.section)}?`}
      onYes={async () => {
        if (!ready || enrollmentFor(confirmWithdraw.student.id)?.sectionId !== confirmWithdraw.section.id) throw new Error('Enrollment changed.');
        await withdrawEnrollment(confirmWithdraw.student.id, schoolYear, 'dropped');
        setNotice(`${fullName(confirmWithdraw.student)} withdrawn from ${confirmWithdraw.section.name}.`);
        setConfirmWithdraw(null);
      }}
      onNo={() => setConfirmWithdraw(null)} label="Withdraw" danger={false} />}
    {confirmMove && <Confirm
      message={`${fullName(confirmMove.student)} is already enrolled in ${sectionLabel(confirmMove.existingSection)} for SY ${schoolYear}. Enrolling again will move them to ${sectionLabel(confirmMove.section)}.`}
      onYes={async () => { await saveEnrollment(confirmMove.student, confirmMove.section); setConfirmMove(null); }}
      onNo={() => setConfirmMove(null)} label="Move learner" danger={false} />}
  </div>;
}
