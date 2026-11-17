import { useEffect, useRef } from 'react';
import { maxWidth, type Breakpoint } from '../utils/breakpoints';

// Thời điểm người dùng chạm/bấm phím gần nhất — để chỉ cuộn khi việc chọn đến từ
// thao tác của họ, không cuộn khi trang tự chọn mục đầu tiên lúc tải xong.
let lastUserInput = 0;
let listening = false;
function trackUserInput() {
	if (listening || typeof window === 'undefined') return;
	listening = true;
	const mark = () => {
		lastUserInput = Date.now();
	};
	window.addEventListener('pointerup', mark, { capture: true, passive: true });
	window.addEventListener('keydown', mark, { capture: true, passive: true });
}
const USER_INPUT_WINDOW_MS = 1000;

/**
 * Bố cục danh sách + chi tiết xếp chồng trên màn hẹp (chi tiết nằm DƯỚI danh sách):
 * khi người dùng chọn một mục, cuộn khung chi tiết vào tầm nhìn — nếu không họ bấm
 * xong chẳng thấy gì thay đổi. Màn rộng (2 cột cạnh nhau) thì không cuộn.
 *
 *   const ref = useRevealOnSelect<HTMLDivElement>(selectedId);
 *   <div ref={ref} className={styles.detailPanel}>…</div>
 */
export function useRevealOnSelect<T extends HTMLElement>(
	selectedKey: string | number | null | undefined,
	stackBelow: Breakpoint = 'lg',
) {
	const ref = useRef<T>(null);
	useEffect(trackUserInput, []);
	useEffect(() => {
		if (selectedKey == null || !ref.current) return;
		if (Date.now() - lastUserInput > USER_INPUT_WINDOW_MS) return;
		if (!window.matchMedia(maxWidth(stackBelow)).matches) return;
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		ref.current.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
	}, [selectedKey, stackBelow]);
	return ref;
}
