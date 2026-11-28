const { getPool, sql, nowSql, upsert, withTransaction, lockResource } = require('../../config/db');
const { httpError } = require('../../utils/httpError');
const { broadcast } = require('../events/eventService');

// Cấu hình hệ thống qua UI (2026-09-14_system_settings.sql) — thay .env cho các
// giá trị nghiệp vụ hay đổi. value NULL = "chưa cấu hình qua UI, dùng .env"
// (mailService.js/cmeRequirementService.js tự fallback process.env).
const SECRET_KEYS = new Set([
	'SMTP_PASS',
	'RECAPTCHA_SECRET_KEY',
	'RECAPTCHA_API_KEY',
	'TUITION_BANK_API_SECRET',
]);
// Whitelist — PUT không được tạo key tùy ý. Thêm key mới:
//   1. thêm tên khóa ở đây (công tắc → BOOLEAN_KEYS, danh sách chọn → ENUM_KEYS);
//   2. ràng buộc riêng (khoảng số, định dạng) → validateSetting ở module đọc khóa đó, đăng ký
//      module trong settingRules.js nếu chưa có;
//   3. khai báo ô nhập ở frontend features/settings/config/sections.ts.
const KEYS = [
	'MAIL_ENABLED',
	'SMTP_HOST',
	'SMTP_PORT',
	'SMTP_SECURE',
	'SMTP_USER',
	'SMTP_PASS',
	'SMTP_FROM_NAME',
	'PUBLIC_BASE_URL',
	'CME_CYCLE_YEARS',
	'CME_MIN_HOURS',
	'REQUIRE_2FA_FOR_ADMINS',
	'TWOFA_GRACE_DAYS',
	'ALERT_EMAILS',
	'PASSWORD_RESET_ENABLED',
	// Hạn dùng mật khẩu tạm (ngày) — permissions/tempPasswordPolicy.js
	'TEMP_PASSWORD_TTL_DAYS',
	'MODULE_RESEARCH',
	'MODULE_TRAINING',
	'MODULE_SEMINAR',
	'MODULE_SURVEY',
	'MODULE_ATTENDANCE',
	// Thu học phí (phân hệ con của Đào tạo) — training/tuition/
	'MODULE_TUITION',
	// Mục menu bị ẩn của từng cổng (danh sách key phân cách dấu phẩy) — modules.routes.js /menus
	'MENU_HIDDEN_ADMIN',
	'MENU_HIDDEN_USER',
	'MENU_HIDDEN_TRAINEE',
	// File tài liệu được nhận — utils/uploadPolicy.js
	'UPLOAD_ALLOWED_EXTENSIONS',
	'UPLOAD_MAX_MB',
	// Kiểm tra file upload — utils/uploadQuota.js, utils/clamav.js (fallback .env)
	'UPLOAD_DAILY_QUOTA_MB',
	'CLAMAV_HOST',
	'CLAMAV_PORT',
	'CLAMAV_MAX_MB',
	'CLAMAV_FAIL_OPEN',
	// Điểm danh học viên — utils/attendancePolicy.js
	'ATTENDANCE_ALLOWED_IPS',
	'ATTENDANCE_LOCATION',
	'ATTENDANCE_RADIUS_M',
	'ATTENDANCE_MAX_ACCURACY_M',
	// Phương thức điểm danh được phép (công tắc toàn hệ thống + theo loại hội nghị) — utils/attendanceMethods.js
	'ATTENDANCE_METHOD_QR',
	'ATTENDANCE_METHOD_APP',
	'ATTENDANCE_METHOD_DEVICE',
	'SEMINAR_CHECKIN_QR',
	'SEMINAR_CHECKIN_TICKET',
	'SEMINAR_CHECKIN_DEVICE',
	'SEMINAR_CHECKIN_BY_TYPE',
	// Máy chấm công vân tay (ADMS) — modules/attendanceDevices/deviceSettings.js
	'DEVICE_CHECKIN_EARLY_MIN',
	'DEVICE_LATE_AFTER_MIN',
	'DEVICE_CLEANUP_DAYS',
	'DEVICE_FP_SYNC',
	// Đơn xin phép của học viên — utils/leavePolicy.js
	'LEAVE_REQUEST_ENABLED',
	'LEAVE_BACKDATE_DAYS',
	'LEAVE_AHEAD_DAYS',
	'LEAVE_MAX_SPAN_DAYS',
	// Google reCAPTCHA cho form đăng ký công khai — utils/captcha.js (fallback .env).
	// PROJECT_ID + API_KEY: xác minh qua Google Cloud (assessment); SECRET_KEY: cách cũ
	'RECAPTCHA_SITE_KEY',
	'RECAPTCHA_SECRET_KEY',
	'RECAPTCHA_HOSTNAMES',
	'RECAPTCHA_PROJECT_ID',
	'RECAPTCHA_API_KEY',
	// Thực hành GPHN — cảnh báo khi 1 người hướng dẫn kèm quá N học viên cùng lúc
	'PRACTICE_MENTOR_MAX_TRAINEES',
	// Lớp ĐTLT / CTCV — training/courses/programClassService.js, utils/classDates.js
	'TRAINING_CLASS_PREP_DAYS',
	'TRAINING_HOLIDAYS',
	// 'false' ⇒ không tự thêm ngày lễ theo luật (utils/vnHolidays.js) — mặc định bật
	'TRAINING_HOLIDAYS_AUTO',
	// Đồng bộ ngày nghỉ lễ từ lịch iCal (mặc định lịch Google) — modules/settings/holidaySync.js
	'TRAINING_HOLIDAYS_SYNC',
	'TRAINING_HOLIDAYS_ICS_URL',
	'TRAINING_ALLOW_MULTI_PROGRAM',
	// Form đăng ký khóa đào tạo liên tục — public/publicPortalService.js, training/registration/
	// 'false' ⇒ không bắt xác minh email bằng OTP trước khi gửi đăng ký (mặc định bật)
	'TRAINING_REGISTRATION_EMAIL_OTP',
	// 'false' ⇒ tắt tự kiểm tra loại file hồ sơ đăng ký (OCR / QR) — training/registration/docCheck/
	'TRAINING_REGISTRATION_DOC_CHECK',
	// 'true' ⇒ kiểm thêm chữ ký số / dấu / chữ ký tay (mặc định TẮT) — docCheck/signature/
	'TRAINING_DOC_SIGNATURE_CHECK',
	// JSON: bật/tắt chi tiết theo loại giấy tờ × mục kiểm (signature/signatureRules.js) — rỗng = bật hết
	'TRAINING_DOC_SIGNATURE_RULES',
	// Chấm điểm Lý thuyết + Thực hành — mặc định ở training/courses/gradeRules.js
	'GRADE_THEORY_PASS_PCT',
	'GRADE_PRACTICE_PASS_PCT',
	'ATTEND_THEORY_MAX_ABSENT_PCT',
	'ATTEND_PRACTICE_MAX_ABSENT_PCT',
	'GRADE_MAX_RETAKES',
	'GRADE_RANK_EXCELLENT',
	'GRADE_RANK_GOOD',
	'GRADE_RANK_AVERAGE',
	// Học phí: tài khoản nhận chuyển khoản (mã VietQR) + tên đơn vị trên phiếu thu — training/tuition/tuitionSettings.js
	'TUITION_BANK_BIN',
	'TUITION_ACCOUNT_NO',
	'TUITION_ACCOUNT_NAME',
	'TUITION_RECEIPT_UNIT',
	// Tự đối soát học phí qua API ngân hàng — training/tuition/bank/bankSettings.js
	'TUITION_BANK_API_PROVIDER',
	'TUITION_BANK_API_SECRET',
	'TUITION_BANK_AUTO_CONFIRM',
	'TUITION_BANK_API_ALLOWED_IPS',
	// Tự cộng tín chỉ CME từ khóa ĐTLT / CTCV — training/courses/courseCmeService.js
	'CME_AUTO_TRAINEE',
	'CME_AUTO_LECTURER',
	// Dòng tự cộng được duyệt luôn hay chờ người quản lý CME duyệt — xem ENUM_KEYS
	'CME_TRAINEE_APPROVAL',
	'CME_LECTURER_APPROVAL',
	// Email theo chức năng — mặc định ở mailService.EVENT_DEFAULTS
	'MAIL_EVENT_TOPIC_RESULT',
	'MAIL_EVENT_DEADLINE_REMINDER',
	'MAIL_EVENT_PASSWORD_EXPIRY',
	'MAIL_EVENT_COURSE_ENROLLMENT',
	'MAIL_EVENT_SEMINAR_BADGE',
	'MAIL_EVENT_SECURITY_ALERT',
	'MAIL_EVENT_TOPIC_SUBMITTED',
	'MAIL_EVENT_ACCOUNT_GRANTED',
	'MAIL_EVENT_BROADCAST',
	'MAIL_EVENT_SIGN_REQUEST',
	// JSON: bật/tắt ký số tổng / theo nơi dùng / theo nhà cung cấp — signing/signingConfig.js
	'SIGNING_CONFIG',
];
const isKey = (key) => KEYS.includes(key);

// Các khóa bật/tắt (công tắc): người đọc chỉ coi đúng chuỗi 'false' là tắt, nên giá trị gõ sai
// (vd "False", "0", "tat") sẽ bị hiểu là BẬT hoặc lệch giữa hai nơi đọc — chỉ nhận
// 'true'/'false' (rỗng = bỏ ghi đè, về mặc định của module đọc khóa). Công tắc mới nhớ thêm vào
// đây — nhất là khi cấu hình được nhập từ file JSON ở trang cấu hình.
const BOOLEAN_KEYS = new Set([
	'MAIL_ENABLED',
	'REQUIRE_2FA_FOR_ADMINS',
	'PASSWORD_RESET_ENABLED',
	'MODULE_RESEARCH',
	'MODULE_TRAINING',
	'MODULE_SEMINAR',
	'MODULE_SURVEY',
	'MODULE_ATTENDANCE',
	'MODULE_TUITION',
	'TUITION_BANK_AUTO_CONFIRM',
	'TRAINING_ALLOW_MULTI_PROGRAM',
	'TRAINING_HOLIDAYS_AUTO',
	'TRAINING_HOLIDAYS_SYNC',
	...KEYS.filter((k) => k.startsWith('MAIL_EVENT_')),
	'TRAINING_REGISTRATION_EMAIL_OTP',
	'TRAINING_REGISTRATION_DOC_CHECK',
	'TRAINING_DOC_SIGNATURE_CHECK',
	'CME_AUTO_TRAINEE',
	'CME_AUTO_LECTURER',
	'DEVICE_FP_SYNC',
	'ATTENDANCE_METHOD_QR',
	'ATTENDANCE_METHOD_APP',
	'ATTENDANCE_METHOD_DEVICE',
	'SEMINAR_CHECKIN_QR',
	'SEMINAR_CHECKIN_TICKET',
	'SEMINAR_CHECKIN_DEVICE',
]);
// Khóa chỉ nhận một trong các giá trị liệt kê (rỗng = bỏ ghi đè, về mặc định — giá trị đầu).
// Khớp courseCmeService.APPROVAL_MODES.
const ENUM_KEYS = {
	CME_TRAINEE_APPROVAL: ['approved', 'pending'],
	CME_LECTURER_APPROVAL: ['permission', 'approved', 'pending'],
};
// Khóa lưu JSON object (module nghiệp vụ tự chuẩn hoá khi đọc — ở đây chỉ chặn chuỗi hỏng / quá dài)
const JSON_OBJECT_KEYS = new Set([
	'TRAINING_DOC_SIGNATURE_RULES',
	'SIGNING_CONFIG',
	'SEMINAR_CHECKIN_BY_TYPE',
]);
const validateJsonObject = (value) => {
	if (value.length > 10000) return 'Cấu hình quá dài';
	try {
		const v = JSON.parse(value);
		return v && typeof v === 'object' && !Array.isArray(v) ? null : 'Giá trị phải là JSON object';
	} catch {
		return 'Giá trị phải là JSON hợp lệ';
	}
};
// null = hợp lệ; ngược lại là thông báo lỗi (dùng khi admin lưu cấu hình)
const validateSetting = (key, value) => {
	if (value === null || value === '') return null;
	if (JSON_OBJECT_KEYS.has(key)) return validateJsonObject(value);
	if (ENUM_KEYS[key])
		return ENUM_KEYS[key].includes(value) ? null : `Giá trị phải là ${ENUM_KEYS[key].join('/')}`;
	if (!BOOLEAN_KEYS.has(key)) return null;
	return value === 'true' || value === 'false' ? null : 'Giá trị phải là true/false';
};
const MASK = '••••••';

// Không bao giờ trả plaintext secret ra ngoài — chỉ báo "đã đặt" hay chưa.
const maskRow = (row) => {
	if (!row) return row;
	if (SECRET_KEYS.has(row.setting_key) && row.value) {
		return { ...row, value: MASK, has_value: true };
	}
	return { ...row, has_value: row.value !== null && row.value !== '' };
};

// Cache 15s/worker: getValue được gọi mỗi request (chính sách 2FA) — không để mỗi
// lần chạm DB. update() xóa cache của worker xử lý; worker khác tự hết hạn sau TTL.
const TTL_MS = 15000;
let cache = null;
const loadRows = async () => {
	if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
	const pool = await getPool();
	const result = await pool.request().query('SELECT * FROM system_settings');
	const rows = new Map(result.recordset.map((r) => [r.setting_key, r]));
	cache = { at: Date.now(), rows };
	return rows;
};

const getRaw = async (key) => (await loadRows()).get(key) || null;

// Đọc giá trị đã cấu hình qua UI, fallback về .env nếu bảng trống/NULL —
// dùng ở mailService.js, cmeRequirementService.js... không phải ở route.
const getValue = async (key, envFallback) => {
	const row = await getRaw(key);
	if (row && row.value !== null && row.value !== '') return row.value;
	return envFallback !== undefined ? envFallback : process.env[key];
};

// Mỗi key trong whitelist 1 dòng; `effective` = giá trị đang áp dụng (UI hoặc .env),
// không trả cho secret.
const getAll = async () =>
	Promise.all(
		KEYS.map(async (key) => {
			const row = maskRow((await getRaw(key)) || { setting_key: key, value: null });
			return SECRET_KEYS.has(key) ? row : { ...row, effective: (await getValue(key)) ?? null };
		}),
	);

const getById = async (key) => maskRow(await getRaw(key));

// Mật khẩu SMTP gắn với máy chủ của nó: đổi SMTP_HOST sang máy lạ rồi "Gửi thử"
// không được làm server đăng nhập máy đó bằng mật khẩu thật (mật khẩu bị che trên
// UI nhưng vẫn lộ theo đường này).
//   Mật khẩu lưu ở DB: update() xóa khi máy chủ SMTP đang áp dụng đổi.
//   Mật khẩu ở .env: chỉ dùng khi máy chủ đang áp dụng = SMTP_HOST của .env.
// Cấu hình SMTP lấy từ MỘT snapshot cache duy nhất (một lần loadRows — Map không bị sửa
// tại chỗ, chỉ bị thay nguyên khối) → host/port/user/mật khẩu luôn thuộc cùng một trạng
// thái. Đọc host và mật khẩu bằng các lần getValue riêng thì có thể ghép host mới với
// mật khẩu của host cũ nếu cache bị nạp lại giữa chừng.
const smtpConfig = async () => {
	const rows = await loadRows();
	const val = (key) => {
		const v = rows.get(key)?.value;
		return v !== null && v !== undefined && v !== '' ? v : process.env[key];
	};
	const host = val('SMTP_HOST');
	const dbPass = rows.get('SMTP_PASS')?.value;
	const pass = dbPass || (host === process.env.SMTP_HOST ? process.env.SMTP_PASS : undefined);
	return {
		host,
		port: val('SMTP_PORT'),
		secure: val('SMTP_SECURE'),
		user: val('SMTP_USER'),
		pass,
	};
};

const smtpPassword = async () => (await smtpConfig()).pass;

const UPSERT_SETTING_SQL = upsert({
	table: 'system_settings',
	key: ['setting_key'],
	values: {
		setting_key: '@key',
		value: '@value',
		created_by: '@actor_id',
		updated_by: '@actor_id',
	},
	update: { value: '@value', updated_at: nowSql, updated_by: '@actor_id' },
});

// Đổi SMTP_HOST: ghi host và xóa mật khẩu DB trong CÙNG transaction (hostBefore đọc từ DB
// dưới khóa, không đọc cache có thể cũ) → không reader nào, ở worker nào, thấy host mới đi
// kèm mật khẩu của host cũ; ghi mật khẩu xóa lỗi thì host cũng rollback.
const effectiveHost = (v) =>
	v !== null && v !== undefined && v !== '' ? v : process.env.SMTP_HOST;
const writeSetting = (runner, key, value, actorId) =>
	runner
		.request()
		.input('key', sql.VarChar(50), key)
		.input('value', sql.NVarChar(sql.MAX), value === '' ? null : value)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(UPSERT_SETTING_SQL);
// Ghi SMTP_HOST trong tx đang mở; trả true nếu máy chủ đang áp dụng đổi (mật khẩu DB đã bị xóa)
const writeSmtpHost = async (tx, value, actorId) => {
	// Tuần tự hóa các lần đổi host đồng thời để hostBefore luôn đúng
	if (!(await lockResource(tx, 'system_settings:SMTP_HOST')))
		throw httpError(409, 'Đang có thay đổi máy chủ SMTP khác, vui lòng thử lại');
	const before = (
		await tx.request().query(`SELECT value FROM system_settings WHERE setting_key = 'SMTP_HOST'`)
	).recordset[0]?.value;
	const next = value === '' ? null : value;
	await writeSetting(tx, 'SMTP_HOST', next, actorId);
	if (effectiveHost(before) === effectiveHost(next)) return false;
	await tx
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.query(
			`UPDATE system_settings SET value = NULL, updated_at = ${nowSql}, updated_by = @actor_id WHERE setting_key = 'SMTP_PASS'`,
		);
	return true;
};
const updateSmtpHost = (value, actorId) =>
	withTransaction((tx) => writeSmtpHost(tx, value, actorId));

const update = async (key, value, actorId) => {
	// UI gửi lại MASK khi admin không đổi secret → giữ nguyên giá trị cũ.
	if (SECRET_KEYS.has(key) && value === MASK) return getById(key);
	if (key === 'SMTP_HOST') {
		await updateSmtpHost(value, actorId);
	} else {
		await writeSetting(await getPool(), key, value, actorId);
	}
	// Xóa cache SAU khi commit — không bao giờ nạp lại trạng thái dở dang
	cache = null;
	broadcast('update', { entity: 'system_setting' });
	return getById(key);
};

// Khóa NỘI BỘ do máy chủ tự ghi (vd bản tải lịch nghỉ lễ — holidaySync.js): không nằm trong KEYS
// nên PUT không sửa được và GET /system-settings không trả ra; đọc bằng getValue như khóa thường.
const setInternal = async (key, value) => {
	if (isKey(key)) throw new Error(`setInternal: ${key} là khóa admin sửa được, dùng update()`);
	await writeSetting(await getPool(), key, value, null);
	cache = null;
};

// Lưu nhiều cấu hình một lần (trang Cấu hình hệ thống bấm "Lưu"): tất cả hoặc không gì cả —
// không còn cảnh lưu được nửa chừng rồi lỗi ở khóa thứ 5. Giá trị đã được kiểm (settingRules)
// trước khi gọi. Secret gửi lại MASK = không đổi, bỏ qua.
//   SMTP_HOST ghi TRƯỚC SMTP_PASS: đổi máy chủ kèm nhập mật khẩu mới trong cùng lần lưu thì
//   mật khẩu cũ bị xóa rồi mật khẩu mới được ghi — không mất mật khẩu vừa nhập.
// Trả số khóa đã ghi.
const updateMany = async (values, actorId) => {
	const entries = Object.entries(values).filter(
		([key, v]) => !(SECRET_KEYS.has(key) && v === MASK),
	);
	if (!entries.length) return 0;
	entries.sort(([a], [b]) => (a === 'SMTP_HOST' ? -1 : b === 'SMTP_HOST' ? 1 : 0));
	await withTransaction(async (tx) => {
		for (const [key, value] of entries) {
			if (key === 'SMTP_HOST') await writeSmtpHost(tx, value, actorId);
			else await writeSetting(tx, key, value, actorId);
		}
	});
	cache = null;
	broadcast('update', { entity: 'system_setting' });
	return entries.length;
};

module.exports = {
	getAll,
	getById,
	getValue,
	smtpConfig,
	smtpPassword,
	update,
	updateMany,
	setInternal,
	isKey,
	validateSetting,
};
