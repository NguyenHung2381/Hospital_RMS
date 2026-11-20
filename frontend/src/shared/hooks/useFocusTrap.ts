import { useEffect, useRef, type RefObject } from 'react';

/** Phần tử nhận được focus bằng Tab trong một lớp hộp thoại. */
export const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Mặc định: mọi lớp khai báo aria-modal (Modal, Drawer…) tính là một lớp. */
export const DIALOG_LAYER_SELECTOR = '[aria-modal="true"]';

export interface FocusTrapOptions {
	/** Đang mở — false thì không làm gì. */
	active: boolean;
	/** Esc khi lớp này đang nằm trên cùng. Luôn gọi bản mới nhất (không cần useCallback). */
	onEscape?: () => void;
	/**
	 * Selector nhận diện các lớp hộp thoại đang mở. Chỉ lớp trên cùng (phần tử khớp
	 * nằm cuối DOM — portal mở sau nằm cuối body) xử lý Tab / Esc; lớp dưới bỏ qua.
	 * Phần tử khớp cuối cùng phải là chính `ref` thì lớp này mới là trên cùng.
	 */
	layerSelector?: string;
	/** Trả focus về chỗ cũ khi đóng (mặc định true). */
	restoreFocus?: boolean;
}

/**
 * Giữ focus trong một hộp thoại / panel modal:
 *   - khi mở: đưa focus vào khung (nếu bên trong chưa có phần tử nào đang focus,
 *     vd ô có autoFocus) — trình đọc màn hình đọc tên hộp thoại;
 *   - Tab / Shift+Tab vòng trong khung, không lọt ra trang phía sau;
 *   - Esc gọi `onEscape`;
 *   - khi đóng: trả focus về phần tử trước đó.
 * Khung cần `tabIndex={-1}` để nhận focus. Muốn focus sẵn một phần tử bên trong thì
 * gọi `.focus()` trong useEffect của component cha (chạy SAU effect này), đừng dùng
 * `autoFocus` — autoFocus chạy trước nên hook không ghi nhớ được chỗ trả focus khi đóng.
 * Dùng ở <Modal> và <Drawer>:
 *
 *   const ref = useRef<HTMLDivElement>(null);
 *   useFocusTrap(ref, { active: open, onEscape: onClose });
 *   <div ref={ref} role='dialog' aria-modal='true' tabIndex={-1}>…</div>
 */
export function useFocusTrap(
	ref: RefObject<HTMLElement | null>,
	{ active, onEscape, layerSelector = DIALOG_LAYER_SELECTOR, restoreFocus = true }: FocusTrapOptions,
) {
	// onEscape thường là arrow function mới mỗi lần render — giữ ref để effect không chạy lại
	const escapeRef = useRef(onEscape);
	useEffect(() => {
		escapeRef.current = onEscape;
	});

	useEffect(() => {
		if (!active) return;
		const previouslyFocused = document.activeElement as HTMLElement | null;
		const container = ref.current;
		if (container && !container.contains(document.activeElement)) {
			container.focus({ preventScroll: true });
		}

		const isTopmost = () => {
			const layers = document.querySelectorAll(layerSelector);
			return layers[layers.length - 1] === ref.current;
		};
		const onKey = (e: KeyboardEvent) => {
			const box = ref.current;
			if (!box || !isTopmost()) return;
			if (e.key === 'Escape') {
				if (!escapeRef.current) return;
				e.preventDefault();
				escapeRef.current();
				return;
			}
			if (e.key !== 'Tab') return;
			const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
				(el) => el.offsetParent !== null || el === document.activeElement,
			);
			if (items.length === 0) {
				e.preventDefault();
				return;
			}
			const firstEl = items[0];
			const lastEl = items[items.length - 1];
			const activeEl = document.activeElement;
			if (e.shiftKey && (activeEl === firstEl || activeEl === box)) {
				e.preventDefault();
				lastEl.focus();
			} else if (!e.shiftKey && activeEl === lastEl) {
				e.preventDefault();
				firstEl.focus();
			} else if (!box.contains(activeEl)) {
				e.preventDefault();
				firstEl.focus();
			}
		};
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('keydown', onKey);
			if (restoreFocus && previouslyFocused && document.contains(previouslyFocused)) {
				previouslyFocused.focus({ preventScroll: true });
			}
		};
	}, [active, ref, layerSelector, restoreFocus]);
}
