/**
 * API dạng lệnh thay `window.confirm` / `window.alert` / `window.prompt` — đổi nơi gọi ít nhất:
 *
 *   if (!confirm('Xóa bản ghi này?')) return;
 *   →  if (!(await confirmDialog({ title: 'Xóa bản ghi này?', tone: 'danger', confirmLabel: 'Xóa' }))) return;
 *
 *   alert('Đã gửi');                     →  await alertDialog({ title: 'Đã gửi' });
 *   const r = prompt('Lý do từ chối');   →  const r = await promptDialog({ title: 'Từ chối', label: 'Lý do', required: true, multiline: true });
 *
 * Hộp thoại hiện qua <DialogHost /> gắn một lần ở AppProviders (như GlobalFeedback với
 * feedbackStore). Gọi nhiều lần liền nhau thì xếp hàng, hiện lần lượt. Chưa có host
 * (vd chạy test không render AppProviders) thì rơi về hộp thoại gốc của trình duyệt.
 *
 * Kho trạng thái không phụ thuộc React — gọi được ở bất kỳ đâu (handler, service…).
 */
import type { ReactNode } from 'react';

interface DialogBaseOptions {
	title: ReactNode;
	/** Đoạn giải thích; chuỗi thường hiện thành đoạn mô tả. */
	message?: ReactNode;
	/** 'danger' cho hành động khó hoàn tác: nút đỏ, focus mặc định ở "Hủy". */
	tone?: 'default' | 'danger';
	confirmLabel?: ReactNode;
	cancelLabel?: ReactNode;
	icon?: ReactNode;
}

export interface ConfirmDialogOptions extends DialogBaseOptions {
	/**
	 * Tác vụ chạy ngay trong hộp thoại khi bấm xác nhận: hộp thoại hiện đang xử lý,
	 * reject thì hiện lỗi và giữ hộp thoại mở để thử lại; xong thì đóng và trả `true`.
	 */
	onConfirm?: () => void | Promise<unknown>;
}

export interface AlertDialogOptions {
	title: ReactNode;
	message?: ReactNode;
	tone?: 'default' | 'danger';
	/** Mặc định "Đã hiểu". */
	okLabel?: ReactNode;
	icon?: ReactNode;
}

export interface PromptDialogOptions extends DialogBaseOptions {
	/** Nhãn ô nhập (bắt buộc — ô nhập luôn có tên truy cập). */
	label: ReactNode;
	defaultValue?: string;
	placeholder?: string;
	multiline?: boolean;
	required?: boolean;
	requiredMessage?: string;
	maxLength?: number;
	validate?: (value: string) => string | undefined | null;
	/** Tác vụ chạy ngay trong hộp thoại với giá trị đã nhập (như ConfirmDialogOptions.onConfirm). */
	onConfirm?: (value: string) => void | Promise<unknown>;
}

export type DialogRequest =
	| { id: number; kind: 'confirm'; options: ConfirmDialogOptions; resolve: (ok: boolean) => void }
	| { id: number; kind: 'alert'; options: AlertDialogOptions; resolve: () => void }
	| { id: number; kind: 'prompt'; options: PromptDialogOptions; resolve: (value: string | null) => void };

type DialogRequestInput =
	| Omit<Extract<DialogRequest, { kind: 'confirm' }>, 'id'>
	| Omit<Extract<DialogRequest, { kind: 'alert' }>, 'id'>
	| Omit<Extract<DialogRequest, { kind: 'prompt' }>, 'id'>;

let queue: DialogRequest[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
/** Số host đang gắn — 0 thì rơi về window.confirm/prompt/alert. */
let hostCount = 0;

function emit() {
	listeners.forEach((l) => l());
}

export const dialogStore = {
	getSnapshot: () => queue,
	subscribe(listener: () => void) {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},
	/** Host gọi khi gắn / gỡ (trong effect). */
	registerHost() {
		hostCount++;
		return () => {
			hostCount--;
		};
	},
	/** Host gọi khi người dùng trả lời hộp thoại `id`. */
	settle(id: number) {
		queue = queue.filter((r) => r.id !== id);
		emit();
	},
};

function enqueue(request: DialogRequestInput) {
	queue = [...queue, { ...request, id: nextId++ } as DialogRequest];
	emit();
}

/** Chuỗi thuần dùng cho hộp thoại gốc của trình duyệt khi chưa có host. */
const plain = (node: ReactNode) =>
	typeof node === 'string' || typeof node === 'number' ? String(node) : '';

async function runFallbackAction<T extends unknown[]>(
	action: ((...args: T) => void | Promise<unknown>) | undefined,
	...args: T
) {
	if (action) await action(...args);
}

/**
 * Hỏi xác nhận. Trả `true` khi bấm xác nhận (và `onConfirm`, nếu có, chạy xong), `false` khi hủy / Esc.
 * Truyền chuỗi = chỉ có tiêu đề.
 *
 *   if (!(await confirmDialog({ title: 'Xóa 3 câu hỏi?', tone: 'danger', confirmLabel: 'Xóa' }))) return;
 */
export function confirmDialog(options: ConfirmDialogOptions | string): Promise<boolean> {
	const opts = typeof options === 'string' ? { title: options } : options;
	if (hostCount === 0) {
		const text = [plain(opts.title), plain(opts.message)].filter(Boolean).join('\n\n');
		if (!window.confirm(text)) return Promise.resolve(false);
		return runFallbackAction(opts.onConfirm).then(() => true);
	}
	return new Promise((resolve) => enqueue({ kind: 'confirm', options: opts, resolve }));
}

/**
 * Thông báo cần người dùng đọc rồi bấm "Đã hiểu" (thay `window.alert`).
 * Thông báo thường (lưu thành công, lỗi mạng…) nên dùng `notify` (toast) thay vì hộp thoại.
 *
 *   await alertDialog({ title: 'Không thể nộp bài', message: 'Đã hết thời gian làm bài.' });
 */
export function alertDialog(options: AlertDialogOptions | string): Promise<void> {
	const opts = typeof options === 'string' ? { title: options } : options;
	if (hostCount === 0) {
		window.alert([plain(opts.title), plain(opts.message)].filter(Boolean).join('\n\n'));
		return Promise.resolve();
	}
	return new Promise((resolve) => enqueue({ kind: 'alert', options: opts, resolve }));
}

/**
 * Hỏi một giá trị. Trả chuỗi đã nhập (giữ nguyên, không trim) hoặc `null` khi hủy — giống `window.prompt`.
 *
 *   const reason = await promptDialog({ title: 'Từ chối đơn', label: 'Lý do từ chối', required: true, multiline: true });
 *   if (reason === null) return;
 */
export function promptDialog(options: PromptDialogOptions): Promise<string | null> {
	if (hostCount === 0) {
		const text = [plain(options.title), plain(options.label)].filter(Boolean).join('\n\n');
		const value = window.prompt(text, options.defaultValue ?? '');
		if (value === null) return Promise.resolve(null);
		return runFallbackAction(options.onConfirm, value).then(() => value);
	}
	return new Promise((resolve) => enqueue({ kind: 'prompt', options, resolve }));
}
