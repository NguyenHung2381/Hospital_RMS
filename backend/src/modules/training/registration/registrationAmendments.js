// course_registration_amendments — các lần người đăng ký tự sửa bản khai (trang Tra cứu,
// public/publicRegistrationAmendService.js). Đọc dùng chung cho cổng công khai và màn duyệt.
const { getPool, sql } = require('../../../config/db');
const { verifyRecord } = require('./registrationConsent');

const parseChanges = (text) => {
	try {
		const v = JSON.parse(text);
		return Array.isArray(v) ? v : [];
	} catch {
		return [];
	}
};

/** Các lần sửa của 1 bản khai, cũ → mới */
const list = async (enrollmentId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.query('SELECT * FROM course_registration_amendments WHERE enrollment_id = @id ORDER BY seq');
	return r.recordset;
};

/** 1 lần sửa theo số thứ tự (tải bản ghi JSON) */
const getOne = async (enrollmentId, seq) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.input('seq', sql.SmallInt, seq)
		.query('SELECT * FROM course_registration_amendments WHERE enrollment_id = @id AND seq = @seq');
	return r.recordset[0] ?? null;
};

/**
 * Lịch sử sửa cho màn duyệt. intact = bản ghi còn khớp mã băm; chained = prev_hash khớp mã của
 * bản trước (bản gốc hoặc lần sửa trước) — false nghĩa là có lần sửa bị chèn / xóa / sửa.
 * mask(key, value): che giá trị nhạy cảm (CCCD) khi người xem thiếu quyền; IP / thiết bị chỉ
 * trả khi sensitive.
 * @param {Array<Record<string, any>>} rows
 * @param {{ originalHash: string | null, sensitive: boolean, mask: (key: string, v: unknown) => unknown }} opts
 */
const forReview = (rows, { originalHash, sensitive, mask }) => {
	let prev = originalHash ?? null;
	return rows.map((a) => {
		const out = {
			seq: a.seq,
			created_at: a.created_at ?? null,
			reason: a.reason,
			identity_changed: !!a.identity_changed,
			changes: parseChanges(a.changes).map((c) => ({
				key: c.key,
				before: mask(c.key, c.before),
				after: mask(c.key, c.after),
			})),
			signature_name: a.signature_name,
			hash: a.consent_hash,
			intact: verifyRecord(a.consent_record, a.consent_hash),
			chained: (a.prev_hash ?? null) === prev,
			ip: sensitive ? (a.consent_ip ?? null) : null,
			user_agent: sensitive ? (a.consent_user_agent ?? null) : null,
		};
		prev = a.consent_hash;
		return out;
	});
};

module.exports = { list, getOne, parseChanges, forReview };
