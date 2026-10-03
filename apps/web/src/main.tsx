import '@fontsource/hanken-grotesk/latin-400.css';
import '@fontsource/hanken-grotesk/latin-500.css';
import '@fontsource/hanken-grotesk/latin-700.css';
import '@fontsource/hanken-grotesk/latin-800.css';
import '@fontsource/martian-mono/latin-400.css';
import '@fontsource/martian-mono/latin-500.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles/tokens.css';
import { view } from './lib/track.ts';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
view();
addEventListener('popstate', view);
