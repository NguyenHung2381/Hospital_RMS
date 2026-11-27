// Tự động phân công hội đồng (councilAutoAssignService) với CSDL giả: chia cụm
// đề tài, chọn người cho 5 ghế (trong viện đủ cờ → ngoài viện → để trống),
// loại người cùng khoa với đề tài, chia phiên sáng/chiều.
// councilService / councilAssignmentService được thay bằng bản ghi lại lời gọi.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

require('../../src/modules/events/eventService').broadcast = () => {};

const state = {};
const reset = (over = {}) => {
	Object.assign(state, {
		topics: [],
		internal: () => ({ id: `U${++state.seq}`, has_flag: 1 }),
		external: () => null,
		seq: 0,
		...over,
	});
};
reset();

const log = install(async (text) => {
	if (text.includes('FROM roles')) return [{ id: 'VT09', code: 'dept_head' }];
	if (text.includes("t.status = 'approved' AND t.council_id IS NULL")) return state.topics;
	if (text.includes('load_count')) {
		const r = state.internal();
		return r ? [r] : [];
	}
	if (text.includes('FROM external_reviewers')) {
		const r = state.external();
		return r ? [r] : [];
	}
	if (text.includes('AS dept_name')) return [{ dept_name: 'Nội' }];
	return [];
});

const councilService = require('../../src/modules/councils/councilService');
const assignment = require('../../src/modules/councils/councilAssignmentService');
const { autoAssign } = require('../../src/modules/councils/councilAutoAssignService');

const calls = { create: [], addMember: [], assignTopics: [], session: [] };
const clearCalls = () => {
	for (const k of Object.keys(calls)) calls[k].length = 0;
	log.length = 0;
};
councilService.create = async (data, actor) => {
	calls.create.push({ data, actor });
	return { id: `HD${calls.create.length}` };
};
councilService.addMember = async (councilId, data, actor) => {
	calls.addMember.push({ councilId, ...data, actor });
};
assignment.assignTopics = async (councilId, ids, actor) => {
	calls.assignTopics.push({ councilId, ids, actor });
	return { assigned: ids.length };
};
assignment.setTopicSession = async (councilId, topicId, session) => {
	calls.session.push({ councilId, topicId, session });
};

const topics = (n, deptOf = (i) => `DV${i % 3}`) =>
	Array.from({ length: n }, (_, i) => ({ id: `DT${i + 1}`, department_id: deptOf(i) }));

const BASE = { round_id: 'DOT2026.1', specialty_group: 'Nội', min_size: 6, max_size: 10 };

test('không có đề tài đủ điều kiện ⇒ không tạo hội đồng nào, có cảnh báo', async () => {
	reset();
	clearCalls();
	const r = await autoAssign(BASE, 'ADMIN');
	assert.equal(r.councils_created, 0);
	assert.equal(r.topics_assigned, 0);
	assert.match(r.warnings[0], /Không có đề tài nào/);
	assert.equal(calls.create.length, 0);
});

test('25 đề tài, cụm 6–10 ⇒ 3 hội đồng 9/8/8 đề tài liền nhau, đủ 5 ghế, chia sáng/chiều', async () => {
	reset({ topics: topics(25) });
	clearCalls();
	const r = await autoAssign(BASE, 'ADMIN');
	assert.equal(r.councils_created, 3);
	assert.equal(r.topics_assigned, 25);
	assert.deepEqual(r.warnings, []);
	assert.deepEqual(
		calls.assignTopics.map((c) => c.ids.length),
		[9, 8, 8],
	);
	assert.deepEqual(calls.assignTopics[1].ids[0], 'DT10', 'cụm liên tiếp, không xáo trộn');
	assert.ok(calls.create.every((c) => c.actor === 'ADMIN' && c.data.round_id === 'DOT2026.1'));
	assert.equal(calls.create[0].data.location, 'VP khoa Nội', 'địa điểm gợi ý theo khoa chủ tịch');

	const seats = calls.addMember.filter((m) => m.councilId === 'HD1');
	assert.deepEqual(
		seats.map((m) => m.role),
		['chairman', 'secretary', 'reviewer1', 'reviewer2', 'member'],
	);
	assert.equal(new Set(seats.map((m) => m.user_id)).size, 5, 'không ai ngồi 2 ghế');
	assert.ok(seats.every((m) => m.external_reviewer_id === null));

	const s1 = calls.session.filter((s) => s.councilId === 'HD1').map((s) => s.session);
	assert.deepEqual(s1, [...Array(5).fill('morning'), ...Array(4).fill('afternoon')]);
});

test('chọn người trong viện: loại người cùng khoa với đề tài trong cụm, loại người đã ngồi ghế khác', async () => {
	reset({ topics: topics(6, (i) => (i < 3 ? 'DV_A' : 'DV_B')) });
	clearCalls();
	await autoAssign(BASE, 'ADMIN');
	const picks = log.filter((l) => l.text.includes('load_count'));
	assert.equal(picks.length, 5);
	for (const p of picks) {
		assert.deepEqual([p.inputs.d0, p.inputs.d1], ['DV_A', 'DV_B']);
		assert.match(p.text, /department_id NOT IN \(@d0,@d1\)/);
		assert.equal(p.inputs.dept_head_role, 'VT09', 'loại tài khoản khoa dùng chung');
	}
	assert.match(picks[0].text, /can_chair_council/, 'ghế chủ tịch cần cờ can_chair_council');
	assert.match(picks[1].text, /can_sit_council/);
	assert.equal(picks[0].inputs.u0, undefined);
	assert.deepEqual(
		[picks[4].inputs.u0, picks[4].inputs.u3, picks[4].inputs.u4],
		['U1', 'U4', undefined],
	);
});

test('trong viện không đủ cờ ⇒ dùng chuyên gia ngoài viện (trong danh sách được chọn) và cảnh báo; hết cả hai ⇒ để trống', async () => {
	let ext = 0;
	reset({
		topics: topics(6),
		internal: () => ({ id: 'U_KHONG_CO', has_flag: 0 }),
		external: () => (++ext <= 2 ? { id: `CG${ext}`, full_name: `Chuyên gia ${ext}` } : null),
	});
	clearCalls();
	const r = await autoAssign({ ...BASE, external_reviewer_ids: ['CG1', 'CG2'] }, 'ADMIN');
	const seats = calls.addMember;
	assert.deepEqual(
		seats.map((m) => [m.role, m.user_id, m.external_reviewer_id]),
		[
			['chairman', null, 'CG1'],
			['secretary', null, 'CG2'],
		],
		'không xếp người trong viện thiếu cờ',
	);
	assert.equal(r.warnings.filter((w) => w.includes('đã xếp chuyên gia ngoài viện')).length, 2);
	assert.equal(r.warnings.filter((w) => w.includes('để trống')).length, 3);
	assert.equal(calls.create[0].data.location, null, 'chủ tịch ngoài viện ⇒ không gợi ý phòng');

	const exQ = log.filter((l) => l.text.includes('FROM external_reviewers'));
	assert.ok(exQ.every((q) => q.inputs.a0 === 'CG1' && q.inputs.a1 === 'CG2'));
	assert.equal(exQ[1].inputs.x0, 'CG1', 'không xếp 1 chuyên gia 2 ghế');
});

test('ít đề tài hơn mức tối thiểu ⇒ vẫn tạo 1 hội đồng, có cảnh báo', async () => {
	reset({ topics: topics(3) });
	clearCalls();
	const r = await autoAssign(BASE, 'ADMIN');
	assert.equal(r.councils_created, 1);
	assert.match(r.warnings[0], /chỉ có 3 đề tài/);
});

test('ưu tiên ít hội đồng: 14 đề tài, tối đa 10 ⇒ 1 hội đồng 14 đề tài kèm cảnh báo vượt mức', async () => {
	reset({ topics: topics(14) });
	clearCalls();
	const r = await autoAssign(BASE, 'ADMIN');
	assert.equal(r.councils_created, 1);
	assert.match(r.warnings.join('\n'), /14 đề tài, vượt mức tối đa 10/);
});

test('min không phải số ⇒ mặc định 6; max < min ⇒ max = min', async () => {
	reset({ topics: topics(12) });
	clearCalls();
	const r = await autoAssign({ ...BASE, min_size: 'abc', max_size: -5 }, 'ADMIN');
	// min 'abc' ⇒ 6; max -5 < min ⇒ max = 6 ⇒ 2 cụm 6/6
	assert.equal(r.councils_created, 2);

	reset({ topics: topics(16) });
	clearCalls();
	const r2 = await autoAssign({ ...BASE, min_size: 8, max_size: 4 }, 'ADMIN');
	// max = 8 ⇒ 2 cụm 8/8
	assert.deepEqual(
		calls.assignTopics.map((c) => c.ids.length),
		[8, 8],
	);
	assert.equal(r2.councils_created, 2);
});

test('nhiều hệ chuyên môn ⇒ cộng dồn kết quả từng hệ', async () => {
	reset({ topics: topics(6) });
	clearCalls();
	const r = await autoAssign({ ...BASE, specialty_group: ['Nội', 'Ngoại'] }, 'ADMIN');
	assert.equal(r.councils_created, 2);
	assert.equal(r.topics_assigned, 12);
	assert.deepEqual(
		calls.create.map((c) => c.data.name),
		['Hội đồng Nội #1', 'Hội đồng Ngoại #1'],
	);
});
