/**
 * seminarService.js — Quản lý Hội thảo / Hội nghị (bảng seminars).
 *
 * Độc lập với nghiệp vụ NCKH. Danh sách người tham dự nằm ở
 * seminarParticipantService; ở đây chỉ CRUD sự kiện + số liệu tổng hợp.
 */
const {
	getPool,
	sql,
	withActorTransaction,
	actorRequest,
	queryAll,
	nowSql,
	ilike,
} = require('../../config/db');
const attendanceMethods = require('../../utils/attendanceMethods');
const { randomId, randomHex32 } = require('../../utils/idGenerator');
const { broadcast } = require('../events/eventService');
const { paging } = require('../../utils/paging');
const { splitList, inClause, buildWhere } = require('../../utils/sqlFilters');
const fs = require('fs');
const path = require('path');
const { httpError } = require('../../utils/httpError');
const { UPLOADS_ROOT, SAFE_ID } = require('../../utils/uploadPaths');
const { normalizeTime, normalizeAgenda } = require('../../utils/seminarSchedule');
const seminarTests = require('./seminarTestService');
const ht = require('./hospitalTraining');
const {
	countSelect,
	statsHosted,
	statsCme,
	cmeRegister,
	updateRegisterSeq,
} = require('./seminarStatsService');

const EVENT_TYPES = [
	'conference',
	'sci_seminar',
	'intl_seminar',
	'sci_conference',
	'training',
	'other',
];
const SCOPES = ['external', 'hosted'];

// Cột đếm dùng chung cho list + detail

const getAll = async ({
	page = 1,
	limit = 20,
	search = undefined,
	scope = undefined,
	event_type = undefined,
	year = undefined,
	grants_cme = undefined,
	hospital_training = undefined,
} = {}) => {
	const pool = await getPool();
	const pg = paging(page, limit, 20);
	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);

	const clauses = [];
	if (search) {
		req.input('search', sql.NVarChar, `%${search}%`);
		clauses.push(
			`(${ilike('s.title', '@search')} OR ${ilike('s.location', '@search')} OR ${ilike('s.speakers', '@search')} OR ${ilike('s.host_chair', '@search')})`,
		);
	}
	clauses.push(inClause(req, 's.scope', 'sc', splitList(scope), sql.VarChar));
	clauses.push(inClause(req, 's.event_type', 'et', splitList(event_type), sql.VarChar));
	if (year !== undefined && year !== '' && year !== null) {
		req.input('year', sql.Int, parseInt(year, 10));
		clauses.push('s.event_year = @year');
	}
	if (grants_cme === '1' || grants_cme === 'true' || grants_cme === true) {
		clauses.push("s.grants_cme = 'true'");
	}
	clauses.push(ht.trainingFilter(hospital_training));
	const where = buildWhere(clauses);

	const sets = await queryAll(req, [
		`
    SELECT s.*, ${countSelect}, ${ht.trainingSelect}
    FROM seminars s ${ht.trainingJoin}
    ${where}
    ORDER BY COALESCE(s.start_date, s.created_at) DESC, s.created_at DESC
    ${pg.fetchClause}
		`,
		`
    SELECT COUNT(*) AS total FROM seminars s ${where}
		`,
	]);
	return {
		data: sets[0].map(ht.parseTraining),
		pagination: {
			page: pg.page,
			limit: pg.limit,
			total: sets[1][0].total,
		},
	};
};

// Cột bài kiểm tra cũ (1 bài / hội nghị) — dữ liệu đã chuyển sang seminar_tests /
// seminar_test_submissions (migration 2027-01-11), cột còn trong DB nhưng không trả ra.
const LEGACY_SEMINAR_TEST = [
	'test_questions',
	'test_open',
	'test_date',
	'test_start_time',
	'test_end_date',
	'test_end_time',
	'test_duration_minutes',
	'test_pass_score',
	'test_score_scale',
	'test_shuffle_questions',
	'test_shuffle_options',
];
const LEGACY_PARTICIPANT_TEST = [
	'test_answers',
	'test_correct',
	'test_total',
	'test_score',
	'test_max_score',
	'test_started_at',
	'test_submitted_at',
];
const omitLegacyTest = (row, keys) => {
	const out = { ...row };
	for (const k of keys) delete out[k];
	return out;
};

const getById = async (id) => {
	const pool = await getPool();
	const sets = await queryAll(pool.request().input('id', sql.VarChar(20), id), [
		`
      SELECT s.*, ${countSelect}, ${ht.trainingSelect} FROM seminars s ${ht.trainingJoin} WHERE s.id = @id
		`,
		`
      SELECT p.*,
             u.full_name  AS user_full_name,
             u.staff_number AS user_staff_number,
             d.name       AS user_department_name
      FROM seminar_participants p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE p.seminar_id = @id
      ORDER BY
        CASE p.participation_type WHEN 'chair' THEN 0 WHEN 'speaker' THEN 1
             WHEN 'organizer' THEN 2 WHEN 'attendee' THEN 3 ELSE 4 END,
        p.cme_seq, p.full_name
		`,
		`SELECT ${seminarTests.TEST_COLS} FROM seminar_tests t WHERE t.seminar_id = @id ${seminarTests.ORDER}`,
		`
      SELECT ${seminarTests.SUBMISSION_COLS}
      FROM seminar_test_submissions r JOIN seminar_tests t ON t.id = r.test_id
      WHERE t.seminar_id = @id
		`,
	]);
	const seminar = sets[0][0] && ht.parseTraining(sets[0][0]);
	if (!seminar) return null;
	// Đề kiểm tra + bài làm (nhiều đề / hội nghị) — participants[].test_results theo đề
	const results = new Map();
	for (const r of sets[3]) {
		if (!results.has(r.participant_id)) results.set(r.participant_id, []);
		results.get(r.participant_id).push(r);
	}
	seminar.tests = sets[2];
	// Phương thức điểm danh dùng được theo loại hội nghị (utils/attendanceMethods) — ẩn nút quét vé...
	seminar.checkin_methods = attendanceMethods.publicSeminar(
		await attendanceMethods.forSeminarType(seminar.event_type),
	);
	seminar.participants = sets[1].map((p) => ({
		...omitLegacyTest(p, LEGACY_PARTICIPANT_TEST),
		test_results: results.get(p.id) ?? [],
	}));
	return omitLegacyTest(seminar, LEGACY_SEMINAR_TEST);
};

// ─── Chuẩn hóa payload ───────────────────────────────────────────────────────
const normalizeType = (t) => (EVENT_TYPES.includes(t) ? t : 'other');
const normalizeScope = (s) => (SCOPES.includes(s) ? s : 'external');
const yearOf = (data) => {
	if (data.event_year) return parseInt(data.event_year, 10) || null;
	const d = data.start_date || data.date_text;
	const m = d && String(d).match(/(20\d{2})/);
	return m ? parseInt(m[1], 10) : null;
};

// Giờ 'HH:mm' của hội nghị. Đề kiểm tra (nhiều đề / hội nghị) sửa qua seminarTestService.
const TIME_FIELDS = {
	start_time: 'Giờ bắt đầu',
	end_time: 'Giờ kết thúc',
};

const create = async (input, actorId) => {
	const data = ht.applyLessonCredits(input);
	const newId = randomId('SEM', 17);
	await withActorTransaction(actorId, async (tx) => {
		await tx
			.request()
			.input('new_id', sql.VarChar(20), newId)
			.input('public_token', sql.VarChar(32), randomHex32())
			.input('actor_id', sql.VarChar(20), actorId)
			.input('title', sql.NVarChar(500), data.title)
			.input('event_type', sql.VarChar(30), normalizeType(data.event_type))
			.input('event_type_raw', sql.NVarChar(100), data.event_type_raw || null)
			.input('scope', sql.VarChar(20), normalizeScope(data.scope))
			.input('location', sql.NVarChar(255), data.location || null)
			.input('start_date', sql.Date, data.start_date || null)
			.input('end_date', sql.Date, data.end_date || null)
			.input(
				'start_time',
				sql.VarChar(5),
				normalizeTime(data.start_time, TIME_FIELDS.start_time) ?? null,
			)
			.input('end_time', sql.VarChar(5), normalizeTime(data.end_time, TIME_FIELDS.end_time) ?? null)
			.input('date_text', sql.NVarChar(100), data.date_text || null)
			.input('event_year', sql.Int, yearOf(data))
			.input('host_chair', sql.NVarChar(255), data.host_chair || null)
			.input('speakers', sql.NVarChar(sql.MAX), data.speakers || null)
			.input('permit_doc_no', sql.NVarChar(255), data.permit_doc_no || null)
			.input('co_organizers', sql.NVarChar(500), data.co_organizers || null)
			.input('grants_cme', sql.Bit, data.grants_cme ? 1 : 0)
			.input('cme_default_credits', sql.Decimal(4, 1), data.cme_default_credits ?? null)
			.input('coordinator', sql.NVarChar(100), data.coordinator || null)
			.input('notes', sql.NVarChar(sql.MAX), data.notes || null)
			.input('manual_participant_count', sql.Int, data.manual_participant_count ?? null)
			.input('manual_internal_count', sql.Int, data.manual_internal_count ?? null)
			.input('manual_external_count', sql.Int, data.manual_external_count ?? null)
			.input('manual_foreign_count', sql.Int, data.manual_foreign_count ?? null)
			.input('manual_cme_count', sql.Int, data.manual_cme_count ?? null)
			.input('organizer_department_id', sql.VarChar(20), data.organizer_department_id || null)
			.input('topic_id', sql.VarChar(20), data.topic_id || null)
			.input('lesson_hours', sql.Decimal(4, 1), data.lesson_hours ?? null).query(`
      INSERT INTO seminars
        (id, title, event_type, event_type_raw, scope, location, start_date, end_date,
         start_time, end_time, date_text, event_year, host_chair, speakers, permit_doc_no, co_organizers,
         grants_cme, cme_default_credits, coordinator, notes,
         manual_participant_count, manual_internal_count, manual_external_count,
         manual_foreign_count, manual_cme_count, organizer_department_id, topic_id, lesson_hours,
         public_token, created_by)
      VALUES
        (@new_id, @title, @event_type, @event_type_raw, @scope, @location, @start_date, @end_date,
         @start_time, @end_time, @date_text, @event_year, @host_chair, @speakers, @permit_doc_no, @co_organizers,
         @grants_cme, @cme_default_credits, @coordinator, @notes,
         @manual_participant_count, @manual_internal_count, @manual_external_count,
         @manual_foreign_count, @manual_cme_count, @organizer_department_id, @topic_id, @lesson_hours,
         @public_token, @actor_id)
    `);
		await ht.setRequiredDepartments(tx, newId, data.required_department_ids);
	});
	broadcast('update', { entity: 'seminar' });
	return getById(newId);
};

const FIELD_TYPES = {
	title: sql.NVarChar(500),
	event_type_raw: sql.NVarChar(100),
	location: sql.NVarChar(255),
	start_date: sql.Date,
	end_date: sql.Date,
	date_text: sql.NVarChar(100),
	host_chair: sql.NVarChar(255),
	speakers: sql.NVarChar(sql.MAX),
	permit_doc_no: sql.NVarChar(255),
	co_organizers: sql.NVarChar(500),
	cme_default_credits: sql.Decimal(4, 1),
	coordinator: sql.NVarChar(100),
	notes: sql.NVarChar(sql.MAX),
	manual_participant_count: sql.Int,
	manual_internal_count: sql.Int,
	manual_external_count: sql.Int,
	manual_foreign_count: sql.Int,
	manual_cme_count: sql.Int,
	...ht.TRAINING_FIELD_TYPES,
};

const update = async (id, input, actorId) => {
	const data = ht.applyLessonCredits(input);
	const sets = [`updated_at = ${nowSql}`, 'updated_by = @actor_id'];
	const req = actorRequest(actorId)
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId);

	for (const [key, type] of Object.entries(FIELD_TYPES)) {
		if (data[key] !== undefined) {
			sets.push(`${key} = @${key}`);
			req.input(key, type, data[key] === '' ? null : data[key]);
		}
	}
	const times = {};
	for (const [key, label] of Object.entries(TIME_FIELDS)) {
		times[key] = normalizeTime(data[key], label);
		if (times[key] !== undefined) {
			sets.push(`${key} = @${key}`);
			req.input(key, sql.VarChar(5), times[key]);
		}
	}
	if (data.agenda !== undefined) {
		sets.push('agenda = @agenda');
		req.input('agenda', sql.NVarChar(sql.MAX), normalizeAgenda(data.agenda));
	}
	if (data.event_type !== undefined) {
		sets.push('event_type = @event_type');
		req.input('event_type', sql.VarChar(30), normalizeType(data.event_type));
	}
	if (data.scope !== undefined) {
		sets.push('scope = @scope');
		req.input('scope', sql.VarChar(20), normalizeScope(data.scope));
	}
	if (data.grants_cme !== undefined) {
		sets.push('grants_cme = @grants_cme');
		req.input('grants_cme', sql.Bit, data.grants_cme ? 1 : 0);
	}
	if (data.event_year !== undefined || data.start_date !== undefined) {
		sets.push('event_year = @event_year');
		req.input('event_year', sql.Int, yearOf(data));
	}

	await req.query(`UPDATE seminars SET ${sets.join(', ')} WHERE id = @id`);
	if (Array.isArray(data.required_department_ids))
		await withActorTransaction(actorId, (tx) =>
			ht.setRequiredDepartments(tx, id, data.required_department_ids),
		);
	broadcast('update', { entity: 'seminar' });
	return getById(id);
};

// Chặn xóa khi còn người đã được cấp số CME (tránh mất số trong sổ năm).
const remove = async (id, actorId) => {
	const pool = await getPool();
	const check = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query(
			`SELECT COUNT(*) AS n FROM seminar_participants WHERE seminar_id = @id AND cme_seq IS NOT NULL`,
		);
	if (check.recordset[0].n > 0) {
		throw httpError(
			409,
			`Không thể xóa: đã có ${check.recordset[0].n} người được cấp số CME trong sự kiện này. Hãy thu hồi số CME trước.`,
		);
	}
	await withActorTransaction(actorId, (tx) =>
		tx
			.request()
			.input('id', sql.VarChar(20), id)
			.input('actor_id', sql.VarChar(20), actorId)
			.query(`DELETE FROM seminars WHERE id = @id`),
	);
	// Ảnh bài test của sự kiện (uploads/seminars/<id>/)
	if (SAFE_ID.test(id))
		fs.rm(path.join(UPLOADS_ROOT, 'seminars', id), { recursive: true, force: true }, () => {});
	broadcast('update', { entity: 'seminar' });
};

module.exports = {
	getAll,
	getById,
	create,
	update,
	remove,
	statsHosted,
	statsCme,
	cmeRegister,
	updateRegisterSeq,
};
