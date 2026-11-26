// Bộ đọc byte nhỏ cho chữ ký số trong PDF: tìm từ điển chữ ký qua /ByteRange, lấy /Contents ở
// đúng khe ByteRange chừa ra, phân loại phần nối thêm sau khi ký, đọc /DSS (pdf-lib).
// Từ điển chữ ký không thể nằm trong object stream nén (khe /Contents phải là byte thô trong file),
// nên quét byte là đủ để tìm hết chữ ký.
const MAX_SIGNATURES = 20;
const MAX_CONTENTS_BYTES = 2 * 1024 * 1024;
const MAX_DSS_ITEMS = 200;
const DICT_WINDOW = 64 * 1024;

/** File có phải PDF không (header %PDF- trong 1 KB đầu, như trình đọc PDF thường chấp nhận). */
const isPdf = (/** @type {Buffer} */ buf) => buf.subarray(0, 1024).includes('%PDF-');

/** PDF có mã hóa (/Encrypt trong trailer). */
const isEncrypted = (/** @type {string} */ s) => /\/Encrypt\s+(\d+\s+\d+\s+R|<<)/.test(s);

/** Độ dài phần tử DER ở đầu buf (bỏ phần đệm 0 phía sau). null nếu không đọc được. */
function derLength(/** @type {Buffer} */ buf) {
	if (buf.length < 2 || buf[0] !== 0x30) return null;
	const b = buf[1];
	if (b < 0x80) return 2 + b;
	const n = b & 0x7f;
	if (n === 0 || n > 4 || buf.length < 2 + n) return null; // 0x80 = độ dài bất định (BER) — không hỗ trợ
	let len = 0;
	for (let i = 0; i < n; i++) len = len * 256 + buf[2 + i];
	return 2 + n + len <= buf.length ? 2 + n + len : null;
}

/** Tên sau một khóa trong đoạn chữ của từ điển, vd /SubFilter /adbe.pkcs7.detached → 'adbe.pkcs7.detached'. */
const nameAfter = (/** @type {string} */ dict, key) =>
	dict.match(new RegExp(`/${key}\\s*/([A-Za-z0-9.#_+-]+)`))?.[1] ?? null;

/** Ngày PDF D:YYYYMMDDHHmmSS+07'00' → Date (null nếu không đọc được). */
function parsePdfDate(/** @type {string | null} */ s) {
	const m = s?.match(
		/^D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+-])?(\d{2})?'?(\d{2})?/,
	);
	if (!m) return null;
	const [, y, mo = '01', d = '01', h = '00', mi = '00', se = '00', sign, oh = '00', om = '00'] = m;
	let t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
	if (sign === '+' || sign === '-') t -= (sign === '+' ? 1 : -1) * (+oh * 60 + +om) * 60000;
	return Number.isNaN(t) ? null : new Date(t);
}

/**
 * @typedef {object} SignatureField
 * @property {number[]} byteRange [a, b, c, d]
 * @property {Buffer | null} contents DER của CMS (đã bỏ phần đệm), null nếu khe ByteRange hỏng
 * @property {Buffer | null} signedData nối 2 vùng ByteRange, null nếu ByteRange vượt quá file
 * @property {string | null} subFilter
 * @property {boolean} docTimeStamp /Type /DocTimeStamp (dấu thời gian tài liệu, ETSI.RFC3161)
 * @property {Date | null} pdfTime /M trong từ điển chữ ký (người ký tự khai)
 * @property {boolean} coversToEnd vùng ký phủ từ byte 0 tới hết file (cho phép khoảng trắng cuối)
 */

/**
 * Tìm mọi chữ ký trong file.
 * @param {Buffer} buf
 * @returns {{ fields: SignatureField[], malformed: number }} malformed = số /ByteRange không đọc được
 */
function findSignatureFields(buf) {
	const s = buf.toString('latin1');
	const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
	const total = (s.match(/\/ByteRange\b/g) ?? []).length;
	const seen = new Set();
	/** @type {SignatureField[]} */
	const fields = [];
	let parsed = 0;
	for (const m of s.matchAll(re)) {
		parsed++;
		const br = m.slice(1, 5).map(Number);
		const key = br.join(' ');
		if (seen.has(key)) continue; // cùng chữ ký được ghi lại ở bản cập nhật sau
		seen.add(key);
		if (fields.length >= MAX_SIGNATURES) break;
		fields.push(readField(buf, s, br, m.index));
	}
	return { fields, malformed: total - parsed };
}

/**
 * @param {Buffer} buf
 * @param {string} s buf ở dạng latin1
 * @param {number[]} br
 * @param {number} at vị trí /ByteRange
 * @returns {SignatureField}
 */
function readField(buf, s, br, at) {
	const [a, b, c, d] = br;
	const inFile = a >= 0 && b >= 0 && c >= a + b && d >= 0 && c + d <= buf.length;
	const signedData = inFile
		? Buffer.concat([buf.subarray(a, a + b), buf.subarray(c, c + d)])
		: null;
	let contents = null;
	if (
		inFile &&
		buf[a + b] === 0x3c &&
		buf[c - 1] === 0x3e &&
		c - a - b - 2 <= MAX_CONTENTS_BYTES * 2
	) {
		const hex = s.slice(a + b + 1, c - 1).replace(/\s+/g, '');
		if (/^[0-9a-fA-F]*$/.test(hex) && hex.length % 2 === 0) {
			const raw = Buffer.from(hex, 'hex');
			const len = derLength(raw);
			contents = len ? raw.subarray(0, len) : null;
		}
	}
	// Đoạn chữ của từ điển quanh /ByteRange, bỏ khe /Contents (hex dài) cho nhẹ
	const start = Math.max(0, s.lastIndexOf('obj', at), at - DICT_WINDOW);
	let end = s.indexOf('endobj', at);
	if (end < 0 || end - at > DICT_WINDOW + (c - a - b)) end = Math.min(s.length, at + DICT_WINDOW);
	const dict =
		inFile && a + b > start && c < end
			? s.slice(start, a + b) + s.slice(c, end)
			: s.slice(start, Math.min(end, at + DICT_WINDOW));
	const tail = buf.subarray(inFile ? c + d : buf.length).toString('latin1');
	return {
		byteRange: br,
		contents,
		signedData,
		subFilter: nameAfter(dict, 'SubFilter'),
		docTimeStamp: /\/Type\s*\/DocTimeStamp\b/.test(dict),
		pdfTime: parsePdfDate(dict.match(/\/M\s*\((D:[^)]*)\)/)?.[1] ?? null),
		coversToEnd: inFile && a === 0 && /^[\s\0]*$/.test(tail),
	};
}

/**
 * Phân loại phần nối thêm sau vùng đã ký (bản cập nhật tăng dần).
 * 'none' = không có; 'ltv' = trông như chỉ thêm /DSS (dữ liệu kiểm chứng dài hạn, không đổi nội
 * dung); 'other' = có thay đổi khác. Heuristic thận trọng: không chắc thì trả 'other'.
 * @param {Buffer} buf
 * @param {number} signedEnd byte cuối cùng được ký (c + d lớn nhất)
 * @returns {'none' | 'ltv' | 'other'}
 */
function classifyAppendedUpdate(buf, signedEnd) {
	const t = buf.subarray(signedEnd).toString('latin1');
	if (/^[\s\0]*$/.test(t)) return 'none';
	if (!/\/DSS\b/.test(t)) return 'other';
	if (/\/Type\s*\/(ObjStm|Page|Annot|XObject|Font|Action)\b/.test(t)) return 'other';
	if (/\/Subtype\s*\/(Widget|Image|Form|JavaScript)\b/.test(t)) return 'other';
	if (/\/(OpenAction|AA|JavaScript|JS|Names)\b/.test(t)) return 'other';
	const head = buf.subarray(0, signedEnd).toString('latin1');
	const refOf = (/** @type {string} */ text, key) =>
		[...text.matchAll(new RegExp(`/${key}\\s+(\\d+\\s+\\d+)\\s+R`, 'g'))].map((m) =>
			m[1].replace(/\s+/g, ' '),
		);
	const oldCatalogs = [...head.matchAll(/\/Type\s*\/Catalog\b/g)].length;
	for (const m of t.matchAll(/(?:^|[^0-9])(\d+)\s+(\d+)\s+obj\b/g)) {
		const [, n, g] = m;
		if (!new RegExp(`(?:^|[^0-9])${n}\\s+${g}\\s+obj\\b`).test(head)) continue; // đối tượng mới
		// Ghi đè đối tượng cũ: chỉ cho phép Catalog, giữ nguyên /Pages và /AcroForm của bản đã ký
		const endAt = t.indexOf('endobj', m.index);
		const body = t.slice(m.index, endAt < 0 ? undefined : endAt);
		if (!/\/Type\s*\/Catalog\b/.test(body) || !oldCatalogs) return 'other';
		for (const key of ['Pages', 'AcroForm']) {
			const now = refOf(body, key);
			if (now.length && !now.every((r) => refOf(head, key).includes(r))) return 'other';
		}
		if (!refOf(body, 'Pages').length) return 'other';
	}
	return 'ltv';
}

/**
 * Đọc /DSS (Document Security Store) của PDF: chứng thư, OCSP, CRL nhúng để kiểm chứng dài hạn.
 * @param {Buffer} buf
 * @returns {Promise<{ certs: Buffer[], ocsps: Buffer[], crls: Buffer[] } | null>}
 */
async function readDss(buf) {
	if (!buf.includes('/DSS')) return null;
	const {
		PDFDocument,
		PDFName,
		PDFDict,
		PDFArray,
		PDFRawStream,
		decodePDFRawStream,
	} = require('pdf-lib');
	const doc = await PDFDocument.load(buf, {
		ignoreEncryption: true,
		updateMetadata: false,
		throwOnInvalidObject: false,
	});
	const dss = doc.catalog.lookupMaybe(PDFName.of('DSS'), PDFDict);
	if (!dss) return null;
	const grab = (/** @type {string} */ key) => {
		const arr = dss.lookupMaybe(PDFName.of(key), PDFArray);
		const out = [];
		for (let i = 0; arr && i < arr.size() && i < MAX_DSS_ITEMS; i++) {
			try {
				const st = arr.lookup(i);
				if (st instanceof PDFRawStream) out.push(Buffer.from(decodePDFRawStream(st).decode()));
			} catch {
				/* luồng hỏng — bỏ qua */
			}
		}
		return out;
	};
	return { certs: grab('Certs'), ocsps: grab('OCSPs'), crls: grab('CRLs') };
}

module.exports = { isPdf, isEncrypted, findSignatureFields, classifyAppendedUpdate, readDss };
