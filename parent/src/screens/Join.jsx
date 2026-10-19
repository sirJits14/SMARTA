import { useMemo, useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { callable } from '../firebase.js';
import S from '../strings.js';
import { Spinner } from '../components/ui.jsx';
import { useSchoolContext } from '../hooks/useSchoolContext.js';
import { useLinks } from '../hooks/useLinks.js';
import { heldRoles, pendingRoles, roleOptions, joinSteps, initialSelection, landingMode } from '../lib/join.js';
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

  const start = async () => {
    setError(''); setPhase('preparing');
    try {
      const trimmed = name.trim();
      if (user.displayName !== trimmed) {
        await updateProfile(user, { displayName: trimmed }).catch(() => {});
        await user.getIdToken(true).catch(() => {});
      }
      // Same as Skip used to do: the profile exists before any role step runs.
      if (!profile) {
        let accepted; try { accepted = Number(localStorage.getItem(CONSENT_KEY)); } catch {}
        await callable('acceptConsentFn')({ acceptedConsentVersion: accepted });
      }
      setSteps(joinSteps(options)); setIndex(0); setPhase('step');
    } catch (e) {
      if (String(e?.code || '').endsWith('failed-precondition')) { navigate('/consent'); return; }
      setError(S.joinPrepareFailed); setPhase('choose');
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
  const open = () => {
    const mode = landingMode(results, links || []);
    setMode(mode);
    school.refresh();
    navigate(mode.view === 'school' ? schoolHome(mode) : '/', { replace: true });
  };

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
  return <RoleChooser name={name} setName={setName} options={options} selected={selected} setSelected={setSelected} onContinue={start} error={error || school.error} />;
}
