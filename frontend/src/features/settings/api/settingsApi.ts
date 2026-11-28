import { apiClient } from '../../../shared/api/axios';
import { seg } from '../../../shared/api/path';

export interface SettingRow {
	setting_key: string;
	value: string | null;
	has_value: boolean;
	/** Giá trị đang áp dụng (UI hoặc .env); không có với secret. */
	effective?: string | null;
}

/** Loại giấy tờ cấu hình được kiểm chữ ký (backend signatureRules.CONFIG_KINDS) */
export type SignatureKind = 'decision' | 'proposal_approved' | 'license' | 'degree' | 'trainee_document';

/** Cấu hình kiểm chữ ký của 1 loại giấy tờ */
export interface SignatureKindConfig {
	/** Kiểm chữ ký loại này */
	enabled: boolean;
	/** Xác thực chữ ký số (PDF) */
	digital: boolean;
	/** Dò dấu đỏ */
	seal: boolean;
	/** Dò chữ ký tay */
	hand: boolean;
	/** Thiếu dấu / chữ ký thì: cảnh báo, hay chỉ ghi chú mờ */
	on_missing: 'warn' | 'info';
}

/** Cấu hình chi tiết TRAINING_DOC_SIGNATURE_RULES (backend trả bản đã chuẩn hoá, đủ mọi trường) */
export interface SignatureRules {
	kinds: Record<SignatureKind, SignatureKindConfig>;
	options: {
		/** Cảnh báo chữ ký số do CA ngoài danh sách tin cậy cấp */
		warn_untrusted: boolean;
		/** So tổ chức người ký với đơn vị công tác đã khai */
		org_match: boolean;
		/** Cảnh báo "có hình dấu nhưng không có chữ ký số" */
		reprint_warning: boolean;
		/** Dùng OCR tìm dòng chức danh người ký */
		ocr: boolean;
	};
}

/** Trạng thái tự kiểm tra file hồ sơ đăng ký khóa ĐTLT (GET /system-settings/doc-check) */
export interface DocCheckStatus {
	/** Công tắc TRAINING_REGISTRATION_DOC_CHECK đang bật */
	enabled: boolean;
	/** DOC_CHECK_ENABLED=false trong .env — vòng xử lý không chạy dù bật công tắc */
	worker_disabled: boolean;
	/** Máy chủ có Tesseract (gói tiếng Việt) */
	ocr: boolean;
	/** Công tắc TRAINING_DOC_SIGNATURE_CHECK (kiểm chữ ký) đang bật — chỉ chạy khi `enabled` cũng bật */
	signature_enabled: boolean;
	/** Cấu hình chi tiết kiểm chữ ký (đã chuẩn hoá) */
	signature_rules: SignatureRules;
	queue: {
		pending: number;
		running: number;
		done: number;
		error: number;
		skipped: number;
		skipped_ocr: number;
		mismatch: number;
		/** File có chữ ký số không hợp lệ / bị sửa sau khi ký */
		sig_invalid: number;
		/** File thiếu dấu / chữ ký theo yêu cầu của loại giấy tờ */
		sig_missing: number;
		/** Việc chờ lâu nhất đã chờ bao nhiêu phút (null = không có việc chờ) */
		oldest_pending_min: number | null;
		last_checked_min: number | null;
	};
}

/** 1 ngày nghỉ trong bảng xem trước (POST /system-settings/holidays/preview) */
export interface HolidayPreviewItem {
	date: string;
	name: string;
	/** auto = tự tính theo luật; manual = nhập tay */
	source: 'auto' | 'manual';
	compensatory?: boolean;
	/** Bị bỏ bằng "-ngày" ở ô nhập tay */
	removed: boolean;
}

/** Khác biệt giữa lịch đồng bộ (Google) và lịch đang dùng */
export interface HolidaySuggestion {
	date: string;
	/** add = nguồn có nghỉ mà lịch đang dùng thiếu; remove = lịch tự tính có mà nguồn không nghỉ */
	action: 'add' | 'remove';
	name: string;
}

export interface HolidayPreview {
	days: HolidayPreviewItem[];
	/** null = chưa đồng bộ lần nào */
	sync: {
		source: string;
		fetched_at: string | null;
		error: string | null;
		error_at: string | null;
		/** Nguồn có dữ liệu năm đang xem */
		covered: boolean;
		suggestions: HolidaySuggestion[];
	} | null;
}

export const settingsApi = {
	list: () => apiClient.get<SettingRow[]>('/system-settings'),
	update: (key: string, value: string) => apiClient.put<SettingRow>(`/system-settings/${seg(key)}`, { value }),
	/**
	 * Lưu nhiều cấu hình trong một transaction. Có ô sai thì không lưu gì — ApiError.errors
	 * là { KEY: "thông báo lỗi" } để tô đỏ đúng ô.
	 */
	saveMany: (values: Record<string, string>) => apiClient.put<{ saved: number }>('/system-settings', { values }),
	/** Xem trước ngày nghỉ của 1 năm theo giá trị đang nhập (chưa lưu cũng được) */
	previewHolidays: (year: number, auto: boolean, text: string) =>
		apiClient.post<HolidayPreview>('/system-settings/holidays/preview', { year, auto, text }),
	/** Tải lịch ngày lễ ngay — lỗi (không ra Internet…) trả trong `error`, không ném */
	syncHolidays: () =>
		apiClient.post<{ fetched_at: string | null; error: string | null; count: number }>('/system-settings/holidays/sync', {}),
	testMail: (to: string) => apiClient.post<null>('/system-settings/test-mail', { to }),
	testClamav: () => apiClient.post<{ host: string; port: number; version: string | null }>('/system-settings/test-clamav', {}),
	/** token = token reCAPTCHA vừa tích (thử cả cặp khóa); bỏ trống = chỉ thử kết nối tới Google */
	testRecaptcha: (token?: string) =>
		apiClient.post<{ ok: boolean; message: string }>('/system-settings/test-recaptcha', token ? { token } : {}),
	docCheckStatus: () => apiClient.get<DocCheckStatus>('/system-settings/doc-check'),
	/** Không tham số: thử lại file lỗi. 'signature': kiểm lại chữ ký mọi file (sau khi bật thêm mục kiểm). */
	retryDocCheck: (what?: 'signature') =>
		apiClient.post<{ requeued: number }>('/system-settings/doc-check/retry', what ? { what } : {}),
};
