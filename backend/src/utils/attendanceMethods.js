// Phương thức điểm danh được phép (2027-01-23_phuong_thuc_diem_danh.sql).
// Bổ sung cho kiểu chấm công (utils/attendanceMode.js — chấm CÁI GÌ: buổi học / ca): đây là
// chấm BẰNG GÌ. Một phương thức dùng được khi bật ở CẢ HAI tầng:
//   1. Cấu hình hệ thống — công tắc từng phương thức (mặc định bật hết):
//        Đào tạo   ATTENDANCE_METHOD_QR / _APP / _DEVICE
//        Hội nghị  SEMINAR_CHECKIN_QR / _TICKET / _DEVICE
//   2. Loại hình:
//        Đào tạo   training_types.attendance_methods ('qr,device'; NULL = tất cả, '' = không gì)
//        Hội nghị  SEMINAR_CHECKIN_BY_TYPE = JSON { event_type: ['qr', 'ticket'] } — loại không
//                  có trong JSON = tất cả (loại hội nghị là danh sách cố định ở seminarService)
//                  — vd { "conference": ["qr", "ticket", "device"] }
// Điểm danh tay (giảng viên / ban tổ chức nhập danh sách) luôn được phép — là đường sửa sai.
const systemSettingService = require('../modules/settings/systemSettingService');
const { getPool, sql } = require('../config/db');
const { httpError } = require('./httpError');

//   qr      học viên quét mã QR của buổi học (chỉ khóa chấm theo buổi học)
//   app     học viên bấm vào / ra ca trên ứng dụng, kèm IP + GPS (chỉ khóa chấm theo ca)
//   device  máy chấm công vân tay (buổi học và ca)
const TRAINING_METHODS = ['qr', 'app', 'device'];
//   qr      người tham dự tự quét mã QR chiếu ở hội trường
//   ticket  ban tổ chức quét vé QR cá nhân của người tham dự
//   device  máy chấm công vân tay dành cho hội nghị (attendanceDevices/seminarPunchMatcher.js)
const SEMINAR_METHODS = ['qr', 'ticket', 'device'];

const TRAINING_KEYS = {
	qr: 'ATTENDANCE_METHOD_QR',
	app: 'ATTENDANCE_METHOD_APP',
	device: 'ATTENDANCE_METHOD_DEVICE',
};
const SEMINAR_KEYS = {
	qr: 'SEMINAR_CHECKIN_QR',
	ticket: 'SEMINAR_CHECKIN_TICKET',
	device: 'SEMINAR_CHECKIN_DEVICE',
};
const SEMINAR_BY_TYPE_KEY = 'SEMINAR_CHECKIN_BY_TYPE';

const TRAINING_LABEL = {
	qr: 'quét mã QR buổi học',
	app: 'điểm danh vào / ra trên ứng dụng',
	device: 'máy chấm công vân tay',
};
const SEMINAR_LABEL = {
	qr: 'quét mã QR tại hội trường',
	ticket: 'quét vé',
	device: 'máy chấm công vân tay',
};

/**
 * 'qr,device' → ['qr', 'device'] (bỏ giá trị lạ, giữ thứ tự chuẩn); null/undefined → null (= tất cả).
 * @param {unknown} raw
 * @param {string[]} [allowed]
 */
const parseList = (raw, allowed = TRAINING_METHODS) => {
	if (raw === null || raw === undefined) return null;
	const set = new Set(
		(Array.isArray(raw) ? raw : String(raw).split(','))
			.map((s) => String(s).trim())
			.filter(Boolean),
	);
	return allowed.filter((m) => set.has(m));
};

/** Danh sách gửi lên (mảng / chuỗi / null) → giá trị lưu cột training_types.attendance_methods */
const toColumn = (raw) => {
	const list = parseList(raw);
	if (list === null) return null;
	// Chọn đủ mọi phương thức = theo hệ thống (NULL) — phương thức thêm về sau tự áp dụng
	return list.length === TRAINING_METHODS.length ? null : list.join(',');
};

/** null = hợp lệ; ngược lại thông báo lỗi (express-validator custom ở trainingCatalog.routes) */
const invalidList = (raw) => {
	if (raw === null || raw === undefined) return null;
	const items = Array.isArray(raw)
		? raw
		: String(raw)
				.split(',')
				.filter((s) => s.trim());
	const bad = items.map((s) => String(s).trim()).filter((s) => !TRAINING_METHODS.includes(s));
	return bad.length ? `Phương thức điểm danh không hợp lệ: ${bad.join(', ')}` : null;
};

const isOn = (v) => v !== 'false'; // mặc định bật — chỉ đúng chuỗi 'false' là tắt

const readSwitches = async (keys) => {
	const entries = await Promise.all(
		Object.entries(keys).map(async ([m, key]) => [
			m,
			isOn(await systemSettingService.getValue(key)),
		]),
	);
	return Object.fromEntries(entries);
};

/** { qr, app, device } theo công tắc toàn hệ thống */
const systemTraining = () => readSwitches(TRAINING_KEYS);

const parseByType = (raw) => {
	if (!raw) return {};
	try {
		const v = JSON.parse(raw);
		return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
	} catch {
		return {};
	}
};

/** Kết hợp 2 tầng → { [method]: boolean } */
const combine = (system, typeList, methods) =>
	Object.fromEntries(
		methods.map((m) => [m, !!system[m] && (typeList === null || typeList.includes(m))]),
	);

/**
 * Phương thức của 1 khóa học từ giá trị cột loại hình (đã đọc sẵn) — hàm thuần khi có `system`.
 * @returns {{ qr: boolean, app: boolean, device: boolean, manual: true }}
 */
const forTypeValue = (system, typeValue) => ({
	.../** @type {{ qr: boolean, app: boolean, device: boolean }} */ (
		combine(system, parseList(typeValue), TRAINING_METHODS)
	),
	manual: true,
});

const typeMethodsOfCourse = async (courseId) =>
	(
		await (await getPool()).request().input('id', sql.VarChar(20), courseId).query(`
      SELECT tt.attendance_methods FROM courses c
      LEFT JOIN training_types tt ON tt.id = c.training_type_id WHERE c.id = @id`)
	).recordset[0]?.attendance_methods ?? null;

/** Phương thức đang dùng được của 1 khóa học */
const forCourse = async (courseId) =>
	forTypeValue(await systemTraining(), await typeMethodsOfCourse(courseId));

/** Phương thức đang dùng được của khóa có buổi học sessionId (null nếu không có buổi) */
const forSession = async (sessionId) => {
	const row = (
		await (await getPool()).request().input('id', sql.VarChar(20), sessionId).query(`
      SELECT c.id, tt.attendance_methods FROM class_sessions sess
      JOIN courses c ON c.id = sess.course_id
      LEFT JOIN training_types tt ON tt.id = c.training_type_id WHERE sess.id = @id`)
	).recordset[0];
	if (!row) return null;
	return forTypeValue(await systemTraining(), row.attendance_methods ?? null);
};

/** Điều kiện SQL "loại hình của khóa (bí danh c) cho phép method" — chỉ tầng loại hình */
const courseAllowsSql = (c, method) => {
	if (!TRAINING_METHODS.includes(method)) throw new Error(`Phương thức lạ: ${method}`);
	return `COALESCE('${method}' = ANY(string_to_array(
    (SELECT tt.attendance_methods FROM training_types tt WHERE tt.id = ${c}.training_type_id), ',')), true)`;
};

/** Chặn khi khóa học không dùng phương thức này (409 kèm lý do) */
const assertTraining = (methods, method, system) => {
	if (methods?.[method]) return;
	const label = TRAINING_LABEL[method];
	if (system && !system[method])
		throw httpError(409, `Điểm danh bằng ${label} đang tắt trên toàn hệ thống.`);
	throw httpError(
		409,
		`Khóa học này không điểm danh bằng ${label} (cấu hình ở loại hình đào tạo).`,
	);
};

/**
 * Phương thức điểm danh của hội nghị theo loại (event_type) → { qr, ticket, device, manual: true }
 * @returns {Promise<{ qr: boolean, ticket: boolean, device: boolean, manual: true, system: any }>}
 */
const forSeminarType = async (eventType) => {
	const [system, byTypeRaw] = await Promise.all([
		readSwitches(SEMINAR_KEYS),
		systemSettingService.getValue(SEMINAR_BY_TYPE_KEY),
	]);
	const byType = parseByType(byTypeRaw);
	const list = Object.hasOwn(byType, eventType)
		? parseList(byType[eventType], SEMINAR_METHODS)
		: null;
	return {
		.../** @type {{ qr: boolean, ticket: boolean, device: boolean }} */ (
			combine(system, list ?? null, SEMINAR_METHODS)
		),
		manual: true,
		system,
	};
};

const forSeminar = async (seminarId) => {
	const row = (
		await (
			await getPool()
		)
			.request()
			.input('id', sql.VarChar(20), seminarId)
			.query('SELECT event_type FROM seminars WHERE id = @id')
	).recordset[0];
	if (!row) throw httpError(404, 'Không tìm thấy hội thảo / hội nghị.');
	return forSeminarType(row.event_type);
};

const assertSeminar = async (seminarId, method) => {
	const m = await forSeminar(seminarId);
	if (m[method]) return;
	const label = SEMINAR_LABEL[method];
	if (!m.system[method])
		throw httpError(409, `Điểm danh hội nghị bằng ${label} đang tắt trên toàn hệ thống.`);
	throw httpError(409, `Loại hội nghị này không điểm danh bằng ${label}.`);
};

/** Bỏ trường nội bộ trước khi trả về client */
const publicSeminar = ({ system: _system, ...m }) => m;

// null = hợp lệ; ngược lại là thông báo lỗi (settingRules.js — admin lưu cấu hình)
const validateSetting = (key, value) => {
	if (key !== SEMINAR_BY_TYPE_KEY || value === null || value === '') return null;
	let v;
	try {
		v = JSON.parse(value);
	} catch {
		return 'Giá trị phải là JSON hợp lệ';
	}
	if (!v || typeof v !== 'object' || Array.isArray(v)) return 'Giá trị phải là JSON object';
	for (const [type, list] of Object.entries(v)) {
		if (!/^[a-z_]{1,30}$/.test(type)) return `Loại hội nghị không hợp lệ: ${type}`;
		if (!Array.isArray(list) || list.some((m) => !SEMINAR_METHODS.includes(m)))
			return `Phương thức của loại ${type} phải là mảng trong ${SEMINAR_METHODS.join('/')}`;
	}
	return null;
};

module.exports = {
	TRAINING_METHODS,
	SEMINAR_METHODS,
	TRAINING_KEYS,
	SEMINAR_KEYS,
	SEMINAR_BY_TYPE_KEY,
	parseList,
	toColumn,
	invalidList,
	systemTraining,
	forTypeValue,
	forCourse,
	forSession,
	courseAllowsSql,
	assertTraining,
	forSeminarType,
	forSeminar,
	assertSeminar,
	publicSeminar,
	validateSetting,
};
