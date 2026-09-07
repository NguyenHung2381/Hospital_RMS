import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './app/App';
import './styles/global.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

// Lazy-loaded chunk went stale (dev server restarted / new build deployed) — reload once instead of a blank error screen.
const RELOAD_FLAG = 'dynamic-import-reload';
window.addEventListener('vite:preloadError', () => window.location.reload());
window.addEventListener('unhandledrejection', (event) => {
	if (
		!/Failed to fetch dynamically imported module/i.test(
			String(event.reason?.message ?? event.reason),
		)
	)
		return;
	if (sessionStorage.getItem(RELOAD_FLAG)) return;
	sessionStorage.setItem(RELOAD_FLAG, '1');
	window.location.reload();
});
sessionStorage.removeItem(RELOAD_FLAG);

createRoot(rootElement).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
