// Copies the LIVE SIMS release tree (2026-11-27 temp-pass tree) and ports the adviser-request / Logistic Operator
// changes (PR #109) onto it. Run from the worktree root: node .superpowers/releases/temp-pass-requests/sims/port-sims.mjs
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const base = resolve(root, '.superpowers/releases/temp-pass/sims/tree');
const out = join(here, 'tree');
if (existsSync(out)) throw new Error('tree/ already exists; remove its node_modules junction with .Delete() before deleting it.');
const FROM = '05864bc';   // master the live tree was ported from
const TO = '191e348';     // merged PR #109
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
const lf = (s) => s.replace(/\r\n/g, '\n');

const skip = new Set(['node_modules', 'dist-baseline', 'dist-new', 'dist', 'dist-tree']);
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
const report = { copied: [], added: [], handPorted: [], leftOut: [] };
for (const path of changed) {
  // staffQueries belongs to the held coordinator rollout; the live tree reads whole collections.
  if (path.startsWith('src/lib/staffQueries')) { report.leftOut.push(path); continue; }
  let existed = true;
  try { git('cat-file', '-e', `${FROM}:${path}`); } catch { existed = false; }
  const inTree = existsSync(join(app, path));
  if (!existed && inTree) throw new Error(`${path} is new in the feature but already in the live tree`);
  if (!existed) { write(path, lf(git('show', `${TO}:${path}`))); report.added.push(path); continue; }
  if (read(path) === lf(git('show', `${FROM}:${path}`))) { write(path, lf(git('show', `${TO}:${path}`))); report.copied.push(path); }
  else report.handPorted.push(path);
}
const expected = ['src/components/StudentPhotoDialog.test.js', 'src/lib/access.js', 'src/lib/access.test.js',
  'src/pages/IDCardsPage.jsx', 'src/pages/StudentsPage.jsx', 'src/pages/idCards/TempPassesTab.test.js'];
if (JSON.stringify([...report.handPorted].sort()) !== JSON.stringify(expected.sort())) {
  throw new Error(`Unexpected files differ from the base: ${report.handPorted.join(', ')}`);
}

// access.js: the Logistic Operator's pages and the Students list scope; passes move to grade level coordinators.
swap('src/lib/access.js', `// Learner photos follow the temporary pass staff: administrators and academic coordinators.
export const canManagePhotos = (me) => canManagePasses(me);
// Academic coordinators also open ID Cards, where they see only Temporary passes.
const PASS_COORDINATOR_PAGES`, `// Learner photos follow the temporary pass staff: administrators, grade level coordinators and logistic operators.
export const canManagePhotos = (me) => canManagePasses(me);
// Grade level coordinators also open ID Cards, for their grade's temporary passes.
const PASS_COORDINATOR_PAGES`);
swap('src/lib/access.js', `export const DISABLED_MESSAGE`, `// Logistic operators print passes and add learner photos, and nothing else. The first page is where they start.
const LOGISTIC_PAGES = ['idcards', 'students'];
export const DISABLED_MESSAGE`);
swap('src/lib/access.js', `  if (isAdmin(me)) return NAV_ITEMS.map((item) => item.key);\n`,
  `  if (isAdmin(me)) return NAV_ITEMS.map((item) => item.key);\n  if (roleOf(me) === 'logistic') return LOGISTIC_PAGES;\n`);
swap('src/lib/access.js', `export const canOpen = (me, page) => allowedPages(me).includes(page);\n`,
  `export const canOpen = (me, page) => allowedPages(me).includes(page);\n// Where this person starts, and where a page they can't open falls back to.\nexport const homePage = (me) => allowedPages(me)[0] ?? 'dashboard';\n`);
swap('src/lib/access.js', `export const gradeOptions = (me) => grades(me) ?? ALL_GRADES;\n`,
  `export const gradeOptions = (me) => grades(me) ?? ALL_GRADES;
// The grades whose learners the Students page lists (null = every grade). Logistic operators
// add photos for every grade there, although they have no general grade scope.
export const studentListGrades = (me) => (roleOf(me) === 'logistic' ? null : grades(me));\n`);

// StudentsPage.jsx
const sp = 'src/pages/StudentsPage.jsx';
swap(sp, `import { isAdmin, canManagePhotos, grades, gradeOptions, singleGrade, scopeRoster } from '../lib/access.js';\n`,
  `import { isAdmin, canManagePhotos, studentListGrades, singleGrade, scopeRoster } from '../lib/access.js';\nimport { ALL_GRADES } from '../../shared/staffRoles.js';\n`);
swap(sp, `  const oneGrade = singleGrade(me);\n`, `  const oneGrade = singleGrade(me);
  // null for administrators and logistic operators, who list every grade.
  const listGrades = studentListGrades(me);
  const everyGrade = listGrades === null;\n`);
swap(sp, `enrollments: enrollmentsResource.data }, grades(me), schoolYear),`, `enrollments: enrollmentsResource.data }, studentListGrades(me), schoolYear),`);
swap(sp, `              {admin && <option value={UNASSIGNED}>No Section Assigned</option>}
            </Sel></Field>
          </div>
          {!oneGrade`, `              {everyGrade && <option value={UNASSIGNED}>No Section Assigned</option>}
            </Sel></Field>
          </div>
          {!oneGrade`);
swap(sp, `{gradeOptions(me).map((g) => <option key={g} value={g}>Grade {g}</option>)}
              {admin && <option value={UNASSIGNED}>Unassigned</option>}`,
  `{(listGrades ?? ALL_GRADES).map((g) => <option key={g} value={g}>Grade {g}</option>)}
              {everyGrade && <option value={UNASSIGNED}>Unassigned</option>}`);
swap(sp, `              {sectionsForGradeFilter.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              {admin && <option value={UNASSIGNED}>No Section Assigned</option>}`,
  `              {sectionsForGradeFilter.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              {everyGrade && <option value={UNASSIGNED}>No Section Assigned</option>}`);
swap(sp, `: <EmptyState title="No learners yet" hint={admin ? 'Add your first learner with the button above.' : 'No learners are enrolled in your grade levels this school year.'} />) : (`,
  `: <EmptyState title="No learners yet" hint={admin ? 'Add your first learner with the button above.'
            : everyGrade ? 'No learners are enrolled this school year.' : 'No learners are enrolled in your grade levels this school year.'} />) : (`);

// IDCardsPage.jsx: keep the live "Recently approved" tab; add Requests beside Temporary passes.
const page = 'src/pages/IDCardsPage.jsx';
swap(page, `import { passGrades } from '../../shared/tempPass.js';\nimport TempPassesTab from './idCards/TempPassesTab.jsx';\n`,
  `import { canManagePasses, passGrades } from '../../shared/tempPass.js';\nimport TempPassesTab from './idCards/TempPassesTab.jsx';\nimport PassRequestsTab, { requestsTabLabel, usePassRequestList } from './idCards/PassRequestsTab.jsx';\n`);
swap(page, `import { approvedTabLabel } from '../lib/idCardQueue.js';\n`, `import { approvedTabLabel } from '../lib/idCardQueue.js';\n\nexport { requestsTabLabel };\n`);
swap(page, `const ADMIN_TABS = [['section', 'By section'], ['queue', 'Saved batch'], ['approved', 'Recently approved'], ['temp', 'Temporary passes']];
// Academic coordinators handle temporary passes only.
const COORDINATOR_TABS = [['temp', 'Temporary passes']];`,
  `const ADMIN_TABS = [['section', 'By section'], ['queue', 'Saved batch'], ['approved', 'Recently approved'], ['requests', 'Requests'], ['temp', 'Temporary passes']];
// Grade level coordinators and logistic operators handle temporary passes only.
const PASS_TABS = [['requests', 'Requests'], ['temp', 'Temporary passes']];
const PASS_TAB_KEYS = ['requests', 'temp'];`);
swap(page, `const readTab = (tabs) => {\n  try {`, `const readTab = (tabs) => {\n  if (!tabs.length) return '';\n  try {`);
const current = read(page);
const a = current.indexOf(`// Passes are the one new collection`);
const b = current.indexOf('  return (\n    <div>', a);
if (a < 0 || b < 0) throw new Error('IDCardsPage layout changed');
write(page, current.slice(0, a) + `// Requests and temporary passes read only sections, enrollments, learners and passes. The live tree reads whole
// collections for the first three, and a grade level coordinator's pass query carries the grade filter the rules need.
function PassesPanel({ tab, me, schoolYear, pending }) {
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
  const data = { me, schoolYear, sections: sections.data, enrollments: enrollments.data, students: students.data, passes: passes.data, pending, onRequestsChanged: pending.reload };
  return tab === 'requests' ? <PassRequestsTab {...data} /> : <TempPassesTab {...data} />;
}

export default function IDCardsPage({ me, schoolYear }) {
  const admin = isAdmin(me);
  const printer = canManagePasses(me);
  const tabs = admin ? ADMIN_TABS : printer ? PASS_TABS : [];
  // The count on the tab label. Only administrators may read this collection.
  const approvedResource = useSharedQueryResource(admin ? 'id_card_approved|all' : 'id_card_approved|none',
    () => (admin ? query(collection(db, 'id_card_approved')) : null));
  const [chosen, setTabState] = useState(() => readTab(tabs));
  const tab = tabs.some(([k]) => k === chosen) ? chosen : tabs[0]?.[0];
  // Waiting requests: counted on the tab and shared by both pass tabs.
  const pending = usePassRequestList('pending', printer);
  const setTab = (next) => {
    setTabState(next);
    // Both pass tabs route learners with a waiting request through it, so they need a fresh list.
    if (PASS_TAB_KEYS.includes(next) && printer) pending.reload();
    try { localStorage.setItem(STORAGE, next); } catch { /* the tab still switches without storage */ }
  };
  const labelOf = (k, label) => (k === 'requests' ? requestsTabLabel(pending.requests.length, pending.truncated)
    : k === 'approved' ? approvedTabLabel(approvedResource.data.length) : label);

  if (!tab) {
    return (
      <div>
        <div className="id-cards-heading" style={S.plate}><h1 style={S.h1}>ID Cards</h1></div>
        <p role="status">ID cards and temporary passes are handled by administrators, grade level coordinators and logistic operators.</p>
      </div>
    );
  }

` + current.slice(b));
swap(page, `}}>{k === 'approved' ? approvedTabLabel(approvedResource.data.length) : label}</button>;`, `}}>{labelOf(k, label)}</button>;`);
swap(page, `        {tab === 'temp' ? <TempPassesPanel me={me} schoolYear={schoolYear} />
          : <OfficialCardsPanel`, `        {PASS_TAB_KEYS.includes(tab) ? <PassesPanel tab={tab} me={me} schoolYear={schoolYear} pending={pending} />
          : <OfficialCardsPanel`);

// Tests: the three hand-ported ones follow the tree's own hooks and tabs.
const photoTest = 'src/components/StudentPhotoDialog.test.js';
write(photoTest, lf(git('show', `${TO}:${photoTest}`)));
swap(photoTest, `  useStaffCollectionResource: (path) => {`, `  useCollectionResource: (path) => {`);

const passTest = 'src/pages/idCards/TempPassesTab.test.js';
write(passTest, lf(git('show', `${TO}:${passTest}`)));
swap(passTest, `  useStaffCollectionResource: (path, { me }) => { fixture.subscribed.push(['staff', path, me?.role]); return { data: [], loading: false, error: null }; },\n`,
  `  useSharedQueryResource: (key) => { fixture.subscribed.push(['query', key]); return { data: [], loading: false, error: null }; },\n`);
swap(passTest, `  it('gives administrators the official card tabs, Requests and Temporary passes', () => {
    expect(tabs(page({ role: 'admin' }))).toEqual(['By section', 'Saved batch', 'Requests', 'Temporary passes']);`,
  `  it('gives administrators the official card tabs, Requests and Temporary passes', () => {
    expect(tabs(page({ role: 'admin' }))).toEqual(['By section', 'Saved batch', 'Recently approved', 'Requests', 'Temporary passes']);`);
swap(passTest, `    expect(fixture.subscribed.filter(([kind]) => kind === 'all')).toEqual([]);
    expect(fixture.subscribed.map(([, path]) => path).sort()).toEqual(['enrollments', 'sections', 'students', 'temp_passes']);
    expect(fixture.subscribed.every(([, , role]) => role === me.role)).toBe(true);
`, `    const asked = fixture.subscribed.map(([, name]) => name);
    expect(asked).not.toContain('id_card_batch');
    expect(asked).not.toContain('id_card_approved|all');
    expect(asked).toContain(me.role === 'logistic' ? 'temp_passes|all' : 'temp_passes|8');
`);
swap(passTest, `    expect(tabs(html)).toEqual([]);
    expect(fixture.subscribed).toEqual([]);`, `    expect(tabs(html)).toEqual([]);
    expect(fixture.subscribed).toEqual([['query', 'id_card_approved|none']]);`);

const accessTest = 'src/lib/access.test.js';
swap(accessTest, `  it('coordinators open the shared pages, including Announcements and Learner requests', () => {
    expect(allowedPages(jhs)).toEqual(['dashboard', 'students', 'learnerRequests', 'sections', 'schedules', 'attendance', 'idcards', 'announcements']);
    expect(canOpen(glc8, 'idcards')).toBe(false);
`, `  const academicPages = ['dashboard', 'students', 'learnerRequests', 'sections', 'schedules', 'attendance', 'announcements'];
  const gradePages = ['dashboard', 'students', 'learnerRequests', 'sections', 'schedules', 'attendance', 'idcards', 'announcements'];
  const logistic = { role: 'logistic' };
  it('grade level coordinators open the shared pages and ID Cards', () => {
    expect(allowedPages(glc8)).toEqual(gradePages);
    expect(canOpen(glc8, 'idcards')).toBe(true);
`);
swap(accessTest, `  it('no coordinator role is an administrator or reaches admin-only pages', () => {`, `  it('academic coordinators open the shared pages but not ID Cards', () => {
    for (const me of [jhs, { role: 'shs_coord' }]) {
      expect(allowedPages(me)).toEqual(academicPages);
      expect(canOpen(me, 'idcards')).toBe(false);
    }
  });
  it('logistic operators open ID Cards and Students only, in that order', () => {
    expect(allowedPages(logistic)).toEqual(['idcards', 'students']);
    for (const page of ['dashboard', 'learnerRequests', 'sections', 'schedules', 'attendance', 'announcements', 'enroll', 'guardians', 'settings', 'accounts']) {
      expect(canOpen(logistic, page)).toBe(false);
    }
    expect(isAdmin(logistic)).toBe(false);
  });
  it('starts each role on the first page it can open', () => {
    expect(access.homePage(logistic)).toBe('idcards');
    for (const me of [admin, {}, jhs, { role: 'shs_coord' }, glc8]) expect(access.homePage(me)).toBe('dashboard');
    for (const me of [null, { role: 'teacher' }]) expect(access.homePage(me)).toBe('dashboard');
  });
  it('no coordinator role is an administrator or reaches admin-only pages', () => {`);
swap(accessTest, `    expect(singleGrade(admin)).toBeNull();
  });
});
`, `    expect(singleGrade(admin)).toBeNull();
  });
  it('lists every grade on the Students page for logistic operators, who have no general grade scope', () => {
    const logistic = { role: 'logistic' };
    expect(access.grades(logistic)).toEqual([]);
    expect(access.studentListGrades(logistic)).toBeNull();
    expect(access.studentListGrades(admin)).toBeNull();
    expect(access.studentListGrades(jhs)).toEqual([7, 8, 9, 10]);
    expect(access.studentListGrades(glc8)).toEqual([8]);
    for (const me of [null, { role: 'teacher' }]) expect(access.studentListGrades(me)).toEqual([]);
  });
});
`);

writeFileSync(join(here, 'port-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`copied ${report.copied.length}, added ${report.added.length}, hand-ported ${report.handPorted.length}, left out ${report.leftOut.length}`);
