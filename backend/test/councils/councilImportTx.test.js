// Hồi quy councilImportService.importExcel (04-backend, phát hiện thêm ở đợt 2): nhập
// hội đồng từ Excel phải chạy trong MỘT transaction có người thao tác — lỗi giữa
// chừng (vd ghế thứ 3 của hội đồng thứ 2) không để lại hội đồng thiếu ghế.
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const fakeDb = require('../auth/fakeDb');

const SEATS_A = ['An Một', 'An Hai', 'An Ba', 'An Bốn', 'An Năm'];
const SEATS_B = ['Bình Một', 'Bình Hai', 'Bình Ba', 'Bình Bốn', 'Bình Năm'];
const USERS = [...SEATS_A, ...SEATS_B].map((full_name, i) => ({
	id: `U${i}`,
	full_name,
	department_id: 'K1',
	department_name: 'Khoa Nội',
	specialty_group: 'Nội',
	qualification: null,
}));
const TOPICS = [
	{ id: 'DT1', title: 'Nghiên cứu điều trị tăng huyết áp', council_id: null },
	{ id: 'DT2', title: 'Đánh giá phục hồi chức năng sau đột quỵ', council_id: null },
];

let memberInserts = 0;
let failAtMember = 0; // 0 = không lỗi
const log = fakeDb.install(async (text) => {
	if (/FROM research_rounds WHERE id = @id/.test(text)) return [{ id: 'DOT20261' }];
	if (/FROM users u\s+LEFT JOIN departments/.test(text)) return USERS;
	if (/FROM external_reviewers/.test(text)) return [];
	if (/FROM topics t WHERE t.round_id/.test(text)) return TOPICS;
	if (/INSERT INTO council_members/.test(text) && ++memberInserts === failAtMember)
		throw new Error('DB rớt');
	if (/SELECT @new_id AS id/.test(text)) return [{ id: 'X' }];
	if (/FROM councils c\s+LEFT JOIN research_rounds/.test(text)) return [{ id: 'X' }];
	if (/^\s*UPDATE topics SET council_id/.test(text)) return [{}];
	return [];
});
require('../../src/modules/access/roleCodes').inputRoleId = async (req, name) =>
	req.input(name, null, 'R_DEPT');

const svc = require('../../src/modules/councils/councilImportService');
const texts = () => log.map((l) => l.text);
const count = (t) => texts().filter((x) => x === t).length;

const buildFile = async () => {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('HD');
	ws.addRow([
		'STT',
		'Tên đề tài',
		'Chủ tịch',
		'Thư ký',
		'Phản biện 1',
		'Phản biện 2',
		'Thành viên',
	]);
	ws.addRow([1, TOPICS[0].title, ...SEATS_A]);
	ws.addRow([2, TOPICS[1].title, ...SEATS_B]);
	return Buffer.from(await wb.xlsx.writeBuffer());
};

const run = async () =>
	svc.importExcel({ buffer: await buildFile(), round_id: 'DOT20261', dry_run: false }, 'ADMIN');

test('nhập hội đồng: lỗi ở ghế thứ 3 của hội đồng thứ 2 ⇒ ROLLBACK, không COMMIT nào', async () => {
	log.length = 0;
	memberInserts = 0;
	failAtMember = 8; // hội đồng 1 có 5 ghế ⇒ ghế thứ 3 của hội đồng 2 = lần chèn thứ 8
	await assert.rejects(run(), /DB rớt/);
	assert.equal(count('COMMIT'), 0, texts().join('\n---\n'));
	assert.equal(count('ROLLBACK'), 1);
});

test('nhập hội đồng trót lọt: 1 transaction có người thao tác cho cả file', async () => {
	log.length = 0;
	memberInserts = 0;
	failAtMember = 0;
	const r = await run();
	assert.equal(r.councils_created, 2);
	assert.equal(r.topics_assigned, 2);
	assert.equal(count('COMMIT'), 1);
	const actor = texts().findIndex((t) => /set_config\('app.current_user_id'/.test(t));
	const firstWrite = texts().findIndex((t) => /INSERT INTO councils/.test(t));
	assert.ok(actor >= 0 && actor < firstWrite);
	assert.ok(
		texts().lastIndexOf('COMMIT') >
			texts().findLastIndex((t) => /UPDATE topics SET council_id/.test(t)),
	);
});
