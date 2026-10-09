import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { installPrompt } from './lib/installPrompt.js';
import '../../shared/theme/theme.css';
import './glass.css';

const reducedMotion = '@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } } body { margin: 0; }';
installPrompt(); // catch beforeinstallprompt before any screen mounts
createRoot(document.getElementById('root')).render(<StrictMode><style>{reducedMotion}</style><App /></StrictMode>);
