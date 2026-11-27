const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
const PizZip = require('pizzip');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const {
	prepareTemplate,
	_test,
} = require('../../src/modules/seminars/certificate/certificateTemplate');
const {
	createRenderer,
	fieldValues,
	creditsInWords,
	formatCredits,
} = require('../../src/modules/seminars/certificate/certificateRender');
const { ZipStoreWriter } = require('../../src/utils/zipStoreWriter');

const FONT = fs.readFileSync(path.join(__dirname, '../../src/assets/fonts/Inter-Regular.ttf'));

// Mẫu giả lập giống mẫu thật: nhãn và dãy chấm tách khối, ô giữa câu, đuôi "/C33.01"
const makeTemplate = async () => {
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	const font = await doc.embedFont(FONT);
	const page = doc.addPage([595, 842]);
	const green = rgb(0, 0.57, 0.25);
	const line = (text, x, yTop, size = 12) =>
		page.drawText(text, { x, y: 842 - yTop, size, font, color: green });
	page.drawText('Số: ...../C33.01', { x: 75, y: 842 - 95, size: 11, font, color: rgb(0, 0, 0) });
	line('Chứng nhận', 75, 300);
	line(': ..................................................', 210, 300);
	line('Sinh ngày', 75, 324);
	line(': ..................................................', 210, 324);
	line('Đơn vị công tác', 75, 348);
	line(': ..................................................', 210, 348);
	line('1. Hình thức: Tham gia Hội nghị khoa học     Vai trò: ....................', 75, 420);
	line('Quy đổi tương đương: ...... giờ tín chỉ', 187, 576);
	line('(Bằng chữ: ........................ giờ tín chỉ)', 187, 595);
	line('Nghệ An, ngày 29 tháng 05 năm 2026', 330, 630);
	return Buffer.from(await doc.save());
};

const pageText = async (buf) => {
	const mupdf = await import('mupdf');
	const doc = mupdf.Document.openDocument(buf, 'application/pdf');
	return doc.loadPage(0).toStructuredText('preserve-whitespace').asText();
};

test('số tín chỉ → chữ', () => {
	assert.equal(creditsInWords(3), 'Ba');
	assert.equal(creditsInWords(1.5), 'Một phẩy năm');
	assert.equal(creditsInWords(10), 'Mười');
	assert.equal(creditsInWords(15), 'Mười lăm');
	assert.equal(creditsInWords(21), 'Hai mươi mốt');
	assert.equal(creditsInWords(24), 'Hai mươi tư');
	assert.equal(creditsInWords(105), 'Một trăm lẻ năm');
	assert.equal(creditsInWords(null), '');
	assert.equal(formatCredits(1.5), '1,5');
	assert.equal(formatCredits('3.0'), '3');
});

test('nhận diện ô theo nhãn đứng trước dãy chấm', () => {
	const { classify } = _test;
	assert.equal(classify('chung nhan', ''), 'name');
	assert.equal(classify('sinh ngay', ''), 'dob');
	assert.equal(classify('don vi cong tac', ''), 'organization');
	assert.equal(classify('hinh thuc tham gia hoi nghi khoa hoc vai tro', ''), 'role');
	assert.equal(classify('quy doi tuong duong', 'gio tin chi'), 'credits');
	assert.equal(classify('bang chu', 'gio tin chi'), 'credits_text');
	assert.equal(classify('so', 'c33 01'), 'so');
	assert.equal(classify('ghi chu khac', ''), null);
});

test('mẫu PDF: dò đủ ô, xoá dãy chấm, điền đúng dữ liệu', async () => {
	const tpl = await prepareTemplate(await makeTemplate());
	assert.deepEqual(tpl.missing, []);
	assert.deepEqual(tpl.unknown, []);
	assert.equal(tpl.slots.so.suffix, '/C33.01');
	assert.equal(tpl.slots.credits.align, 'center');
	assert.equal(tpl.slots.name.align, 'left');
	// Màu chữ điền vào lấy theo dãy chấm: xanh ở ô thường, đen ở dòng Số
	assert.ok(tpl.slots.name.color[1] > 0.5 && tpl.slots.name.color[0] < 0.1, 'ô tên màu xanh');
	assert.deepEqual(tpl.slots.so.color, [0, 0, 0]);

	const cleaned = await pageText(tpl.pdf);
	assert.ok(!/\.{3,}/.test(cleaned), 'không còn dãy chấm');
	assert.ok(cleaned.includes('Nghệ An, ngày 29'), 'chữ khác của mẫu giữ nguyên');
	assert.ok(cleaned.includes('Vai trò:'), 'nhãn cạnh ô giữ nguyên');

	const render = await createRenderer(tpl.pdf, tpl);
	const out = await render(
		fieldValues({
			so: '0261',
			title_prefix: 'Ông',
			full_name: 'Ngô Vi Tiến',
			dob: '14/02/1985',
			organization: 'Bệnh viện Ung bướu Nghệ An',
			role: 'Đại biểu',
			credits: 3,
		}),
	);
	const text = await pageText(out);
	for (const s of [
		'0261/C33.01',
		'Ông Ngô Vi Tiến',
		'14/02/1985',
		'Bệnh viện Ung bướu Nghệ An',
		'Đại biểu',
		'Ba',
	]) {
		assert.ok(text.includes(s), `có "${s}"`);
	}
});

test('mẫu không có chỗ điền / nhiều trang ⇒ báo lỗi rõ ràng', async () => {
	const doc = await PDFDocument.create();
	doc.addPage();
	doc.addPage();
	await assert.rejects(prepareTemplate(Buffer.from(await doc.save())), /đúng 1 trang/);
	const one = await PDFDocument.create();
	one.addPage();
	await assert.rejects(prepareTemplate(Buffer.from(await one.save())), /Không tìm thấy chỗ điền/);
	await assert.rejects(prepareTemplate(Buffer.from('không phải pdf')), /Không đọc được/);
});

test('ZIP ghi luồng: tên file tiếng Việt, nội dung đúng', async () => {
	const out = new PassThrough();
	const chunks = [];
	out.on('data', (c) => chunks.push(c));
	const zip = new ZipStoreWriter(out);
	await zip.add('0261 - Ngô Vi Tiến.pdf', Buffer.from('%PDF-a'));
	await zip.add('0262 - Hồ Đăng Châu.pdf', Buffer.from('%PDF-bb'));
	await zip.finish();
	const z = new PizZip(Buffer.concat(chunks));
	assert.deepEqual(Object.keys(z.files).sort(), [
		'0261 - Ngô Vi Tiến.pdf',
		'0262 - Hồ Đăng Châu.pdf',
	]);
	assert.equal(z.file('0262 - Hồ Đăng Châu.pdf').asText(), '%PDF-bb');
});

test('thu nhỏ ảnh Flate dạng luồng: trung bình vùng, có/không predictor PNG', async () => {
	const zlib = require('zlib');
	const { shrinkFlateImage } = require('../../src/modules/seminars/certificate/flateImageShrink');
	// Ảnh xám 4×2: hàng 1 = 0,0,100,100; hàng 2 = 50,50,150,150 → 2×1 = [25, 125]
	const rows = [
		[0, 0, 100, 100],
		[50, 50, 150, 150],
	];
	const plain = zlib.deflateSync(Buffer.from(rows.flat()));
	const out = await shrinkFlateImage(plain, { w: 4, h: 2, ncomp: 1, nw: 2, nh: 1 });
	assert.deepEqual([...out], [25, 125]);
	// Cùng ảnh mã hoá PNG: hàng 1 bộ lọc Sub (1), hàng 2 bộ lọc Up (2)
	const sub = [1, 0, 0, 100, 0];
	const up = [2, 50, 50, 50, 50];
	const png = zlib.deflateSync(Buffer.from([...sub, ...up]));
	const out2 = await shrinkFlateImage(png, { w: 4, h: 2, ncomp: 1, predictor: 15, nw: 2, nh: 1 });
	assert.deepEqual([...out2], [25, 125]);
	// Predictor TIFF (2) chưa hỗ trợ → null, bên gọi giữ nguyên ảnh
	assert.equal(
		await shrinkFlateImage(plain, { w: 4, h: 2, ncomp: 1, predictor: 2, nw: 2, nh: 1 }),
		null,
	);
});

test('chỉnh tay vị trí ô: di chuyển, đổi cỡ, ẩn, thêm ô thiếu; bản in theo đúng', async () => {
	const {
		applyEdits,
		toEditable,
	} = require('../../src/modules/seminars/certificate/certificateLayout');
	const tpl = await prepareTemplate(await makeTemplate());
	assert.ok(tpl.preview.length > 1000, 'có ảnh nền xem trước');
	const meta = { page: tpl.page, slots: { ...tpl.slots } };
	delete meta.slots.dob; // giả lập mẫu thiếu ô Sinh ngày

	const name = toEditable('name', meta.slots.name);
	assert.equal(name.bold, true);
	assert.match(name.color, /^#[0-9a-f]{6}$/);

	const slots = applyEdits(meta, {
		name: { ...name, x0: 100, x1: 400, baseline: 250, size: 16 },
		role: { ...toEditable('role', meta.slots.role), hidden: true },
		dob: { x0: 300, x1: 450, baseline: 500, size: 11, align: 'left' },
	});
	assert.equal(slots.name.x, 100);
	assert.equal(slots.name.textSize, 16);
	assert.equal(slots.role.hidden, true);
	assert.equal(slots.dob.added, true);
	assert.equal(meta.slots.name.x !== 100, true, 'không sửa thẳng vào bản gốc');

	assert.throws(() => applyEdits(meta, { abc: name }), /không tồn tại/);
	assert.throws(() => applyEdits(meta, { name: { ...name, size: 99 } }), /cỡ chữ/);
	assert.throws(() => applyEdits(meta, { name: { ...name, x0: 300, x1: 305 } }), /x1/);

	const render = await createRenderer(tpl.pdf, { page: tpl.page, slots });
	const out = await render(
		fieldValues({
			so: '0261',
			full_name: 'Ngô Vi Tiến',
			dob: '14/02/1985',
			role: 'Đại biểu',
			credits: 3,
		}),
	);
	const mupdf = await import('mupdf');
	const page = mupdf.Document.openDocument(out, 'application/pdf').loadPage(0);
	const text = page.toStructuredText('preserve-whitespace').asText();
	assert.ok(!text.includes('Đại biểu'), 'ô bị ẩn không in');
	assert.ok(text.includes('14/02/1985'), 'ô tự thêm được in');
	const hit = page.search('Ngô Vi Tiến')[0][0]; // quad: góc trên-trái ở [0], [1]
	assert.ok(Math.abs(hit[0] - 101) < 2, `tên in ở x≈101 (thực tế ${hit[0]})`);
});

test('sửa chữ in sẵn trên mẫu: dòng gốc bị xoá, bản in viết dòng mới', async () => {
	const {
		applyTextEdits,
		textEditable,
	} = require('../../src/modules/seminars/certificate/certificateLayout');
	const { removeTexts } = require('../../src/modules/seminars/certificate/certificateTemplate');
	const tpl = await prepareTemplate(await makeTemplate());
	const date = tpl.texts.find((t) => t.text.startsWith('Nghệ An, ngày 29'));
	assert.ok(date, 'trích được dòng ngày tháng');
	assert.ok(!tpl.texts.some((t) => /\.{3,}/.test(t.text)), 'không còn dãy chấm trong dòng chữ');

	const meta = { page: tpl.page, slots: tpl.slots, texts: tpl.texts };
	const edit = { ...textEditable(date), text: 'Nghệ An, ngày 15 tháng 12 năm 2026' };
	const overrides = applyTextEdits(meta, { [date.id]: edit });
	assert.equal(overrides[date.id].text, 'Nghệ An, ngày 15 tháng 12 năm 2026');
	assert.throws(() => applyTextEdits(meta, { t999: edit }), /không có trên mẫu/);
	assert.throws(
		() => applyTextEdits(meta, { [date.id]: { ...edit, text: 'x'.repeat(301) } }),
		/dài quá/,
	);

	const rebuilt = await removeTexts(tpl.pdf, [date]);
	const render = await createRenderer(rebuilt.pdf, { ...meta, text_overrides: overrides });
	const out = await render(fieldValues({ so: '0261', full_name: 'Ngô Vi Tiến', credits: 3 }));
	const text = await pageText(out);
	assert.ok(text.includes('ngày 15 tháng 12 năm 2026'), 'có dòng mới');
	assert.ok(!text.includes('ngày 29 tháng 05'), 'dòng cũ đã bị xoá');
	assert.ok(text.includes('Ngô Vi Tiến'), 'ô dữ liệu vẫn in');
});

test('tự nhận 4 dòng thông tin hội nghị trên mẫu chuẩn', () => {
	const { findInfoLines } = require('../../src/modules/seminars/certificate/certificateLayout');
	const mk = (id, text, baseline, x0 = 75) => ({ id, text, baseline, x0, size: 11.9 });
	const texts = [
		mk('a', '2. Nội dung/ chủ đề:', 454),
		mk('b', 'Hội nghị khoa học Phẫu thuật Gan Mật Tụy Việt Nam lần thứ I năm 2026', 478),
		mk('c', '3. Đơn vị/ cá nhân chịu trách nhiệm:', 502),
		mk('d', 'Bệnh viện Hữu nghị Đa khoa Nghệ An', 526),
		mk('e', '4. Thời gian: Ngày 29 tháng 5 năm 2026', 550),
		mk('f', '5. Số tiết:', 573),
		mk('g', 'Nghệ An, ngày 29 tháng 05 năm 2026', 632, 334),
	];
	assert.deepEqual(findInfoLines(texts), {
		content: { id: 'b', prefix: '' },
		organizer: { id: 'd', prefix: '' },
		time: { id: 'e', prefix: '4. Thời gian: ' },
		sign_date: { id: 'g', prefix: '' },
	});
	// Nhãn không có dòng giá trị bên dưới (dòng kế là nhãn khác) → không nhận nhầm
	assert.equal(
		findInfoLines([mk('a', '2. Nội dung/ chủ đề:', 454), mk('c', '3. Đơn vị:', 478)]).content,
		undefined,
	);
});

test('font nhúng của mẫu: đọc ToUnicode, chia đoạn ký tự có/thiếu', async () => {
	const F = require('../../src/modules/seminars/certificate/certificateFonts');
	const cmap = `1 begincodespacerange <0000> <FFFF> endcodespacerange
3 beginbfchar
<0003> <0020>
<0010> <1EC7>
<0011> <0110>
endbfchar
1 beginbfrange
<0020> <0022> <0041>
endbfrange`;
	const map = F._test.parseToUnicode(cmap);
	assert.equal(map.get(' '), 3);
	assert.equal(map.get('ệ'), 0x10);
	assert.equal(map.get('Đ'), 0x11);
	assert.deepEqual([map.get('A'), map.get('B'), map.get('C')], [0x20, 0x21, 0x22]);

	const font = { name: 'x', ref: null, map, widths: new Map([[0x20, 600]]), dw: 500 };
	const runs = F.splitRuns('AB D', font);
	assert.deepEqual(
		runs.map((r) => [r.text, r.embedded]),
		[
			['AB ', true],
			['D', false],
		],
	);
	assert.equal(F.embeddedWidth(font, 'AB', 10), 6 + 5);
	assert.equal(F.toCidHex(font, 'AĐ'), '00200011');
	assert.equal(F.normFontName('/RVFZTK+UTM-Avo'), 'utmavo');

	// Mẫu tạo bằng pdf-lib nhúng Inter dạng Type0/Identity-H có ToUnicode → đọc được
	const charsets = await F.fontCharsets(await makeTemplate());
	const inter = Object.entries(charsets).find(([k]) => k.includes('inter'));
	assert.ok(inter && inter[1].length > 50, 'đọc được bảng ký tự font nhúng');
});

// Mẫu "chữ nét vẽ" giả lập: không có ký tự nào — mỗi "chữ" là 1 hình chữ nhật nhỏ tô
// đặc; nền là mảng màu lớn + 1 lớp mờ trong suốt (như hình chìm logo)
const makeVectorTemplate = async () => {
	const doc = await PDFDocument.create();
	const page = doc.addPage([595, 842]);
	page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.85, 0.93, 0.98) });
	page.drawRectangle({
		x: 150,
		y: 400,
		width: 300,
		height: 200,
		color: rgb(0.9, 0.3, 0.6),
		opacity: 0.2,
	});
	const navy = rgb(0.18, 0.19, 0.57);
	const glyphs = (x, yTop, n, color) => {
		for (let i = 0; i < n; i++) {
			page.drawRectangle({ x: x + i * 9, y: 842 - yTop, width: 6, height: 9, color });
		}
	};
	glyphs(75, 300, 20, navy); // "Chứng nhận: Ông …"
	glyphs(75, 330, 12, navy); // "Sinh ngày: …"
	glyphs(300, 600, 15, rgb(0, 0, 0)); // "Nghệ An, ngày …"
	return Buffer.from(await doc.save());
};

const pixelAt = async (pdf, x, y) => {
	const mupdf = await import('mupdf');
	const page = mupdf.Document.openDocument(pdf, 'application/pdf').loadPage(0);
	const pix = page.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false, true);
	const i = Math.round(y) * pix.getStride() + Math.round(x) * 3;
	const px = pix.getPixels();
	return [px[i], px[i + 1], px[i + 2]];
};

test('mẫu chữ nét vẽ: dò dòng, xoá vùng bằng miếng vá nền, in ô có kiểu chữ + chữ kèm sau', async () => {
	const {
		applyEdits,
		toEditable,
		applyTextEdits,
		textEditable,
	} = require('../../src/modules/seminars/certificate/certificateLayout');
	const { patchRegions } = require('../../src/modules/seminars/certificate/certificateTemplate');
	const tpl = await prepareTemplate(await makeVectorTemplate());
	assert.equal(tpl.vector, true);
	assert.deepEqual(Object.keys(tpl.slots), []);
	assert.equal(tpl.texts.length, 3, 'dò đúng 3 dòng');
	const [l1, l2, l3] = tpl.texts;
	assert.ok(l1.vector && l1.text === '', 'dòng nét vẽ không có chữ');
	assert.ok(
		Math.abs(l1.y1 - 300) < 1 && Math.abs(l1.x0 - 75) < 1,
		`khung dòng 1 (${l1.x0}, ${l1.y1})`,
	);
	assert.ok(l1.x1 > 75 + 19 * 9, 'dòng 1 gồm cả 20 chữ');
	assert.ok(l2.y0 > l1.y1 && l3.x0 > 290, 'thứ tự dòng theo chiều dọc');
	assert.ok(l1.color[2] > 0.4 && l1.color[0] < 0.3, `màu dòng 1 xanh đậm (${l1.color})`);

	// Ô Số giấy đè lên nửa sau dòng 1: kiểu chữ, màu, chữ kèm sau
	const meta = { page: tpl.page, slots: {}, texts: tpl.texts, vector: true };
	meta.slots = applyEdits(meta, {
		so: {
			x0: 160,
			x1: 260,
			baseline: l1.baseline,
			size: 12,
			align: 'left',
			hidden: false,
			color: '#2e3192',
			bold: true,
			italic: false,
			serif: true,
			suffix: '/GCN/2025',
		},
	});
	const so = toEditable('so', meta.slots.so);
	assert.equal(so.color, '#2e3192');
	assert.equal(so.serif, true);
	assert.equal(so.bold, true);
	assert.equal(so.suffix, '/GCN/2025');
	assert.throws(() => applyEdits(meta, { so: { ...so, color: 'red' } }), /Màu chữ/);

	// Dòng 2: sửa cả dòng; kiểu chữ người dùng chọn
	const overrides = applyTextEdits(meta, {
		[l2.id]: { ...textEditable(l2), text: 'Sinh ngày: 01/01/1990', bold: true, color: '#000000' },
	});
	assert.deepEqual(overrides[l2.id].color, [0, 0, 0]);
	assert.equal(textEditable(l2, overrides[l2.id]).bold, true);

	// Xoá: nửa sau dòng 1 + cả dòng 2
	const rects = [
		{ x0: 158, y0: l1.y0 - 1, x1: 262, y1: l1.y1 + 1 },
		{ x0: l2.x0 - 1, y0: l2.y0 - 1, x1: l2.x1 + 1, y1: l2.y1 + 1 },
	];
	const patched = await patchRegions(tpl.pdf, rects);
	assert.ok(patched.preview.length > 1000, 'có ảnh xem trước mới');
	// Nền thật ở cùng hàng: khe giữa 2 chữ (có cả lớp mờ phía sau)
	const bg = await pixelAt(tpl.pdf, 75 + 10 * 9 + 7.5, l1.y1 - 4);
	const erased = await pixelAt(patched.pdf, 75 + 10 * 9 + 3, l1.y1 - 4); // chữ thứ 11 của dòng 1
	const kept = await pixelAt(patched.pdf, 75 + 3, l1.y1 - 4); // chữ đầu dòng 1 — ngoài vùng xoá
	assert.ok(
		erased.every((v, i) => Math.abs(v - bg[i]) <= 6),
		`vùng xoá liền nền (${erased} ≈ ${bg})`,
	);
	assert.ok(kept[0] < 100 && kept[2] > 100, `chữ ngoài vùng giữ nguyên (${kept})`);
	// Vùng xoá đè lên lớp mờ trong suốt: lớp mờ vẫn còn
	const wm = await pixelAt(tpl.pdf, 160, 842 - 450);
	const wmPatched = await patchRegions(tpl.pdf, [
		{ x0: 155, y0: 842 - 460, x1: 170, y1: 842 - 440 },
	]);
	assert.deepEqual(await pixelAt(wmPatched.pdf, 160, 842 - 450), wm);

	const render = await createRenderer(patched.pdf, { ...meta, text_overrides: overrides });
	const text = await pageText(
		await render(fieldValues({ so: '0261', full_name: 'Ngô Vi Tiến', credits: 3 })),
	);
	assert.ok(text.includes('0261/GCN/2025'), 'số giấy kèm chữ in sau');
	assert.ok(text.includes('Sinh ngày: 01/01/1990'), 'dòng sửa được in');
});

// Mẫu CME nét vẽ giả lập đúng bố cục chuẩn: chữ = hình chữ nhật 6×9 (cách 1pt), từ
// cách 6pt, dấu ":" = 2 chấm vuông chồng nhau, ")" = nét mảnh cao thò dưới chân chữ
const makeCmeVectorTemplate = async () => {
	const doc = await PDFDocument.create();
	const page = doc.addPage([595, 842]);
	const ink = rgb(0.18, 0.19, 0.57);
	const box = (x, yTop, w, h) =>
		page.drawRectangle({ x, y: 842 - yTop - h, width: w, height: h, color: ink });
	// spec: số chữ của từng từ, ':' = dấu hai chấm, ')' = ngoặc đóng
	const line = (x, base, spec, cw = 6, ch = 9) => {
		for (const tok of spec) {
			if (tok === ':') {
				box(x, base - 1.6, 1.6, 1.6);
				box(x, base - 6.6, 1.6, 1.6);
				x += 2.6 + 6;
			} else if (tok === ')') {
				box(x, base - 10, 1.8, 12.5);
				x += 2.8;
			} else {
				for (let i = 0; i < tok; i++) box(x + i * (cw + 1), base - ch, cw, ch);
				x += tok * (cw + 1) - 1 + 6;
			}
		}
	};
	line(95, 110, [2, ':', 4]); // Số: 002/GCN
	line(160, 196, [5, 6], 18, 24); // GIẤY CHỨNG NHẬN (tiêu đề to nhất)
	line(75, 294, [4, 3, ':', 3, 5, 4]); // Chứng nhận: Ông …
	line(75, 320, [3, 4, ':', 10]); // Sinh ngày: …
	line(75, 345, [3, 2, 3, 3, ':', 5, 4]); // Đơn vị công tác: …
	line(75, 371, [3, 4, 3, 3, ':']); // Đã hoàn thành … như sau:
	line(75, 397, [2, 4, 4, ':', 3, 4, 4, 3, 2, 3, ':', 3, 3, 4, ')']); // 1. Hình thức: … (Vai trò: …)
	line(75, 422, [2, 3, 3, ':', 6, 5]); // 2. Chủ đề: …
	line(75, 448, [2, 3, 2, 4, 5, 5, ':', 5, 4]); // 3. Đơn vị chịu trách nhiệm: …
	line(75, 473, [2, 4, 4, ':', 4, 10]); // 4. Thời gian: …
	line(75, 499, [2, 3, 3, ':', 2, 3, 3, 3, 4, 3, ':', 3, 3, 3, 3, ')']); // 5. Quy đổi: … (Bằng chữ: …)
	line(283, 595, [4, 2, 4, 2, 5, 2, 3, 4]); // Nghệ An, ngày … (không có ":")
	return Buffer.from(await doc.save());
};

test('mẫu CME nét vẽ: tự nhận đủ 7 ô theo người và 5 dòng thông tin hội nghị', async () => {
	const { guessVectorFields } = require('../../src/modules/seminars/certificate/certificateVector');
	const tpl = await prepareTemplate(await makeCmeVectorTemplate());
	assert.equal(tpl.vector, true);
	const { slots, info } = guessVectorFields(tpl.texts);
	assert.deepEqual(Object.keys(slots).sort(), [
		'credits',
		'credits_text',
		'dob',
		'name',
		'organization',
		'role',
		'so',
	]);
	assert.deepEqual(Object.keys(info).sort(), ['content', 'form', 'organizer', 'sign_date', 'time']);
	// Ô tên bắt đầu ngay sau "Chứng nhận:" (4+3 chữ, dấu ":", khoảng trống)
	const nameStart = 75 + 4 * 7 - 1 + 6 + 3 * 7 - 1 + 6 + 2.6 + 6;
	assert.ok(
		Math.abs(slots.name.x0 + 0.5 - nameStart) < 1,
		`ô tên x0 ${slots.name.x0} ≈ ${nameStart}`,
	);
	assert.equal(slots.role.suffix, ')');
	assert.equal(slots.credits_text.suffix, ' giờ tín chỉ)');
	assert.ok(slots.credits.x1 - slots.credits.x0 < 20, 'ô số tín chỉ chỉ phủ 1 từ');
	assert.ok(info.form.x1 < slots.role.x0 - 30, 'Hình thức dừng trước "(Vai trò:"');
	assert.equal(tpl.texts.find((t) => t.id === info.sign_date.id).baseline, 595);
	assert.equal(slots.name.serif, true);
	assert.match(slots.name.color, /^#2[de]309[0-2]$/, 'ô tên lấy màu của dòng');
});
