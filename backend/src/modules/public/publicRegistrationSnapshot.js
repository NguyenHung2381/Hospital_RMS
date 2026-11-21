// Hàm thuần dựng bản khai (snapshot) đăng ký khóa học công khai — tách khỏi
// publicCourseRegistrationService.js cho gọn.
const { SNAPSHOT_FIELDS } = require('../training/registration/registrationConstants');

const clean = (v) => {
	if (v === undefined || v === null) return null;
	if (typeof v === 'string') return v.trim() || null;
	return v;
};

// 'YYYY-MM-DD' của cột DATE (driver trả Date lúc 00:00 UTC) hoặc chuỗi ISO từ form
const toDateKey = (v) => {
	if (!v) return null;
	const d = v instanceof Date ? v : new Date(String(v).slice(0, 10));
	return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const DATE_FIELDS = new Set(['dob', 'national_id_issued_date']);
const STAFF_ONLY_FIELDS = new Set(['staff_number', 'department_id']);

// Bản khai = đúng các khóa SNAPSHOT_FIELDS người đăng ký vừa gửi (không lấy từ hồ sơ cũ).
// Ngoại viện không có mã NV / khoa; nội viện ghi đè các trường đó từ hồ sơ nhân sự.
const buildSnapshot = (data, { internal }) => {
	const out = {};
	for (const k of SNAPSHOT_FIELDS) {
		if (STAFF_ONLY_FIELDS.has(k)) continue;
		let v = clean(data[k]);
		if (v === null) continue;
		if (DATE_FIELDS.has(k)) v = toDateKey(v);
		if (k === 'graduated_year' && /^\d{4}$/.test(String(v))) v = Number(v);
		if (v !== null) out[k] = v;
	}
	if (internal) delete out.qualification;
	return out;
};

const pick = (obj, keys) => {
	const out = {};
	for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
	return out;
};

const birthYearOf = (dob) => {
	const y = dob ? Number(String(dob).slice(0, 4)) : NaN;
	return Number.isInteger(y) && y > 1900 ? y : null;
};

module.exports = { clean, toDateKey, buildSnapshot, pick, birthYearOf };
