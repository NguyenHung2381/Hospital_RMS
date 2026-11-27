// Hồi quy councilAutoAssignService.autoAssign (01-tests mục 3 #7): mỗi hệ chuyên môn
// chạy trong MỘT transaction có người thao tác — lỗi giữa chừng (vd ghế thứ 3 của
// hội đồng thứ 2) không để lại hội đồng nháp thiếu ghế hay đề tài gán dở.
const test = require('node:test');
const assert = require('node:assert/strict');

const fakeDb = require('../auth/fakeDb');

const TOPICS = Array.from({ length: 12 }, (_, i) => ({
	id: `DT${i}`,
	department_id: `K${i % 3}`,
	department_name: `Khoa ${i % 3}`,
}));
let memberInserts = 0;
let failAtMember = 0; // 0 = không lỗi
let userSeq = 0;
const log = fakeDb.install(async (text) => {
	if (/FROM topics t\s+INNER JOIN departments d/.test(text)) return TOPICS;
	if (/SELECT u.id, u.can_(sit|chair)_council AS has_flag/.test(text))
		return [{ id: `U${++userSeq}`, has_flag: true }];
	if (/FROM roles/.test(text)) return [{ id: 'R_DEPT' }];
	if (/INSERT INTO council_members/.test(text) && ++memberInserts === failAtMember)
		throw new Error('DB rớt');
	if (/SELECT @new_id AS id/.test(text)) return [{ id: 'X' }];
	if (/FROM councils c\s+LEFT JOIN research_rounds/.test(text)) return [{ id: 'X' }];
	if (/^\s*UPDATE topics SET (council_id|session)/.test(text)) return [{}];
	return [];
});
// roleCodes đọc mã vai trò từ CSDL / cache — trả cố định cho test
require('../../src/modules/access/roleCodes').inputRoleId = async (req, name) =>
	req.input(name, null, 'R_DEPT');

const svc = require('../../src/modules/councils/councilAutoAssignService');
const texts = () => log.map((l) => l.text);
const count = (t) => texts().filter((x) => x === t).length;

const run = () =>
	svc.autoAssign(
		{ round_id: 'DOT20261', specialty_group: 'Nội', min_size: 6, max_size: 6 },
		'ADMIN',
	);

test('#7 lỗi ở ghế thứ 3 của hội đồng thứ 2 ⇒ ROLLBACK cả hệ, không COMMIT nào', async () => {
	log.length = 0;
	memberInserts = 0;
	failAtMember = 8; // hội đồng 1 có 5 ghế, ghế thứ 3 của hội đồng 2 = lần chèn thứ 8
	await assert.rejects(run(), /DB rớt/);
	assert.equal(count('COMMIT'), 0, texts().join('\n---\n'));
	assert.equal(count('ROLLBACK'), 1);
});

test('#7 chạy trót lọt: 1 transaction có người thao tác cho cả hệ', async () => {
	log.length = 0;
	memberInserts = 0;
	failAtMember = 0;
	const r = await run();
	assert.equal(r.councils_created, 2);
	assert.equal(r.topics_assigned, 12);
	assert.equal(count('COMMIT'), 1);
	const actor = texts().findIndex((t) => /set_config\('app.current_user_id'/.test(t));
	const firstWrite = texts().findIndex((t) => /INSERT INTO councils/.test(t));
	assert.ok(actor >= 0 && actor < firstWrite);
	assert.ok(
		texts().lastIndexOf('COMMIT') >
			texts().findLastIndex((t) => /UPDATE topics SET session/.test(t)),
	);
});
