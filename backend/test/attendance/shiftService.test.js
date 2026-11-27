// Ca học, mẫu ca tuần, phân ca (attendance/shiftService) với CSDL giả: kiểm dữ liệu ca,
// ký hiệu không trùng, không xóa ca đang dùng, đổi mẫu mặc định trong transaction,
// phân ca theo lô (giới hạn ô, ca ngừng dùng ⇒ rollback). Phạm vi khoa khi phân ca đã
// có ở test/permissions/staffAttendanceScope.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

require('../../src/modules/events/eventService').broadcast = () => {};

const S = {};
const log = install(async (text, inputs) => {
	if (text.includes('SELECT name FROM work_shifts WHERE code = @code'))
		return S.dupCode ? [{ name: 'Chiều' }] : [];
	if (/^\s*(INSERT INTO|UPDATE) work_shifts/.test(text))
		return S.shiftRow === undefined ? [{ id: inputs.id ?? 9, ...inputs }] : S.shiftRow;
	if (text.includes('SELECT name, days FROM shift_patterns')) return S.patternsRaw;
	if (text.includes('FROM shift_assignments WHERE shift_id = @id'))
		return S.assigned ? [{ x: 1 }] : [];
	if (text.includes('DELETE FROM work_shifts')) return S.deleted ? [{}] : [];
	if (/SELECT id FROM work_shifts WHERE (is_active = 'true' AND )?id IN/.test(text))
		return JSON.parse(inputs.ids)
			.filter((id) => S.shiftIds.includes(id))
			.map((id) => ({ id }));
	if (/^\s*(INSERT INTO|UPDATE) shift_patterns SET name|INSERT INTO shift_patterns/.test(text))
		return [
			{ id: inputs.id ?? 4, name: inputs.name, days: inputs.days, is_default: inputs.is_default },
		];
	if (text.includes('DELETE FROM shift_patterns')) return S.deleted ? [{}] : [];
	if (text.includes('SELECT 1 AS x FROM shift_patterns WHERE id = @id'))
		return S.patternExists ? [{ x: 1 }] : [];
	if (/SELECT j\.value AS id FROM/.test(text)) return []; // mọi tài khoản đều là học viên
	return [];
});
const svc = require('../../src/modules/attendance/shiftService');

const reset = (over = {}) => {
	Object.assign(S, {
		dupCode: false,
		shiftRow: undefined,
		patternsRaw: [],
		assigned: false,
		deleted: true,
		shiftIds: [1, 2],
		patternExists: true,
		...over,
	});
	log.length = 0;
};
const texts = () => log.map((l) => l.text);
const has = (re) => texts().some((t) => re.test(t));
const SHIFT = {
	name: ' Ca sáng ',
	code: ' S ',
	start_time: '07:00',
	end_time: '11:30',
	checkin_before_min: 30,
	checkout_after_min: 60,
	grace_min: 10,
};
const ADMIN = { id: 'ADM', permissions: new Set(['system:manage']), permissionScopes: new Map() };

test('saveShift: dữ liệu sai ⇒ 400 trước khi đọc CSDL', async () => {
	for (const bad of [
		{ name: '  ' },
		{ code: 'QUA_MUOI_KY_TU' },
		{ start_time: '7:00' },
		{ end_time: '24:00' },
		{ checkin_before_min: 721 },
		{ grace_min: -1 },
	]) {
		reset();
		await assert.rejects(
			svc.saveShift(null, { ...SHIFT, ...bad }),
			{ statusCode: 400 },
			JSON.stringify(bad),
		);
		assert.equal(log.length, 0);
	}
});

test('saveShift: ký hiệu đã dùng cho ca khác ⇒ 409 (bỏ qua chính ca đang sửa)', async () => {
	reset({ dupCode: true });
	await assert.rejects(svc.saveShift(3, SHIFT), {
		statusCode: 409,
		message: /"S" đã dùng cho ca "Chiều"/,
	});
	assert.equal(log[0].inputs.id, 3);
	assert.ok(!has(/UPDATE work_shifts/));
});

test('saveShift: thêm mới — cắt khoảng trắng, mặc định đang dùng, màu ≤ 20 ký tự', async () => {
	reset();
	await svc.saveShift(null, { ...SHIFT, color: '#'.repeat(50) });
	const ins = log.find((l) => l.text.includes('INSERT INTO work_shifts')).inputs;
	assert.deepEqual([ins.name, ins.code, ins.active, ins.color.length], ['Ca sáng', 'S', true, 20]);
	assert.equal(log[0].inputs.id, 0, 'tạo mới so trùng với mọi ca');
});

test('saveShift: sửa ca không tồn tại ⇒ 404', async () => {
	reset({ shiftRow: [] });
	await assert.rejects(svc.saveShift(77, { ...SHIFT, is_active: false }), { statusCode: 404 });
	assert.equal(log.find((l) => l.text.includes('UPDATE work_shifts')).inputs.active, false);
});

test('removeShift: đang dùng trong mẫu tuần ⇒ 409 nêu tên mẫu; đã xếp phân ca ⇒ 409', async () => {
	reset({ patternsRaw: [{ name: 'Mẫu HC', days: JSON.stringify({ 1: [1, 2], 6: [] }) }] });
	await assert.rejects(svc.removeShift(2), { statusCode: 409, message: /mẫu "Mẫu HC"/ });
	reset({ assigned: true });
	await assert.rejects(svc.removeShift(2), { statusCode: 409, message: /bảng phân ca/ });
	assert.ok(!has(/DELETE FROM work_shifts/));
});

test('removeShift: không tồn tại ⇒ 404; chưa dùng ⇒ xóa', async () => {
	reset({ deleted: false });
	await assert.rejects(svc.removeShift(5), { statusCode: 404 });
	reset();
	await svc.removeShift(5);
	assert.ok(has(/DELETE FROM work_shifts WHERE id = @id/));
});

test('savePattern: thiếu tên ⇒ 400; có ca không tồn tại ⇒ 400, không ghi', async () => {
	reset();
	await assert.rejects(svc.savePattern(null, { name: ' ', days: {} }), { statusCode: 400 });
	await assert.rejects(svc.savePattern(null, { name: 'Mẫu', days: { 1: [1, 3] } }), {
		statusCode: 400,
		message: /ca không tồn tại/,
	});
	assert.ok(!has(/shift_patterns/));
});

test('savePattern: chuẩn hóa ngày (bỏ trùng / số rác), đặt mặc định thì bỏ mặc định cũ trước, trong transaction', async () => {
	reset();
	const p = await svc.savePattern(null, {
		name: ' Hành chính ',
		days: { 1: [1, '1', 2, -3, 'x'], 7: 'không phải mảng' },
		is_default: true,
	});
	assert.deepEqual(p.days[1], [1, 2]);
	assert.deepEqual(p.days[7], []);
	assert.equal(Object.keys(p.days).length, 7);
	const t = texts();
	const iClear = t.findIndex((x) => x.includes("SET is_default = 'false'"));
	const iIns = t.findIndex((x) => x.includes('INSERT INTO shift_patterns'));
	assert.ok(iClear >= 0 && iClear < iIns && iIns < t.indexOf('COMMIT'));
	assert.equal(log[iIns].inputs.name, 'Hành chính');

	reset();
	await svc.savePattern(4, { name: 'A', days: {} });
	assert.ok(!has(/SET is_default = 'false'/), 'không đặt mặc định ⇒ không đụng mẫu khác');
	assert.ok(!has(/FROM work_shifts/), 'mẫu trống ⇒ không cần kiểm ca');
});

test('removePattern: gỡ khỏi khóa học rồi mới xóa, trong 1 transaction; không có ⇒ 404', async () => {
	reset();
	await svc.removePattern(4);
	const t = texts();
	assert.ok(
		t.findIndex((x) => x.includes('UPDATE courses SET shift_pattern_id = NULL')) <
			t.findIndex((x) => x.includes('DELETE FROM shift_patterns')),
	);
	assert.ok(t.indexOf('COMMIT') > 0);
	reset({ deleted: false });
	await assert.rejects(svc.removePattern(4), { statusCode: 404 });
});

test('setPatternCourses: mẫu không tồn tại ⇒ 404; bỏ trùng mã khóa, gỡ khóa cũ rồi gán khóa mới', async () => {
	reset({ patternExists: false });
	await assert.rejects(svc.setPatternCourses(4, ['K1']), { statusCode: 404 });
	assert.ok(!has(/UPDATE courses/));

	reset();
	await svc.setPatternCourses(4, ['K1', 'K1', 'K2']);
	const upd = log.filter((l) => l.text.includes('UPDATE courses'));
	assert.equal(upd.length, 2);
	assert.match(upd[0].text, /shift_pattern_id = NULL WHERE shift_pattern_id = @id AND id NOT IN/);
	assert.match(upd[1].text, /SET shift_pattern_id = @id WHERE id IN/);
	assert.deepEqual(JSON.parse(upd[1].inputs.ids), ['K1', 'K2']);
	assert.ok(texts().indexOf('COMMIT') > texts().lastIndexOf(upd[1].text));
});

test('setRoster: kiểm đầu vào trước khi ghi (rỗng, ngày sai, quá 20000 ô, chế độ ca mà không chọn ca)', async () => {
	reset();
	const many = Array.from({ length: 401 }, (_, i) => `U${i}`);
	const days = Array.from(
		{ length: 50 },
		(_, i) => `2026-12-${String((i % 28) + 1).padStart(2, '0')}`,
	);
	const cases = [
		[{ user_ids: [], dates: ['2026-12-01'], mode: 'off' }, /ít nhất 1 học viên/],
		[{ user_ids: ['U1'], dates: ['01/12/2026'], mode: 'off' }, /Ngày không hợp lệ/],
		[
			{
				user_ids: many,
				dates: [...days, ...days.map((d) => d.replace('2026', '2027'))],
				mode: 'off',
			},
			/Tối đa 20000 ô/,
		],
		[{ user_ids: ['U1'], dates: ['2026-12-01'], mode: 'shifts', shift_ids: [] }, /ít nhất 1 ca/],
	];
	for (const [body, msg] of cases) {
		await assert.rejects(svc.setRoster(body, ADMIN), { statusCode: 400, message: msg });
	}
	assert.equal(log.length, 0);
});

test('setRoster: ca ngừng dùng / không tồn tại ⇒ 400 và rollback (không mất phân ca cũ)', async () => {
	reset({ shiftIds: [1] });
	await assert.rejects(
		svc.setRoster(
			{ user_ids: ['U1'], dates: ['2026-12-01'], mode: 'shifts', shift_ids: [1, 2] },
			ADMIN,
		),
		{ statusCode: 400, message: /ngừng dùng/ },
	);
	assert.ok(texts().includes('ROLLBACK'));
	assert.ok(!texts().includes('COMMIT'));
	assert.ok(!has(/INSERT INTO shift_assignments/));
});

test('setRoster: off ⇒ ghi 1 dòng ca NULL; pattern ⇒ chỉ xóa; trùng người/ngày được gộp', async () => {
	reset();
	const r = await svc.setRoster(
		{ user_ids: ['U1', 'U1', 'U2'], dates: ['2026-12-01', '2026-12-01'], mode: 'off' },
		ADMIN,
	);
	assert.deepEqual(r, { cells: 2 });
	const ins = log.find((l) => l.text.includes('INSERT INTO shift_assignments'));
	assert.deepEqual(JSON.parse(ins.inputs.shifts), [null]);
	assert.equal(ins.inputs.actor, 'ADM');

	reset();
	await svc.setRoster({ user_ids: ['U1'], dates: ['2026-12-01'], mode: 'pattern' }, ADMIN);
	assert.ok(has(/DELETE FROM shift_assignments/));
	assert.ok(!has(/INSERT INTO shift_assignments/));
});

test('courseResolver: khóa mới nhất phủ ngày, mẫu của khóa hoặc mẫu mặc định, ngoài khóa ⇒ null', () => {
	const patterns = [
		{ id: 1, name: 'Mặc định', is_default: true },
		{ id: 2, name: 'Riêng', is_default: false },
	];
	const periods = [
		{
			course_id: 'K1',
			course_name: 'Cũ',
			shift_pattern_id: null,
			start_date: '2026-01-01',
			end_date: '2026-12-31',
		},
		{
			course_id: 'K2',
			course_name: 'Mới',
			shift_pattern_id: 2,
			start_date: '2026-06-01',
			end_date: '2026-06-30',
		},
	];
	const on = svc.courseResolver(periods, patterns);
	assert.equal(on('2026-06-15').course_id, 'K2');
	assert.equal(on('2026-06-15').pattern.name, 'Riêng');
	assert.equal(on('2026-07-01').pattern.name, 'Mặc định');
	assert.equal(on('2027-01-01'), null);
	assert.equal(
		svc.courseResolver(periods, [])('2026-07-01').pattern,
		null,
		'không có mẫu ⇒ điểm danh tự do',
	);
});
