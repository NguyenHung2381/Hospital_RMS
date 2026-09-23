// Parser tối giản cho khối `INSERT INTO \`table\` (...) VALUES (...), (...);`
// của phpMyAdmin/mysqldump — đủ dùng cho dump ql_nckh_dt_cdt (không cần parser
// SQL đầy đủ). Dùng chung bởi mọi script import_*.js dưới scripts/.
function parseMysqlInserts(text, tableName) {
	const rows = [];
	const insertRe = new RegExp('INSERT INTO `' + tableName + '` \\(([^)]*)\\) VALUES\\s*\\n?', 'g');
	let m;
	while ((m = insertRe.exec(text))) {
		const columns = m[1].split(',').map((c) => c.trim().replace(/`/g, ''));
		let i = m.index + m[0].length;
		while (true) {
			while (text[i] === '\n' || text[i] === '\r' || text[i] === ' ') i++;
			if (text[i] !== '(') break;
			i++;
			const values = [];
			let cur = '';
			let inStr = false;
			let wasQuoted = false; // '0912345001'/'1946' phải giữ NGUYÊN dạng chuỗi (số 0 đầu), không được ép Number
			while (i < text.length) {
				const ch = text[i];
				if (inStr) {
					if (ch === '\\' && text[i + 1] !== undefined) {
						cur += ch + text[i + 1];
						i += 2;
						continue;
					}
					if (ch === "'" && text[i + 1] === "'") {
						cur += "''";
						i += 2;
						continue;
					}
					if (ch === "'") {
						inStr = false;
						i++;
						continue;
					}
					cur += ch;
					i++;
					continue;
				}
				if (ch === "'") {
					inStr = true;
					wasQuoted = true;
					i++;
					continue;
				}
				if (ch === ',') {
					values.push({ raw: cur.trim(), quoted: wasQuoted });
					cur = '';
					wasQuoted = false;
					i++;
					continue;
				}
				if (ch === ')') {
					values.push({ raw: cur.trim(), quoted: wasQuoted });
					cur = '';
					wasQuoted = false;
					i++;
					break;
				}
				cur += ch;
				i++;
			}
			const row = {};
			columns.forEach((col, idx) => {
				const v = values[idx] || {};
				row[col] = decodeLiteral(v.raw, v.quoted);
			});
			rows.push(row);
			while (text[i] === '\n' || text[i] === '\r' || text[i] === ' ') i++;
			if (text[i] === ',') {
				i++;
				continue;
			}
			break;
		}
	}
	return rows;
}

// quoted=false (không có dấu '' bao quanh trong dump) mới được coi là số/NULL —
// giá trị CÓ dấu nháy ('0912345001', '1946'...) luôn giữ nguyên dạng chuỗi dù
// nhìn "giống số", vì mysqldump chỉ bỏ dấu nháy quanh literal số thật.
function decodeLiteral(raw, quoted) {
	if (raw === undefined) return null;
	if (!quoted) {
		if (raw === 'NULL') return null;
		if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
		return raw;
	}
	return raw.replace(/''/g, "'").replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

const normalizeName = (s) =>
	String(s || '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/gi, 'd')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();

// gender trong DB Hospital_RMS lưu ASCII 'male'/'female'/'other' (khớp
// GENDER_OPTIONS ở frontend) — KHÔNG được lưu thẳng 'Nam'/'Nữ' tiếng Việt vào
// cột VARCHAR (non-Unicode): SQL Server sẽ đổi ký tự không hỗ trợ (ữ...) thành
// '?', hỏng dữ liệu ('Nữ' -> 'N?').
const mapGender = (raw) => {
	const v = normalizeName(raw);
	if (v === 'nam') return 'male';
	if (v === 'nu') return 'female';
	return null;
};

module.exports = { parseMysqlInserts, decodeLiteral, normalizeName, mapGender };
