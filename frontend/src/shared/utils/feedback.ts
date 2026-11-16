/**
 * Kho trạng thái phản hồi toàn cục (không phụ thuộc React) — apiClient ghi vào,
 * <GlobalFeedback /> đọc ra qua useSyncExternalStore:
 *   - số request đang chạy (đọc / ghi) → thanh tiến trình trên cùng + lớp phủ "Đang lưu"
 *   - hàng đợi thông báo (toast) → notify.success / notify.error dùng được ở bất kỳ đâu
 */

export type RequestKind = 'read' | 'write';

export interface ToastAction {
	label: string;
	onClick: () => void;
}

export interface ToastItem {
	id: number;
	type: 'success' | 'error' | 'info';
	msg: string;
	/** Nút trong toast (vd "Hoàn tác") — toast có nút ở lại lâu hơn để kịp bấm. */
	action?: ToastAction;
}

export interface FeedbackState {
	reads: number;
	writes: number;
	toasts: ToastItem[];
}

let state: FeedbackState = { reads: 0, writes: 0, toasts: [] };
const listeners = new Set<() => void>();

function setState(patch: Partial<FeedbackState>) {
	state = { ...state, ...patch };
	listeners.forEach((l) => l());
}

export const feedbackStore = {
	getSnapshot: () => state,
	subscribe(listener: () => void) {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},
};

/** Bọc một request để GlobalFeedback biết đang có tác vụ chạy. */
export async function trackRequest<T>(kind: RequestKind, run: () => Promise<T>): Promise<T> {
	const key = kind === 'read' ? 'reads' : 'writes';
	setState({ [key]: state[key] + 1 });
	try {
		return await run();
	} finally {
		setState({ [key]: Math.max(0, state[key] - 1) });
	}
}

let nextToastId = 1;
const TOAST_MS = 3200;
const TOAST_ACTION_MS = 7000;

function push(type: ToastItem['type'], msg: string, action?: ToastAction) {
	const id = nextToastId++;
	// Giới hạn 4 toast cùng lúc — thao tác hàng loạt không được phủ kín màn hình
	setState({ toasts: [...state.toasts.slice(-3), { id, type, msg, action }] });
	setTimeout(() => dismissToast(id), action ? TOAST_ACTION_MS : TOAST_MS);
}

export function dismissToast(id: number) {
	if (!state.toasts.some((t) => t.id === id)) return;
	setState({ toasts: state.toasts.filter((t) => t.id !== id) });
}

export const notify = {
	success: (msg: string) => push('success', msg),
	error: (msg: string) => push('error', msg),
	info: (msg: string) => push('info', msg),
};

/** Dạng (loại, nội dung) — tiện khi loại toast tính động, vd `showToast(failed ? 'error' : 'success', msg)`. */
export const showToast = (type: ToastItem['type'], msg: string, action?: ToastAction) =>
	push(type, msg, action);
