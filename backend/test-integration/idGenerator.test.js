// Test tích hợp: sinh mã bằng JS (src/utils/idGenerator.js, thay sp_gen_*) trên
// SQL Server THẬT. Chạy trong 1 transaction rồi ROLLBACK ⇒ không để lại dữ liệu.
//
//   npm run test:smoke   (chạy cùng smoke.test.js)
//
// Bản PostgreSQL: test-integration-pg/idGenerator.test.js (cùng các ca).
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const db = require('../src/config/db');
require('../src/modules/events/eventService').broadcast = () => {};
const { run } = require('./idGenerator.cases');

test('sinh mã trên SQL Server thật (rollback)', async (t) => {
	await run(t, db);
});

// Thủ tục sp_gen_* cũ vẫn còn trong DB (chưa xoá tới cutover) ⇒ so kết quả trên
// cùng dữ liệu: hàm JS phải ra đúng mã thủ tục ra.
test('hàm JS ra cùng mã với thủ tục sp_gen_* cũ (rollback)', async (t) => {
	const { sql } = db;
	const gen = require('../src/utils/idGenerator');
	const pool = await db.getPool();
	const tx = new sql.Transaction(pool);
	await tx.begin();
	t.after(async () => {
		await tx.rollback();
		await pool.close();
	});
	const proc = async (name, inputs = {}, out = 'new_id', outType = sql.VarChar(30)) => {
		const req = new sql.Request(tx);
		for (const [k, [type, v]] of Object.entries(inputs)) req.input(k, type, v);
		req.output(out, outType);
		return (await req.execute(name)).output[out];
	};
	const q = async (text) => (await new sql.Request(tx).query(text)).recordset;

	const dated = [
		['sp_gen_course_id', 'genCourseId'],
		['sp_gen_class_session_id', 'genClassSessionId'],
		['sp_gen_certificate_id', 'genCertificateId'],
		['sp_gen_course_document_id', 'genCourseDocumentId'],
		['sp_gen_course_enrollment_id', 'genCourseEnrollmentId'],
		['sp_gen_course_program_id', 'genCourseProgramId'],
		['sp_gen_grade_id', 'genGradeId'],
		['sp_gen_lecturer_assignment_id', 'genLecturerAssignmentId'],
		['sp_gen_attendance_id', 'genAttendanceId'],
	];
	for (const [p, fn] of dated) {
		await t.test(`${p} = ${fn}`, async () => {
			assert.equal(await gen[fn](tx), await proc(p));
		});
	}

	await t.test('sp_gen_certificate_no = genCertificateNo', async () => {
		const year = new Date().getFullYear();
		assert.equal(
			await gen.genCertificateNo(tx, year),
			await proc('sp_gen_certificate_no', { year: [sql.Int, year] }, 'new_no'),
		);
	});

	await t.test('sp_gen_external_reviewer_id = genExternalReviewerId', async () => {
		assert.equal(await gen.genExternalReviewerId(tx), await proc('sp_gen_external_reviewer_id'));
	});

	await t.test('sp_gen_user_id = genUserId (mỗi khoa có nhân viên)', async () => {
		const depts = await q(
			"SELECT DISTINCT TOP 5 d.code FROM departments d JOIN users u ON u.id LIKE 'NV' + d.code + '[0-9][0-9][0-9][0-9]' WHERE d.code IS NOT NULL",
		);
		for (const { code } of depts) {
			assert.equal(
				await gen.genUserId(tx, code),
				await proc('sp_gen_user_id', { dept_code: [sql.VarChar(20), code] }),
				code,
			);
		}
	});

	await t.test('sp_gen_topic_id = genTopicId (các cặp loại + đợt đã có đề tài)', async () => {
		const pairs = await q(
			'SELECT DISTINCT TOP 5 t.category_id, t.round_id FROM topics t JOIN categories c ON c.id = t.category_id WHERE c.abbr IS NOT NULL',
		);
		for (const { category_id, round_id } of pairs) {
			assert.equal(
				await gen.genTopicId(tx, category_id, round_id),
				await proc('sp_gen_topic_id', {
					category_id: [sql.VarChar(6), category_id],
					round_id: [sql.VarChar(10), round_id],
				}),
			);
		}
	});

	await t.test('sp_gen_trainee_id / sp_gen_cme_no: dùng chung bộ đếm năm', async () => {
		const fromProc = await proc('sp_gen_trainee_id', { year: [sql.Int, 2098] });
		assert.equal(fromProc, 'HV20980001');
		assert.equal(await gen.genTraineeId(tx, 2098), 'HV20980002');
		const seq = await proc('sp_gen_cme_no', { year: [sql.Int, 2098] }, 'new_seq', sql.Int);
		assert.equal(await gen.genCmeNo(tx, 2098), seq + 1);
	});
});

test.after(async () => (await db.getPool()).close().catch(() => {}));
