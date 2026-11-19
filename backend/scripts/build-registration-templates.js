#!/usr/bin/env node
/**
 * build-registration-templates.js — dựng 2 mẫu Word của form đăng ký khóa đào tạo
 * liên tục từ bản gốc của phòng Đào tạo (chỉ có dòng chấm "……………", không phải mẫu
 * trộn thư). Đổi các cụm dòng chấm thành thẻ docxtemplater ({ten_the}) NGAY TRONG run
 * cũ nên phông, cỡ chữ, lề, độ rộng bảng giữ nguyên.
 *
 * Dùng: node scripts/build-registration-templates.js [thư-mục-mẫu-gốc] [thư-mục-xuất]
 *   mặc định: gốc = templates/training/goc, xuất = templates/training
 * Mẫu gốc đã bị xóa khỏi repo sau khi chuyển (xem lịch sử git, thư mục goc/);
 * script giữ lại để dựng lại khi phòng Đào tạo đổi mẫu.
 *
 * Thẻ trong mẫu (khai báo ở registrationDocumentService.js):
 *   Đơn: kinh_gui ho_ten_hoa dan_toc ngay_sinh que_quan cccd ngay_cap noi_cap dia_chi
 *        dien_thoai email truong_tot_nghiep nam_tn chuyen_nganh_tn co_quan
 *        chuyen_nganh_cong_tac tham_nien khoa_hoc ngay thang nam ho_ten ma_dang_ky
 *   Tờ trình: khoa_hoa khoa nam ten_lop tu_ngay den_ngay kinh_phi
 *        {#people}stt staff_number full_name birth_year qualification{/people}
 *        ky_thuat co_chung_chi de_xuat khoa_khac ly_do
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const SRC = process.argv[2] || path.join(__dirname, '../templates/training/goc');
const OUT = process.argv[3] || path.join(__dirname, '../templates/training');

const DOT_RUN = /…[….]*/g;
const WT = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
const PARA = /<w:p[ >][\s\S]*?<\/w:p>/g;

const paragraphText = (p) => [...p.matchAll(WT)].map((m) => m[1]).join('');

/** Sửa danh sách đoạn <w:p> theo chỉ số; mỗi sửa kiểm tra đoạn đúng nội dung mong đợi. */
const makeEditor = (xml) => {
	const paras = [...xml.matchAll(PARA)].map((m) => ({ start: m.index, text: m[0] }));
	const edits = new Map();
	const edit = (idx, expect, fn) => {
		const p = paras[idx];
		if (!p) throw new Error(`Không có đoạn ${idx}`);
		if (!paragraphText(p.text).includes(expect))
			throw new Error(`Đoạn ${idx} không chứa "${expect}": "${paragraphText(p.text)}"`);
		edits.set(idx, fn(p.text));
	};
	const build = () => {
		let out = '';
		let pos = 0;
		paras.forEach((p, i) => {
			out += xml.slice(pos, p.start);
			out += edits.has(i) ? edits.get(i) : p.text;
			pos = p.start + p.text.length;
		});
		return out + xml.slice(pos);
	};
	return { edit, build, count: paras.length };
};

/** Thay từng cụm dòng chấm bằng thẻ kế tiếp trong danh sách (null = xóa cụm). */
const dotsToTags = (tags, { gap = '   ' } = {}) => {
	return (p) => {
		const queue = [...tags];
		const result = p.replace(WT, (whole, text) => {
			const next = text.replace(DOT_RUN, (run, offset) => {
				if (!queue.length) throw new Error(`Thiếu thẻ cho cụm dòng chấm: "${text}"`);
				const tag = queue.shift();
				if (tag === null) return '';
				const before = text[offset - 1];
				const after = text[offset + run.length];
				// Cụm chấm dính liền chữ/dấu hai chấm phía trước ⇒ thêm 1 dấu cách để giá trị không dính nhãn
				const lead = before && /[\p{L}:]/u.test(before) ? ' ' : '';
				const trail = after && /\p{L}/u.test(after) ? gap : '';
				return `${lead}{${tag}}${trail}`;
			});
			return `<w:t xml:space="preserve">${next}</w:t>`;
		});
		if (queue.length) throw new Error(`Còn thẻ chưa dùng: ${queue.join(', ')}`);
		return result;
	};
};

/** Thay chữ trong <w:t> bằng hàm — giữ nguyên run. */
const mapTexts = (fn) => (p) =>
	p.replace(WT, (whole, text, offset) => `<w:t xml:space="preserve">${fn(text, offset)}</w:t>`);

/**
 * Điền chữ vào đoạn trống: dùng đúng định dạng "dấu đoạn" (pPr/rPr) làm định dạng chữ,
 * vì ô trống của mẫu mang cỡ chữ ở đó. `tweak` chỉnh định dạng nếu cần.
 */
const fillEmpty =
	(content, tweak = (s) => s) =>
	(p) => {
		if (/<w:t[ >]/.test(p)) throw new Error('Đoạn không trống');
		const m = p.match(/<w:pPr>[\s\S]*?<w:rPr>([\s\S]*?)<\/w:rPr><\/w:pPr>/);
		const inner = tweak(m ? m[1] : '');
		const run = `<w:r><w:rPr>${inner}<w:rtl w:val="0"/></w:rPr><w:t xml:space="preserve">${content}</w:t></w:r>`;
		// Thay run trống đầu tiên; đoạn không có run thì chèn trước </w:p>
		if (/<w:r[ >]/.test(p)) return p.replace(/<w:r[ >][\s\S]*?<\/w:r>/, run);
		return p.replace('</w:p>', `${run}</w:p>`);
	};

const readDocument = (file) => {
	const zip = new PizZip(fs.readFileSync(path.join(SRC, file)));
	return { zip, xml: zip.file('word/document.xml').asText() };
};

const writeTemplate = (zip, xml, file) => {
	zip.file('word/document.xml', xml);
	fs.writeFileSync(
		path.join(OUT, file),
		zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }),
	);
	console.log(`Đã ghi ${file}`);
};

// ---------------------------------------------------------------- Đơn đăng ký
const buildApplication = () => {
	const { zip, xml } = readDocument('don-dang-ky-dtlt.goc.docx');
	const ed = makeEditor(xml);
	if (ed.count !== 39) throw new Error(`Mẫu đơn đổi cấu trúc: ${ed.count} đoạn (mong đợi 39)`);

	// "Khoa/Phòng/TT………" ⇒ cả cụm do code dựng theo nguồn (nội viện / ngoại viện)
	ed.edit(
		7,
		'Khoa/Phòng/TT',
		mapTexts((t) => (t.startsWith('Khoa/Phòng/TT') ? '{kinh_gui}' : t)),
	);
	ed.edit(9, 'Dân tộc', dotsToTags(['ho_ten_hoa', 'dan_toc']));
	ed.edit(10, 'Ngày sinh', dotsToTags(['ngay_sinh']));
	ed.edit(11, 'Quê quán', dotsToTags(['que_quan']));
	ed.edit(12, 'CCCD', dotsToTags(['cccd', null]));
	ed.edit(13, 'Nơi cấp', dotsToTags(['ngay_cap', 'noi_cap']));
	ed.edit(14, 'Địa chỉ liên hệ', dotsToTags(['dia_chi']));
	ed.edit(15, 'Điện thoại', dotsToTags(['dien_thoai']));
	ed.edit(16, 'Email', dotsToTags(['email']));
	ed.edit(17, 'Năm TN', dotsToTags(['truong_tot_nghiep', 'nam_tn']));
	ed.edit(20, '………', dotsToTags(['chuyen_nganh_tn']));
	ed.edit(21, 'Cơ quan đang công tác', dotsToTags(['co_quan']));
	ed.edit(22, 'Chuyên ngành đang công tác', dotsToTags(['chuyen_nganh_cong_tac']));
	ed.edit(23, 'Thâm niên', dotsToTags(['tham_nien']));
	ed.edit(24, 'Khóa đào tạo', dotsToTags(['khoa_hoc']));
	ed.edit(
		33,
		'Nghệ An, ngày',
		mapTexts(() => 'Nghệ An, ngày {ngay} tháng {thang} năm {nam}'),
	);
	// Tên in dưới chỗ ký: đoạn trống cuối của ô ký, chữ đậm, chừa chỗ ký phía trên
	ed.edit(36, '', (p) =>
		fillEmpty('{ho_ten}', (s) =>
			s
				.replace('<w:b w:val="0"/><w:bCs w:val="0"/>', '<w:b w:val="1"/><w:bCs w:val="1"/>')
				.replace('<w:i w:val="1"/><w:iCs w:val="1"/>', '<w:i w:val="0"/><w:iCs w:val="0"/>'),
		)(p).replace('w:after="200" w:before="0"', 'w:after="200" w:before="600"'),
	);
	// Bù chiều cao: bỏ 1 đoạn trống sau bảng ký, đoạn cuối mang dòng mã đăng ký
	ed.edit(37, '', () => '');
	ed.edit(38, '', fillEmpty('Mã đăng ký: {ma_dang_ky}'));

	writeTemplate(zip, ed.build(), 'don-dang-ky-dtlt.docx');
};

// ------------------------------------------------------------------- Tờ trình
const buildProposal = () => {
	const { zip, xml } = readDocument('to-trinh-dtlt.goc.docx');
	const ed = makeEditor(xml);
	if (ed.count !== 87) throw new Error(`Mẫu tờ trình đổi cấu trúc: ${ed.count} đoạn (mong đợi 87)`);

	ed.edit(2, 'KHOA:', dotsToTags(['khoa_hoa']));
	ed.edit(
		8,
		'năm 2026',
		mapTexts((t) => t.replace('2026', '{nam}')),
	);
	ed.edit(12, 'tại Bệnh viện', dotsToTags(['ten_lop'], { gap: ' ' }));
	ed.edit(19, 'năm 2026', (p) =>
		dotsToTags(['khoa'], { gap: ' ' })(mapTexts((t) => t.replace('2026', '{nam}'))(p)),
	);
	ed.edit(21, 'kính trình', dotsToTags(['ten_lop', 'khoa', 'khoa'], { gap: ' ' }));
	ed.edit(33, 'Nội dung lớp học', dotsToTags(['ten_lop']));
	ed.edit(34, 'Từ ngày', dotsToTags(['tu_ngay', 'den_ngay'], { gap: ' ' }));
	ed.edit(
		35,
		'Kinh phí',
		mapTexts((t) => (t.trim().startsWith('…') ? ' {kinh_phi} ' : t)),
	);
	// Mẫu viết "Khoa.………" (dấu chấm thay dấu cách) ⇒ "Khoa {khoa}"
	ed.edit(37, 'đã bố trí', (p) =>
		dotsToTags(['khoa'], { gap: ' ' })(mapTexts((t) => t.replace('Khoa.…', 'Khoa …'))(p)),
	);

	// Bảng danh sách: dòng 2 là dòng lặp ({#people} ô đầu … {/people} ô cuối)
	ed.edit(28, '', fillEmpty('{#people}{stt}'));
	ed.edit(29, '', fillEmpty('{staff_number}'));
	ed.edit(30, '', fillEmpty('{full_name}'));
	ed.edit(31, '', fillEmpty('{birth_year}'));
	ed.edit(32, '', fillEmpty('{qualification}{/people}'));

	// Bảng phân tích nhu cầu: 2 ô đầu (nhân lực hiện có / đang đào tạo) khoa tự ghi
	ed.edit(79, '', fillEmpty('{ten_lop}'));
	ed.edit(80, '', fillEmpty('{ky_thuat}'));
	ed.edit(81, '', fillEmpty('{co_chung_chi}'));
	ed.edit(82, '', fillEmpty('{de_xuat}'));
	ed.edit(83, '', fillEmpty('{khoa_khac}'));
	ed.edit(84, '', fillEmpty('{ly_do}'));

	writeTemplate(zip, ed.build(), 'to-trinh-dtlt.docx');
};

buildApplication();
buildProposal();
