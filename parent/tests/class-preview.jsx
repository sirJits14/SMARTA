import { createRoot } from 'react-dom/client';
import '../../shared/theme/theme.css';
import '../src/app.css';
import ClassTab from '../src/screens/school/ClassTab.jsx';

// ?theme=dark previews Night teal; ?ended=1 previews an ended school year.
const params = new URLSearchParams(location.search);
if (params.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
document.body.style.margin = '0';
createRoot(document.getElementById('root')).render(
  <main style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 120px', boxSizing: 'border-box', fontFamily: 'var(--font-sans)', color: 'var(--t-ink)', minHeight: '100dvh' }}>
    <h1 style={{ fontSize: 28, margin: '8px 0 12px' }}>Class</h1>
    <ClassTab sections={[{ id: 'SEC1', name: 'Mabini', gradeLevel: 8, schoolYear: '2026-2027' }]} ended={params.get('ended') === '1'} />
  </main>,
);
