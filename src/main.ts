/** Entry point. Owner: Agent 7 (UI). */
import './ui/styles.css';
import { mountApp } from './ui/app';

const root = document.getElementById('app');
if (root) mountApp(root);

// Service worker: production builds only (dev would cache stale modules).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is optional; the app works without it */
    });
  });
}
