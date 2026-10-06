import React from 'react';
import { createRoot } from 'react-dom/client';
import Shell from '/src/components/Shell.jsx';
import EnrollPage from '/src/pages/EnrollPage.jsx';
import { setScenario } from './enrollment-fixture.js';
import '/src/registrar.css';

if (new URLSearchParams(location.search).has('checks')) {
  import('./enrollment-regression.jsx');
} else {
  createRoot(document.getElementById('root')).render(<Shell me={{ role: 'admin', name: 'Preview staff', email: 'preview@example.test' }} page="enroll" setPage={() => {}} schoolYear="2026-2027" onLogout={() => {}}>
    <details style={{ marginBottom: 16, color: '#55706f', fontSize: 12 }}><summary>Preview controls · synthetic data</summary>
      <select aria-label="Preview scenario" onChange={event => setScenario(event.target.value)}>{['normal', 'empty', 'loading', 'error', 'save-error'].map(value => <option key={value}>{value}</option>)}</select>
    </details><EnrollPage schoolYear="2026-2027" />
  </Shell>);
}
