/** suspended: hệ thống tạm khoá vì 1 số serial gửi từ 2 nơi (nghi máy giả) — quản trị mở lại */
export type DeviceStatus = 'pending' | 'active' | 'disabled' | 'suspended';

export interface AttendanceDevice {
	id: number;
	serial_no: string;
	name: string | null;
	location: string | null;
	status: DeviceStatus;
	name_ascii: boolean;
	push_version: string | null;
	firmware: string | null;
	fp_algorithm: string | null;
	/** UTC ISO */
	last_seen_at: string | null;
	last_ip: string | null;
	/** Số người dùng / vân tay máy tự báo */
	user_count: number | null;
	fp_count: number | null;
	created_at: string;
	/** Số học viên server đã gửi xuống máy */
	synced_users: number;
	pending_commands: number;
	failed_commands: number;
	last_punch_at: string | null;
	/** UTC ISO — lúc bị tạm khoá */
	suspended_at: string | null;
	suspend_reason: string | null;
}

export interface DeviceFormData {
	name: string;
	location: string;
	name_ascii: boolean;
}

export type PunchMatchStatus =
	| 'pending'
	| 'matched'
	| 'no_trainee'
	| 'no_session'
	| 'kept_manual'
	| 'locked';
export type PunchFilter = 'unmatched' | 'matched' | 'skipped' | 'all';

export interface DevicePunch {
	id: number;
	pin: string;
	/** UTC ISO */
	punched_at: string;
	verify_mode: number | null;
	match_status: PunchMatchStatus;
	received_at: string;
	trainee_id: string | null;
	trainee_name: string | null;
	session_id: string | null;
	session_date: string | null;
	start_time: string | null;
	end_time: string | null;
	course_id: string | null;
	course_name: string | null;
	device_id: number;
	device_name: string;
}

export type CommandStatus = 'pending' | 'sent' | 'done' | 'failed' | 'cancelled';

export interface DeviceCommand {
	id: number;
	device_id: number;
	device_name: string;
	kind: 'user_upsert' | 'user_delete' | 'fp_upsert' | 'query_attlog' | 'info' | 'other';
	trainee_id: string | null;
	trainee_name: string | null;
	/** Mô tả lệnh — server không bao giờ trả nguyên văn lệnh (lệnh vân tay chứa mẫu sinh trắc) */
	summary: string;
	status: CommandStatus;
	return_code: number | null;
	attempts: number;
	created_at: string;
	sent_at: string | null;
	done_at: string | null;
	/** Lệnh kéo lại lượt chấm: khoảng ngày (giờ VN) và số lượt hệ thống đã có / mới nhận */
	attlog?: AttlogResult | null;
}

export interface AttlogResult {
	from: string;
	to: string;
	/** Lượt của máy trong khoảng đang có trên hệ thống */
	in_range: number;
	/** Lượt mới nhận từ lúc tạo lệnh (lượt trùng máy gửi lại không tính) */
	received: number;
}

/** Bảng công: mỗi người (mã trên máy) mỗi ngày một dòng — giờ đã là giờ Việt Nam */
export interface TimesheetRow {
	/** YYYY-MM-DD */
	work_date: string;
	pin: string;
	trainee_id: string | null;
	trainee_name: string | null;
	/** HH:MM:SS */
	first_time: string;
	last_time: string;
	span_minutes: number;
	punch_count: number;
	matched_count: number;
	/** "07:31 · 11:30 · 16:45" */
	times: string;
	devices: string;
	courses: string | null;
}

export interface Timesheet {
	rows: TimesheetRow[];
	truncated: boolean;
	summary: { punches: number; people: number; days: number; unknown_pins: number };
}
