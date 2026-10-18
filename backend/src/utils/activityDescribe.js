// Diễn giải 1 dòng activity log (method + path) thành ngôn ngữ nghiệp vụ để
// trang /activity-logs hiển thị "Thêm mới · Đề tài nghiên cứu #12" thay vì
// "POST /api/v1/topics". Dùng chung cho cả việc LỌC (theo module/hành động)
// lẫn HIỂN THỊ nên đặt ở backend.

const MODULE_LABELS = {
	auth: 'Xác thực',
	users: 'Người dùng',
	topics: 'Đề tài nghiên cứu',
	councils: 'Hội đồng chấm',
	files: 'Tệp tin',
	dashboard: 'Tổng quan',
	notifications: 'Thông báo',
	events: 'Lịch trình',
	'activity-logs': 'Nhật ký hoạt động',
	'security-events': 'Sự kiện bảo mật',
	seminars: 'Hội thảo & Hội nghị',
	'cme-records': 'Sổ cấp CME',
	trainees: 'Học viên',
	'training-programs': 'Chương trình đào tạo',
	'training-plans': 'Kế hoạch đào tạo',
	surveys: 'Khảo sát',
	'my-tasks': 'Việc của tôi',
	exams: 'Bài thi',
	workflows: 'Workflow duyệt',
	lecturers: 'Giảng viên',
	courses: 'Khóa học',
	'staff-licenses': 'Chứng chỉ hành nghề',
	'system-settings': 'Cài đặt hệ thống',
	persons: 'Hồ sơ nhân sự',
	public: 'Trang công khai',
	departments: 'Khoa / Phòng ban',
	roles: 'Vai trò & Quyền',
	permissions: 'Quyền',
	categories: 'Phân loại đề tài',
	levels: 'Cấp độ đề tài',
	'round-types': 'Loại đợt',
	'research-rounds': 'Đợt nghiên cứu',
	venues: 'Địa điểm / Phòng họp',
	'external-reviewers': 'Người ngoài viện',
	'job-titles': 'Chức danh',
	'cme-credit-categories': 'Danh mục tín chỉ CME',
};

const ACTION_LABELS = {
	login: 'Đăng nhập',
	login_failed: 'Đăng nhập thất bại',
	logout: 'Đăng xuất',
	auth: 'Xác thực',
	view: 'Xem',
	create: 'Thêm mới',
	update: 'Cập nhật',
	delete: 'Xoá',
	execute: 'Thực hiện',
};

// "::ffff:172.18.0.1" (IPv4 nhúng trong IPv6 do Node lắng nghe dual-stack) → "172.18.0.1".
const normalizeIp = (ip) => {
	if (!ip) return null;
	const s = String(ip).trim();
	const m = s.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
	if (m) return m[1];
	if (s === '::1') return '127.0.0.1';
	return s;
};

// Phân loại IP để người xem biết đó là máy thật hay chỉ là gateway/proxy nội bộ.
const ipKind = (ip) => {
	if (!ip) return 'unknown';
	if (/^127\./.test(ip) || ip === '::1') return 'loopback';
	if (
		/^10\./.test(ip) ||
		/^192\.168\./.test(ip) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
		/^f[cd][0-9a-f]{2}:/i.test(ip) ||
		/^fe80:/i.test(ip)
	)
		return 'private';
	return 'public';
};

const splitPath = (fullPath) => {
	const [p, qs = ''] = String(fullPath || '').split('?');
	const rel = p.replace(/^\/api\/v1\/?/, '');
	return { pathname: p, segments: rel.split('/').filter(Boolean), qs };
};

// Đoán module: segment đầu tiên sau /api/v1 (với các route lookups nằm thẳng
// dưới /api/v1 thì segment đầu cũng chính là tên danh mục).
const moduleOf = (segments) => segments[0] || '';

// Mã bản ghi luôn có chữ số (12, NVBGD0001, NCKH_2026_001, uuid...); segment
// hành động/tài nguyên con thì không (approve, export-excel, members...).
const isIdLike = (s) => /\d/.test(s);

// Hành động phụ dạng /<module>/:id/<sub> hoặc /<module>/<sub>.
const SUB_ACTION_LABELS = {
	approve: 'Phê duyệt',
	reject: 'Từ chối',
	submit: 'Nộp',
	review: 'Đánh giá',
	decide: 'Ra quyết định',
	'bulk-decide': 'Quyết định hàng loạt',
	reopen: 'Mở lại',
	start: 'Bắt đầu',
	send: 'Gửi',
	respond: 'Phản hồi',
	revoke: 'Thu hồi',
	'revoke-cme': 'Thu hồi CME',
	'issue-cme': 'Cấp CME',
	'bulk-cme': 'Cấp CME hàng loạt',
	'import-excel': 'Nhập Excel',
	'export-excel': 'Xuất Excel',
	'export-stats': 'Xuất thống kê',
	'export-report': 'Xuất báo cáo',
	'export-data': 'Xuất dữ liệu',
	'training-report-export': 'Xuất báo cáo đào tạo',
	download: 'Tải xuống',
	'reset-password': 'Đặt lại mật khẩu',
	'grant-accounts': 'Cấp tài khoản',
	merge: 'Gộp hồ sơ',
	link: 'Liên kết',
	'link-many': 'Liên kết nhiều',
	'auto-assign': 'Tự động phân công',
	reorder: 'Sắp xếp lại',
	'read-all': 'Đánh dấu đã đọc tất cả',
	read: 'Đánh dấu đã đọc',
	checkin: 'Điểm danh',
	'check-in': 'Điểm danh',
	attendance: 'Điểm danh',
	grade: 'Chấm điểm',
	grades: 'Chấm điểm',
	substitute: 'Thay thế thành viên',
	bulk: 'Thao tác hàng loạt',
	members: 'Thành viên',
	documents: 'Tài liệu',
	files: 'Tệp đính kèm',
	minutes: 'Biên bản',
	participants: 'Người tham dự',
	enrollments: 'Ghi danh',
	certificates: 'Chứng chỉ',
	evidence: 'Minh chứng',
	'comment-image': 'Ảnh bình luận',
	result: 'Kết quả',
	questions: 'Câu hỏi',
	lessons: 'Bài học',
	papers: 'Bài báo',
	authors: 'Tác giả',
	items: 'Mục',
};

const describe = (o) => {
	const method = String(o.method || '').toUpperCase();
	const { segments } = splitPath(o.path);
	const mod = moduleOf(segments);
	const status = Number(o.status_code) || 0;
	const rest = segments.slice(1);

	// Đối tượng bị tác động: ưu tiên req.params (đã log sẵn), sau đó đoán từ URL.
	const params = o.params && typeof o.params === 'object' ? o.params : {};
	let target = params.id ?? Object.values(params).find((v) => v != null && v !== '') ?? null;
	if (target == null) target = rest.find(isIdLike) ?? null;
	if (target == null && o.result_id != null) target = o.result_id;

	// Sub-action dạng /topics/12/approve hoặc /councils/export-excel → segment
	// chữ cuối cùng (bỏ qua segment là mã bản ghi).
	const literal = rest.filter((s) => !isIdLike(s));
	const subAction = literal.length ? literal[literal.length - 1] : null;

	let action;
	if (mod === 'auth') {
		const a = rest.join('/');
		if (a === 'login' || a === '2fa/verify')
			action = status && status < 400 ? 'login' : 'login_failed';
		else if (a.startsWith('logout')) action = 'logout';
		else if (method === 'GET') action = 'view';
		else action = 'auth';
	} else if (method === 'GET' || method === 'HEAD') action = 'view';
	else if (method === 'DELETE') action = 'delete';
	else if (method === 'PUT' || method === 'PATCH') action = 'update';
	else if (method === 'POST') action = subAction ? 'execute' : 'create';
	else action = 'execute';

	const moduleLabel = MODULE_LABELS[mod] || mod || '—';
	let summary = `${ACTION_LABELS[action]} · ${moduleLabel}`;
	if (mod === 'auth') {
		const AUTH_SUMMARY = {
			refresh: 'Làm mới phiên đăng nhập',
			'change-password': 'Đổi mật khẩu',
			'2fa/setup': 'Bắt đầu thiết lập 2FA',
			'2fa/verify-setup': 'Bật xác thực 2 lớp (2FA)',
			'2fa/disable': 'Tắt xác thực 2 lớp (2FA)',
			'2fa/status': 'Xem trạng thái 2FA',
			sessions: 'Xem các phiên đăng nhập',
			'logout-all': 'Đăng xuất khỏi mọi thiết bị',
			'2fa/verify': 'Đăng nhập (bước xác minh 2FA)',
		};
		const key = rest.join('/');
		summary =
			action === 'login_failed'
				? `Đăng nhập thất bại${key === '2fa/verify' ? ' (sai mã 2FA)' : ''}`
				: AUTH_SUMMARY[key] || ACTION_LABELS[action];
	} else {
		const subLabel = subAction ? SUB_ACTION_LABELS[subAction] || subAction : null;
		if (action === 'view')
			summary = `${subAction ? 'Xem' : target != null ? 'Xem chi tiết' : 'Xem danh sách'} · ${moduleLabel}`;
		else if (action === 'execute') summary = `${subLabel} · ${moduleLabel}`;
		if (subAction && action !== 'execute') summary += ` → ${subLabel}`;
		if (target != null) summary += ` #${target}`;
	}

	return {
		module: mod,
		module_label: moduleLabel,
		action,
		action_label: ACTION_LABELS[action],
		target_id: target != null ? String(target) : null,
		summary,
	};
};

module.exports = {
	MODULE_LABELS,
	ACTION_LABELS,
	normalizeIp,
	ipKind,
	splitPath,
	describe,
};
