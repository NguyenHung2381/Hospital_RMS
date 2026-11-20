import { useEffect, useRef, type RefObject } from 'react';

interface Options {
	/** Drawer đang hiển thị thật sự: màn hẹp VÀ đang mở. */
	active: boolean;
	onClose: () => void;
	/** Phần tử nhận focus khi mở (thường là nút đóng). */
	initialFocusRef: RefObject<HTMLElement | null>;
	/** Nút mở menu — nhận lại focus khi đóng. */
	triggerRef: RefObject<HTMLElement | null>;
}

/**
 * Quản lý focus + phím cho drawer điều hướng ở màn hẹp.
 * - mở: focus vào drawer · Esc: đóng · đóng: trả focus về nút mở menu
 * Việc chặn focus lọt ra sau drawer do layout đặt `inert` lên cột nội dung.
 */
export function useMobileDrawer({
	active,
	onClose,
	initialFocusRef,
	triggerRef,
}: Options) {
	const wasActive = useRef(false);

	useEffect(() => {
		if (active) {
			wasActive.current = true;
			initialFocusRef.current?.focus({ preventScroll: true });
		} else if (wasActive.current) {
			wasActive.current = false;
			triggerRef.current?.focus({ preventScroll: true });
		}
	}, [active, initialFocusRef, triggerRef]);

	useEffect(() => {
		if (!active) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [active, onClose]);
}
