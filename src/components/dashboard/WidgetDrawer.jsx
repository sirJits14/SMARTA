import { Btn, Modal, ResourceState } from '../ui.jsx';
import NavIcon from '../NavIcon.jsx';

// A right-side drawer over the dashboard. Native <dialog> (via Modal): Escape, backdrop click,
// focus trap and focus return to the expand button come from DialogFrame.
export default function WidgetDrawer({ title, pageLink, onNavigate, onClose, resources = [], children }) {
  return <Modal title={title} width={560} overlayClassName="sims-side-drawer" onClose={onClose} closeLabel={`Close ${title}`}>
    <div className="sims-side-drawer-body">
      <ResourceState resources={resources} label={title.toLowerCase()} inline>{children}</ResourceState>
    </div>
    {pageLink && <div className="sims-side-drawer-foot">
      <Btn variant="quiet" onClick={() => { onClose(); onNavigate(pageLink.page, pageLink.params ?? null); }}>
        {pageLink.label} <NavIcon name="arrow" size={16} />
      </Btn>
    </div>}
  </Modal>;
}
