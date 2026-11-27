// Hồ sơ chứng chỉ hành nghề (staffLicenseService) với CSDL giả: tạo/sửa chỉ ghi
// các cột cho phép, ghi người thao tác, tham số hoá tìm kiếm, giới hạn số dòng.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

require('../../src/modules/events/eventService').broadcast = () => {};

const log = install(async (text, inputs) =>
	text.includes('WHERE sl.id = @id') ? [{ id: inputs.id }] : [],
);
const svc = require('../../src/modules/staffLicenses/staffLicenseService');

const write = (needle) => {
	const i = log.findIndex((l) => l.text.includes(needle));
	assert.ok(i >= 0, `có câu ${needle}`);
	return { i, ...log[i] };
};

test('create: thiếu user_id ⇒ 400, không ghi', async () => {
	log.length = 0;
	await assert.rejects(svc.create({ license_no: 'X' }, 'A'), { statusCode: 400 });
	assert.equal(log.length, 0);
});

test('create: chỉ ghi các cột trong fieldDefs, chuỗi rỗng ⇒ NULL, có người thao tác trong transaction', async () => {
	log.length = 0;
	const row = await svc.create(
		{ user_id: 'NV1', license_no: '000111/NA-CCHN', notes: '', is_admin: true, id: 'LIC_GIA' },
		'ADMIN',
	);
	const ins = write('INSERT INTO staff_practice_licenses');
	const iActor = log.findIndex((l) => l.text.includes('app.current_user_id'));
	assert.ok(iActor >= 0 && iActor < ins.i && ins.i < log.findIndex((l) => l.text === 'COMMIT'));
	assert.equal(ins.inputs.user_id, 'NV1');
	assert.equal(ins.inputs.license_no, '000111/NA-CCHN');
	assert.equal(ins.inputs.notes, null);
	assert.equal(ins.inputs.actor_id, 'ADMIN');
	assert.match(ins.inputs.new_id, /^LIC[0-9A-F]{17}$/, 'mã do server sinh, bỏ id gửi lên');
	assert.ok(!ins.text.includes('is_admin'));
	assert.equal(row.id, ins.inputs.new_id);
});

test('update: chỉ SET các trường được gửi và nằm trong fieldDefs', async () => {
	log.length = 0;
	await svc.update('LIC1', { practice_scope: 'Nội khoa', user_id: 'NV_KHAC', scope_code: '' }, 'A');
	const upd = write('UPDATE staff_practice_licenses');
	const set = upd.text.split(' SET ')[1].split(' WHERE')[0];
	assert.match(set, /practice_scope = @practice_scope/);
	assert.match(set, /scope_code = @scope_code/);
	assert.ok(!/user_id|license_no/.test(set), 'không đổi chủ hồ sơ, không chạm cột không gửi');
	assert.equal(upd.inputs.scope_code, null);
	assert.equal(upd.inputs.id, 'LIC1');
});

test('getMentors: giới hạn 1..50, chỉ nhân sự đang hoạt động, lọc có CCHN', async () => {
	for (const [limit, expected] of [
		[undefined, 20],
		[1000, 50],
		[0, 20],
		[-3, 1],
		['abc', 20],
	]) {
		log.length = 0;
		await svc.getMentors({ limit });
		assert.equal(log[0].inputs.limit, expected, `limit=${limit}`);
	}
	log.length = 0;
	await svc.getMentors({ search: "  An' --", licensed_only: '1' });
	const q = log[0];
	assert.match(q.text, /u\.is_active = 'true'/);
	assert.match(q.text, /sl\.license_no IS NOT NULL/);
	assert.equal(q.inputs.search_exact, "An' --");
	assert.equal(q.inputs.search, "%An' --%");
	assert.ok(!q.text.includes("An'"));
});

test('getAll: has_license lọc đúng, giá trị lạ bị bỏ qua', async () => {
	for (const [v, needle, absent] of [
		['1', 'license_no IS NOT NULL', false],
		['0', 'license_no IS NULL', false],
		['x', 'license_no IS', true],
	]) {
		log.length = 0;
		// queryAll giả chỉ trả 1 tập kết quả (thiếu total) ⇒ chỉ xét câu SQL
		await svc.getAll({ has_license: v }).catch(() => {});
		assert.equal(log[0].text.includes(needle), !absent, `has_license=${v}`);
	}
});
