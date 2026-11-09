// M-01: assertUnzippedSize (utils/excelImport) không được bị vượt bằng cách khai man
// số mục trong EOCD. JSZip (ExcelJS) duyệt mục lục theo chữ ký nên vẫn bung mọi mục,
// kể cả khi EOCD khai 0 hoặc 1 mục → guard phải duyệt đúng những gì JSZip duyệt và từ
// chối khi số mục thấy được lệch số khai.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const ExcelJS = require('exceljs');
const { loadWorkbook, assertUnzippedSize } = require('../../src/utils/excelImport');

const MiB = 1024 * 1024;
const is400 = (re) => (e) => e.statusCode === 400 && re.test(e.message);

// Zip tự dựng nhiều mục; CRC để 0 (guard không kiểm CRC, chỉ cần cấu trúc đúng).
const buildZip = (entries) => {
	const parts = [];
	const cds = [];
	let offset = 0;
	for (const [name, raw] of entries) {
		const data = zlib.deflateRawSync(raw, { level: 9 });
		const fname = Buffer.from(name);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(8, 8);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(raw.length, 22);
		local.writeUInt16LE(fname.length, 26);
		const cd = Buffer.alloc(46);
		cd.writeUInt32LE(0x02014b50, 0);
		cd.writeUInt16LE(8, 10);
		cd.writeUInt32LE(data.length, 20);
		cd.writeUInt32LE(raw.length, 24);
		cd.writeUInt16LE(fname.length, 28);
		cd.writeUInt32LE(offset, 42);
		cds.push(cd, fname);
		parts.push(local, fname, data);
		offset += local.length + fname.length + data.length;
	}
	const cdBuf = Buffer.concat(cds);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(entries.length, 8);
	eocd.writeUInt16LE(entries.length, 10);
	eocd.writeUInt32LE(cdBuf.length, 12);
	eocd.writeUInt32LE(offset, 16);
	return Buffer.concat([...parts, cdBuf, eocd]);
};

// Sửa số mục ở EOCD (cả entries-on-disk và total-entries), giữ nguyên mọi mục khác.
const forgeCount = (zip, n) => {
	const out = Buffer.from(zip);
	const eocd = out.length - 22; // không có comment
	out.writeUInt16LE(n, eocd + 8);
	out.writeUInt16LE(n, eocd + 10);
	return out;
};

// 1 mục nhỏ + 1 mục "bom" 24MiB (> trần 20MiB) — đúng mẫu tái hiện của audit
const bomb = () =>
	buildZip([
		['[Content_Types].xml', Buffer.from('<Types/>')],
		['xl/media/pad.bin', Buffer.alloc(24 * MiB)],
	]);

test('tiền đề: JSZip vẫn liệt kê mọi mục dù EOCD khai man số mục', async () => {
	const JSZip = require(require.resolve('jszip', { paths: [require.resolve('exceljs')] }));
	const zip = await JSZip.loadAsync(forgeCount(bomb(), 1));
	assert.deepEqual(Object.keys(zip.files).sort(), ['[Content_Types].xml', 'xl/media/pad.bin']);
});

test('bom nén thật (EOCD trung thực) bị chặn', () => {
	assert.throws(() => assertUnzippedSize(bomb()), is400(/quá lớn/));
});

test('bom nén khai man số mục EOCD = 1 hoặc 0 bị chặn (không bypass guard)', async () => {
	for (const n of [1, 0]) {
		const forged = forgeCount(bomb(), n);
		assert.ok(forged.length < 100 * 1024);
		assert.throws(() => assertUnzippedSize(forged), is400(/quá lớn|không đọc được/), `EOCD = ${n}`);
		await assert.rejects(loadWorkbook(forged), is400(/quá lớn|không đọc được/), `EOCD = ${n}`);
	}
});

test('khai man số mục LỚN HƠN thực tế hoặc chỉ sửa một trong hai trường đếm cũng bị từ chối', () => {
	const honest = buildZip([
		['a.xml', Buffer.from('<a/>')],
		['b.xml', Buffer.from('<b/>')],
	]);
	assert.doesNotThrow(() => assertUnzippedSize(honest));
	assert.throws(() => assertUnzippedSize(forgeCount(honest, 3)), is400(/không đọc được/));
	const onlyTotal = Buffer.from(honest);
	onlyTotal.writeUInt16LE(1, onlyTotal.length - 22 + 10); // entries-on-disk vẫn = 2
	assert.throws(() => assertUnzippedSize(onlyTotal), is400(/không đọc được/));
});

test('mục lục không liền ngay trước EOCD (dữ liệu chen giữa/offset sai) bị từ chối', () => {
	const honest = buildZip([['a.xml', Buffer.from('<a/>')]]);
	// chèn rác giữa mục lục và EOCD: cdOffset + cdSize ≠ vị trí EOCD
	const eocd = honest.length - 22;
	const gap = Buffer.concat([honest.subarray(0, eocd), Buffer.alloc(64), honest.subarray(eocd)]);
	assert.throws(() => assertUnzippedSize(gap), is400(/không đọc được/));
	// cdSize khai thiếu
	const shortCd = Buffer.from(honest);
	shortCd.writeUInt32LE(0, shortCd.length - 22 + 12);
	assert.throws(() => assertUnzippedSize(shortCd), is400(/không đọc được/));
});

test('file .xlsx hợp lệ (nhiều sheet, tạo bằng exceljs) vẫn đọc được', async () => {
	const wb = new ExcelJS.Workbook();
	for (const name of ['Học viên', 'Khóa học', 'Ghi chú']) {
		const ws = wb.addWorksheet(name);
		for (let i = 1; i <= 200; i++)
			ws.addRow([i, `Dòng ${i}`, new Date(Date.UTC(2025, 0, (i % 28) + 1))]);
	}
	const buf = Buffer.from(await wb.xlsx.writeBuffer());
	assert.doesNotThrow(() => assertUnzippedSize(buf));
	const loaded = await loadWorkbook(buf);
	assert.deepEqual(
		loaded.worksheets.map((w) => w.name),
		['Học viên', 'Khóa học', 'Ghi chú'],
	);
	assert.equal(loaded.worksheets[1].getRow(200).getCell(2).text, 'Dòng 200');
});

test('zip nhiều mục sát trần vẫn qua, vượt trần một chút thì bị chặn', () => {
	const at = (bytes) =>
		buildZip([
			['x.xml', Buffer.alloc(bytes / 2)],
			['y.xml', Buffer.alloc(bytes / 2)],
		]);
	assert.doesNotThrow(() => assertUnzippedSize(at(20 * MiB)));
	assert.throws(() => assertUnzippedSize(at(20 * MiB + 2)), is400(/quá lớn/));
});
