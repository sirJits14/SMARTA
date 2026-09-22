import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

const reducedMotion = '@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } } body { margin: 0; }';
createRoot(document.getElementById('root')).render(<StrictMode><style>{reducedMotion}</style><App /></StrictMode>);
