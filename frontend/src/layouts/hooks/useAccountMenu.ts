import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type KeyboardEvent,
} from 'react';

const ITEM_SELECTOR = '[role="menuitem"]:not([disabled])';

/**
 * Menu tài khoản theo mẫu "menu button" (WAI-ARIA):
 * - mở: focus mục đầu tiên
 * - ↑ ↓ Home End: di chuyển giữa các mục (vòng tròn)
 * - Esc: đóng và trả focus về nút mở · Tab: đóng, Tab đi tiếp từ nút mở
 * - bấm ra ngoài: đóng (không cướp focus của chỗ vừa bấm)
 * Các mục trong menu phải có role="menuitem"; nút mở có aria-haspopup="menu".
 */
export function useAccountMenu() {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	// Bỏ qua mục đang bị ẩn bằng CSS (vd. nhóm "chỉ hiện ở điện thoại")
	const items = useCallback(
		() =>
			Array.from(
				menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [],
			).filter((el) => el.getClientRects().length > 0),
		[],
	);

	/** Đóng menu; `restoreFocus` đưa focus về nút mở (dùng khi đóng bằng bàn phím). */
	const close = useCallback((restoreFocus = false) => {
		setOpen(false);
		if (restoreFocus) triggerRef.current?.focus();
	}, []);

	const toggle = useCallback(() => setOpen((o) => !o), []);

	// Vừa mở → focus mục đầu tiên
	useEffect(() => {
		if (open) items()[0]?.focus();
	}, [open, items]);

	// Bấm ra ngoài + Esc (Esc nghe ở window để hoạt động cả khi focus đang ở chỗ khác)
	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
				setOpen(false);
		};
		const onKey = (e: globalThis.KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			const active = document.activeElement;
			// Chỉ trả focus khi nó đang ở trong menu / nút mở (hoặc đã mất về body)
			const mine =
				!active ||
				active === document.body ||
				wrapRef.current?.contains(active);
			close(Boolean(mine));
		};
		document.addEventListener('mousedown', onDown);
		window.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDown);
			window.removeEventListener('keydown', onKey);
		};
	}, [open, close]);

	const onMenuKeyDown = (e: KeyboardEvent<HTMLElement>) => {
		const list = items();
		if (list.length === 0) return;
		const i = list.indexOf(document.activeElement as HTMLElement);
		let next: number | null = null;
		if (e.key === 'ArrowDown') next = (i + 1) % list.length;
		else if (e.key === 'ArrowUp') next = (i <= 0 ? list.length : i) - 1;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = list.length - 1;
		else if (e.key === 'Tab') {
			// Không chặn Tab: focus về nút mở rồi trình duyệt tự đi tiếp từ đó
			close(true);
			return;
		}
		if (next === null) return;
		e.preventDefault();
		list[next].focus();
	};

	/** Nút mở: ↓ mở menu (focus mục đầu nhờ effect ở trên). */
	const onTriggerKeyDown = (e: KeyboardEvent<HTMLElement>) => {
		if (e.key === 'ArrowDown' && !open) {
			e.preventDefault();
			setOpen(true);
		}
	};

	return {
		open,
		toggle,
		close,
		wrapRef,
		triggerRef,
		menuRef,
		onMenuKeyDown,
		onTriggerKeyDown,
	};
}
