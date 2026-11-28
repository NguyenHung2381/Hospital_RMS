// Phương thức điểm danh được phép (backend utils/attendanceMethods.js). Dùng được khi bật ở CẢ
// Cấu hình hệ thống (công tắc từng phương thức) LẪN loại hình (loại hình đào tạo / loại hội nghị).
// Điểm danh tay của giảng viên / ban tổ chức luôn được phép.
import type { AttendanceMode } from './attendanceMode';

export type TrainingMethod = 'qr' | 'app' | 'device';
export type SeminarMethod = 'qr' | 'ticket' | 'device';

export const TRAINING_METHOD_ORDER: TrainingMethod[] = ['qr', 'app', 'device'];
export const SEMINAR_METHOD_ORDER: SeminarMethod[] = ['qr', 'ticket', 'device'];

/** Khóa công tắc toàn hệ thống (system_settings) của từng phương thức */
export const TRAINING_METHOD_KEY: Record<TrainingMethod, string> = {
	qr: 'ATTENDANCE_METHOD_QR',
	app: 'ATTENDANCE_METHOD_APP',
	device: 'ATTENDANCE_METHOD_DEVICE',
};
export const SEMINAR_METHOD_KEY: Record<SeminarMethod, string> = {
	qr: 'SEMINAR_CHECKIN_QR',
	ticket: 'SEMINAR_CHECKIN_TICKET',
	device: 'SEMINAR_CHECKIN_DEVICE',
};

export const TRAINING_METHOD: Record<
	TrainingMethod,
	{ label: string; short: string; hint: string; modes: AttendanceMode[] }
> = {
	qr: {
		label: 'Quét mã QR buổi học',
		short: 'QR',
		hint: 'Giảng viên chiếu mã QR, học viên quét bằng tài khoản của mình (kèm kiểm tra mạng + vị trí bệnh viện).',
		modes: ['session', 'both'],
	},
	app: {
		label: 'Bấm vào / ra trên ứng dụng',
		short: 'Ứng dụng',
		hint: 'Học viên tự bấm điểm danh vào / ra ca ở mục Điểm danh (kèm kiểm tra mạng + vị trí bệnh viện).',
		modes: ['shift', 'both'],
	},
	device: {
		label: 'Máy chấm công vân tay',
		short: 'Vân tay',
		hint: 'Lượt chấm ở máy tự ghép vào buổi học và vào / ra ca.',
		modes: ['session', 'shift', 'both'],
	},
};

export const SEMINAR_METHOD: Record<SeminarMethod, { label: string; short: string; hint: string }> = {
	qr: {
		label: 'Quét mã QR tại hội trường',
		short: 'QR hội trường',
		hint: 'Ban tổ chức chiếu mã QR, người tham dự (có tài khoản, đã trong danh sách) tự quét.',
	},
	ticket: {
		label: 'Quét vé cá nhân',
		short: 'Quét vé',
		hint: 'Ban tổ chức quét vé QR của người đã đăng ký tham dự.',
	},
	device: {
		label: 'Máy chấm công vân tay',
		short: 'Vân tay',
		hint: 'Người tham dự chấm vân tay ở máy dành cho hội nghị (PIN trên máy = mã nhân viên, học viên = mã HV bỏ chữ HV).',
	},
};

/** Nhãn cách điểm danh của 1 người tham dự (seminar_participants.checkin_method) */
export const SEMINAR_CHECKIN_LABEL: Record<SeminarMethod, string> = {
	qr: 'tự quét QR hội trường',
	ticket: 'quét vé',
	device: 'máy chấm công vân tay',
};

/** Phương thức đang dùng được (đã kết hợp hệ thống × loại hình) — backend trả về */
export type TrainingMethods = Record<TrainingMethod, boolean> & { manual: true };
export type SeminarMethods = Record<SeminarMethod, boolean> & { manual: true };

/** Giá trị cột training_types.attendance_methods → danh sách; null = theo hệ thống (tất cả) */
export const parseMethodList = (raw: string | null | undefined): TrainingMethod[] | null => {
	if (raw === null || raw === undefined) return null;
	const set = new Set(raw.split(',').map((s) => s.trim()));
	return TRAINING_METHOD_ORDER.filter((m) => set.has(m));
};

/** Nhãn ngắn liệt kê phương thức của loại hình — 'Mọi phương thức' khi theo hệ thống */
export const methodListLabel = (raw: string | null | undefined) => {
	const list = parseMethodList(raw);
	if (list === null) return 'Mọi phương thức';
	if (!list.length) return 'Chỉ điểm danh tay';
	return list.map((m) => TRAINING_METHOD[m].short).join(', ');
};
