// Luật nhận diện loại giấy tờ hồ sơ đăng ký khóa ĐTLT (docCheck/docCheckRules.js) — file thuần,
// chữ đầu vào giả lập kết quả OCR (đã có lỗi dấu / sai vài ký tự như OCR thật).
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../../src/modules/training/registration/docCheck/docCheckRules');

const ID = { full_name: 'Nguyễn Văn An', national_id: '001099012345' };

const CCCD_FRONT = `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM Độc lập - Tự do - Hạnh phúc
CĂN CƯỚC CÔNG DÂN Citizen Identity Card Số / No.: 001099012345
Họ và tên / Full name: NGUYỄN VĂN AN Ngày sinh / Date of birth: 01/01/1999
Giới tính / Sex: Nam Quốc tịch / Nationality: Việt Nam Quê quán / Place of origin: Hà Nội
Nơi thường trú / Place of residence: Số 1 phố Huế, Hà Nội Có giá trị đến: 01/01/2039`;
const CCCD_BACK = `Đặc điểm nhân dạng / Personal identification: Nốt ruồi cách 2cm trên mép phải
Ngày, tháng, năm: 15/08/2021 CỤC TRƯỞNG CỤC CẢNH SÁT QUẢN LÝ HÀNH CHÍNH VỀ TRẬT TỰ XÃ HỘI
Ngón trỏ trái Ngón trỏ phải IDVNM0990123451001099012345<<1 9901014M3901014VNM<<<<<<<<<<<6
NGUYEN<<VAN<AN<<<<<<<<<<<<<<<<`;
const DECISION = `ỦY BAN NHÂN DÂN TỈNH BẮC NINH CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
QUYẾT ĐỊNH Về việc cử viên chức đi học GIÁM ĐỐC BỆNH VIỆN Căn cứ Luật Viên chức;
Theo đề nghị của Trưởng phòng Tổ chức cán bộ, QUYẾT ĐỊNH: Điều 1. Cử bà Nguyễn Văn An,
số căn cước công dân 001099012345 tham gia khóa học. Điều 2. Thủ trưởng các đơn vị chịu
trách nhiệm thi hành quyết định này. Nơi nhận: như Điều 2.`;

test('normalize: bỏ dấu, viết hoa, giữ < của MRZ', () => {
	assert.equal(rules.normalize('Căn cước công dân — Đặc điểm'), 'CAN CUOC CONG DAN DAC DIEM');
	assert.equal(rules.normalize('IDVNM«««'), 'IDVNM<<<');
});

test('fuzzyHas: chịu được OCR đọc sai vài ký tự', () => {
	const t = rules.normalize('CHUNG CHL HANH NGHÈ kham benh');
	assert.ok(rules.fuzzyHas(t, t.split(' '), rules.normalize('chứng chỉ hành nghề')));
	assert.ok(!rules.fuzzyHas(t, t.split(' '), rules.normalize('giấy phép lái xe')));
});

test('parseCccdQr: lấy số CCCD 12 số + họ tên; chuỗi khác ⇒ null', () => {
	assert.deepEqual(
		rules.parseCccdQr('001099012345|123456789|Nguyễn Văn An|01011999|Nam|Hà Nội|15082021'),
		{ id: '001099012345', name: 'Nguyễn Văn An' },
	);
	assert.equal(rules.parseCccdQr('https://example.com/verify?id=1'), null);
	assert.equal(rules.parseCccdQr('abc|def'), null);
});

test('CCCD đủ 2 mặt, đúng họ tên ⇒ ok, không cảnh báo', () => {
	const r = rules.evaluate({
		kind: 'national_id',
		pages: [{ text: CCCD_FRONT }, { text: CCCD_BACK }],
		identity: ID,
	});
	assert.equal(r.verdict, 'ok');
	assert.deepEqual(r.warnings, []);
	assert.equal(r.signals.mrz, true);
	assert.equal(r.signals.id_found, true);
});

test('CCCD chỉ có mặt trước ⇒ cảnh báo thiếu mặt sau', () => {
	const r = rules.evaluate({ kind: 'national_id', pages: [{ text: CCCD_FRONT }], identity: ID });
	assert.equal(r.verdict, 'ok');
	assert.deepEqual(r.warnings, ['cccd_missing_back']);
});

test('CCCD chỉ có mặt sau ⇒ cảnh báo thiếu mặt trước', () => {
	const r = rules.evaluate({ kind: 'national_id', pages: [{ text: CCCD_BACK }], identity: ID });
	assert.equal(r.verdict, 'ok');
	assert.ok(r.warnings.includes('cccd_missing_front'));
});

test('QR CCCD số khác số đã khai ⇒ id_mismatch', () => {
	const r = rules.evaluate({
		kind: 'national_id',
		pages: [{ text: '', qr: ['079199000111||Trần Thị B|02021990|Nữ|TP HCM|01012022'] }],
		identity: ID,
	});
	assert.equal(r.verdict, 'ok');
	assert.equal(r.signals.id_match, false);
	assert.ok(r.warnings.includes('id_mismatch'));
});

test('Nộp quyết định vào ô CCCD ⇒ mismatch, đoán là quyết định (dù có nhắc số CCCD)', () => {
	const r = rules.evaluate({ kind: 'national_id', pages: [{ text: DECISION }], identity: ID });
	assert.equal(r.verdict, 'mismatch');
	assert.equal(r.detected_kind, 'decision');
});

test('Quyết định đúng ô ⇒ ok', () => {
	const r = rules.evaluate({ kind: 'decision', pages: [{ text: DECISION }], identity: ID });
	assert.equal(r.verdict, 'ok');
	assert.equal(r.detected_kind, 'decision');
});

test('Đọc được chữ mà không có dấu hiệu loại nào ⇒ mismatch, không đoán được loại', () => {
	const text =
		'Thực đơn tuần này gồm cơm gà, phở bò, bún chả, canh chua và nhiều món tráng miệng khác cho mọi người cùng thưởng thức';
	const r = rules.evaluate({ kind: 'license', pages: [{ text }], identity: ID });
	assert.equal(r.verdict, 'mismatch');
	assert.equal(r.detected_kind, null);
});

test('OCR rác / ảnh mờ ⇒ unclear (không kết luận sai)', () => {
	const r = rules.evaluate({ kind: 'degree', pages: [{ text: '~~ ;; 1 l| ,. ' }], identity: ID });
	assert.equal(r.verdict, 'unclear');
	assert.deepEqual(r.warnings, []);
});

test('Bằng tốt nghiệp không có họ tên người đăng ký ⇒ name_not_found; số hiệu khớp ⇒ cộng điểm', () => {
	const text = `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM HIỆU TRƯỞNG TRƯỜNG ĐẠI HỌC Y HÀ NỘI cấp
BẰNG TỐT NGHIỆP ĐẠI HỌC cho Ông Trần Văn Bình ngành Y khoa Xếp loại tốt nghiệp Khá
Hình thức đào tạo Chính quy Số hiệu: A123456 Số vào sổ cấp bằng: 2015/YK-0012`;
	const r = rules.evaluate({
		kind: 'degree',
		pages: [{ text }],
		identity: { ...ID, degree_number: 'A 123456' },
	});
	assert.equal(r.verdict, 'ok');
	assert.equal(r.signals.degree_number_found, true);
	assert.deepEqual(r.warnings, ['name_not_found']);
});

test('Trang trắng ⇒ cảnh báo blank', () => {
	const r = rules.evaluate({ kind: 'license', pages: [{ text: '', blank: true }], identity: ID });
	assert.equal(r.verdict, 'unclear');
	assert.deepEqual(r.warnings, ['blank']);
});

test('Không lưu chữ đọc được: signals chỉ có cờ / điểm', () => {
	const r = rules.evaluate({ kind: 'national_id', pages: [{ text: CCCD_FRONT }], identity: ID });
	const json = JSON.stringify(r);
	assert.ok(!json.includes('001099012345'), 'không chứa số CCCD');
	assert.ok(!/NGUYEN VAN AN/i.test(json), 'không chứa họ tên');
});
