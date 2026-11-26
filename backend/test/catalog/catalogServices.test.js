// Danh mục NCKH (catalog) với CSDL giả: sinh mã tuần tự LDT/CD/RT trong
// transaction có khoá, cấp độ theo loại đợt / theo đợt (fallback khi chưa cấu
// hình), thay cấp độ của loại đợt trong 1 transaction, xoá khoa/phòng gỡ liên kết.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');
const db = require('../../src/config/db');

require('../../src/modules/events/eventService').broadcast = () => {};

const state = {};
const reset = (over = {}) => {
	Object.assign(state, {
		maxId: null, // MAX(id) hiện có của bảng danh mục
		rtLevels: [], // round_type_levels
		rtLevelsError: null,
		existingLevels: ['CD01', 'CD02', 'CD03'],
		...over,
	});
	log.length = 0;
};
const LEVELS = [
	{ id: 'CD01', name: 'Cơ sở' },
	{ id: 'CD02', name: 'Tỉnh' },
	{ id: 'CD03', name: 'Bộ' },
];

const log = install(async (text, inputs) => {
	if (text.includes('AS v FROM')) return [{ v: state.maxId }];
	if (text.includes('FROM round_type_levels WHERE round_type_id')) {
		if (state.rtLevelsError) throw state.rtLevelsError;
		return state.rtLevels.map((level_id) => ({ level_id }));
	}
	if (text.includes('SELECT 1 AS x FROM levels WHERE id = @lid'))
		return state.existingLevels.includes(inputs.lid) ? [{ x: 1 }] : [];
	if (/SELECT \* FROM (categories|levels|round_types) WHERE id = @id/.test(text))
		return [{ id: inputs.id }];
	if (text.includes('COUNT(*) AS total')) return [{ total: LEVELS.length }];
	if (text.includes('FROM levels')) return LEVELS;
	return [];
});
// queryAll giả của fakeDb chỉ trả 1 tập kết quả ⇒ chạy từng câu (getAll cần dòng total)
db.queryAll = async (req, statements) => {
	const out = [];
	for (const s of statements) out.push((await req.query(s)).recordset);
	return out;
};

const roundService = require('../../src/modules/rounds/roundService');
const categoryService = require('../../src/modules/catalog/categoryService');
const levelService = require('../../src/modules/catalog/levelService');
const roundTypeService = require('../../src/modules/catalog/roundTypeService');
const departmentService = require('../../src/modules/catalog/departmentService');

const texts = () => log.map((l) => l.text);

test('category.create: mã LDT kế tiếp, sinh mã dưới khoá, ghi người thao tác, trong transaction', async () => {
	reset({ maxId: 'LDT07' });
	const row = await categoryService.create({ name: 'Lâm sàng', abbr: 'LS' }, 'ADMIN');
	assert.equal(row.id, 'LDT08');
	const t = texts();
	const iActor = t.findIndex((x) => x.includes('app.current_user_id'));
	const iLock = t.findIndex((x) => x.startsWith('LOCK gen_categories_LDT'));
	const iIns = t.findIndex((x) => x.includes('INSERT INTO categories'));
	assert.ok(iActor >= 0 && iLock > iActor && iIns > iLock && t.indexOf('COMMIT') > iIns);
	const ins = log[iIns].inputs;
	assert.deepEqual(
		[ins.id, ins.name, ins.abbr, ins.actor_id],
		['LDT08', 'Lâm sàng', 'LS', 'ADMIN'],
	);
});

test('category.create: bảng rỗng ⇒ LDT01; đã tới LDT99 ⇒ 409 và rollback', async () => {
	reset({ maxId: null });
	assert.equal((await categoryService.create({ name: 'A' }, 'A')).id, 'LDT01');

	reset({ maxId: 'LDT99' });
	await assert.rejects(categoryService.create({ name: 'B' }, 'A'), {
		statusCode: 409,
		message: 'Đã đạt giới hạn 99 danh mục',
	});
	assert.ok(texts().includes('ROLLBACK'));
	assert.ok(!texts().some((x) => x.includes('INSERT INTO categories')));
});

test('level.create / roundType.create: mã CDnn / RTnn tuần tự', async () => {
	reset({ maxId: 'CD03' });
	assert.equal((await levelService.create({ name: 'Quốc gia' }, 'A')).id, 'CD04');
	reset({ maxId: 'RT09' });
	assert.equal((await roundTypeService.create({ name: 'Đột xuất' }, 'A')).id, 'RT10');
	assert.ok(texts().some((x) => x.includes('INSERT INTO round_types')));
});

test('getLevelIdsForRoundType: không có loại đợt / bảng chưa có ⇒ []', async () => {
	reset();
	assert.deepEqual(await levelService.getLevelIdsForRoundType(null), []);
	assert.equal(log.length, 0);
	reset({ rtLevelsError: new Error('relation "round_type_levels" does not exist') });
	assert.deepEqual(await levelService.getLevelIdsForRoundType('RT01'), []);
	reset({ rtLevels: ['CD02'] });
	assert.deepEqual(await levelService.getLevelIdsForRoundType('RT01'), ['CD02']);
});

test('getForRound: loại đợt có cấu hình ⇒ chỉ trả cấp độ được phép; chưa cấu hình ⇒ tất cả', async () => {
	reset({ rtLevels: ['CD01', 'CD03'] });
	const r = await levelService.getForRound({ round_type_id: 'RT01' });
	assert.deepEqual(
		r.data.map((x) => x.id),
		['CD01', 'CD03'],
	);
	assert.equal(r.pagination.total, 2);

	reset({ rtLevels: [] });
	const all = await levelService.getForRound({ round_type_id: 'RT02' });
	assert.equal(all.data.length, 3);
});

test('getForRound: có round_id ⇒ lấy cấu hình của đợt (roundService), không đọc theo loại đợt', async () => {
	reset({ rtLevels: ['CD01'] });
	const orig = roundService.getAllowedLevelIds;
	roundService.getAllowedLevelIds = async (id) => (id === 'DOT2026.1' ? ['CD02'] : []);
	try {
		const r = await levelService.getForRound({ round_id: 'DOT2026.1', round_type_id: 'RT01' });
		assert.deepEqual(
			r.data.map((x) => x.id),
			['CD02'],
		);
	} finally {
		roundService.getAllowedLevelIds = orig;
	}
});

test('roundType.setLevels: xoá rồi ghi lại trong 1 transaction, bỏ trùng / rỗng / mã không tồn tại', async () => {
	reset({ rtLevels: ['CD01', 'CD02'] });
	const res = await roundTypeService.setLevels('RT01', ['CD01', 'CD01', '', null, 'CD99', 'CD02']);
	const t = texts();
	const iDel = t.findIndex((x) => x.includes('DELETE FROM round_type_levels'));
	const ins = log.filter((l) => l.text.includes('INSERT INTO round_type_levels'));
	assert.ok(iDel >= 0 && iDel < t.findIndex((x) => x.includes('INSERT')));
	assert.deepEqual(
		ins.map((l) => l.inputs.lid),
		['CD01', 'CD02'],
	);
	assert.ok(t.indexOf('COMMIT') > t.lastIndexOf(ins.at(-1).text));
	assert.deepEqual(res, ['CD01', 'CD02']);
});

test('roundType.setLevels: lỗi giữa chừng ⇒ rollback (loại đợt không mất hết cấp độ)', async () => {
	reset();
	const orig = db.sql.Transaction.prototype.request;
	let n = 0;
	db.sql.Transaction.prototype.request = function () {
		const req = orig.call(this);
		const q = req.query;
		req.query = async (text) => {
			if (text.includes('INSERT INTO round_type_levels') && ++n === 2)
				throw new Error('mất kết nối');
			return q(text);
		};
		return req;
	};
	try {
		await assert.rejects(roundTypeService.setLevels('RT01', ['CD01', 'CD02']), /mất kết nối/);
		assert.ok(texts().includes('ROLLBACK'));
		assert.ok(!texts().includes('COMMIT'));
	} finally {
		db.sql.Transaction.prototype.request = orig;
	}
});

test('department.remove: gỡ liên kết (SET NULL) rồi mới xoá, tất cả trong 1 transaction có người thao tác', async () => {
	reset();
	await departmentService.remove('DV001', 'ADMIN');
	const t = texts();
	const iActor = t.findIndex((x) => x.includes('app.current_user_id'));
	const body = t.slice(iActor + 1, t.indexOf('COMMIT'));
	assert.deepEqual(
		body.map((x) => x.split(' WHERE')[0]),
		[
			'UPDATE users SET department_id = NULL',
			'UPDATE topics SET department_id = NULL',
			'UPDATE topic_members SET department_id = NULL',
			'UPDATE departments SET parent_id = NULL',
			'DELETE FROM topic_related_departments',
			'DELETE FROM departments',
		],
	);
	assert.ok(log.slice(iActor + 1, -1).every((l) => l.inputs.id === 'DV001'));
	assert.equal(log[iActor].inputs.actor_id, 'ADMIN');
});
