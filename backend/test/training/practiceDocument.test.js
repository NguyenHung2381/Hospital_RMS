const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const { DOMParser } = require('@xmldom/xmldom');
const {
	TEMPLATES,
	buildFields,
	render,
	templateTags,
	BLANK,
} = require('../../src/modules/training/courses/practiceDocumentService');
const { convertXml, slug } = require('../../scripts/convert-mergefield-template');

// Hồ sơ giả — đủ mọi trường
const REC = {
	enrollment: {
		practice_code: '999.BS',
		professional_field: 'Bác sĩ y khoa',
		practice_form: 'Khám bệnh, chữa bệnh y khoa',
		total_duration: '12 tháng',
		start_date: new Date('2025-06-16T00:00:00Z'),
		end_date: new Date('2026-06-15T00:00:00Z'),
		practice_location: null,
		sending_unit: 'BV X',
	},
	trainee: {
		full_name: 'Học Viên Thử',
		gender: 'female',
		dob: new Date('1999-08-15T00:00:00Z'),
		birth_province: 'Nghệ An',
		national_id: '040199000001',
		national_id_issued_date: new Date('2024-11-12T00:00:00Z'),
		national_id_issued_place: 'Bộ Công an',
		permanent_address: 'Xóm 1, xã A',
		phone: '0900000000',
		qualification: 'Bác sĩ đa khoa',
		graduated_year: 2023,
	},
	rotations: [
		{
			id: 'R1',
			seq: 10,
			round_title: 'Vòng HSCC',
			department_name: 'Khoa Cấp Cứu',
			start_date: new Date('2025-06-16T00:00:00Z'),
			end_date: new Date('2025-09-15T00:00:00Z'),
			duration_text: '03 tháng',
			mentor_name: 'Người Hướng Dẫn A',
			mentor_salutation: 'ông',
			mentor_dob: new Date('1987-06-10T00:00:00Z'),
			mentor_qualification: 'Bác sĩ chuyên khoa II',
			mentor_license_no: '000001/NA-CCHN',
			mentor_license_date: new Date('2015-04-27T00:00:00Z'),
			mentor_scope: 'Khám chữa bệnh Hồi sức cấp cứu',
			result: 'pass',
		},
		{
			id: 'R2',
			seq: 20,
			round_title: 'Vòng Nội',
			department_name: 'Khoa Nội Tim Mạch 2',
			start_date: new Date('2025-09-16T00:00:00Z'),
			end_date: new Date('2025-10-15T00:00:00Z'),
			duration_text: null,
			mentor_name: 'Người Hướng Dẫn B',
			result: 'pending',
		},
	],
};

const docText = (buf) =>
	new PizZip(buf)
		.file('word/document.xml')
		.asText()
		.replace(/<[^>]+>/g, '');

for (const type of Object.keys(TEMPLATES)) {
	test(`mẫu ${type}: mọi biến trong mẫu đều có dữ liệu`, () => {
		const fields = buildFields(REC, TEMPLATES[type].perRotation ? REC.rotations[0] : null);
		const unknown = templateTags(type).filter((t) => fields[t] === undefined);
		assert.deepEqual(unknown, [], `biến chưa có nguồn dữ liệu: ${unknown.join(', ')}`);
	});

	test(`mẫu ${type}: sinh .docx không còn {biến} sót, có giá trị của hồ sơ`, () => {
		const fields = buildFields(REC, TEMPLATES[type].perRotation ? REC.rotations[0] : null);
		const text = docText(render(type, fields));
		assert.doesNotMatch(text, /\{[a-z0-9_]+\}/);
		assert.match(text, /Học Viên Thử/);
		assert.match(text, /999\.BS/);
		assert.match(text, /040199000001/);
	});

	test(`mẫu ${type}: document.xml sinh ra là XML hợp lệ (Word mở được)`, () => {
		const fields = buildFields(REC, TEMPLATES[type].perRotation ? REC.rotations[0] : null);
		const xml = new PizZip(render(type, fields)).file('word/document.xml').asText();
		new DOMParser({ onError: (level, msg) => assert.fail(msg) }).parseFromString(xml, 'text/xml');
	});
}

test('chuyển mẫu trộn thư: trường trong textbox không cắt mất run bọc textbox', () => {
	const field = (name) =>
		'<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
		`<w:r><w:instrText> MERGEFIELD ${name} </w:instrText></w:r>` +
		'<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
		`<w:r><w:t>«${name}»</w:t></w:r>` +
		'<w:r><w:fldChar w:fldCharType="end"/></w:r>';
	const xml = `<w:p><w:r><w:rPr><w:noProof/></w:rPr><w:drawing><w:txbxContent><w:p>${field('Mã')}</w:p></w:txbxContent></w:drawing></w:r></w:p>`;
	assert.equal(
		convertXml(xml).xml,
		'<w:p><w:r><w:rPr><w:noProof/></w:rPr><w:drawing><w:txbxContent><w:p>' +
			'<w:r><w:t xml:space="preserve">{ma}</w:t></w:r>' +
			'</w:p></w:txbxContent></w:drawing></w:r></w:p>',
	);
});

test('phiếu nhận xét: vòng được chọn là *_1; tên khoa bỏ chữ "Khoa"; ông/bà theo giới tính', () => {
	const f = buildFields(REC, REC.rotations[1]);
	assert.equal(f.khoa_thuc_hanh_1, 'Nội Tim Mạch 2');
	assert.equal(f.nguoi_huong_dan_1, 'Người Hướng Dẫn B');
	assert.equal(f.tong_thoi_gian_khoa_1, '01 tháng'); // chưa ghi thời lượng ⇒ tính từ ngày
	assert.equal(f.gioi_tinh, 'bà');
	assert.equal(f.ngay_sinh, '15/08/1999');
	assert.equal(f.dia_diem_thuc_hanh, 'Tại các khoa: Cấp Cứu, Nội Tim Mạch 2');
	const text = docText(render('phieu-nhan-xet', f));
	assert.match(text, /khoa Nội Tim Mạch 2/);
	assert.ok(text.includes(BLANK), 'ô thiếu dữ liệu (CCHN của NHD B) in thành dòng chấm');
});

test('chuyển mẫu trộn thư: fldSimple và trường phức thành 1 run {biến}', () => {
	assert.equal(slug('Nơi_sinh__Tỉnh'), 'noi_sinh_tinh');
	assert.equal(slug('PVHĐCM_của_NHD_TH_1'), 'pvhdcm_cua_nhd_th_1');
	const xml =
		'<w:p><w:r><w:t>Họ tên: </w:t></w:r>' +
		'<w:r><w:rPr><w:b/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>' +
		'<w:r><w:instrText xml:space="preserve"> MERGEFIELD "Họ_và_tên" </w:instrText></w:r>' +
		'<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
		'<w:r><w:rPr><w:i/></w:rPr><w:t>«Họ_và_tên»</w:t></w:r>' +
		'<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
		'<w:fldSimple w:instr=" MERGEFIELD &quot;Mã_thực_hành&quot; "><w:r><w:t>«Mã_thực_hành»</w:t></w:r></w:fldSimple></w:p>';
	const { xml: out, tags } = convertXml(xml);
	assert.deepEqual([...tags].sort(), ['ho_va_ten', 'ma_thuc_hanh']);
	assert.equal(
		out,
		'<w:p><w:r><w:t>Họ tên: </w:t></w:r>' +
			'<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">{ho_va_ten}</w:t></w:r>' +
			'<w:r><w:t xml:space="preserve">{ma_thuc_hanh}</w:t></w:r></w:p>',
	);
});
