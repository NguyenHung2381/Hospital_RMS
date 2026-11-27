// courseService.create / update + setPrograms — ghi khóa học và đồng bộ chương trình áp dụng
// chung 1 transaction có người thao tác (D1, docs/review/2026-11-26/03-training.md). Lỗi khi
// gắn chương trình ⇒ rollback cả câu ghi khóa học, không để khóa học mất liên kết cũ.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { install } = require('../auth/fakeDb');

const state = { current: [], known: [], failInsert: null, tx: 0, seq: 0 };
const log = install(async (text, inputs) => {
	log.at(-1).tx = state.tx;
	if (/INSERT INTO courses \(/.test(text)) return [{ id: inputs.new_id }];
	if (/SELECT id, program_id FROM course_programs/.test(text)) return state.current;
	if (/SELECT id FROM training_programs/.test(text)) return state.known.map((id) => ({ id }));
	if (/INSERT INTO course_programs/.test(text) && inputs.program_id === state.failInsert)
		throw new Error('insert lỗi');
	return [];
});
// Đánh số từng transaction để biết câu nào chạy trong transaction nào. Thay TRƯỚC khi nạp
// courseService; withActorTransaction gọi qua db.withTransaction nên cũng được đánh số.
const fakeTx = db.withTransaction;
db.withTransaction = async (fn) => {
	const outer = state.tx;
	state.tx = ++state.seq;
	try {
		return await fakeTx(fn);
	} finally {
		// COMMIT / ROLLBACK / LOCK do fakeDb ghi thẳng vào log (không qua handler)
		for (const l of log) if (l.tx === undefined) l.tx = state.tx;
		state.tx = outer;
	}
};
require('../../src/modules/events/eventService').broadcast = () => {};
const programClassService = require('../../src/modules/training/courses/programClassService');
programClassService.appliesTo = () => false;
programClassService.refreshCourse = async () => {};
const courseService = require('../../src/modules/training/courses/courseService');

const reset = (patch) => {
	log.length = 0;
	Object.assign(state, { current: [], known: [], failInsert: null }, patch);
};
// Các câu của setPrograms (câu SELECT của getById cũng nhắc course_programs nên lọc hẹp)
const LINK_SQL =
	/SELECT id, program_id FROM course_programs|(DELETE FROM|INSERT INTO) course_programs|SELECT id FROM training_programs/;
const find = (re) => log.filter((l) => re.test(l.text));
const inTx = (tx, text) => log.filter((l) => l.tx === tx && l.text === text).length;

test('update: UPDATE courses + gỡ + gắn chương trình chung 1 transaction có người thao tác', async () => {
	reset({
		current: [
			{ id: 'CPa', program_id: 'P1' },
			{ id: 'CPb', program_id: 'P2' },
		],
		known: ['P3', 'P4'],
	});
	await courseService.update(
		'K1',
		{ name: 'Khóa A', program_ids: ['P1', 'P3', '', 'P4', 'P9'] },
		'U1',
	);
	const [upd] = find(/UPDATE courses SET/);
	const tx = upd.tx;
	assert.ok(tx > 0);
	assert.equal(upd.inputs.name, 'Khóa A');
	assert.equal(upd.inputs.actor_id, 'U1');
	// Người thao tác đặt cho trigger audit trong chính transaction này
	assert.ok(
		find(/set_config\('app\.current_user_id'/).some(
			(l) => l.tx === tx && l.inputs.actor_id === 'U1',
		),
	);
	const links = find(LINK_SQL);
	assert.ok(links.length >= 4);
	assert.ok(
		links.every((l) => l.tx === tx),
		'đọc / gỡ / kiểm / gắn cùng transaction với UPDATE courses',
	);
	assert.equal(inTx(tx, 'COMMIT'), 1);
	assert.equal(find(/^ROLLBACK$/).length, 0);

	const [del] = find(/DELETE FROM course_programs/);
	assert.deepEqual(JSON.parse(del.inputs.ids), ['CPb']);
	assert.equal(del.inputs.course_id, 'K1');
	// P9 không có trong training_programs ⇒ bỏ qua; P1 đã gắn ⇒ không gắn lại
	const ins = find(/INSERT INTO course_programs/);
	assert.deepEqual(
		ins.map((l) => l.inputs.program_id),
		['P3', 'P4'],
	);
	assert.ok(ins.every((l) => l.inputs.actor_id === 'U1' && l.inputs.course_id === 'K1'));
	// Mã CP… sinh dưới khóa trong chính transaction này
	assert.ok(log.some((l) => l.tx === tx && /^LOCK gen_course_program_id_CP/.test(l.text)));
});

test('update: gắn chương trình lỗi ⇒ ROLLBACK cả UPDATE courses và câu gỡ, ném lại lỗi gốc', async () => {
	reset({
		current: [{ id: 'CPa', program_id: 'P1' }],
		known: ['P3', 'P4'],
		failInsert: 'P4',
	});
	await assert.rejects(
		courseService.update('K1', { name: 'B', program_ids: ['P3', 'P4'] }, 'U1'),
		/insert lỗi/,
	);
	const [upd] = find(/UPDATE courses SET/);
	assert.ok(find(LINK_SQL).every((l) => l.tx === upd.tx));
	assert.equal(find(/DELETE FROM course_programs/)[0].tx, upd.tx);
	assert.equal(inTx(upd.tx, 'COMMIT'), 0);
	assert.equal(inTx(upd.tx, 'ROLLBACK'), 1);
});

test('update không gửi program_ids ⇒ không đụng course_programs, vẫn 1 transaction', async () => {
	reset({});
	await courseService.update('K1', { name: 'C' }, 'U1');
	assert.equal(find(LINK_SQL).length, 0);
	const [upd] = find(/UPDATE courses SET/);
	assert.equal(inTx(upd.tx, 'COMMIT'), 1);
});

test('create: INSERT courses + gắn chương trình chung 1 transaction; lỗi ⇒ không còn khóa học', async () => {
	reset({ known: ['P3'] });
	await courseService.create({ name: 'Khóa mới', program_ids: ['P3'] }, 'U1');
	const [insCourse] = find(/INSERT INTO courses \(/);
	const links = find(LINK_SQL);
	assert.ok(links.length >= 2);
	assert.ok(links.every((l) => l.tx === insCourse.tx));
	const [insLink] = find(/INSERT INTO course_programs/);
	assert.equal(insLink.inputs.course_id, insCourse.inputs.new_id);
	assert.equal(inTx(insCourse.tx, 'COMMIT'), 1);

	reset({ known: ['P3'], failInsert: 'P3' });
	await assert.rejects(
		courseService.create({ name: 'Khóa lỗi', program_ids: ['P3'] }, 'U1'),
		/insert lỗi/,
	);
	const [again] = find(/INSERT INTO courses \(/);
	assert.equal(inTx(again.tx, 'COMMIT'), 0);
	assert.equal(inTx(again.tx, 'ROLLBACK'), 1);
});
