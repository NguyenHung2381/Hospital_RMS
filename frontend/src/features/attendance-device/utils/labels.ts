import type { BadgeTone } from '@/shared/components/Badge/badgeTone';
import type {
	AttendanceDevice,
	CommandStatus,
	DeviceStatus,
	PunchMatchStatus,
} from '../types/attendanceDevice.type';

type Label = { label: string; tone: BadgeTone };

export const DEVICE_STATUS: Record<DeviceStatus, Label> = {
	active: { label: 'Đang hoạt động', tone: 'green' },
	// Máy lạ chờ quản trị duyệt = việc đang chờ bạn xử lý (magenta)
	pending: { label: 'Chờ duyệt', tone: 'pink' },
	disabled: { label: 'Đã tắt', tone: 'gray' },
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
};

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
