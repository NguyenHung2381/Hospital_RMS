// Kiểu chấm công của khóa học — đặt ở loại hình đào tạo, khóa học được ghi đè
// (backend utils/attendanceMode.js)
export type AttendanceMode = 'session' | 'shift' | 'both' | 'none';

export const ATTENDANCE_MODE_ORDER: AttendanceMode[] = ['session', 'shift', 'both', 'none'];

export const ATTENDANCE_MODE: Record<AttendanceMode, { label: string; short: string; hint: string }> = {
	session: {
		label: 'Theo buổi học',
		short: 'Buổi học',
		hint: 'Học viên quét QR hoặc chấm vân tay vào từng buổi học. Không có ca.',
	},
	shift: {
		label: 'Theo ca',
		short: 'Ca',
		hint: 'Giờ vào / ra theo mẫu ca tuần. Buổi học không nhận QR / vân tay (giảng viên vẫn điểm danh tay được).',
	},
	both: {
		label: 'Cả buổi học và ca',
		short: 'Buổi học + ca',
		hint: 'Điểm danh từng buổi học và chấm công vào / ra theo ca.',
	},
	none: {
		label: 'Không chấm công',
		short: 'Không chấm',
		hint: 'Dành cho e-learning, trực tuyến — không điểm danh buổi học, không có ca.',
	},
};

/** Nhãn kiểu chấm công; giá trị lạ / thiếu ⇒ như mặc định (cả hai) */
export const attendanceModeLabel = (mode: string | null | undefined) =>
	ATTENDANCE_MODE[(mode as AttendanceMode) ?? 'both']?.label ?? ATTENDANCE_MODE.both.label;
