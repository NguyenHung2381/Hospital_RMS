import { apiClient } from '../../../shared/api/axios';
import { seg } from '../../../shared/api/path';

export interface SettingRow {
	setting_key: string;
	value: string | null;
	has_value: boolean;
	/** Giá trị đang áp dụng (UI hoặc .env); không có với secret. */
	effective?: string | null;
}

/** Trạng thái tự kiểm tra file hồ sơ đăng ký khóa ĐTLT (GET /system-settings/doc-check) */
export interface DocCheckStatus {
	/** Công tắc TRAINING_REGISTRATION_DOC_CHECK đang bật */
	enabled: boolean;
	/** DOC_CHECK_ENABLED=false trong .env — vòng xử lý không chạy dù bật công tắc */
	worker_disabled: boolean;
	/** Máy chủ có Tesseract (gói tiếng Việt) */
	ocr: boolean;
	queue: {
		pending: number;
		running: number;
		done: number;
		error: number;
		skipped: number;
		skipped_ocr: number;
		mismatch: number;
		/** Việc chờ lâu nhất đã chờ bao nhiêu phút (null = không có việc chờ) */
		oldest_pending_min: number | null;
		last_checked_min: number | null;
	};
}

export const settingsApi = {
	list: () => apiClient.get<SettingRow[]>('/system-settings'),
	update: (key: string, value: string) => apiClient.put<SettingRow>(`/system-settings/${seg(key)}`, { value }),
	testMail: (to: string) => apiClient.post<null>('/system-settings/test-mail', { to }),
	testClamav: () => apiClient.post<{ host: string; port: number; version: string | null }>('/system-settings/test-clamav', {}),
	docCheckStatus: () => apiClient.get<DocCheckStatus>('/system-settings/doc-check'),
	retryDocCheck: () => apiClient.post<{ requeued: number }>('/system-settings/doc-check/retry', {}),
};
