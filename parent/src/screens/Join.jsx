import { useMemo, useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { callable } from '../firebase.js';
import S from '../strings.js';
import { Spinner } from '../components/ui.jsx';
import { useSchoolContext } from '../hooks/useSchoolContext.js';
import { useLinks } from '../hooks/useLinks.js';
import { heldRoles, pendingRoles, roleOptions, joinSteps, initialSelection, landingModeFor } from '../lib/join.js';
import { schoolHome } from '../lib/portalMode.js';
import RoleChooser, { ROLE_TEXT } from './join/RoleChooser.jsx';
import FamilyStep from './join/FamilyStep.jsx';
import AdviserStep from './join/AdviserStep.jsx';
import SubjectTeacherStep from './join/SubjectTeacherStep.jsx';
import JoinSummary from './join/JoinSummary.jsx';
import { stepLabel } from './join/StepHeader.jsx';

const CONSENT_KEY = 'bnhs-parent-consent';
const STEPS = { family: FamilyStep, adviser: AdviserStep, subject_teacher: SubjectTeacherStep };

// "Who are you?" then one step per chosen role (spec 2026-10-19). Each step
// saves on its own; a skipped or failed step can be retried from the summary.
export default function Join({ user, profile, route, navigate, setMode }) {
  const school = useSchoolContext(user.uid);
  const { links } = useLinks(user.uid);
  const [name, setName] = useState(profile?.displayName || user.displayName || '');
  const [selected, setSelected] = useState(() => initialSelection(route.query));
  const [phase, setPhase] = useState('choose');
  const [steps, setSteps] = useState([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState({});
  const [error, setError] = useState('');
  const options = useMemo(() => roleOptions({ held: heldRoles(school.data, links || []), pending: pendingRoles(school.data), selected, email: user.email }),
    [school.data, links, selected, user.email]);

  // Same as Skip used to do: the name is saved and the profile exists before any
  // role step runs, or before an account with nothing to add opens the app.
  const prepare = async () => {
    const trimmed = name.trim();
    if (trimmed && user.displayName !== trimmed) {
      await updateProfile(user, { displayName: trimmed }).catch(() => {});
      await user.getIdToken(true).catch(() => {});
    }
    if (!profile) {
      let accepted; try { accepted = Number(localStorage.getItem(CONSENT_KEY)); } catch {}
      await callable('acceptConsentFn')({ acceptedConsentVersion: accepted });
    }
  };
  const start = async () => {
    setError(''); setPhase('preparing');
    try {
      await prepare();
      setSteps(joinSteps(options)); setIndex(0); setPhase('step');
    } catch (e) {
      if (String(e?.code || '').endsWith('failed-precondition')) { navigate('/consent'); return; }
      setError(S.joinPrepareFailed); setPhase('choose');
    }
  };
  // Wait for a fresh answer before choosing the mode: App reconciles the mode
  // against the school context, and a stale one (no new assignments yet) would
  // drop a teacher-only account back to Family.
  const land = async (finished) => {
    const fresh = await school.refresh({ force: true }).catch(() => null);
    const mode = landingModeFor(finished, links || [], (fresh || school.data)?.assignments || []);
    setMode(mode);
    navigate(mode.view === 'school' ? schoolHome(mode) : '/', { replace: true });
  };
  // For an account that already holds a school role (or has nothing to add) and
  // so has no role to claim: same preparation as Continue, no steps.
  const skip = async () => {
    setError(''); setPhase('skipping');
    try {
      await prepare();
      await land({});
    } catch (e) {
      if (String(e?.code || '').endsWith('failed-precondition')) { navigate('/consent'); return; }
      setError(S.activateSkipFailed); setPhase('choose');
    }
  };
  // After a step (or a retry from the summary), go to the next step that has no
  // answer yet; a skipped step is recorded as null so it is not revisited.
  const next = (role, result) => {
    const merged = { ...results, [role]: result };
    setResults(merged);
    const after = steps.findIndex((r, i) => i > steps.indexOf(role) && !(r in merged));
    if (after !== -1) setIndex(after); else setPhase('summary');
  };
  const retry = (role) => { setIndex(steps.indexOf(role)); setPhase('step'); };
  const open = async () => { setPhase('opening'); await land(results); };

  if (phase === 'opening') return <Spinner label={S.loading} />;
  if (phase === 'skipping') return <Spinner label={S.activateSkipping} />;
  if (phase === 'preparing') return <Spinner label={S.joinPreparing} />;
  if (phase === 'summary') return <JoinSummary steps={steps} results={results} onRetry={retry} onOpen={open} />;
  if (phase === 'step') {
    const role = steps[index];
    const Step = STEPS[role];
    return <Step key={`${role}:${index}`} user={user} name={name} school={school} query={route.query} navigate={navigate}
      label={stepLabel(index, steps.length, ROLE_TEXT[role][0])}
      onDone={(result) => next(role, result)} onSkip={() => next(role, results[role] || null)} />;
  }
  if (school.loading && !school.data) return <Spinner label={S.loading} />;
  return <RoleChooser name={name} setName={setName} options={options} selected={selected} setSelected={setSelected} onContinue={start} onSkip={profile ? undefined : skip} error={error || school.error} />;
}
