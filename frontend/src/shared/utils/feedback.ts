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

/** Tiến trình gửi file (cộng dồn mọi lượt upload đang chạy) — null = không có lượt nào. */
export interface UploadProgress {
	loaded: number;
	total: number;
}

export interface FeedbackState {
	reads: number;
	writes: number;
	toasts: ToastItem[];
	upload: UploadProgress | null;
}

let state: FeedbackState = { reads: 0, writes: 0, toasts: [], upload: null };
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

// ─── Tiến trình upload ───────────────────────────────────────────────────────
const uploads = new Map<number, { loaded: number; total: number; abort: () => void }>();
let nextUploadId = 1;

function publishUploads() {
	let loaded = 0;
	let total = 0;
	for (const u of uploads.values()) {
		loaded += u.loaded;
		total += u.total;
	}
	const next = uploads.size ? { loaded, total } : null;
	const prev = state.upload;
	// Sự kiện progress bắn rất dày — chỉ báo cho giao diện khi phần trăm đổi
	const pct = (p: UploadProgress | null) => (p && p.total ? Math.floor((p.loaded / p.total) * 100) : -1);
	if (!!prev === !!next && pct(prev) === pct(next) && prev?.total === next?.total) return;
	setState({ upload: next });
}

/**
 * Đăng ký một lượt gửi file để GlobalFeedback hiện phần trăm thật + nút Hủy.
 * `signal` bị hủy khi người dùng bấm Hủy; gọi `done()` khi request kết thúc.
 */
export function beginUpload() {
	const id = nextUploadId++;
	const controller = new AbortController();
	uploads.set(id, { loaded: 0, total: 0, abort: () => controller.abort() });
	publishUploads();
	return {
		signal: controller.signal,
		progress(loaded: number, total: number) {
			const u = uploads.get(id);
			if (!u) return;
			u.loaded = loaded;
			u.total = total;
			publishUploads();
		},
		done() {
			uploads.delete(id);
			publishUploads();
		},
	};
}

/** Người dùng bấm "Hủy" trên lớp phủ — dừng mọi lượt gửi file đang chạy. */
export function cancelUploads() {
	for (const u of uploads.values()) u.abort();
}

let nextToastId = 1;
const TOAST_MS = 3200;
const TOAST_ACTION_MS = 7000;

/**
 * Toast lỗi KHÔNG tự tắt — ở lại tới khi người dùng bấm đóng (người đọc chậm / dùng
 * trình đọc màn hình kịp đọc; WCAG 2.2.1). Không tồn đọng vì: tối đa 4 toast cùng lúc
 * (toast cũ nhất bị đẩy ra) và lỗi trùng nội dung chỉ giữ một bản.
 * Toast thành công / thông tin tự tắt sau 3,2 giây, có nút thì 7 giây.
 */
function push(type: ToastItem['type'], msg: string, action?: ToastAction) {
	const id = nextToastId++;
	// Lỗi trùng nội dung (vd nhiều request cùng hỏng) — bỏ bản cũ, giữ bản mới nhất
	const rest =
		type === 'error' ? state.toasts.filter((t) => !(t.type === 'error' && t.msg === msg)) : state.toasts;
	// Giới hạn 4 toast cùng lúc — thao tác hàng loạt không được phủ kín màn hình
	setState({ toasts: [...rest.slice(-3), { id, type, msg, action }] });
	if (type === 'error') return;
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
