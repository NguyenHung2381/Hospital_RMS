import { useCallback, useSyncExternalStore } from 'react';

// Lựa chọn "Ký số" dùng chung giữa các khối cùng màn hình (vd thanh giấy tờ thực hành và nút
// "Phiếu nhận xét" từng vòng). Chỉ giữ trong bộ nhớ của tab — tải lại trang là tắt, để không ai
// vô tình ký hàng loạt từ một lựa chọn cũ.
const values = new Map<string, boolean>();
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
	listeners.add(fn);
	return () => listeners.delete(fn);
};

/** [đang bật, đặt lại] cho 1 khóa lựa chọn, vd 'practice-documents'. */
export function useSignPreference(key: string): [boolean, (v: boolean) => void] {
	const value = useSyncExternalStore(subscribe, () => values.get(key) ?? false);
	const set = useCallback(
		(v: boolean) => {
			values.set(key, v);
			listeners.forEach((fn) => fn());
		},
		[key],
	);
	return [value, set];
}
