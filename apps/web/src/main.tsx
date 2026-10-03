import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles/tokens.css';
import { view } from './lib/track.ts';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
view();
addEventListener('popstate', view);
