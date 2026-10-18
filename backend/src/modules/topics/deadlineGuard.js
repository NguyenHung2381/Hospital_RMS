const { getPool, sql } = require('../../config/db');
const { todayVN } = require('../../utils/vnDate');
const { httpError } = require('../../utils/httpError');

const SUPPLEMENT_FIELDS = ['title', 'description', 'members', 'files'];

// Ánh xạ thao tác -> "mục" tương ứng trong cấu hình supplement_fields.
const ACTION_FIELD = {
	'edit-title': 'title',
	'edit-info': 'description',
	'edit-members': 'members',
	'add-files': 'files',
	'delete-files': 'files',
};

/**
 * Chủ nhiệm / thư ký của đề tài có được phép thực hiện `action` ngay bây giờ không,
 * dựa trên mốc thời gian (round_deadlines) đang mở của đợt.
 *
 * action ∈ 'edit-title' | 'edit-info' | 'edit-members' | 'add-files' | 'delete-files'
 */
async function isTopicActionAllowed(topicId, actorUserId, action) {
	const field = ACTION_FIELD[action];
	if (!field || !actorUserId) return false;

	const pool = await getPool();

	const topicRes = await pool
		.request()
		.input('tid', sql.VarChar(15), topicId)
		.query('SELECT round_id FROM topics WHERE id = @tid');
	const roundId = topicRes.recordset[0]?.round_id;
	if (!roundId) return false;

	// Phải là chủ nhiệm / thư ký của chính đề tài này.
	const roleRes = await pool
		.request()
		.input('tid', sql.VarChar(15), topicId)
		.input('uid', sql.VarChar(20), actorUserId).query(`
			SELECT TOP 1 1 FROM topic_members
			WHERE topic_id = @tid AND user_id = @uid AND role IN ('leader', 'secretary')
		`);
	if (!roleRes.recordset[0]) return false;

	const today = todayVN();
	const dls = (
		await pool.request().input('rid', sql.VarChar(10), roundId).query(`
			SELECT deadline_type, start_date, deadline_date, supplement_fields
			FROM round_deadlines
			WHERE round_id = @rid
			  AND deadline_type IN ('edit', 'supplement', 'report_submission')
		`)
	).recordset;

	for (const dl of dls) {
		const afterStart = !dl.start_date || today >= new Date(dl.start_date);
		const end = dl.deadline_date ? new Date(dl.deadline_date) : null;
		if (!afterStart || !end || today > end) continue;

		if (dl.deadline_type === 'edit') return true;

		if (dl.deadline_type === 'report_submission') {
			if (action === 'add-files') return true;
			continue;
		}

		// supplement — chỉ những mục đã cấu hình (null/rỗng ⇒ tất cả)
		let allowed = SUPPLEMENT_FIELDS;
		if (dl.supplement_fields) {
			const parsed = String(dl.supplement_fields)
				.split(',')
				.map((s) => s.trim())
				.filter((s) => SUPPLEMENT_FIELDS.includes(s));
			if (parsed.length) allowed = parsed;
		}
		if (allowed.includes(field)) return true;
	}

	return false;
}

/** Ném lỗi 403 nếu thao tác không được phép. */
async function assertTopicActionWindow(topicId, actorUserId, action) {
	if (await isTopicActionAllowed(topicId, actorUserId, action)) return;
	throw httpError(
		403,
		'Không trong thời gian cho phép thao tác này, hoặc bạn không phải chủ nhiệm/thư ký đề tài',
	);
}

/**
 * Đợt `roundId` có đang trong thời gian "Đăng ký đề tài" không?
 * - Không cấu hình mốc `topic_registration` ⇒ true (giữ hành vi cũ).
 * - Có cấu hình ⇒ hôm nay (giờ VN) phải nằm trong [start_date, deadline_date].
 */
async function isRegistrationOpen(roundId) {
	if (!roundId) return false;
	const pool = await getPool();
	const rows = (
		await pool.request().input('rid', sql.VarChar(10), roundId).query(`
			SELECT start_date, deadline_date
			FROM round_deadlines
			WHERE round_id = @rid AND deadline_type = 'topic_registration'
		`)
	).recordset;

	if (rows.length === 0) return true;

	const today = todayVN();
	return rows.some((r) => {
		const afterStart = !r.start_date || today >= new Date(r.start_date);
		const end = r.deadline_date ? new Date(r.deadline_date) : null;
		return afterStart && end && today <= end;
	});
}

/** Ném lỗi 403 nếu ngoài thời gian đăng ký đề tài của đợt. */
async function assertRegistrationOpen(roundId) {
	if (await isRegistrationOpen(roundId)) return;
	throw httpError(403, 'Hiện không trong thời gian đăng ký đề tài của đợt này.');
}

module.exports = {
	assertTopicActionWindow,
	isTopicActionAllowed,
	isRegistrationOpen,
	assertRegistrationOpen,
};
