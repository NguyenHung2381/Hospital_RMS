import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './app/App';
import { initMobileTableCards } from './shared/utils/mobileTableCards';
import { initSelectAutoWidth } from './shared/utils/selectAutoWidth';
import './styles/global.css';

// Stylesheet chèn bằng JS không chặn vẽ trang: Google Fonts chậm/bị chặn thì
// trang vẫn hiện ngay với font dự phòng, font thật đổi vào khi tải xong (swap).
const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href =
	'https://fonts.googleapis.com/css2?family=Mulish:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400&family=Be+Vietnam+Pro:wght@300;400;500;600;700;800&display=swap';
document.head.append(fontLink);

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

initMobileTableCards();
initSelectAutoWidth();

createRoot(rootElement).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
