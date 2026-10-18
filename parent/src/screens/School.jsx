// School mode's Class tab. Teachers get here only after an administrator
// assigns them in SIMS and they choose School in Settings.
import { useEffect } from 'react';
import { useSchoolContext } from '../hooks/useSchoolContext.js';
import { canUseSchool, hasClass, advisorySections } from '../lib/portalMode.js';
import { sectionLabel } from '../lib/school.js';
import { Banner, Btn, Spinner } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ClassTab from './school/ClassTab.jsx';

export default function School({ user, navigate, mode, setMode }) {
  const resource = useSchoolContext(user.uid);
  const context = resource.data;
  useEffect(() => {
    if (!context) return;
    if (!canUseSchool(context)) { setMode({ view: 'family', hasClass: false }); navigate('/', { replace: true }); return; }
    const next = { view: 'school', hasClass: hasClass(context) };
    if (mode.view !== 'school' || mode.hasClass !== next.hasClass) setMode(next);
    if (!next.hasClass) navigate('/announcements?view=school', { replace: true });
  }, [context, mode, setMode, navigate]);
  const sections = advisorySections(context);
  return (
    <>
      <PageHeader title="Class" subtitle={sections.length === 1 ? sectionLabel(sections[0]) : context ? `School year ${context.schoolYear}` : undefined} />
      {resource.loading && !context && <Spinner label="Loading your class" />}
      {resource.error && <Banner tone="danger" action={<Btn variant="ghost" onClick={resource.refresh}>Try again</Btn>}>{resource.error}</Banner>}
      {context && sections.length > 0 && <ClassTab key={context.schoolYear} sections={sections} ended={context.ended} />}
    </>
  );
}
