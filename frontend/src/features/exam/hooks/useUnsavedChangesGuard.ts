import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

/** Chặn rời trang khi còn thay đổi chưa lưu:
 *  - đổi route trong app ⇒ trả về `blocker` (state 'blocked') để trang tự hiện hộp thoại xác nhận;
 *  - đóng tab / tải lại ⇒ hộp thoại mặc định của trình duyệt (beforeunload).
 *  `allowNextNavigation()` gọi ngay trước `navigate()` sau khi lưu xong (state `dirty` chưa kịp cập nhật). */
export function useUnsavedChangesGuard(dirty: boolean) {
	const dirtyRef = useRef(dirty);
	const bypassRef = useRef(false);
	useEffect(() => {
		dirtyRef.current = dirty;
		if (!dirty) bypassRef.current = false;
	}, [dirty]);

	const blocker = useBlocker(
		({ currentLocation, nextLocation }) =>
			!bypassRef.current && dirtyRef.current && currentLocation.pathname !== nextLocation.pathname,
	);

	useEffect(() => {
		if (!dirty) return;
		const warn = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = '';
		};
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	}, [dirty]);

	const allowNextNavigation = useCallback(() => {
		bypassRef.current = true;
	}, []);

	return { blocker, allowNextNavigation };
}
