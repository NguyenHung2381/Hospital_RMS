import { lazy, type ComponentType } from 'react';

const thunks: Array<() => Promise<unknown>> = [];

// Như React.lazy nhưng ghi lại thunk import để prefetch nền sau này.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- giống chữ ký của React.lazy
export function lazyRoute<T extends ComponentType<any>>(imp: () => Promise<{ default: T }>) {
	thunks.push(imp);
	return lazy(imp);
}

// ponytail: khi trình duyệt rảnh (sau render đầu) nạp sẵn mọi chunk route vào cache.
// Điều hướng tiếp theo không phải chờ dynamic import → Suspense (thanh 92%) gần như
// không xuất hiện. Ceiling: tải nền ~250KB gzip 1 lần; nhiều route hơn thì đổi sang
// prefetch-on-hover từng link.
export function prefetchRoutes() {
	const run = () => thunks.forEach((t) => t().catch(() => {}));
	const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
		.requestIdleCallback;
	if (ric) ric(run, { timeout: 3000 });
	else setTimeout(run, 2000);
}
