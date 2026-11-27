// Chương trình đào tạo: ghi chương trình + gán lại đối tượng (setProgramTraineeTypes), và gán
// lại chương trình cho bài học (setLessonPrograms) — mỗi lần ghi chung 1 transaction (D1,
// docs/review/2026-11-26/03-training.md). Lỗi giữa chừng ⇒ rollback cả câu DELETE.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { install } = require('../auth/fakeDb');

const state = { fail: null, tx: 0, seq: 0 };
const log = install(async (text) => {
	log.at(-1).tx = state.tx;
	if (state.fail && state.fail.re.test(text)) throw state.fail.err;
	return [];
});
// Đánh số từng transaction (thay TRƯỚC khi nạp service — chúng destructure withTransaction;
// withActorTransaction gọi qua db.withTransaction nên cũng được đánh số).
const fakeTx = db.withTransaction;
db.withTransaction = async (fn) => {
	const outer = state.tx;
	state.tx = ++state.seq;
	try {
		return await fakeTx(fn);
	} finally {
		// COMMIT / ROLLBACK do fakeDb ghi thẳng vào log (không qua handler)
		for (const l of log) if (l.tx === undefined) l.tx = state.tx;
		state.tx = outer;
	}
};
const broadcasts = [];
require('../../src/modules/events/eventService').broadcast = (...a) => broadcasts.push(a);
const programService = require('../../src/modules/training/programs/trainingProgramService');
const lessonService = require('../../src/modules/training/programs/programLessonService');

const reset = (fail = null) => {
	log.length = 0;
	broadcasts.length = 0;
	state.fail = fail;
};
const find = (re) => log.filter((l) => re.test(l.text));
const inTx = (tx, text) => log.filter((l) => l.tx === tx && l.text === text).length;
const TYPES_SQL = /(DELETE FROM|INSERT INTO) program_trainee_types/;
const ACTOR_SQL = /set_config\('app\.current_user_id'/;
const pgError = (code) => Object.assign(new Error(`pg ${code}`), { code, severity: 'ERROR' });

test('update chương trình: UPDATE + gán lại đối tượng chung 1 transaction có người thao tác', async () => {
	reset();
	await programService.update(
		'CT1',
		{ name: 'CT A', trainee_type_ids: ['T2', '', 'T1', 'T2'] },
		'U1',
	);
	const [upd] = find(/UPDATE training_programs SET/);
	assert.ok(upd.tx > 0);
	assert.equal(upd.inputs.name, 'CT A');
	// trainee_type_id (cột cũ) = đối tượng đầu tiên, như trước
	assert.equal(upd.inputs.trainee_type_id, 'T2');
	assert.ok(find(ACTOR_SQL).some((l) => l.tx === upd.tx && l.inputs.actor_id === 'U1'));
	const types = find(TYPES_SQL);
	assert.equal(types.length, 2);
	assert.ok(types.every((l) => l.tx === upd.tx));
	assert.deepEqual(JSON.parse(types[1].inputs.ids), ['T2', 'T1']);
	assert.equal(inTx(upd.tx, 'COMMIT'), 1);
	assert.equal(broadcasts.length, 1);
});

test('update chương trình: INSERT đối tượng lỗi ⇒ ROLLBACK cả UPDATE và DELETE, không broadcast', async () => {
	reset({ re: /INSERT INTO program_trainee_types/, err: new Error('insert lỗi') });
	await assert.rejects(
		programService.update('CT1', { name: 'B', trainee_type_ids: ['T1'] }, 'U1'),
		/insert lỗi/,
	);
	const [upd] = find(/UPDATE training_programs SET/);
	assert.equal(find(/DELETE FROM program_trainee_types/)[0].tx, upd.tx);
	assert.equal(inTx(upd.tx, 'COMMIT'), 0);
	assert.equal(inTx(upd.tx, 'ROLLBACK'), 1);
	assert.equal(broadcasts.length, 0);
});

test('update chương trình: bỏ hết đối tượng ⇒ cột cũ về null + xóa liên kết; không gửi gì ⇒ không mở transaction', async () => {
	reset();
	await programService.update('CT1', { trainee_type_ids: [] }, 'U1');
	// Như trước: gửi trainee_type_ids thì cột cũ trainee_type_id đồng bộ theo (mảng rỗng ⇒ null)
	const [upd] = find(/UPDATE training_programs SET/);
	assert.equal(upd.inputs.trainee_type_id, null);
	const [del] = find(/DELETE FROM program_trainee_types/);
	assert.ok(del.tx > 0);
	assert.equal(upd.tx, del.tx);
	assert.equal(find(/INSERT INTO program_trainee_types/).length, 0);
	assert.ok(find(ACTOR_SQL).some((l) => l.tx === del.tx));
	assert.equal(inTx(del.tx, 'COMMIT'), 1);

	reset();
	await programService.update('CT1', {}, 'U1');
	assert.equal(
		find(/UPDATE training_programs|(DELETE FROM|INSERT INTO) program_trainee_types|^COMMIT$/)
			.length,
		0,
	);
	assert.equal(find(ACTOR_SQL).length, 0);
	assert.equal(broadcasts.length, 1);
});

test('create chương trình: INSERT + đối tượng chung 1 transaction; trùng mã ⇒ 409, rollback', async () => {
	reset();
	await programService.create({ name: 'CT mới', code: 'M1', trainee_type_ids: ['T1'] }, 'U1');
	const [ins] = find(/INSERT INTO training_programs/);
	const types = find(TYPES_SQL);
	assert.equal(types.length, 2);
	assert.ok(types.every((l) => l.tx === ins.tx));
	assert.equal(types[0].inputs.program_id, ins.inputs.new_id);
	assert.ok(find(ACTOR_SQL).some((l) => l.tx === ins.tx && l.inputs.actor_id === 'U1'));
	assert.equal(inTx(ins.tx, 'COMMIT'), 1);

	reset({ re: /INSERT INTO training_programs/, err: pgError('23505') });
	await assert.rejects(
		programService.create({ name: 'CT trùng', code: 'M1', trainee_type_ids: ['T1'] }, 'U1'),
		{ statusCode: 409, message: 'Mã chương trình đã tồn tại.' },
	);
	const [dup] = find(/INSERT INTO training_programs/);
	assert.equal(find(TYPES_SQL).length, 0);
	assert.equal(inTx(dup.tx, 'ROLLBACK'), 1);
	assert.equal(broadcasts.length, 0);
});

test('setLessonPrograms: xóa + chèn + dọn giảng viên chung 1 transaction, đọc lại sau COMMIT', async () => {
	reset();
	await lessonService.setLessonPrograms('PL1', ['CT2', 'CT1', 'CT2', ''], 'U1');
	const writes = find(/(DELETE FROM|INSERT INTO) (lesson_programs|program_lesson_lecturers)/);
	assert.deepEqual(
		writes.map((l) => l.text.match(/(DELETE FROM|INSERT INTO) \w+/)[0]),
		[
			'DELETE FROM lesson_programs',
			'INSERT INTO lesson_programs',
			'DELETE FROM program_lesson_lecturers',
		],
	);
	const tx = writes[0].tx;
	assert.ok(tx > 0);
	assert.ok(writes.every((l) => l.tx === tx));
	assert.deepEqual(JSON.parse(writes[1].inputs.ids), ['CT2', 'CT1']);
	assert.equal(inTx(tx, 'COMMIT'), 1);
	// getLessonProgramIds chạy sau khi commit (ngoài transaction)
	const [read] = find(/SELECT program_id FROM lesson_programs WHERE lesson_id/);
	assert.equal(read.tx, 0);
	assert.ok(log.indexOf(read) > log.findIndex((l) => l.text === 'COMMIT'));
});

test('setLessonPrograms: INSERT lỗi ⇒ ROLLBACK cả câu DELETE, không dọn giảng viên, không broadcast', async () => {
	reset({ re: /INSERT INTO lesson_programs/, err: new Error('insert lỗi') });
	await assert.rejects(lessonService.setLessonPrograms('PL1', ['CT1'], 'U1'), /insert lỗi/);
	const [del] = find(/DELETE FROM lesson_programs/);
	assert.ok(del.tx > 0);
	assert.equal(inTx(del.tx, 'ROLLBACK'), 1);
	assert.equal(inTx(del.tx, 'COMMIT'), 0);
	assert.equal(find(/program_lesson_lecturers/).length, 0);
	assert.equal(broadcasts.length, 0);
});
