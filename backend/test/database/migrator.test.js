// Phần thuần của bộ chạy migration (không cần DB) + quy ước tên file thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const { splitBatches, checksum, nextFilename, listFiles, RENAMED } = require('../../src/database/migrator');

test('splitBatches: tách theo dòng GO (không phân biệt hoa thường), đổi USE sang DB cấu hình', () => {
	const batches = splitBatches('USE [RMS_HOSPITAL];\nGO\nSELECT 1 AS go_col\n  go  \n\nSELECT 2\nGO;\n', 'RMS_STAGING');
	assert.deepEqual(
		batches.map((b) => b.trim()),
		['USE [RMS_STAGING];', 'SELECT 1 AS go_col', 'SELECT 2'],
	);
});

test('checksum bỏ qua khác biệt CRLF / khoảng trắng cuối dòng', () => {
	assert.equal(checksum('SELECT 1;  \nGO\n'), checksum('SELECT 1;\nGO'));
	assert.notEqual(checksum('SELECT 1;'), checksum('SELECT 2;'));
});

test('nextFilename: slug không dấu, luôn xếp sau file mới nhất', () => {
	const last = listFiles().filter((f) => /^\d{4}-\d{2}-\d{2}_/.test(f)).pop();
	const name = nextFilename('Phòng hội nghị — mới', new Date('2000-01-01'));
	assert.match(name, /^\d{4}-\d{2}-\d{2}_phong_hoi_nghi_moi\.sql$/);
	assert.ok(name > last, `${name} phải đứng sau ${last}`);
	assert.equal(nextFilename('x', new Date('2999-05-06')), '2999-05-06_x.sql');
	assert.throws(() => nextFilename('  '), /Thiếu mô tả/);
});

test('mọi file migration đúng quy ước YYYY-MM-DD_[NN_]mo_ta.sql, không trùng tên cũ', () => {
	for (const f of listFiles()) assert.match(f, /^\d{4}-\d{2}-\d{2}_[a-z0-9_]+\.sql$/, f);
	for (const [from, to] of Object.entries(RENAMED)) {
		assert.ok(!listFiles().includes(from), `${from} đã đổi tên`);
		assert.ok(listFiles().includes(to), `${to} phải tồn tại`);
	}
});
