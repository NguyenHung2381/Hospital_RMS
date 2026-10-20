#!/usr/bin/env node
// Chuyển mẫu Word dùng TRỘN THƯ (MERGEFIELD «Họ_và_tên») sang mẫu docxtemplater
// ({ho_va_ten}) để backend sinh giấy tờ — xem modules/training/courses/practiceDocumentService.js.
//   node scripts/convert-mergefield-template.js <mẫu-gốc.docx> <mẫu-ra.docx>
// Tên biến = tên trường bỏ dấu, chữ thường, gộp "_" (Nơi_sinh__Tỉnh → noi_sinh_tinh).
// Mỗi trường được thay bằng 1 run duy nhất giữ định dạng (rPr) của phần kết quả
// trường cũ, nên docxtemplater đọc được (tag không bị cắt qua nhiều run).
// Chữ cố định trong mẫu (đại diện Bên A, số quyết định…) giữ nguyên — muốn đổi thì
// sửa thẳng file mẫu đã chuyển bằng Word.
const fs = require('fs');
const PizZip = require('pizzip');

const slug = (s) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/g, 'd')
		.replace(/Đ/g, 'D')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '');

const unescapeXml = (s) =>
	s
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');

const fieldName = (instr) => {
	const m = unescapeXml(instr).match(/MERGEFIELD\s+(?:"([^"]+)"|(\S+))/);
	return m ? m[1] || m[2] : null;
};

const runWithTag = (rPr, tag) => `<w:r>${rPr || ''}<w:t xml:space="preserve">{${tag}}</w:t></w:r>`;
const rPrOf = (runXml) => (runXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];

/** Thay mọi MERGEFIELD trong 1 phần XML; trả { xml, tags }. */
const convertXml = (xml) => {
	const tags = new Set();
	// 1) Trường đơn giản: <w:fldSimple w:instr=" MERGEFIELD … ">…</w:fldSimple>
	let out = xml.replace(
		/<w:fldSimple\b[^>]*w:instr="([^"]*)"[^>]*>([\s\S]*?)<\/w:fldSimple>/g,
		(all, instr, inner) => {
			const name = fieldName(instr);
			if (!name) return all;
			const tag = slug(name);
			tags.add(tag);
			return runWithTag(rPrOf(inner), tag);
		},
	);

	// 2) Trường phức: run(begin) … run(instrText) … run(separate) … run(kết quả) … run(end)
	// Run không được chứa run con: run bọc textbox (<w:drawing>/<w:pict>) có run bên
	// trong — nếu bắt cả nó, thay trường sẽ cắt mất phần mở textbox ⇒ XML hỏng.
	const runRe = /<w:r(?:\s[^>]*)?>(?:(?!<w:r[\s>/])[\s\S])*?<\/w:r>|<w:r\/>/g;
	let result = '';
	let last = 0;
	let field = null; // { start, instr, resultRPr, depth }
	for (const m of out.matchAll(runRe)) {
		const run = m[0];
		const type = (run.match(/w:fldCharType="(\w+)"/) || [])[1];
		if (!field) {
			if (type === 'begin')
				field = { start: m.index, instr: '', resultRPr: null, separated: false, depth: 1 };
			continue;
		}
		if (type === 'begin') field.depth++;
		const instr = run.match(/<w:instrText[^>]*>([^<]*)<\/w:instrText>/);
		if (instr && field.depth === 1) field.instr += instr[1];
		if (type === 'separate' && field.depth === 1) field.separated = true;
		else if (field.separated && field.resultRPr === null && /<w:t[\s>]/.test(run))
			field.resultRPr = rPrOf(run);
		if (type === 'end' && --field.depth === 0) {
			const name = fieldName(field.instr);
			if (name) {
				const tag = slug(name);
				tags.add(tag);
				result += out.slice(last, field.start) + runWithTag(field.resultRPr, tag);
				last = m.index + run.length;
			}
			field = null;
		}
	}
	out = result + out.slice(last);
	return { xml: out, tags };
};

const convertFile = (input, output) => {
	const zip = new PizZip(fs.readFileSync(input));
	const all = new Set();
	for (const name of Object.keys(zip.files)) {
		if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
		const { xml, tags } = convertXml(zip.file(name).asText());
		tags.forEach((t) => all.add(t));
		zip.file(name, xml);
	}
	// Bỏ cấu hình trộn thư (nguồn dữ liệu Excel/SQL) — nếu còn, Word hỏi kết nối dữ liệu mỗi lần mở file.
	const settings = zip.file('word/settings.xml');
	if (settings)
		zip.file(
			'word/settings.xml',
			settings.asText().replace(/<w:mailMerge>[\s\S]*?<\/w:mailMerge>/, ''),
		);
	const settingsRels = zip.file('word/_rels/settings.xml.rels');
	if (settingsRels)
		zip.file(
			'word/_rels/settings.xml.rels',
			settingsRels
				.asText()
				.replace(/<Relationship\b[^>]*relationships\/mailMergeSource[^>]*\/>/g, ''),
		);
	fs.writeFileSync(output, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
	return [...all].sort();
};

if (require.main === module) {
	const [input, output] = process.argv.slice(2);
	if (!input || !output) {
		console.error('Dùng: node scripts/convert-mergefield-template.js <mẫu-gốc.docx> <mẫu-ra.docx>');
		process.exit(1);
	}
	const tags = convertFile(input, output);
	console.log(`✅ ${output}\n   ${tags.length} biến: ${tags.join(', ')}`);
}

module.exports = { slug, convertXml, convertFile };
