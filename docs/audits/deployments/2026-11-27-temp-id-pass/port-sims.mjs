// Copies the LIVE SIMS release tree (PR #106, idcard-dash05) and ports PR #107's SIMS changes onto it.
// Run from the PR worktree root: node .superpowers/releases/temp-pass/sims/port-sims.mjs
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const base = resolve(root, '../saved-by-batch-printing-borders-42d5d0/.superpowers/releases/idcard-dash05/sims/tree');
const out = join(here, 'tree');
if (existsSync(out)) throw new Error('tree/ already exists; remove its node_modules junction with .Delete() before deleting it.');
const FROM = '49b9f64';
const TO = '59b10b6';
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
const lf = (s) => s.replace(/\r\n/g, '\n');

const skip = new Set(['node_modules', 'dist-baseline', 'dist-new', 'dist']);
cpSync(join(base, 'sims'), join(out, 'sims'), { recursive: true,
  filter: (p) => !relative(join(base, 'sims'), p).split(sep).some((part) => skip.has(part)) });
cpSync(join(base, '.firebaserc'), join(out, '.firebaserc'));
const app = join(out, 'sims');
const read = (p) => lf(readFileSync(join(app, p), 'utf8'));
const write = (p, s) => { mkdirSync(dirname(join(app, p)), { recursive: true }); writeFileSync(join(app, p), s); };
function swap(path, anchor, replacement) {
  const parts = read(path).split(anchor);
  if (parts.length !== 2) throw new Error(`${path}: anchor found ${parts.length - 1} times: ${anchor.slice(0, 70)}`);
  write(path, parts[0] + replacement + parts[1]);
}

const changed = git('diff', '--name-only', FROM, TO, '--', 'src', 'shared').trim().split('\n');
const report = { copied: [], handPorted: [], leftOut: [] };
for (const path of changed) {
  // staffQueries belongs to the held coordinator rollout; the live tree reads whole collections.
  if (path.startsWith('src/lib/staffQueries')) { report.leftOut.push(path); continue; }
  let existed = true;
  try { git('cat-file', '-e', `${FROM}:${path}`); } catch { existed = false; }
  const inTree = existsSync(join(app, path));
  if (!existed && inTree) throw new Error(`${path} is new in the feature but already in the live tree`);
  if (!existed || read(path) === lf(git('show', `${FROM}:${path}`))) {
    write(path, lf(git('show', `${TO}:${path}`)));
    report.copied.push(path);
  } else report.handPorted.push(path);
}
const expected = ['shared/theme/literals.test.js', 'src/lib/access.js', 'src/lib/access.test.js',
  'src/lib/idCardQueue.js', 'src/pages/IDCardsPage.jsx', 'src/pages/StudentsPage.jsx'];
if (JSON.stringify(report.handPorted.sort()) !== JSON.stringify(expected.sort())) {
  throw new Error(`Unexpected files differ from the base: ${report.handPorted.join(', ')}`);
}

// access.js
swap('src/lib/access.js', `export { sectionEditSchoolYears } from '../../shared/sectionEditing.js';\n`,
  `import { canManagePasses } from '../../shared/tempPass.js';\nexport { sectionEditSchoolYears } from '../../shared/sectionEditing.js';\n`);
swap('src/lib/access.js', 'export function allowedPages(me) {\n',
  `// Learner photos follow the temporary pass staff: administrators and academic coordinators.
export const canManagePhotos = (me) => canManagePasses(me);
// Academic coordinators also open ID Cards, where they see only Temporary passes.
const PASS_COORDINATOR_PAGES = ['dashboard', 'students', 'learnerRequests', 'sections', 'schedules', 'attendance', 'idcards', 'announcements'];
export function allowedPages(me) {\n`);
swap('src/lib/access.js', `  return isAdmin(me) ? NAV_ITEMS.map((item) => item.key) : COORDINATOR_PAGES;\n`,
  `  if (isAdmin(me)) return NAV_ITEMS.map((item) => item.key);\n  return canManagePasses(me) ? PASS_COORDINATOR_PAGES : COORDINATOR_PAGES;\n`);

// idCardQueue.js: the printed-card rule now lives in shared/tempPass.js.
swap('src/lib/idCardQueue.js', `export function isIdCardPrinted(student) {
  return !!student?.idCard?.printedAt && student.idCard.lrn === student.lrn;
}\n`, `export const isIdCardPrinted = isOfficialCardPrinted;\n`);
swap('src/lib/idCardQueue.js', `import { byLastThenFirstName } from './roster.js';\n`,
  `import { byLastThenFirstName } from './roster.js';\nimport { isOfficialCardPrinted } from '../../shared/tempPass.js';\n`);

// StudentsPage.jsx
swap('src/pages/StudentsPage.jsx', `import ImportStudentsWizard from './ImportStudentsWizard.jsx';\n`,
  `import ImportStudentsWizard from './ImportStudentsWizard.jsx';\nimport StudentPhotoDialog from '../components/StudentPhotoDialog.jsx';\n`);
swap('src/pages/StudentsPage.jsx', `import { isAdmin, grades, gradeOptions, singleGrade, scopeRoster } from '../lib/access.js';\n`,
  `import { isAdmin, canManagePhotos, grades, gradeOptions, singleGrade, scopeRoster } from '../lib/access.js';\n`);
swap('src/pages/StudentsPage.jsx', `  const admin = isAdmin(me);\n`, `  const admin = isAdmin(me);\n  const photos = canManagePhotos(me);\n`);
swap('src/pages/StudentsPage.jsx', `  const [importOpen, setImportOpen] = useState(false);\n`,
  `  const [importOpen, setImportOpen] = useState(false);\n  const [photoFor, setPhotoFor] = useState(null);\n`);
swap('src/pages/StudentsPage.jsx', `                      {admin && <span className="sims-row-actions">
                        <Btn variant="ghost" onClick={() => setForm(s)}>Edit</Btn>
                        <RowMenu label={\`More actions for \${fullName(s)}\`} items={[{ label: 'Delete', danger: true, onSelect: () => setConfirm(s) }]} />
                      </span>}\n`, `                      {(admin || photos) && <span className="sims-row-actions">
                        {photos && <Btn variant="ghost" onClick={() => setPhotoFor(s)}>Photo</Btn>}
                        {admin && <>
                          <Btn variant="ghost" onClick={() => setForm(s)}>Edit</Btn>
                          <RowMenu label={\`More actions for \${fullName(s)}\`} items={[{ label: 'Delete', danger: true, onSelect: () => setConfirm(s) }]} />
                        </>}
                      </span>}\n`);
swap('src/pages/StudentsPage.jsx', `      {importOpen && <ImportStudentsWizard`,
  `      {photoFor && <StudentPhotoDialog key={photoFor.id} student={photoFor} onClose={() => setPhotoFor(null)} />}\n      {importOpen && <ImportStudentsWizard`);

// IDCardsPage.jsx: keep the live "Recently approved" tab; add Temporary passes.
const page = 'src/pages/IDCardsPage.jsx';
swap(page, `import { useState } from 'react';
import { useCollectionResource, useSchoolYearEnrollments } from '../hooks/useCollection.js';
import { ResourceState } from '../components/ui.jsx';\n`, `import { useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useCollectionResource, useSchoolYearEnrollments, useSharedQueryResource } from '../hooks/useCollection.js';
import { ResourceState } from '../components/ui.jsx';
import { isAdmin } from '../lib/access.js';
import { passGrades } from '../../shared/tempPass.js';
import TempPassesTab from './idCards/TempPassesTab.jsx';\n`);
const current = read(page);
const start = current.indexOf(`// 'queue' is kept as the key`);
const returnAt = current.indexOf('  return (\n    <div>', start);
if (start < 0 || returnAt < 0) throw new Error('IDCardsPage layout changed');
const head = `// 'queue' is kept as the key so a remembered tab still opens the batch.
const ADMIN_TABS = [['section', 'By section'], ['queue', 'Saved batch'], ['approved', 'Recently approved'], ['temp', 'Temporary passes']];
// Academic coordinators handle temporary passes only.
const COORDINATOR_TABS = [['temp', 'Temporary passes']];
const STORAGE = 'sims.idCards.tab';
const readTab = (tabs) => {
  try { const v = localStorage.getItem(STORAGE); return tabs.some(([k]) => k === v) ? v : tabs[0][0]; }
  catch { return tabs[0][0]; }
};

// Official cards: administrators only.
function OfficialCardsPanel({ tab, me, schoolYear, approvedResource }) {
  const sectionsResource = useCollectionResource('sections');
  const enrollmentsResource = useSchoolYearEnrollments(schoolYear);
  const studentsResource = useCollectionResource('students');
  const batchResource = useCollectionResource('id_card_batch');
  const resources = [sectionsResource, enrollmentsResource, studentsResource];
  if (resources.some(r => r.loading || r.error)) return <ResourceState resources={resources}/>;
  const data = { me, schoolYear, sections: sectionsResource.data, enrollments: enrollmentsResource.data, students: studentsResource.data };
  return tab === 'section' ? <BySectionTab {...data} />
    : tab === 'queue' ? <ResourceState resources={[batchResource]}><SavedBatchTab {...data} batchDocs={batchResource.data} /></ResourceState>
    : <ResourceState resources={[approvedResource]}><RecentlyApprovedTab {...data} approvedDocs={approvedResource.data} /></ResourceState>;
}

// Passes are the one new collection a coordinator reads, and the rules require the grade filter.
function TempPassesPanel({ me, schoolYear }) {
  const grades = passGrades(me);
  const sections = useCollectionResource('sections');
  const enrollments = useSchoolYearEnrollments(schoolYear);
  const students = useCollectionResource('students');
  const passes = useSharedQueryResource(\`temp_passes|\${grades === null ? 'all' : grades.join(',')}\`, () => {
    if (grades === null) return query(collection(db, 'temp_passes'));
    return grades.length ? query(collection(db, 'temp_passes'), where('gradeLevel', 'in', grades)) : null;
  });
  const resources = [sections, enrollments, students, passes];
  if (resources.some(r => r.loading || r.error)) return <ResourceState resources={resources}/>;
  return <TempPassesTab me={me} schoolYear={schoolYear} sections={sections.data} enrollments={enrollments.data} students={students.data} passes={passes.data} />;
}

export default function IDCardsPage({ me, schoolYear }) {
  const admin = isAdmin(me);
  const tabs = admin ? ADMIN_TABS : COORDINATOR_TABS;
  // The count on the tab label. Only administrators may read this collection.
  const approvedResource = useSharedQueryResource(admin ? 'id_card_approved|all' : 'id_card_approved|none',
    () => (admin ? query(collection(db, 'id_card_approved')) : null));
  const [chosen, setTabState] = useState(() => readTab(tabs));
  const tab = tabs.some(([k]) => k === chosen) ? chosen : tabs[0][0];
  const setTab = (next) => {
    setTabState(next);
    try { localStorage.setItem(STORAGE, next); } catch { /* the tab still switches without storage */ }
  };

`;
write(page, current.slice(0, start) + head + current.slice(returnAt));
swap(page, `        {TABS.map(([k, label]) => {`, `        {tabs.map(([k, label]) => {`);
swap(page, `              const index = TABS.findIndex(([key]) => key === k);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 :
                event.key === 'ArrowRight' ? (index + 1) % TABS.length :
                event.key === 'ArrowLeft' ? (index - 1 + TABS.length) % TABS.length : null;
              if (next === null) return;
              event.preventDefault(); setTab(TABS[next][0]);
              document.getElementById(\`id-cards-tab-\${TABS[next][0]}\`)?.focus();\n`,
  `              const index = tabs.findIndex(([key]) => key === k);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
                event.key === 'ArrowRight' ? (index + 1) % tabs.length :
                event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : null;
              if (next === null) return;
              event.preventDefault(); setTab(tabs[next][0]);
              document.getElementById(\`id-cards-tab-\${tabs[next][0]}\`)?.focus();\n`);
swap(page, `        {tab === 'section' ? <BySectionTab {...data} />
          : tab === 'queue' ? <ResourceState resources={[batchResource]}><SavedBatchTab {...data} batchDocs={batchResource.data} /></ResourceState>
          : <ResourceState resources={[approvedResource]}><RecentlyApprovedTab {...data} approvedDocs={approvedResource.data} /></ResourceState>}\n`,
  `        {tab === 'temp' ? <TempPassesPanel me={me} schoolYear={schoolYear} />
          : <OfficialCardsPanel tab={tab} me={me} schoolYear={schoolYear} approvedResource={approvedResource} />}\n`);

// Tests that name the changed behaviour.
swap('shared/theme/literals.test.js', `const JSX_ALLOWED = new Set(['parent/src/components/ScanSheet.jsx']);\n`,
  `// The temporary ID pass is printed artwork in the school's fixed colors.
const JSX_ALLOWED = new Set(['parent/src/components/ScanSheet.jsx', 'src/components/TempPassPrintable.jsx']);\n`);
swap('src/lib/access.test.js', `expect(allowedPages(jhs)).toEqual(['dashboard', 'students', 'learnerRequests', 'sections', 'schedules', 'attendance', 'announcements']);`,
  `expect(allowedPages(jhs)).toEqual(['dashboard', 'students', 'learnerRequests', 'sections', 'schedules', 'attendance', 'idcards', 'announcements']);
    expect(canOpen(glc8, 'idcards')).toBe(false);`);
swap('src/lib/access.test.js', `for (const page of ['enroll', 'idcards', 'guardians', 'settings', 'accounts'])`,
  `for (const page of ['enroll', 'guardians', 'settings', 'accounts'])`);

const tab = 'src/pages/idCards/TempPassesTab.test.js';
swap(tab, `  useStaffCollectionResource: (path, { me }) => { fixture.subscribed.push(['staff', path, me?.role]); return { data: [], loading: false, error: null }; },\n`,
  `  useSharedQueryResource: (key) => { fixture.subscribed.push(['query', key]); return { data: [], loading: false, error: null }; },\n`);
swap(tab, `  it('gives administrators all three tabs', () => {`, `  it('gives administrators all four tabs', () => {`);
swap(tab, `    expect(html).toContain('>Saved batch<');\n    expect(html).toContain('>Temporary passes<');\n`,
  `    expect(html).toContain('>Saved batch<');\n    expect(html).toContain('>Recently approved<');\n    expect(html).toContain('>Temporary passes<');\n`);
swap(tab, `    expect(fixture.subscribed.filter(([kind]) => kind === 'all')).toEqual([]);
    expect(fixture.subscribed.map(([, path]) => path).sort()).toEqual(['enrollments', 'sections', 'students', 'temp_passes']);\n`,
  `    expect(html).not.toContain('>Recently approved<');
    const asked = fixture.subscribed.map(([, name]) => name);
    expect(asked).not.toContain('id_card_batch');
    expect(asked).not.toContain('id_card_approved|all');
    expect(asked).toContain(role === 'jhs_coord' ? 'temp_passes|7,8,9,10' : 'temp_passes|11,12');\n`);

swap('src/components/StudentPhotoDialog.test.js', `  useStaffCollectionResource: (path) => ({ data: fixture[path] ?? [], loading: false, error: null }),
`,
  `  useCollectionResource: (path) => ({ data: fixture[path] ?? [], loading: false, error: null }),
`);
// SIMS is the first hosting entry of the tree's firebase.json: it may now use the camera.
swap('firebase.json', `"geolocation=(), camera=(), microphone=()"`, `"geolocation=(), camera=(self), microphone=()"`);

writeFileSync(join(here, 'port-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`copied ${report.copied.length}, hand-ported ${report.handPorted.length}, left out ${report.leftOut.length}`);
