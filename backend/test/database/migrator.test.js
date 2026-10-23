// Phần thuần của bộ chạy migration (không cần DB) + quy ước tên file thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
	splitBatches,
	checksum,
	nextFilename,
	listFiles,
	readFile,
	parseSections,
	computeStatus,
	RENAMED,
	MERGED,
} = require('../../src/database/migrator');

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
	const NAME = /^\d{4}-\d{2}-\d{2}_[a-z0-9_]+\.sql$/;
	// File gộp được thay bằng các phần: thứ tự chạy cũ phải giữ nguyên, tên không trùng
	const expanded = listFiles().flatMap((f) => {
		const parts = parseSections(readFile(f)).map((p) => p.name);
		return parts.length ? parts : [f];
	});
	const all = new Set([...listFiles(), ...expanded]);
	for (const f of all) assert.match(f, NAME, f);
	assert.deepEqual(expanded, [...expanded].sort(), 'các phần phải đúng thứ tự tên');
	assert.equal(new Set(expanded).size, expanded.length, 'trùng tên phần');
	for (const f of listFiles()) if (parseSections(readFile(f)).length) assert.ok(!expanded.includes(f), f);
	for (const [from, to] of Object.entries(RENAMED)) {
		assert.ok(!all.has(from), `${from} đã đổi tên`);
		assert.ok(all.has(to), `${to} phải tồn tại`);
	}
	for (const [from, to] of Object.entries(MERGED)) {
		assert.ok(!all.has(from), `${from} đã gộp vào ${to}`);
		assert.ok(all.has(to), `${to} phải tồn tại (file hoặc phần của file gộp)`);
	}
});

test('parseSections: bỏ chú thích đầu file, tách theo dòng -- @migration', () => {
	const text = '/* gộp */\n-- @migration a.sql\nSELECT 1\nGO\n--@migration  b.sql \nSELECT 2\n';
	const parts = parseSections(text);
	assert.deepEqual(
		parts.map((p) => [p.name, p.text.trim()]),
		[
			['a.sql', 'SELECT 1\nGO'],
			['b.sql', 'SELECT 2'],
		],
	);
	assert.deepEqual(parseSections('SELECT 1 -- @migration x.sql\n'), []);
});

test('computeStatus: file gộp coi là đã chạy khi DB có đủ bản ghi các file cũ', () => {
	const texts = {
		'1_gop.sql': '-- @migration 0_a.sql\nSELECT 1\n-- @migration 0_b.sql\nSELECT 2\n',
		'2_c.sql': 'SELECT 3',
	};
	const read = (f) => texts[f];
	const files = Object.keys(texts);
	const at = (d) => new Date(`2026-10-0${d}T00:00:00Z`);

	const full = computeStatus(
		files,
		[
			{ filename: '0_a.sql', applied_at: at(1) },
			{ filename: '0_b.sql', applied_at: at(2) },
			{ filename: '2026-11-14_program_trainee_types.sql' }, // MERGED cũ — bỏ qua
		],
		read,
	);
	assert.deepEqual(full.pending, ['2_c.sql']);
	assert.deepEqual(full.squashed, ['1_gop.sql']);
	assert.deepEqual(full.applied.get('1_gop.sql').applied_at, at(2));
	assert.deepEqual(full.missing, []);
	assert.deepEqual(full.outOfOrder, []);

	const partial = computeStatus(files, [{ filename: '0_a.sql' }, { filename: 'x_old.sql' }], read);
	assert.deepEqual(partial.pending, ['1_gop.sql', '2_c.sql']);
	assert.deepEqual(partial.squashed, []);
	assert.ok(partial.recorded.has('0_a.sql') && !partial.recorded.has('0_b.sql'));
	assert.deepEqual(partial.missing, ['x_old.sql']);

	const done = computeStatus(files, [{ filename: '1_gop.sql', checksum: 'khác' }], read);
	assert.deepEqual(done.squashed, []);
	assert.deepEqual(done.changed, ['1_gop.sql']);

	const fresh = computeStatus(files, [], read);
	assert.deepEqual(fresh.pending, files);
});

test('mỗi phần của file gộp có nội dung chạy được (ít nhất 1 batch)', () => {
	for (const f of listFiles()) {
		for (const part of parseSections(readFile(f))) {
			assert.ok(splitBatches(part.text, 'RMS_HOSPITAL').length > 0, `${f} › ${part.name} trống`);
		}
	}
});
