import { openedStatus, shortDate } from '../../../lib/schoolAssignments.js';

export default function OpenedTag({ item }) {
  const status = openedStatus(item);
  return <span className={`sims-flag ${status.opened ? 'sims-flag--ok' : 'sims-flag--stale'}`}>
    {status.opened ? `Opened ${shortDate(status.at)}` : 'Not opened yet'}</span>;
}
