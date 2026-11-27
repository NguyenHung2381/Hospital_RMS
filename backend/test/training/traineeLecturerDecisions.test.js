// Các đề xuất D2–D4 người dùng đã duyệt (docs/review/2026-11-26/03-training.md):
//   D2: PUT /trainees/:id — mã không tồn tại ⇒ 404, không lưu trường tùy chỉnh.
//   D3: bản ghi trả về sau tạo / sửa học viên che / hiện CCCD theo quyền như GET chi tiết.
//   D4: lecturerService.remove không nuốt lỗi DB khi kiểm giảng viên đã được dùng.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const state = { failUsage: false, used: false };
const log = install(async (text, inputs) => {
	if (/INSERT INTO trainees/.test(text)) return [{ id: inputs.new_id }];
	if (/FROM trainees t/.test(text) && /WHERE t\.id = @id/.test(text))
		return [{ id: inputs.id, full_name: 'Học viên A', national_id: '012345678901' }];
	if (/FROM lecturer_assignments WHERE lecturer_id/.test(text)) {
		if (state.failUsage) throw Object.assign(new Error('mất kết nối'), { code: 'ECONNRESET' });
		return state.used ? [{ x: 1 }] : [];
	}
	return [];
});
require('../../src/modules/events/eventService').broadcast = () => {};
require('../../src/modules/persons/personService').syncPerson = async () => {};
const formCustom = require('../../src/modules/forms/formCustomValueService');
const customCalls = [];
formCustom.save = async (entity, id, values) => (
	customCalls.push(['save', entity, id]),
	values ?? null
);
formCustom.remove = async (entity, id) => customCalls.push(['remove', entity, id]);
const traineeService = require('../../src/modules/training/trainees/traineeService');
const lecturerService = require('../../src/modules/training/lecturers/lecturerService');

const SENSITIVE = { id: 'U1', permissions: new Set(['trainees:read_sensitive']) };
const PLAIN = { id: 'U2', permissions: new Set(['trainees:update']) };
const MASKED = '••••8901';

const run = async (handler, req) => {
	const res = {
		statusCode: 200,
		status(c) {
			this.statusCode = c;
			return this;
		},
		json(b) {
			this.body = b;
			return this;
		},
	};
	let err = null;
	await handler({ params: {}, query: {}, body: {}, ...req }, res, (e) => {
		err = e;
	});
	if (err) throw err;
	return res;
};

test('D3: update — người có read_sensitive thấy đủ CCCD; không truyền actor / thiếu quyền ⇒ che', async () => {
	const full = await traineeService.update('HV1', { full_name: 'A' }, 'U1', { actor: SENSITIVE });
	assert.equal(full.national_id, '012345678901');
	const plain = await traineeService.update('HV1', { full_name: 'A' }, 'U2', { actor: PLAIN });
	assert.equal(plain.national_id, MASKED);
	// Nơi gọi khác (import Excel...) không truyền actor ⇒ che như trước
	assert.equal((await traineeService.update('HV1', { full_name: 'A' }, 'U1')).national_id, MASKED);
});

test('D3: create — giống update; fetch=false vẫn chỉ trả { id }', async () => {
	const full = await traineeService.create({ full_name: 'B' }, 'U1', { actor: SENSITIVE });
	assert.equal(full.national_id, '012345678901');
	assert.equal((await traineeService.create({ full_name: 'B' }, 'U1')).national_id, MASKED);
	const bare = await traineeService.create({ full_name: 'B' }, 'U1', { fetch: false });
	assert.deepEqual(Object.keys(bare), ['id']);
});

test('D2 + D3: controller học viên — truyền người xem cho create / update; mã không có ⇒ 404, không lưu custom', async () => {
	const realUpdate = traineeService.update;
	const realCreate = traineeService.create;
	const seen = [];
	traineeService.update = async (id, body, actorId, opts) => (
		seen.push(['update', actorId, opts]),
		id === 'NONE' ? null : { id, full_name: 'A' }
	);
	traineeService.create = async (body, actorId, opts) => (
		seen.push(['create', actorId, opts]),
		{ id: 'HVNEW' }
	);
	// Nạp lại controller để nó lấy service đã thay (createCustomFormCrud giữ tham chiếu module)
	delete require.cache[require.resolve('../../src/modules/training/trainees/traineeController')];
	const ctrl = require('../../src/modules/training/trainees/traineeController');
	try {
		customCalls.length = 0;
		const miss = await run(ctrl.updateOne, {
			user: SENSITIVE,
			params: { id: 'NONE' },
			formCustom: { f1: 'x' },
		});
		assert.equal(miss.statusCode, 404);
		assert.deepEqual(customCalls, []);

		const ok = await run(ctrl.updateOne, { user: SENSITIVE, params: { id: 'HV1' } });
		assert.equal(ok.statusCode, 200);
		assert.equal(ok.body.message, 'Cập nhật thành công');
		assert.deepEqual(ok.body.data, { id: 'HV1', full_name: 'A' });
		assert.deepEqual(customCalls, [['save', 'trainee', 'HV1']]);

		const c = await run(ctrl.createOne, { user: PLAIN, body: { full_name: 'C' } });
		assert.equal(c.statusCode, 201);
		assert.deepEqual(seen, [
			['update', 'U1', { actor: SENSITIVE }],
			['update', 'U1', { actor: SENSITIVE }],
			['create', 'U2', { actor: PLAIN }],
		]);
	} finally {
		traineeService.update = realUpdate;
		traineeService.create = realCreate;
	}
});

test('D4: lỗi DB khi kiểm "đã được dùng" ⇒ ném ra, không DELETE cứng, không xóa custom', async () => {
	log.length = 0;
	customCalls.length = 0;
	state.failUsage = true;
	await assert.rejects(lecturerService.remove('GV1', 'U1'), /mất kết nối/);
	state.failUsage = false;
	assert.equal(log.filter((l) => /DELETE FROM lecturers|UPDATE lecturers/.test(l.text)).length, 0);
	assert.deepEqual(customCalls, []);
});

test('D4: chưa dùng ⇒ DELETE cứng + xóa custom; đã dùng ⇒ chỉ vô hiệu hóa, giữ custom', async () => {
	log.length = 0;
	customCalls.length = 0;
	Object.assign(state, { failUsage: false, used: false });
	await lecturerService.remove('GV1', 'U1');
	assert.equal(log.filter((l) => /DELETE FROM lecturers WHERE id = @id/.test(l.text)).length, 1);
	assert.deepEqual(customCalls, [['remove', 'lecturer', 'GV1']]);

	log.length = 0;
	customCalls.length = 0;
	state.used = true;
	await lecturerService.remove('GV2', 'U1');
	assert.equal(
		log.filter((l) => /UPDATE lecturers SET is_active = 'false'/.test(l.text)).length,
		1,
	);
	assert.equal(log.filter((l) => /DELETE FROM lecturers/.test(l.text)).length, 0);
	assert.deepEqual(customCalls, []);
	state.used = false;
});
