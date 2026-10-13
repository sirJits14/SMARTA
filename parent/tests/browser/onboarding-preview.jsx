import { createRoot } from 'react-dom/client';
import '../../../shared/theme/theme.css';
import '../../src/glass.css';
import App from '../../src/App.jsx';
import { reset, failNextSkip, updateNotice } from './onboarding-fixture.js';

createRoot(document.getElementById('root')).render(<>
  <aside style={{ padding: 12, textAlign: 'center', fontSize: 12 }}>
    Synthetic account · no Firebase access{' '}
    <button onClick={reset}>Reset new account</button>{' '}
    <button onClick={failNextSkip}>Fail next skip</button>
    {' '}<button onClick={updateNotice}>Update privacy notice</button>
  </aside>
  <App />
</>);
