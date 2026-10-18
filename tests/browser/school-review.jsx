import React from 'react';
import { createRoot } from 'react-dom/client';
import '/shared/theme/theme.css';
import '/src/registrar.css';
import SessionReviewPage from '/src/pages/SessionReviewPage.jsx';
import SchoolAccessTab from '/src/pages/guardians/SchoolAccessTab.jsx';

// ?view=review (default) | access   ?me=glc   ?theme=dark
const params = new URLSearchParams(location.search);
if (params.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
document.body.style.margin = '0';

const me = params.get('me') === 'glc' ? { role: 'glc', gradeLevel: 8, uid: 'synthetic-glc' } : { role: 'admin', uid: 'synthetic-admin' };
const host = document.getElementById('root');
Object.assign(host.style, { minHeight: '100dvh', padding: '24px', background: 'var(--t-canvas)' });
const view = params.get('view') === 'access' ? <SchoolAccessTab /> : <SessionReviewPage me={me} schoolYear="2026-2027" />;
createRoot(host).render(<div id="sims-main" style={{ maxWidth: 1100, margin: '0 auto' }}>{view}</div>);
