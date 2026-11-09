/**
 * idGenerator.js — Sinh mã (khoá chính, số chứng chỉ, số CME...) bằng JS, chạy
 * được trên cả SQL Server và PostgreSQL. Thay cho các thủ tục `sp_gen_*` (đã gỡ),
 * giữ nguyên định dạng mã.
 *
 * Mọi hàm nhận `tx` (Transaction) và giữ khoá sinh mã tới khi transaction kết
 * thúc ⇒ phải INSERT dòng mới trong CÙNG transaction rồi commit ngay:
 *
 *   const id = await withTransaction(async (tx) => {
 *     const newId = await genCourseId(tx);
 *     await tx.request().input('id', sql.VarChar(20), newId)...query('INSERT ...');
 *     return newId;
 *   });
 *
 * Gọi nhiều lần trong cùng transaction (thêm nhiều dòng) vẫn đúng: lần sau thấy
 * dòng lần trước đã INSERT nên lấy số kế tiếp.
 */
const { randomUUID } = require('crypto');
const db = require('../config/db');
const { httpError } = require('./httpError');
const { VN_OFFSET_MS } = require('./vnDate');

const LOCK_TIMEOUT_MS = 5000;

const lockError = (what) =>
	httpError(503, `Không lấy được khóa sinh ${what}, vui lòng thử lại`, {
		code: 'ID_LOCK_TIMEOUT',
	});

const isIdLockTimeout = (err) => err?.code === 'ID_LOCK_TIMEOUT';

// Gọi qua db.lockResource để test thay được.
const lock = async (tx, resource, what, timeoutMs = LOCK_TIMEOUT_MS) => {
	if (!(await db.lockResource(tx, resource, timeoutMs))) throw lockError(what);
};

// Ngày hôm nay theo giờ VN dạng yyyymmdd (thủ tục sp_gen_* cũ lấy ngày giờ VN của máy SQL Server).
const todayCompactVN = () =>
	new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '');
const yearVN = () => new Date(Date.now() + VN_OFFSET_MS).getUTCFullYear();

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Số lớn nhất đang dùng sau `prefix` (đúng `digits` chữ số, hoặc ≥ digits nếu
 * `minDigits`), 0 nếu chưa có. LIKE chỉ lọc thô (ký tự đặc biệt của LIKE trong
 * prefix đổi thành `_`, lớp ký tự chữ số của LIKE không có ở PG); regex trong JS lọc đúng.
 * @param {any} tx
 * @param {{table: string, column?: string, prefix: string, digits: number,
 *   minDigits?: boolean, skip?: (digits: string) => boolean}} opts
 */
const maxSeq = async (tx, { table, column = 'id', prefix, digits, minDigits = false, skip }) => {
	const likePrefix = prefix.replace(/[%_[\]]/g, '_');
	const pattern = minDigits ? `${likePrefix}%` : likePrefix + '_'.repeat(digits);
	const re = new RegExp(`^${escapeRegex(prefix)}(\\d{${digits}${minDigits ? ',' : ''}})$`);
	const run = (select) =>
		tx
			.request()
			.input('pattern', db.sql.VarChar(100), pattern)
			.query(`SELECT ${select} AS v FROM ${table} WHERE ${column} LIKE @pattern`);
	// Nhanh: số cùng độ dài ⇒ MAX của chuỗi = MAX của số (đọc 1 dòng theo index).
	// Dòng lớn nhất không đúng mẫu (hoặc bị bỏ qua) thì mới quét cả dải.
	if (!minDigits) {
		const top = (await run(`MAX(${column})`)).recordset[0]?.v;
		if (top == null) return 0;
		const m = re.exec(String(top).trim());
		if (m && !(skip && skip(m[1]))) return Number(m[1]);
	}
	const { recordset } = await run(column);
	let max = 0;
	for (const { v } of recordset) {
		const m = re.exec(String(v).trim());
		if (!m || (skip && skip(m[1]))) continue;
		max = Math.max(max, Number(m[1]));
	}
	return max;
};

const format = (prefix, n, digits, what) => {
	const s = String(n).padStart(digits, '0');
	if (s.length > digits) throw httpError(409, `Đã hết số để sinh ${what} (${prefix})`);
	return prefix + s;
};

/**
 * MAX+1 theo tiền tố, có khoá. lockKey mặc định `gen_<name>_<prefix>` như thủ tục cũ.
 * @param {any} tx
 * @param {{table: string, column?: string, prefix: string, digits: number,
 *   what: string, lockKey: string, skip?: (digits: string) => boolean}} opts
 */
const nextId = async (tx, opts) => {
	await lock(tx, opts.lockKey, opts.what);
	const n = (await maxSeq(tx, opts)) + 1;
	return format(opts.prefix, n, opts.digits, opts.what);
};

// ── Mã theo ngày: XX + yyyymmdd + 4 số ────────────────────────────────────────
const dated = (code, table, name, what) => (tx) => {
	const prefix = code + todayCompactVN();
	return nextId(tx, { table, prefix, digits: 4, what, lockKey: `gen_${name}_${prefix}` });
};

const genClassSessionId = dated('BH', 'class_sessions', 'class_session_id', 'mã buổi học');
const genCertificateId = dated('CH', 'certificates', 'certificate_id', 'mã chứng chỉ');
const genCourseDocumentId = dated(
	'TL',
	'course_documents',
	'course_document_id',
	'mã tài liệu khóa học',
);
const genCourseEnrollmentId = dated(
	'DK',
	'course_enrollments',
	'course_enrollment_id',
	'mã đăng ký khóa học',
);
const genCourseProgramId = dated(
	'CP',
	'course_programs',
	'course_program_id',
	'mã chương trình áp dụng',
);
const genGradeId = dated('KQ', 'grades', 'grade_id', 'mã điểm');
const genLecturerAssignmentId = dated(
	'PC',
	'lecturer_assignments',
	'lecturer_assignment_id',
	'mã phân công giảng viên',
);
const genAttendanceId = dated('DD', 'attendance', 'attendance_id', 'mã điểm danh');
const genCourseId = dated('KH', 'courses', 'course_id', 'mã khóa học');

// ── Mã theo đối tượng cha: XX + mã cha + '_' + 2 số ──────────────────────────
const genCouncilId = (tx, roundId) =>
	nextId(tx, {
		table: 'councils',
		prefix: `HD${roundId}_`,
		digits: 2,
		what: 'mã hội đồng',
		lockKey: `gen_council_id_${roundId}`,
	});

const genCouncilMemberId = (tx, councilId) =>
	nextId(tx, {
		table: 'council_members',
		prefix: `HDM${councilId}_`,
		digits: 2,
		what: 'mã thành viên hội đồng',
		lockKey: `gen_council_member_id_${councilId}`,
	});

const genMemberId = (tx, topicId) =>
	nextId(tx, {
		table: 'topic_members',
		prefix: `TV${topicId}_`,
		digits: 2,
		what: 'mã thành viên đề tài',
		lockKey: `gen_member_id_${topicId}`,
	});

// Lượt tải file đề tài: BATCH + mã đề tài + yyyymmdd + 2 số; file: FILE + ... + 2 số
const genFileBatchId = (tx, topicId) => {
	const prefix = `BATCH${topicId}${todayCompactVN()}`;
	return nextId(tx, {
		table: 'file_batches',
		prefix,
		digits: 2,
		what: 'mã lượt tải file',
		lockKey: `gen_batch_id_${prefix}`,
	});
};
const genFileId = (tx, topicId) => {
	const prefix = `FILE${topicId}${todayCompactVN()}`;
	return nextId(tx, {
		table: 'files',
		prefix,
		digits: 2,
		what: 'mã file',
		lockKey: `gen_file_id_${prefix}`,
	});
};

// Dòng tiến độ đề tài: TT + mã đề tài + '_' + 2 số
const genProgressId = (tx, topicId) =>
	nextId(tx, {
		table: 'topic_progress',
		prefix: `TT${topicId}_`,
		digits: 2,
		what: 'mã tiến độ đề tài',
		lockKey: `gen_progress_id_${topicId}`,
	});

const genExternalReviewerId = (tx) =>
	nextId(tx, {
		table: 'external_reviewers',
		prefix: 'EXR',
		digits: 4,
		what: 'mã phản biện ngoài',
		lockKey: 'gen_external_reviewer_id',
	});

// Khoa/phòng: DV + 3 số (quá 999 thì dài hơn), như trigger trg_dept_gen_id cũ.
const genDeptId = async (tx) => {
	await lock(tx, 'gen_dept_id', 'mã khoa/phòng');
	const n =
		(await maxSeq(tx, { table: 'departments', prefix: 'DV', digits: 3, minDigits: true })) + 1;
	return 'DV' + String(n).padStart(3, '0');
};

/**
 * Mã nhân viên: NV + mã khoa + 4 số (bỏ qua đuôi 0000). Tài khoản khoa
 * (isDeptAccount) luôn là NV + mã khoa + '0000', lỗi nếu đã có.
 */
const genUserId = async (tx, deptCode, { isDeptAccount = false } = {}) => {
	const prefix = `NV${deptCode}`;
	if (isDeptAccount) {
		const id = `${prefix}0000`;
		const { recordset } = await tx
			.request()
			.input('id', db.sql.VarChar(20), id)
			.query('SELECT 1 AS x FROM users WHERE id = @id');
		if (recordset.length) throw httpError(409, `Tài khoản khoa ${deptCode} đã tồn tại`);
		return id;
	}
	return nextId(tx, {
		table: 'users',
		prefix,
		digits: 4,
		what: 'mã nhân viên',
		lockKey: `gen_user_id_${prefix}`,
		skip: (d) => d === '0000',
	});
};

// Mã đề tài: <ký hiệu loại>_<năm của đợt>_ + 3 số.
const genTopicId = async (tx, categoryId, roundId) => {
	const r = await tx
		.request()
		.input('category_id', db.sql.VarChar(6), categoryId ?? null)
		.input('round_id', db.sql.VarChar(10), roundId)
		.query(`SELECT (SELECT abbr FROM categories WHERE id = @category_id) AS abbr,
		               (SELECT year FROM research_rounds WHERE id = @round_id) AS year`);
	const { abbr, year } = r.recordset[0] || {};
	if (!abbr)
		throw httpError(400, `Loại đề tài ${categoryId} không hợp lệ hoặc chưa có ký hiệu viết tắt`);
	if (year == null) throw httpError(400, `Đợt nghiên cứu ${roundId} không tồn tại`);
	const prefix = `${abbr}_${year}_`;
	return nextId(tx, {
		table: 'topics',
		prefix,
		digits: 3,
		what: 'mã đề tài',
		lockKey: `gen_topic_id_${prefix}`,
	});
};

// Mã đợt: DOT + năm + số đợt (cố định, không cần khoá — trùng thì PK báo lỗi).
const genRoundId = async (txOrPool, year, roundNumber) => {
	const id = `DOT${year}${roundNumber}`;
	const { recordset } = await txOrPool
		.request()
		.input('id', db.sql.VarChar(10), id)
		.query('SELECT 1 AS x FROM research_rounds WHERE id = @id');
	if (recordset.length) throw httpError(409, `Đợt số ${roundNumber} năm ${year} đã tồn tại`);
	return id;
};

const checkYear = (year, what) => {
	if (!Number.isInteger(year) || year < 2000 || year > 2100)
		throw httpError(400, `Năm ${what} không hợp lệ`);
};

// Số chứng chỉ: CC + năm + 4 số (cột cert_no).
const genCertificateNo = (tx, year = yearVN()) => {
	checkYear(year, 'cấp chứng chỉ');
	const prefix = `CC${year}`;
	return nextId(tx, {
		table: 'certificates',
		column: 'cert_no',
		prefix,
		digits: 4,
		what: 'số chứng chỉ',
		lockKey: `gen_certificate_no_${prefix}`,
	});
};

/**
 * Bộ đếm theo năm (bảng <x>_year_register: year, last_seq, updated_at, updated_by):
 * tăng last_seq, chưa có dòng của năm thì thêm dòng = 1. Trả số mới.
 */
const bumpYearCounter = async (tx, { table, year, actorId, what, lockKey, timeoutMs }) => {
	await lock(tx, lockKey, what, timeoutMs);
	const req = () =>
		tx
			.request()
			.input('year', db.sql.Int, year)
			.input('actor_id', db.sql.VarChar(20), actorId ?? null);
	await req().query(
		`UPDATE ${table} SET last_seq = last_seq + 1, updated_at = CURRENT_TIMESTAMP, updated_by = @actor_id WHERE year = @year`,
	);
	const { recordset } = await req().query(`SELECT last_seq FROM ${table} WHERE year = @year`);
	if (recordset.length) return Number(recordset[0].last_seq);
	await req().query(
		`INSERT INTO ${table} (year, last_seq, updated_by) VALUES (@year, 1, @actor_id)`,
	);
	return 1;
};

// Mã học viên: HV + năm đăng ký + 4 số (đếm ở trainee_year_register).
const genTraineeId = async (tx, year = yearVN(), actorId = null) => {
	checkYear(year, 'đăng ký học viên');
	const seq = await bumpYearCounter(tx, {
		table: 'trainee_year_register',
		year,
		actorId,
		what: 'mã học viên',
		lockKey: `gen_trainee_id_${year}`,
		timeoutMs: 15000,
	});
	if (seq > 9999) {
		throw httpError(409, 'Đã vượt quá 9999 học viên đăng ký trong năm nay, không thể sinh thêm mã');
	}
	return `HV${year}${String(seq).padStart(4, '0')}`;
};

// Số thứ tự CME trong năm (đếm ở cme_year_register).
const genCmeNo = async (tx, year, actorId = null) => {
	checkYear(year, 'cấp CME');
	return bumpYearCounter(tx, {
		table: 'cme_year_register',
		year,
		actorId,
		what: 'số CME',
		lockKey: `gen_cme_no_${year}`,
		timeoutMs: 15000,
	});
};

/**
 * Mã ngẫu nhiên như mã NEWID cũ của SQL Server ('CM' + 18 ký tự): tiền tố + n ký tự
 * hex in hoa (n ≤ 32). Không cần khoá / transaction. Chèn nhiều dòng trong 1 câu
 * thì dùng `newIdSql` của adapter (config/db).
 * @param {string} prefix
 * @param {number} n
 */
const randomId = (prefix, n) => prefix + randomUUID().replace(/-/g, '').toUpperCase().slice(0, n);

/** Chuỗi hex ngẫu nhiên chữ thường, 32 ký tự (thay token NEWID chữ thường cũ). */
const randomHex32 = () => randomUUID().replace(/-/g, '');

/**
 * Mã <PREFIX>NN của bảng danh mục nhỏ (danh mục LDT, cấp độ CD, loại đợt RT, vai
 * trò VT): MAX+1, có khoá; hết 99 số thì 409 với thông báo `full`.
 * @param {any} tx
 * @param {string} table hằng trong code
 * @param {string} prefix
 * @param {string} full
 */
const genSeq2Id = async (tx, table, prefix, full) => {
	try {
		return await nextId(tx, {
			table,
			prefix,
			digits: 2,
			what: 'mã',
			lockKey: `gen_${table}_${prefix}`,
		});
	} catch (err) {
		if (err.statusCode === 409) throw httpError(409, full);
		throw err;
	}
};

module.exports = {
	randomId,
	genSeq2Id,
	randomHex32,
	nextId,
	maxSeq,
	isIdLockTimeout,
	todayCompactVN,
	genClassSessionId,
	genCertificateId,
	genCourseDocumentId,
	genCourseEnrollmentId,
	genCourseProgramId,
	genGradeId,
	genLecturerAssignmentId,
	genAttendanceId,
	genCourseId,
	genCouncilId,
	genCouncilMemberId,
	genMemberId,
	genProgressId,
	genFileBatchId,
	genFileId,
	genExternalReviewerId,
	genDeptId,
	genUserId,
	genTopicId,
	genRoundId,
	genCertificateNo,
	genTraineeId,
	genCmeNo,
};
