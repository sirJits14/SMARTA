import { Card, EmptyState } from '../../components/ui.jsx';
import { orderWaiting } from '../../lib/learnerRequests.js';
import RequestCard from './RequestCard.jsx';

// Oldest first, with the ones that need an administrator after the ones this person can decide.
export default function WaitingList({ requests, ended, pending, pendingId, failures, onApprove, onReject }) {
  return <Card style={{ padding: 20 }}>
    {requests.length === 0
      ? <EmptyState title="No requests waiting" hint="Class advisers send requests from the Class tab of the parent app." />
      : <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{orderWaiting(requests).map(request => (
        <RequestCard key={request.id} request={request} disabled={pending || ended} busy={request.id === pendingId} failure={failures[request.id]} onApprove={onApprove} onReject={onReject} />))}</ul>}
  </Card>;
}
