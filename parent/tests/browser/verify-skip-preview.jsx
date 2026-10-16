import { createRoot } from 'react-dom/client';
import '../../../shared/theme/theme.css';
import '../../src/glass.css';
import App from '../../src/App.jsx';
import { profileSubscriptions } from './verify-skip-fixture.js';

// Verify → Continue → Consent → Skip for now should reach Home in one go.
window.profileSubscriptions = profileSubscriptions;
createRoot(document.getElementById('root')).render(<>
  <aside style={{ padding: 12, textAlign: 'center', fontSize: 12 }}>Synthetic new email account · no Firebase access · reload to start over</aside>
  <App />
</>);
