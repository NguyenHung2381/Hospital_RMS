import type { BadgeTone } from '@/shared/components/Badge/badgeTone';
import type {
	AttendanceDevice,
	CommandStatus,
	DevicePurpose,
	DeviceStatus,
	PunchMatchStatus,
} from '../types/attendanceDevice.type';

type Label = { label: string; tone: BadgeTone };

export const DEVICE_STATUS: Record<DeviceStatus, Label> = {
	active: { label: 'Đang hoạt động', tone: 'green' },
	// Máy lạ chờ quản trị duyệt = việc đang chờ bạn xử lý (magenta)
	pending: { label: 'Chờ duyệt', tone: 'pink' },
	disabled: { label: 'Đã tắt', tone: 'gray' },
	// Nghi giả số serial — quản trị phải kiểm tra rồi mở lại (magenta = chờ bạn xử lý)
	suspended: { label: 'Tạm khoá', tone: 'pink' },
};

export const PUNCH_STATUS: Record<PunchMatchStatus, Label & { hint?: string }> = {
	matched: { label: 'Đã ghép', tone: 'green' },
	pending: { label: 'Chờ ghép', tone: 'gray' },
	no_trainee: {
		label: 'Không khớp học viên',
		tone: 'amber',
		hint: 'Mã trên máy không phải mã học viên (HV + 8 số bỏ chữ HV)',
	},
	no_session: {
		label: 'Không có buổi học',
		tone: 'amber',
		hint: 'Giờ chấm không rơi vào buổi học nào của học viên trong ngày',
	},
	kept_manual: {
		label: 'Giữ điểm danh tay',
		tone: 'gray',
		hint: 'Giảng viên đã điểm danh tay buổi này — không ghi đè',
	},
	locked: { label: 'Điểm đã khóa', tone: 'gray', hint: 'Điểm khóa học đã khóa — không sửa điểm danh' },
	not_training: {
		label: 'Không tính cho đào tạo',
		tone: 'gray',
		hint: 'Máy chỉ dành cho hội nghị (hoặc phương thức máy chấm công đang tắt) — lượt chấm không tính vào buổi học / ca, và không có hội nghị nào của người này đang diễn ra',
	},
};

export const DEVICE_PURPOSE: Record<DevicePurpose, Label & { hint: string }> = {
	training: {
		label: 'Học viên',
		tone: 'blue',
		hint: 'Nhận danh sách học viên và vân tay; lượt chấm tính vào buổi học và điểm danh theo ca',
	},
	seminar: {
		label: 'Hội nghị',
		tone: 'gray',
		hint: 'Không nhận học viên; học viên đã gửi xuống máy sẽ được gỡ. Lượt chấm ghép vào người tham dự hội nghị đang diễn ra (PIN = mã nhân viên / mã học viên), không tính vào buổi học / ca',
	},
	both: {
		label: 'Học viên + hội nghị',
		tone: 'blue',
		hint: 'Như máy chấm công học viên, đồng thời ghép lượt chấm vào người tham dự hội nghị đang diễn ra',
	},
};
export const PURPOSE_ORDER: DevicePurpose[] = ['training', 'both', 'seminar'];

export const COMMAND_STATUS: Record<CommandStatus, Label> = {
	pending: { label: 'Chờ gửi', tone: 'blue' },
	sent: { label: 'Đã gửi, chờ máy báo', tone: 'blue' },
	done: { label: 'Xong', tone: 'green' },
	failed: { label: 'Lỗi', tone: 'red' },
	cancelled: { label: 'Đã hủy', tone: 'gray' },
};

/** Máy hỏi lệnh ~10–30 giây/lần: quá 2 phút không thấy là mất kết nối */
export const ONLINE_MS = 2 * 60 * 1000;
export const isOnline = (d: AttendanceDevice) =>
	!!d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < ONLINE_MS;

export const deviceLabel = (d: AttendanceDevice) => d.name || `Máy ${d.serial_no}`;

/** Mở trang Bảng công đúng khoảng ngày (và máy) */
export const timesheetHref = (from: string, to: string, deviceId?: number) =>
	`/admin/attendance-timesheet?${new URLSearchParams({
		from,
		to,
		...(deviceId ? { device: String(deviceId) } : {}),
	})}`;
