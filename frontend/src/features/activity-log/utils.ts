import type { ActivityLog } from './api/activityLogApi';

export const ACTION_OPTIONS: { value: string; label: string }[] = [
	{ value: 'create', label: 'Thêm mới' },
	{ value: 'update', label: 'Cập nhật' },
	{ value: 'delete', label: 'Xoá' },
	{ value: 'execute', label: 'Thực hiện (duyệt, xuất file…)' },
	{ value: 'view', label: 'Xem' },
	{ value: 'login', label: 'Đăng nhập' },
	{ value: 'login_failed', label: 'Đăng nhập thất bại' },
	{ value: 'logout', label: 'Đăng xuất' },
	{ value: 'auth', label: 'Bảo mật tài khoản' },
];

export const STATUS_OPTIONS = [
	{ value: '2xx', label: 'Thành công (2xx)' },
	{ value: 'error', label: 'Mọi lỗi (≥ 400)' },
	{ value: '4xx', label: 'Lỗi phía người dùng (4xx)' },
	{ value: '5xx', label: 'Lỗi hệ thống (5xx)' },
	{ value: '401', label: '401 · Chưa đăng nhập / hết phiên' },
	{ value: '403', label: '403 · Không có quyền' },
	{ value: '404', label: '404 · Không tìm thấy' },
	{ value: '400,422', label: '400 · Dữ liệu không hợp lệ' },
	{ value: '409', label: '409 · Xung đột dữ liệu' },
	{ value: '429', label: '429 · Quá nhiều yêu cầu' },
	{ value: '499', label: '499 · Người dùng huỷ' },
	{ value: '500', label: '500 · Lỗi máy chủ' },
];

export const METHOD_OPTIONS = [
	{ value: 'GET', label: 'GET · Xem' },
	{ value: 'POST', label: 'POST · Tạo / thực hiện' },
	{ value: 'PUT', label: 'PUT · Cập nhật' },
	{ value: 'PATCH', label: 'PATCH · Cập nhật một phần' },
	{ value: 'DELETE', label: 'DELETE · Xoá' },
];

export const DURATION_OPTIONS = [
	{ value: '300', label: '≥ 300 ms' },
	{ value: '1000', label: '≥ 1 giây' },
	{ value: '3000', label: '≥ 3 giây' },
	{ value: '10000', label: '≥ 10 giây' },
];

export const STATUS_TEXT: Record<number, string> = {
	200: 'OK',
	201: 'Đã tạo',
	204: 'Không có nội dung',
	304: 'Không thay đổi',
	400: 'Dữ liệu không hợp lệ',
	401: 'Chưa đăng nhập / hết phiên',
	403: 'Không có quyền',
	404: 'Không tìm thấy',
	409: 'Xung đột dữ liệu',
	413: 'Dữ liệu quá lớn',
	422: 'Không xử lý được',
	429: 'Quá nhiều yêu cầu',
	499: 'Người dùng huỷ giữa chừng',
	500: 'Lỗi máy chủ',
	502: 'Lỗi cổng',
	503: 'Dịch vụ không sẵn sàng',
};

export function formatDuration(ms: number | null | undefined): string {
	if (ms == null) return '—';
	if (ms < 1) return '< 1 ms';
	if (ms < 1000) return `${Math.round(ms)} ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} giây`;
	const totalSec = Math.round(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h) return `${h} giờ ${m} phút`;
	return s ? `${m} phút ${s} giây` : `${m} phút`;
}

/** Mức độ chậm để tô màu cột "Xử lý". */
export function durationLevel(ms: number | null | undefined): 'fast' | 'ok' | 'slow' | 'verySlow' | 'none' {
	if (ms == null) return 'none';
	if (ms < 300) return 'fast';
	if (ms < 1000) return 'ok';
	if (ms < 3000) return 'slow';
	return 'verySlow';
}

export function formatBytes(n: number | null | undefined): string {
	if (n == null) return '—';
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const vnFmt = new Intl.DateTimeFormat('vi-VN', {
	timeZone: 'Asia/Ho_Chi_Minh',
	day: '2-digit',
	month: '2-digit',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false,
});

/** dd/mm/yyyy HH:mm:ss (giờ Việt Nam) */
export function formatDateTimeSec(iso: string | null | undefined): string {
	if (!iso) return '';
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? '' : vnFmt.format(d);
}

export function formatTimeOnly(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleTimeString('vi-VN', {
		timeZone: 'Asia/Ho_Chi_Minh',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	});
}

export function formatDayOnly(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString('vi-VN', {
		timeZone: 'Asia/Ho_Chi_Minh',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	});
}

export interface ParsedUA {
	browser: string;
	os: string;
	device: 'Máy tính' | 'Điện thoại' | 'Máy tính bảng' | 'Công cụ / script';
}

/** Nhận diện trình duyệt / hệ điều hành đủ dùng cho nhật ký (không cần thư viện). */
export function parseUserAgent(ua: string | null | undefined): ParsedUA | null {
	if (!ua) return null;
	const pick = (re: RegExp) => ua.match(re)?.[1];
	let browser = 'Không rõ';
	if (/Edg\//.test(ua)) browser = `Edge ${pick(/Edg\/(\d+)/)}`;
	else if (/OPR\//.test(ua)) browser = `Opera ${pick(/OPR\/(\d+)/)}`;
	else if (/CocCoc/.test(ua)) browser = `Cốc Cốc ${pick(/coc_coc_browser\/(\d+)/i) ?? ''}`.trim();
	else if (/Zalo/i.test(ua)) browser = 'Zalo';
	else if (/Chrome\//.test(ua)) browser = `Chrome ${pick(/Chrome\/(\d+)/)}`;
	else if (/Firefox\//.test(ua)) browser = `Firefox ${pick(/Firefox\/(\d+)/)}`;
	else if (/Safari\//.test(ua)) browser = `Safari ${pick(/Version\/(\d+)/) ?? ''}`.trim();
	else if (/PostmanRuntime/.test(ua)) browser = 'Postman';
	else if (/curl\//.test(ua)) browser = 'curl';
	else if (/axios|node-fetch|python-requests|okhttp/i.test(ua)) browser = ua.split(' ')[0];

	let os = 'Không rõ';
	if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
	else if (/Windows NT/.test(ua)) os = 'Windows';
	else if (/Android/.test(ua)) os = `Android ${pick(/Android (\d+)/) ?? ''}`.trim();
	else if (/iPhone|iPad|iPod/.test(ua)) os = `iOS ${pick(/OS (\d+)_/) ?? ''}`.trim();
	else if (/Mac OS X/.test(ua)) os = 'macOS';
	else if (/Linux/.test(ua)) os = 'Linux';

	const device: ParsedUA['device'] = /iPad|Tablet/.test(ua)
		? 'Máy tính bảng'
		: /Mobi|iPhone|Android/.test(ua)
			? 'Điện thoại'
			: /Mozilla/.test(ua)
				? 'Máy tính'
				: 'Công cụ / script';
	return { browser, os, device };
}

export const IP_KIND_LABEL: Record<ActivityLog['ip_kind'], string> = {
	public: 'IP công khai',
	private: 'IP mạng nội bộ',
	loopback: 'Chính máy chủ',
	unknown: 'Không rõ',
};

export function actorDisplay(r: {
	actor_name: string | null;
	actor_username: string | null;
	actor_id: string | null;
}) {
	return r.actor_name || r.actor_username || r.actor_id || 'Chưa đăng nhập';
}

export function prettyJson(raw: string | null): string | null {
	if (!raw) return null;
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw; // body bị cắt ngắn → không parse được, hiển thị nguyên văn
	}
}

export function queryParams(path: string): [string, string][] {
	const qs = path.split('?')[1];
	if (!qs) return [];
	return [...new URLSearchParams(qs).entries()];
}

/** Xuất danh sách đang hiển thị ra CSV (mở được bằng Excel, giữ tiếng Việt). */
export function exportCsv(rows: ActivityLog[]) {
	const header = [
		'Thời gian',
		'Mã người dùng',
		'Tài khoản',
		'Họ tên',
		'Hành động',
		'Mô tả',
		'Phân hệ',
		'Phương thức',
		'Đường dẫn',
		'Trạng thái',
		'Thời gian xử lý (ms)',
		'IP',
		'Trình duyệt',
		'Hệ điều hành',
		'Lỗi',
		'Dữ liệu gửi lên',
	];
	const esc = (v: unknown) => {
		const s = v == null ? '' : String(v);
		return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	const lines = rows.map((r) => {
		const ua = parseUserAgent(r.user_agent);
		return [
			formatDateTimeSec(r.created_at),
			r.actor_id,
			r.actor_username,
			r.actor_name,
			r.action_label,
			r.summary,
			r.module_label,
			r.method,
			r.path,
			r.status_code,
			r.duration_ms,
			r.ip_address,
			ua?.browser,
			ua?.os,
			r.error,
			r.body,
		]
			.map(esc)
			.join(',');
	});
	const blob = new Blob(['\uFEFF' + [header.join(','), ...lines].join('\r\n')], {
		type: 'text/csv;charset=utf-8',
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `nhat-ky-hoat-dong-${new Date().toISOString().slice(0, 10)}.csv`;
	a.click();
	URL.revokeObjectURL(url);
}
