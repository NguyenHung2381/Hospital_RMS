const { getPool, sql } = require('../config/db');
const cacheBus = require('../utils/cacheBus');

// Mã cố định của các vai trò hệ thống (roles.code). Code nghiệp vụ tham chiếu
// vai trò qua mã này thay vì id ('VT05', 'VT08'...) — id là dữ liệu, có thể
// khác giữa các môi trường; mã thì không đổi.
const ROLE = {
	ADMIN: 'admin', // Quản trị hệ thống (superuser)
	DIRECTOR: 'director', // Giám đốc / lãnh đạo
	RESEARCH_MANAGER: 'research_manager', // Quản lý NCKH
	REVIEW_COUNCIL: 'review_council', // Hội đồng xét duyệt
	TOPIC_LEADER: 'topic_leader', // Chủ nhiệm đề tài — cấp khi cấp tài khoản cho chủ nhiệm
	MEMBER: 'member', // Thành viên — mặc định cho tài khoản mới
	// "Trưởng khoa": thực tế là TÀI KHOẢN KHOA DÙNG CHUNG — bị loại khỏi nguồn
	// thành viên hội đồng / người tham dự / ghi nhận CME (không phải một người).
	DEPT_HEAD: 'dept_head',
	TRAINEE: 'trainee', // Học viên — cấp khi cấp tài khoản học viên
};

// id tương ứng trong dữ liệu gốc — CHỈ dùng cho migration gán mã cho các vai
// trò có sẵn (permissions/migrations.js). Code nghiệp vụ luôn tra qua roles.code.
const LEGACY_ROLE_IDS = {
	admin: 'VT01',
	director: 'VT02',
	research_manager: 'VT03',
	review_council: 'VT04',
	topic_leader: 'VT05',
	member: 'VT06',
	dept_head: 'VT07',
	trainee: 'VT08',
};

const TTL_MS = 5 * 60 * 1000;
let _cache = null; // { byCode: Map<code, id>, ts }

const clearLocal = () => {
	_cache = null;
};
const clear = () => {
	clearLocal();
	cacheBus.publish('roleCodes');
};
cacheBus.register('roleCodes', clearLocal);

// id vai trò mang mã `code` (null nếu không có vai trò nào mang mã đó).
const roleIdOf = async (code) => {
	if (!_cache || Date.now() - _cache.ts > TTL_MS) {
		const pool = await getPool();
		const rows = (await pool.request().query('SELECT id, code FROM roles WHERE code IS NOT NULL')).recordset;
		_cache = { byCode: new Map(rows.map((r) => [r.code, r.id])), ts: Date.now() };
	}
	return _cache.byCode.get(code) ?? null;
};

// Như roleIdOf nhưng bắt buộc có — thiếu thì là lỗi cấu hình DB, báo rõ.
const requireRoleId = async (code) => {
	const id = await roleIdOf(code);
	if (!id) {
		throw Object.assign(new Error(`Chưa có vai trò mang mã "${code}" (roles.code)`), {
			statusCode: 500,
		});
	}
	return id;
};

// Gắn @<name> = id vai trò vào request mssql — dùng trong SQL kiểu
// `u.role_id <> @dept_head_role`. Vai trò không tồn tại → '' (không khớp ai).
const inputRoleId = async (request, name, code) =>
	request.input(name, sql.VarChar(20), (await roleIdOf(code)) ?? '');

module.exports = { ROLE, LEGACY_ROLE_IDS, roleIdOf, requireRoleId, inputRoleId, clear };
