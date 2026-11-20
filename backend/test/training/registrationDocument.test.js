// Đơn đăng ký + Tờ trình khóa đào tạo liên tục (registrationDocumentService):
// mở lại file .docx sinh ra, kiểm XML hợp lệ, giá trị đúng chỗ, không sót thẻ,
// dòng chấm cho ô thiếu dữ liệu. Đơn nháp (chưa có mã đăng ký) và tờ trình nháp (bảng phân tích để
// trống). Hàm thuần — không cần CSDL.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const { DOMParser } = require('@xmldom/xmldom');
const {
	DOCX_MIME,
	BLANK,
	renderApplication,
	renderProposal,
} = require('../../src/modules/training/registration/registrationDocumentService');

const TEMPLATE_DIR = path.join(__dirname, '../../templates/training');

const documentXml = (buffer) => {
	const xml = new PizZip(buffer).file('word/document.xml').asText();
	const errors = [];
	new DOMParser({ onError: (level, msg) => errors.push(`${level}: ${msg}`) }).parseFromString(
		xml,
		'text/xml',
	);
	assert.deepEqual(errors, [], 'document.xml phải là XML hợp lệ');
	return xml;
};
const paragraphs = (xml) =>
	[...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) =>
		[...m[0].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
			.map((t) => t[1])
			.join('')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&'),
	);
const rows = (xml) =>
	[...xml.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((r) =>
		[...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => paragraphs(c[0]).join('').trim()),
	);
const noLeftoverTags = (xml) => {
	const text = paragraphs(xml).join('\n');
	assert.doesNotMatch(text, /[{}]/, 'không còn thẻ { } trong văn bản');
};

const SNAPSHOT = {
	source: 'internal',
	full_name: 'Nguyễn Văn Ánh',
	dob: '1990-03-05',
	gender: 'male',
	ethnicity: 'Kinh',
	hometown: 'Diễn Châu, Nghệ An',
	national_id: '040090001234',
	national_id_issued_date: '2021-07-09',
	national_id_issued_place: 'Cục Cảnh sát QLHC về TTXH',
	permanent_address: 'Xóm 1, Diễn Châu',
	address: 'Số 10 Lê Lợi, Vinh',
	phone: '0912345678',
	email: 'anh@example.com',
	qualification: 'Điều dưỡng đại học',
	graduated_school: 'Đại học Y khoa Vinh',
	graduated_year: 2013,
	graduated_major: 'Điều dưỡng',
	workplace: 'Phòng khám X',
	work_specialty: 'Hồi sức',
	work_seniority: '10 năm',
};
const APP_FULL = {
	source: 'internal',
	registration_code: 'DK-2026-000123',
	created_at: new Date(2026, 11, 27, 9, 30),
	snapshot: SNAPSHOT,
	course_name: 'Điện tâm đồ cơ bản',
	program_name: 'Khóa 01/2026',
	department_name: 'Khoa Hồi sức tích cực',
};

test('đơn nội viện: điền đủ giá trị, kính gửi theo khoa, họ tên in hoa và thường', async () => {
	const out = await renderApplication(APP_FULL);
	assert.equal(out.mime, DOCX_MIME);
	assert.equal(out.filename, 'Don-dang-ky-Nguyen-Van-Anh-DK-2026-000123.docx');
	const xml = documentXml(out.buffer);
	noLeftoverTags(xml);
	const lines = paragraphs(xml);
	const has = (needle) =>
		assert.ok(
			lines.some((l) => l.includes(needle)),
			`thiếu "${needle}"`,
		);

	assert.equal(lines.find((l) => l.startsWith('Kính gửi')).includes('Khoa/Phòng/TT'), false);
	has('Khoa Hồi sức tích cực');
	assert.doesNotMatch(lines.join('\n'), /Giám đốc Bệnh viện Hữu nghị/);
	has('NGUYỄN VĂN ÁNH');
	has('Dân tộc: Kinh');
	has('Ngày sinh: 05/03/1990');
	has('Quê quán: Diễn Châu, Nghệ An');
	has('040090001234');
	has('Ngày cấp: 09/07/2021');
	has('Nơi cấp: Cục Cảnh sát QLHC về TTXH');
	has('Địa chỉ liên hệ: Số 10 Lê Lợi, Vinh');
	has('0912345678');
	has('Email: anh@example.com');
	has('Trường tốt nghiệp: Đại học Y khoa Vinh');
	has('Năm TN: 2013');
	assert.ok(lines.includes('Điều dưỡng'), 'chuyên ngành tốt nghiệp ở dòng riêng');
	has('Cơ quan đang công tác: Bệnh viện Hữu nghị Đa khoa Nghệ An – Khoa Hồi sức tích cực');
	has('Chuyên ngành đang công tác: Hồi sức');
	has('Thâm niên công tác: 10 năm');
	has('Khóa đào tạo đăng ký học: Điện tâm đồ cơ bản – Khóa 01/2026');
	has('Nghệ An, ngày 27 tháng 12 năm 2026');
	assert.ok(lines.includes('Nguyễn Văn Ánh'), 'họ tên thường dưới chỗ ký');
	assert.equal(lines[lines.length - 1], 'Mã đăng ký: DK-2026-000123');
	// Giữ chữ phụ của mẫu gốc; giới tính không có trên mẫu
	has('(ghi bằng tốt nghiệp có trình độ cao nhất)');
	has('VD: Cao đẳng điều dưỡng, Bác sỹ đa khoa, BSCKI Nội khoa');
	assert.doesNotMatch(lines.join('\n'), /Giới tính|Nam\b/);
	assert.equal(lines.filter((l) => l.includes(BLANK)).length, 0, 'đủ dữ liệu ⇒ hết dòng chấm');
});

test('đơn ngoại viện: kính gửi Giám đốc + Trung tâm; cơ quan lấy từ bản khai', async () => {
	const out = await renderApplication({
		...APP_FULL,
		source: 'external',
		department_name: null,
		snapshot: { ...SNAPSHOT, source: 'external', address: '' },
	});
	const xml = documentXml(out.buffer);
	noLeftoverTags(xml);
	const lines = paragraphs(xml);
	assert.ok(
		lines.some((l) =>
			l.includes('Giám đốc Bệnh viện Hữu nghị Đa khoa Nghệ An; Trung tâm Đào tạo và Chỉ đạo tuyến'),
		),
	);
	assert.ok(!lines.some((l) => l.includes('Khoa/Phòng/TT')));
	assert.ok(lines.includes('Cơ quan đang công tác: Phòng khám X'));
	// address trống ⇒ dùng thường trú
	assert.ok(lines.includes('Địa chỉ liên hệ: Xóm 1, Diễn Châu'));
});

test('đơn thưa dữ liệu: ô thiếu in dòng chấm, không lỗi, ký tự đặc biệt được thoát', async () => {
	const out = await renderApplication({
		source: 'internal',
		registration_code: 'DK-2026-000124',
		created_at: null,
		snapshot: { full_name: 'Trần Thị <B> & Đỗ', qualification: 'Bác sĩ' },
		course_name: 'Khóa A',
	});
	assert.equal(out.filename, 'Don-dang-ky-Tran-Thi-B-Do-DK-2026-000124.docx');
	const xml = documentXml(out.buffer);
	noLeftoverTags(xml);
	const lines = paragraphs(xml);
	const line = (prefix) => lines.find((l) => l.startsWith(prefix));
	assert.ok(line('Họ và tên').includes('TRẦN THỊ <B> & ĐỖ'));
	assert.equal(line('Ngày sinh:'), `Ngày sinh: ${BLANK}`);
	assert.equal(line('Quê quán:'), `Quê quán: ${BLANK}`);
	assert.ok(line('Số CCCD').includes(BLANK));
	assert.ok(line('Ngày cấp').includes(`Ngày cấp: ${BLANK}`));
	assert.ok(line('Kính gửi').includes('Khoa/Phòng/TT'));
	assert.ok(lines.some((l) => l.includes('Khoa/Phòng/TT') && l.includes('…')));
	assert.equal(
		line('Cơ quan đang công tác'),
		'Cơ quan đang công tác: Bệnh viện Hữu nghị Đa khoa Nghệ An',
	);
	assert.equal(line('Khóa đào tạo'), 'Khóa đào tạo đăng ký học: Khóa A');
	// chuyên ngành tốt nghiệp trống ⇒ lấy trình độ
	assert.ok(lines.includes('Bác sĩ'));
	// không có ngày lập ⇒ chừa trống như mẫu gốc
	assert.match(line('Nghệ An, ngày'), /^Nghệ An, ngày\s+tháng\s+năm\s*$/);
});

test('đơn không có họ tên: tên file dự phòng, vẫn sinh được', async () => {
	const out = await renderApplication({
		source: 'external',
		registration_code: 'X1',
		created_at: '2026-12-27T20:00:00Z',
		snapshot: {},
		course_name: 'Khóa A',
	});
	assert.equal(out.filename, 'Don-dang-ky-nguoi-dang-ky-X1.docx');
	const lines = paragraphs(documentXml(out.buffer));
	// 20:00 UTC = 03:00 ngày 28 giờ Việt Nam
	assert.ok(lines.includes('Nghệ An, ngày 28 tháng 12 năm 2026'));
});

const PROPOSAL = {
	department_name: 'Khoa Nội tim mạch',
	course_name: 'Đợt 2/2027',
	program_name: 'Siêu âm tim cơ bản',
	start_date: '2027-03-01',
	end_date: new Date(2027, 2, 20),
	tuition_fee: 1500000,
	people: [
		{ staff_number: 101, full_name: 'Lê Văn A', birth_year: 1985, qualification: 'BSCKI' },
		{ staff_number: 205, full_name: 'Phạm Thị B', birth_year: 1992, qualification: 'ĐD ĐH' },
		{ staff_number: null, full_name: 'Hồ Văn C', birth_year: null, qualification: null },
	],
	analysis: {
		technique: 'Siêu âm tim qua thành ngực',
		certified_count: 2,
		in_other_training_count: 0,
		reason: 'Triển khai kỹ thuật mới',
	},
};

test('tờ trình đủ dữ liệu: khoa, năm, lớp, ngày, kinh phí, bảng người và bảng phân tích', async () => {
	const out = await renderProposal(PROPOSAL);
	assert.equal(out.mime, DOCX_MIME);
	assert.equal(out.filename, 'To-trinh-Noi-tim-mach-Sieu-am-tim-co-ban.docx');
	assert.match(out.filename, /^[A-Za-z0-9.-]+$/);
	const xml = documentXml(out.buffer);
	noLeftoverTags(xml);
	const text = paragraphs(xml);
	const joined = text.join('\n');

	assert.ok(text.includes('KHOA: NỘI TIM MẠCH'));
	assert.ok(text.includes('Căn cứ kế hoạch đào tạo năm 2027 của khoa Nội tim mạch;'));
	assert.doesNotMatch(joined, /2026/, 'năm cứng 2026 đã được thay');
	assert.ok(text.some((l) => l.startsWith('Siêu âm tim cơ bản tại Bệnh viện')));
	assert.ok(text.some((l) => /về Siêu âm tim cơ bản, đáp ứng/.test(l)));
	assert.equal((joined.match(/[Kk]hoa Nội tim mạch/g) || []).length, 4, '"khoa …" ở 4 chỗ');
	assert.ok(
		text.includes(
			'Khoa Nội tim mạch đã bố trí nhân lực và đảm bảo duy trì hoạt động chuyên môn thường quy trong thời gian cán bộ tham gia học tập.',
		),
	);
	assert.ok(text.includes('Nội dung lớp học: Siêu âm tim cơ bản'));
	assert.ok(text.includes('Thời gian: Từ ngày 01/03/2027 đến ngày 20/03/2027'));
	assert.ok(text.some((l) => l.startsWith('Kinh phí: 1.500.000 đồng/học viên/khóa học')));
	// phần ký giữ nguyên
	assert.ok(text.includes('Nguyễn Ngọc Hòa'));
	assert.ok(text.includes('TRƯỞNG KHOA'));
	assert.ok(text.includes('LÃNH ĐẠO'));
	assert.ok(text.includes('TRUNG TÂM ĐT-CĐT'));

	const table = rows(xml);
	const header = table.findIndex((r) => r[0] === 'TT');
	assert.ok(header >= 0);
	assert.deepEqual(table.slice(header + 1, header + 4), [
		['1', '101', 'Lê Văn A', '1985', 'BSCKI'],
		['2', '205', 'Phạm Thị B', '1992', 'ĐD ĐH'],
		['3', '', 'Hồ Văn C', '', ''],
	]);
	assert.notEqual(table[header + 4]?.length, 5, 'không còn dòng người thừa');

	// Bảng phân tích: tên lớp, kỹ thuật, 2, đề xuất = 3 người, 0, lý do
	const needs = table.find((r) => r.length === 8 && r[2].startsWith('Siêu âm tim cơ bản'));
	assert.deepEqual(needs, [
		'',
		'',
		'Siêu âm tim cơ bản',
		'Siêu âm tim qua thành ngực',
		'2',
		'3',
		'0',
		'Triển khai kỹ thuật mới',
	]);
});

test('tờ trình thưa dữ liệu: dòng chấm cho khoa viết tay, bảng phân tích để trống', async () => {
	const out = await renderProposal({
		department_name: '',
		course_name: 'Lớp Y',
		people: [],
	});
	assert.match(out.filename, /^To-trinh-khoa-Lop-Y\.docx$/);
	const xml = documentXml(out.buffer);
	noLeftoverTags(xml);
	const text = paragraphs(xml);
	assert.ok(text.includes(`KHOA: ${BLANK}`));
	assert.ok(
		text.some(
			(l) => l.startsWith('Căn cứ kế hoạch đào tạo năm ') && l.includes(`của khoa ${BLANK};`),
		),
	);
	assert.ok(
		text.some((l) => l.startsWith('Thời gian: Từ ngày ') && (l.match(/…/g) || []).length > 10),
	);
	assert.ok(text.some((l) => l.startsWith('Kinh phí: ') && l.includes(BLANK)));
	const year = String(new Date().getFullYear());
	assert.ok(text.includes(`Nghệ An, ngày…… tháng……. năm ${year}`));

	const table = rows(xml);
	const header = table.findIndex((r) => r[0] === 'TT');
	assert.deepEqual(table[header + 1], ['', '', '', '', ''], 'giữ 1 dòng trống khi chưa có người');
	const needs = table.find((r) => r.length === 8 && r[2] === 'Lớp Y');
	assert.deepEqual(needs, ['', '', 'Lớp Y', '', '', '', '', '']);
});

test('tờ trình: năm lấy theo data.year, ưu tiên hơn ngày bắt đầu; đề xuất tự đặt thì giữ', async () => {
	const out = await renderProposal({
		...PROPOSAL,
		year: 2030,
		analysis: { proposed_count: 5 },
	});
	const xml = documentXml(out.buffer);
	const text = paragraphs(xml);
	assert.ok(text.some((l) => l.includes('năm 2030 của khoa')));
	assert.ok(text.includes('Nghệ An, ngày…… tháng……. năm 2030'));
	const needs = rows(xml).find((r) => r.length === 8 && r[2].startsWith('Siêu âm'));
	assert.deepEqual(needs.slice(3), ['', '', '5', '', '']);
});

// ─── Đơn nháp / tờ trình nháp ───────────────────────────────────────────────
test('đơn nháp: không có dòng "Mã đăng ký", ngày lập để trống, không dòng chấm thừa, tên file -ban-nhap', async () => {
	const out = await renderApplication({
		...APP_FULL,
		registration_code: null,
		created_at: null,
		draft: true,
	});
	assert.equal(out.mime, DOCX_MIME);
	assert.equal(out.filename, 'Don-dang-ky-Nguyen-Van-Anh-ban-nhap.docx');
	assert.match(out.filename, /-ban-nhap\.docx$/);
	const xml = documentXml(out.buffer);
	noLeftoverTags(xml);
	assert.doesNotMatch(xml, /Mã đăng ký/, 'XML không còn chuỗi "Mã đăng ký"');
	const lines = paragraphs(xml);
	assert.ok(!lines.some((l) => /Mã đăng ký/.test(l)));
	// Đoạn văn cũ của dòng mã vẫn còn (rỗng) ⇒ chiều cao trang như đơn thật, không in dòng chấm
	assert.equal(lines[lines.length - 1].trim(), '');
	assert.equal(lines.filter((l) => l.includes(BLANK)).length, 0, 'đủ dữ liệu ⇒ hết dòng chấm');
	assert.match(
		lines.find((l) => l.startsWith('Nghệ An, ngày')),
		/^Nghệ An, ngày\s+tháng\s+năm\s*$/,
	);
	// Đơn thật cùng dữ liệu: nhiều hơn đúng 1 đoạn chữ ("Mã đăng ký: …") — phần còn lại y hệt
	const real = paragraphs(documentXml((await renderApplication(APP_FULL)).buffer));
	assert.equal(real.length, lines.length, 'cùng số đoạn văn');
	assert.deepEqual(
		lines.slice(0, -1).filter((l) => !l.startsWith('Nghệ An, ngày')),
		real.slice(0, -1).filter((l) => !l.startsWith('Nghệ An, ngày')),
	);
	// Không làm hỏng đơn thật sau khi đã dựng bản nháp (cache riêng)
	assert.equal(real[real.length - 1], 'Mã đăng ký: DK-2026-000123');
});

test('đơn nháp: draft không phải true thì vẫn là đơn thật; mẫu gốc vẫn chứa đúng chuỗi mã đăng ký', async () => {
	const out = await renderApplication({ ...APP_FULL, draft: false });
	assert.equal(out.filename, 'Don-dang-ky-Nguyen-Van-Anh-DK-2026-000123.docx');
	// Chặn đổi mẫu âm thầm: đơn nháp dựa vào đúng chuỗi này trong mẫu
	const tpl = new PizZip(fs.readFileSync(path.join(TEMPLATE_DIR, 'don-dang-ky-dtlt.docx')));
	assert.ok(
		tpl.file('word/document.xml').asText().includes('Mã đăng ký: {ma_dang_ky}'),
		'mẫu đơn phải chứa nguyên chuỗi "Mã đăng ký: {ma_dang_ky}" trong 1 thẻ w:t',
	);
});

test('tờ trình nháp (blank_analysis): đúng 1 người, mọi ô bảng phân tích để trống kể cả số đề xuất', async () => {
	const out = await renderProposal({
		...PROPOSAL,
		people: [
			{ staff_number: 101, full_name: 'Lê Văn A', birth_year: 1985, qualification: 'BSCKI' },
		],
		blank_analysis: true,
	});
	const xml = documentXml(out.buffer);
	noLeftoverTags(xml);
	const table = rows(xml);
	const header = table.findIndex((r) => r[0] === 'TT');
	assert.deepEqual(table[header + 1], ['1', '101', 'Lê Văn A', '1985', 'BSCKI']);
	assert.notEqual(table[header + 2]?.length, 5, 'bảng người có đúng 1 dòng');
	// Bảng phân tích: tên lớp giữ, kỹ thuật / có chứng chỉ / đề xuất / khoa khác / lý do đều rỗng
	// (PROPOSAL có sẵn analysis — blank_analysis phải thắng)
	const needs = table.find((r) => r.length === 8 && r[2].startsWith('Siêu âm tim cơ bản'));
	assert.deepEqual(needs, ['', '', 'Siêu âm tim cơ bản', '', '', '', '', '']);
	assert.doesNotMatch(xml, /Triển khai kỹ thuật mới|Siêu âm tim qua thành ngực/);

	// Không bật cờ ⇒ như cũ: số đề xuất mặc định = số người
	const normal = await renderProposal({
		...PROPOSAL,
		people: [
			{ staff_number: 101, full_name: 'Lê Văn A', birth_year: 1985, qualification: 'BSCKI' },
		],
	});
	const nrow = rows(documentXml(normal.buffer)).find(
		(r) => r.length === 8 && r[2].startsWith('Siêu âm tim cơ bản'),
	);
	assert.equal(nrow[5], '1');
});

test('mẫu: docxtemplater không báo lỗi cú pháp thẻ ở cả hai mẫu', () => {
	const Docxtemplater = require('docxtemplater');
	for (const f of ['don-dang-ky-dtlt.docx', 'to-trinh-dtlt.docx']) {
		const zip = new PizZip(fs.readFileSync(path.join(TEMPLATE_DIR, f)));
		assert.doesNotThrow(() => new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true }), f);
	}
	assert.equal(fs.existsSync(path.join(TEMPLATE_DIR, 'goc')), false, 'thư mục goc/ đã xóa');
});
