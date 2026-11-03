// Phần thuần của pg:transfer (test: test/database/pgTransfer.test.js):
//   - biểu thức T-SQL đọc từng cột ở SQL Server (ngày giờ, số thập phân đọc
//     dạng CHUỖI để không lệch múi giờ / mất độ chính xác qua Date, float của JS),
//   - mã hoá 1 dòng cho COPY ... FROM STDIN (định dạng text),
//   - chuẩn hoá giá trị 2 phía về cùng 1 chuỗi để so checksum (verify).
const crypto = require('crypto');
const net = require('net');

const bracket = (name) => `[${String(name).replace(/]/g, ']]')}]`;

/**
 * Loại giá trị của 1 cột, dùng chung cho load và verify.
 * `src`: { type, scale } từ sys.columns; `pgType`: data_type của PG.
 */
const kindOf = (src, pgType) => {
	if (pgType === 'jsonb' || pgType === 'json') return 'json';
	if (pgType === 'inet') return 'inet';
	switch (src.type) {
		case 'bit':
			return 'bool';
		case 'tinyint':
		case 'smallint':
		case 'int':
		case 'bigint':
			return 'int';
		case 'decimal':
		case 'numeric':
			return 'num';
		case 'date':
			return 'date';
		case 'datetime':
		case 'smalldatetime':
		case 'datetime2':
			return 'ts';
		case 'char':
		case 'nchar':
		case 'varchar':
		case 'nvarchar':
		case 'text':
		case 'ntext':
			return 'text';
		default:
			throw new Error(`pg:transfer chưa hỗ trợ kiểu ${src.type}`);
	}
};

/**
 * Biểu thức SELECT ở SQL Server cho 1 cột (đã có alias).
 *   datetime2(7) → làm tròn về 6 chữ số (PG chỉ tới micro giây) ngay ở SQL Server,
 *   để 2 phía có cùng 1 giá trị, không phụ thuộc cách làm tròn của PG.
 *   datetime → giữ 3 chữ số như driver mssql vẫn đọc (KHÔNG đổi qua datetime2:
 *   .003 của datetime thực chất là 1/300 giây, đổi sẽ ra .003333).
 */
const sourceExpr = (src) => {
	const c = bracket(src.name);
	switch (src.type) {
		case 'datetime2':
			return `CONVERT(varchar(26), CAST(${c} AS datetime2(${Math.min(src.scale ?? 7, 6)})), 121) AS ${c}`;
		case 'datetime':
		case 'smalldatetime':
			return `CONVERT(varchar(23), ${c}, 121) AS ${c}`;
		case 'date':
			return `CONVERT(char(10), ${c}, 23) AS ${c}`;
		case 'decimal':
		case 'numeric':
			return `CONVERT(varchar(50), ${c}) AS ${c}`;
		case 'bigint':
			return `CAST(${c} AS varchar(20)) AS ${c}`;
		default:
			return c;
	}
};

// ── COPY text ────────────────────────────────────────────────────────────
const copyText = (s) => {
	if (s.includes('\0'))
		throw new Error('Giá trị chứa ký tự NUL (PG không lưu được) — chạy precheck');
	return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
};

/** 1 giá trị → trường COPY text. */
const copyField = (value) => {
	if (value === null || value === undefined) return '\\N';
	if (typeof value === 'boolean') return value ? 't' : 'f';
	if (typeof value === 'number' || typeof value === 'bigint') return String(value);
	if (Buffer.isBuffer(value)) return `\\\\x${value.toString('hex')}`;
	if (value instanceof Date) throw new Error('Giá trị Date chưa đổi sang chuỗi (sourceExpr)');
	return copyText(String(value));
};

const copyLine = (values) => `${values.map(copyField).join('\t')}\n`;

/** Đọc lại 1 dòng COPY text (verify đọc PG bằng COPY ... TO STDOUT). */
const parseCopyLine = (line) =>
	line.split('\t').map((f) => {
		if (f === '\\N') return null;
		// COPY TO viết \b \f \n \r \t \v và \\ cho ký tự điều khiển / dấu \
		const map = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\' };
		return f.replace(/\\(.)/g, (_, ch) => map[ch] ?? ch);
	});

// ── Chuẩn hoá để so sánh ────────────────────────────────────────────────
const stableJson = (v) => {
	if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
	if (v && typeof v === 'object')
		return `{${Object.keys(v)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`)
			.join(',')}}`;
	return JSON.stringify(v);
};

/** Địa chỉ IP → 16 byte hex (IPv4 đổi sang dạng IPv4-mapped), null nếu không hợp lệ. */
const ipKey = (raw) => {
	const s = String(raw).trim();
	const v = net.isIP(s);
	if (v === 4)
		return `00000000000000000000ffff${Buffer.from(s.split('.').map(Number)).toString('hex')}`;
	if (v !== 6) return null;
	const [head, tail] = s.toLowerCase().split('::');
	const toGroups = (part) => {
		if (!part) return [];
		const groups = part.split(':');
		const last = groups[groups.length - 1];
		if (last.includes('.')) {
			const b = last.split('.').map(Number);
			groups.splice(-1, 1, ((b[0] << 8) | b[1]).toString(16), ((b[2] << 8) | b[3]).toString(16));
		}
		return groups;
	};
	const h = toGroups(head);
	const t = tail === undefined ? [] : toGroups(tail);
	const zeros = tail === undefined ? [] : Array(8 - h.length - t.length).fill('0');
	return [...h, ...zeros, ...t].map((g) => g.padStart(4, '0')).join('');
};

const NULL_MARK = '\u0000';

/** Giá trị (của SQL Server hoặc chuỗi COPY của PG) → chuỗi chuẩn để băm. */
const normalize = (kind, value) => {
	if (value === null || value === undefined) return NULL_MARK;
	switch (kind) {
		case 'bool':
			return value === true || value === 1 || ['t', 'true', '1'].includes(value) ? '1' : '0';
		case 'int':
			return String(value);
		case 'num': {
			const s = String(value);
			return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
		}
		case 'ts': {
			const [base, frac = ''] = String(value).split('.');
			return `${base}.${frac.padEnd(6, '0')}`;
		}
		case 'json':
			try {
				return stableJson(JSON.parse(value));
			} catch {
				return `!${value}`;
			}
		case 'inet':
			return ipKey(value) ?? `!${value}`;
		default:
			return String(value);
	}
};

// Biểu thức SELECT phía PG cho verify, để chuỗi COPY ra khớp normalize().
const targetExpr = (name, kind) => {
	const c = `"${name}"`;
	if (kind === 'ts') return `to_char(${c}, 'YYYY-MM-DD HH24:MI:SS.US')`;
	if (kind === 'date') return `to_char(${c}, 'YYYY-MM-DD')`;
	if (kind === 'inet') return `host(${c})`;
	return `${c}::text`;
};

// ── Checksum không phụ thuộc thứ tự dòng ─────────────────────────────────
// SQL Server (CI_AS) và PG (C.UTF-8) sắp xếp chuỗi khác nhau → không so theo
// thứ tự. Mỗi dòng băm SHA-256; cộng dồn (mod 2^256) theo BUCKETS nhóm khoá
// chính. Nhóm nào lệch thì lượt 2 liệt kê đúng khoá chính lệch.
const BUCKETS = 64;
const MOD = 1n << 256n;
const rowHash = (fields) =>
	BigInt(`0x${crypto.createHash('sha256').update(fields.join('\u0001')).digest('hex')}`);
const bucketOf = (key) => crypto.createHash('sha1').update(key).digest()[0] % BUCKETS;

class TableDigest {
	constructor() {
		this.rows = 0;
		this.sums = new Array(BUCKETS).fill(0n);
	}

	add(key, fields) {
		const b = bucketOf(key);
		this.sums[b] = (this.sums[b] + rowHash(fields)) % MOD;
		this.rows++;
	}

	/** Danh sách nhóm lệch so với `other`. */
	diff(other) {
		return this.sums.map((s, i) => (s === other.sums[i] ? -1 : i)).filter((i) => i >= 0);
	}
}

module.exports = {
	bracket,
	kindOf,
	sourceExpr,
	copyField,
	copyLine,
	parseCopyLine,
	stableJson,
	ipKey,
	normalize,
	targetExpr,
	TableDigest,
	bucketOf,
	rowHash,
	NULL_MARK,
	BUCKETS,
};
