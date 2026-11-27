/**
 * seminarTestService.js — Đề kiểm tra của hội thảo / hội nghị (bảng seminar_tests).
 *
 * Một hội nghị có nhiều đề (vd bài trước buổi + bài cuối buổi, hoặc 1 đề / phiên). Mỗi
 * đề: câu hỏi trắc nghiệm 1 đáp án, công tắc mở, khung giờ, thời gian làm bài, thang
 * điểm, điểm đạt, trộn đề, và có tính vào điều kiện cấp CME hay không (counts_for_cme).
 * Bài làm: seminar_test_submissions (1 dòng / người / đề) — làm và chấm ở
 * seminarPublicService (vé QR) hoặc seminarTestQrService (QR chung của đề, nhập họ tên:
 * qr_enabled bật / tắt, qr_counts_for_cme = bài nộp kiểu này có tính điều kiện CME không).
 *
 * Cột test_* của seminar_tests giữ tên cột cũ của seminars nên utils/seminarSchedule
 * (testWindow, testState) và utils/seminarTest dùng thẳng với dòng đề — kèm start_date /
 * end_date của hội nghị (ngày mở mặc định), xem withSeminarDates().
 */
const { getPool, sql, withActorTransaction, nowSql } = require('../../config/db');
const { randomId, randomHex32 } = require('../../utils/idGenerator');
const { broadcast } = require('../events/eventService');
const { httpError, badRequest } = require('../../utils/httpError');
const { removeUploadedFile, toStoredUploadPath } = require('../../utils/uploadPaths');
const { normalizeTime } = require('../../utils/seminarSchedule');
const { maxScore } = require('../../utils/seminarTest');

// Cột cấu hình đề (không gồm id / seminar_id / audit)
const TEST_COLS = `t.id, t.seminar_id, t.title, t.sort_order, t.counts_for_cme, t.test_questions,
  t.test_open, t.test_date, t.test_start_time, t.test_end_date, t.test_end_time,
  t.test_duration_minutes, t.test_pass_score, t.test_score_scale, t.test_shuffle_questions,
  t.test_shuffle_options, t.qr_token, t.qr_enabled, t.qr_counts_for_cme, t.created_at, t.updated_at`;
// Bài làm — không trả test_answers (đáp án đã chọn) ra màn quản lý
const SUBMISSION_COLS = `r.test_id, r.participant_id, r.test_correct, r.test_total, r.test_score,
  r.test_max_score, r.test_started_at, r.test_submitted_at, r.via`;
const ORDER = 'ORDER BY t.sort_order, t.created_at, t.id';

/** Dòng đề + ngày hội nghị: testWindow() lấy ngày kết thúc / bắt đầu làm ngày mở mặc định */
const withSeminarDates = (test, seminar) => ({
	...test,
	start_date: seminar?.start_date ?? null,
	end_date: seminar?.end_date ?? null,
});

// ─── Chuẩn hóa payload ───────────────────────────────────────────────────────

// Câu hỏi: [{ q, image?, options: [..≥2], answer: index, points }]. image: ảnh minh họa,
// tải lên qua POST /seminars/:id/test-image (thư mục chung của hội nghị).
const testImageDir = (seminarId) => `/uploads/seminars/${seminarId}/test/`;
const testImages = (json) => {
	try {
		return (JSON.parse(json || '[]') || []).map((x) => x?.image).filter(Boolean);
	} catch {
		return [];
	}
};
const normalizeTestQuestions = (raw, seminarId) => {
	if (raw === null || raw === '') return null;
	if (!Array.isArray(raw)) throw badRequest('Danh sách câu hỏi không hợp lệ.');
	if (!raw.length) return null;
	const out = raw.map((x, i) => {
		const q = String(x?.q ?? '').trim();
		const options = (Array.isArray(x?.options) ? x.options : []).map((o) => String(o ?? '').trim());
		const answer = Number(x?.answer);
		if (!q) throw badRequest(`Câu ${i + 1}: chưa nhập nội dung câu hỏi.`);
		if (options.length < 2) throw badRequest(`Câu ${i + 1}: cần ít nhất 2 phương án.`);
		// Không tự lọc phương án trống — lọc sẽ làm lệch chỉ số đáp án đúng
		if (options.some((o) => !o)) throw badRequest(`Câu ${i + 1}: có phương án để trống.`);
		if (!Number.isInteger(answer) || answer < 0 || answer >= options.length)
			throw badRequest(`Câu ${i + 1}: chưa chọn đáp án đúng.`);
		const points = x?.points == null || x.points === '' ? 1 : Number(x.points);
		if (!Number.isFinite(points) || points <= 0 || points > 1000)
			throw badRequest(`Câu ${i + 1}: điểm phải lớn hơn 0 (tối đa 1000).`);
		const image = toStoredUploadPath(x?.image, testImageDir(seminarId));
		const out = { q, options, answer, points: Math.round(points * 100) / 100 };
		return image ? { ...out, image } : out;
	});
	return JSON.stringify(out);
};

const TIME_FIELDS = {
	test_start_time: 'Giờ mở bài kiểm tra',
	test_end_time: 'Giờ dừng tiếp nhận bài kiểm tra',
};

// Thời gian làm bài (phút) / điểm đạt / thang: '' / null → null; sai → 400
const optionalNumber = (v, label, { min, max, integer = false }) => {
	if (v === undefined) return undefined;
	if (v === null || v === '') return null;
	const n = Number(v);
	if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n)))
		throw badRequest(`${label} phải là ${integer ? 'số nguyên' : 'số'} từ ${min} đến ${max}.`);
	return integer ? n : Math.round(n * 100) / 100;
};

const optionalDate = (v) => {
	if (v === undefined) return undefined;
	if (v === null || v === '') return null;
	const d = String(v).slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw badRequest('Ngày không hợp lệ.');
	return d;
};

/**
 * Payload → { cột: [kiểu, giá trị] } chỉ gồm trường có gửi lên (undefined = giữ nguyên).
 * `creating`: bắt buộc có tên đề.
 */
const normalize = (data, seminarId, { creating = false } = {}) => {
	const cols = {};
	if (data.title !== undefined || creating) {
		const title = String(data.title ?? '').trim();
		if (!title) throw badRequest('Chưa nhập tên đề kiểm tra.');
		if (title.length > 255) throw badRequest('Tên đề kiểm tra tối đa 255 ký tự.');
		cols.title = [sql.NVarChar(255), title];
	}
	for (const key of [
		'test_open',
		'test_shuffle_questions',
		'test_shuffle_options',
		'counts_for_cme',
		'qr_enabled',
		'qr_counts_for_cme',
	])
		if (data[key] !== undefined) cols[key] = [sql.Bit, data[key] ? 1 : 0];

	const dates = {
		test_date: optionalDate(data.test_date),
		test_end_date: optionalDate(data.test_end_date),
	};
	for (const [key, v] of Object.entries(dates)) if (v !== undefined) cols[key] = [sql.Date, v];
	const times = {};
	for (const [key, label] of Object.entries(TIME_FIELDS)) {
		times[key] = normalizeTime(data[key], label);
		if (times[key] !== undefined) cols[key] = [sql.VarChar(5), times[key]];
	}
	// Ngày trống = mặc định (xem seminarSchedule.testWindow); chỉ so được khi biết ngày
	if (times.test_start_time && times.test_end_time) {
		const openDay = dates.test_date || '';
		const closeDay = dates.test_end_date || openDay;
		if (`${closeDay} ${times.test_end_time}` <= `${openDay} ${times.test_start_time}`)
			throw badRequest('Thời điểm dừng tiếp nhận bài kiểm tra phải sau thời điểm mở bài.');
	}
	const duration = optionalNumber(data.test_duration_minutes, 'Thời gian làm bài (phút)', {
		min: 1,
		max: 1440,
		integer: true,
	});
	if (duration !== undefined) cols.test_duration_minutes = [sql.Int, duration];
	const passScore = optionalNumber(data.test_pass_score, 'Điểm đạt', { min: 0, max: 100000 });
	if (passScore !== undefined) cols.test_pass_score = [sql.Decimal(7, 2), passScore];
	// Thang điểm tối đa (vd 10, 100): điểm bài làm được quy về thang này trước khi so điểm đạt.
	// Trống = thang là tổng điểm các câu.
	const scale = optionalNumber(data.test_score_scale, 'Thang điểm tối đa', { min: 1, max: 10000 });
	if (scale !== undefined) {
		cols.test_score_scale = [sql.Decimal(7, 2), scale];
		if (scale != null && passScore != null && passScore > scale)
			throw badRequest(`Điểm đạt (${passScore}) lớn hơn thang điểm tối đa (${scale}).`);
	}
	if (data.test_questions !== undefined) {
		const next = normalizeTestQuestions(data.test_questions, seminarId);
		const max = maxScore(JSON.parse(next || '[]'));
		if (passScore != null && next && !scale && passScore > max)
			throw badRequest(`Điểm đạt (${passScore}) lớn hơn tổng điểm bài kiểm tra (${max}).`);
		if (data.test_open && !next) throw badRequest('Chưa có câu hỏi nào để mở bài kiểm tra.');
		cols.test_questions = [sql.NVarChar(sql.MAX), next];
	}
	return cols;
};

// ─── Đọc ─────────────────────────────────────────────────────────────────────

/** Các đề của 1 hội nghị (gồm câu hỏi + đáp án — chỉ dùng phía quản lý) */
const listBySeminar = async (seminarId) => {
	const pool = await getPool();
	return (
		await pool
			.request()
			.input('sid', sql.VarChar(20), seminarId)
			.query(`SELECT ${TEST_COLS} FROM seminar_tests t WHERE t.seminar_id = @sid ${ORDER}`)
	).recordset;
};

const getOne = async (seminarId, testId) => {
	const pool = await getPool();
	const row = (
		await pool
			.request()
			.input('sid', sql.VarChar(20), seminarId)
			.input('tid', sql.VarChar(20), testId)
			.query(`SELECT ${TEST_COLS} FROM seminar_tests t WHERE t.seminar_id = @sid AND t.id = @tid`)
	).recordset[0];
	if (!row) throw httpError(404, 'Đề kiểm tra không tồn tại.');
	return row;
};

const ensureSeminar = async (seminarId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), seminarId)
		.query('SELECT id FROM seminars WHERE id = @id');
	if (!r.recordset.length) throw httpError(404, 'Hội thảo/hội nghị không tồn tại.');
};

// Ảnh câu hỏi nằm chung thư mục của hội nghị: chỉ xoá ảnh không còn đề nào dùng
const unusedImages = async (seminarId, testId, prevJson, nextJson) => {
	const others = (await listBySeminar(seminarId)).filter((t) => t.id !== testId);
	const kept = new Set([
		...testImages(nextJson),
		...others.flatMap((t) => testImages(t.test_questions)),
	]);
	return testImages(prevJson).filter((img) => !kept.has(img));
};

// ─── Ghi ─────────────────────────────────────────────────────────────────────

const create = async (seminarId, data, actorId) => {
	await ensureSeminar(seminarId);
	const cols = normalize(data, seminarId, { creating: true });
	if (data.test_open && !cols.test_questions?.[1])
		throw badRequest('Chưa có câu hỏi nào để mở bài kiểm tra.');
	const id = randomId('SMT', 17);
	await withActorTransaction(actorId, async (tx) => {
		const req = tx
			.request()
			.input('id', sql.VarChar(20), id)
			.input('sid', sql.VarChar(20), seminarId)
			.input('sid_order', sql.VarChar(20), seminarId)
			.input('qr_token', sql.VarChar(32), randomHex32())
			.input('actor_id', sql.VarChar(20), actorId);
		for (const [key, [type, v]] of Object.entries(cols)) req.input(key, type, v);
		const names = Object.keys(cols);
		// Tham số riêng cho truy vấn con: PG suy kiểu 1 tham số dùng ở 2 chỗ khác kiểu (text/varchar) thì lỗi
		await req.query(`
      INSERT INTO seminar_tests (id, seminar_id, sort_order, qr_token, created_by${names.map((n) => `, ${n}`).join('')})
      VALUES (@id, @sid,
        (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM seminar_tests WHERE seminar_id = @sid_order),
        @qr_token, @actor_id${names.map((n) => `, @${n}`).join('')})`);
	});
	broadcast('update', { entity: 'seminar' });
	return getOne(seminarId, id);
};

const update = async (seminarId, testId, data, actorId) => {
	const prev = await getOne(seminarId, testId);
	const cols = normalize(data, seminarId);
	// Bật đề mà không gửi câu hỏi: đề hiện tại phải có câu hỏi
	if (data.test_open && cols.test_questions === undefined && !prev.test_questions)
		throw badRequest('Chưa có câu hỏi nào để mở bài kiểm tra.');
	const names = Object.keys(cols);
	if (names.length) {
		await withActorTransaction(actorId, async (tx) => {
			const req = tx
				.request()
				.input('sid', sql.VarChar(20), seminarId)
				.input('tid', sql.VarChar(20), testId)
				.input('actor_id', sql.VarChar(20), actorId);
			for (const [key, [type, v]] of Object.entries(cols)) req.input(key, type, v);
			await req.query(`
        UPDATE seminar_tests
        SET ${names.map((n) => `${n} = @${n}`).join(', ')}, updated_at = ${nowSql}, updated_by = @actor_id
        WHERE seminar_id = @sid AND id = @tid`);
		});
	}
	if (cols.test_questions !== undefined)
		(await unusedImages(seminarId, testId, prev.test_questions, cols.test_questions[1])).forEach(
			removeUploadedFile,
		);
	broadcast('update', { entity: 'seminar' });
	return getOne(seminarId, testId);
};

// Đã có người làm thì không xoá (mất bài làm, đổi điều kiện cấp CME) — tắt đề hoặc bỏ
// "tính điều kiện CME" thay vì xoá.
const remove = async (seminarId, testId, actorId) => {
	const prev = await getOne(seminarId, testId);
	await withActorTransaction(actorId, async (tx) => {
		const n = (
			await tx
				.request()
				.input('tid', sql.VarChar(20), testId)
				.query('SELECT COUNT(*) AS n FROM seminar_test_submissions WHERE test_id = @tid')
		).recordset[0].n;
		if (Number(n) > 0)
			throw httpError(
				409,
				`Đã có ${n} người làm đề "${prev.title}" — không xoá được. Hãy tắt đề (hoặc bỏ tính điều kiện CME) thay vì xoá.`,
			);
		await tx
			.request()
			.input('sid', sql.VarChar(20), seminarId)
			.input('tid', sql.VarChar(20), testId)
			.query('DELETE FROM seminar_tests WHERE seminar_id = @sid AND id = @tid');
	});
	(await unusedImages(seminarId, testId, prev.test_questions, null)).forEach(removeUploadedFile);
	broadcast('update', { entity: 'seminar' });
};

module.exports = {
	TEST_COLS,
	SUBMISSION_COLS,
	ORDER,
	withSeminarDates,
	listBySeminar,
	create,
	update,
	remove,
	// cho test
	normalize,
	normalizeTestQuestions,
};
