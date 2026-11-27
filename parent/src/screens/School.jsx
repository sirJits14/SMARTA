// School mode's Class tab. Teachers get here only after an administrator
// assigns them in SIMS and they choose School in Settings.
import { useEffect } from 'react';
import { useSchoolContext } from '../hooks/useSchoolContext.js';
import { canUseSchool, hasClass, advisorySections } from '../lib/portalMode.js';
import { sectionLabel } from '../lib/school.js';
import { Banner, Btn, EmptyState, Spinner } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ClassTab from './school/ClassTab.jsx';

export default function School({ user, navigate }) {
  const resource = useSchoolContext(user.uid);
  const context = resource.data;
  const noAccess = Boolean(context) && !canUseSchool(context);
  const noClass = Boolean(context) && !noAccess && !hasClass(context);
  // No school access goes Home; Curriculum Advisers have no Class tab. App.jsx owns the saved mode.
  useEffect(() => {
    if (noAccess) navigate('/', { replace: true });
    else if (noClass) navigate('/announcements?view=school', { replace: true });
  }, [noAccess, noClass, navigate]);
  const sections = advisorySections(context);
  return (
    <>
      <PageHeader title="Class" subtitle={sections.length === 1 ? sectionLabel(sections[0]) : context ? `School year ${context.schoolYear}` : undefined} />
      {resource.loading && !context && <Spinner label="Loading your class" />}
      {resource.error && <Banner tone="danger" action={<Btn variant="ghost" onClick={resource.refresh}>Try again</Btn>}>{resource.error}</Banner>}
      {context && hasClass(context) && sections.length === 0 && <EmptyState title="No advisory class yet" hint="An administrator assigns your class in SIMS." />}
      {context && sections.length > 0 && <ClassTab key={context.schoolYear} sections={sections} ended={context.ended} navigate={navigate} />}
    </>
  );
}
