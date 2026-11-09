// Phần thuần của adapter PostgreSQL (db.pg.js), test không cần DB:
//   - kiểu tham số giả lập `sql.VarChar(20)`, `sql.Int`... của mssql,
//   - đổi câu SQL dùng `@ten` sang `$1, $2...` của PostgreSQL,
//   - đổi giá trị tham số (Date, Bit) giống cách mssql gửi xuống SQL Server.

// Kiểu tham số. Code hiện nay viết cả `sql.Int` lẫn `sql.VarChar(50)`,
// `sql.Decimal(5, 2)`, `sql.NVarChar(sql.MAX)` → mỗi kiểu là 1 hàm, gọi thì trả
// { type: hàm đó, args }.
const TYPE_NAMES = [
	'VarChar',
	'NVarChar',
	'Char',
	'NChar',
	'Text',
	'NText',
	'VarBinary',
	'Binary',
	'Int',
	'BigInt',
	'SmallInt',
	'TinyInt',
	'Bit',
	'Decimal',
	'Numeric',
	'Money',
	'SmallMoney',
	'Float',
	'Real',
	'Date',
	'DateTime',
	'DateTime2',
	'SmallDateTime',
	'DateTimeOffset',
	'Time',
	'UniqueIdentifier',
	'Xml',
];
/** Hàm kiểu giống mssql (`sql.Int`, `sql.VarChar(20)`...), có `typeName`. */
/** @type {Record<string, any>} */
const TYPES = Object.fromEntries(
	TYPE_NAMES.map((name) => {
		const fn = (...args) => ({ type: fn, args });
		fn.typeName = name;
		return [name, fn];
	}),
);

/** Tên kiểu của tham số: `sql.Int` hoặc `sql.VarChar(20)` → 'Int' / 'VarChar'. */
const typeNameOf = (type) => type?.typeName ?? type?.type?.typeName;

// Ép kiểu `$n::kiểu` cho kiểu số / ngày / boolean: PG biết đúng kiểu cả khi
// không suy ra được từ ngữ cảnh (`@x IS NULL`, `SELECT @x AS ...`).
// Kiểu chuỗi KHÔNG ép ở mọi chỗ (để `cột_date >= @tu_ngay` truyền chuỗi
// '2026-01-01' vẫn chạy như SQL Server), chỉ ép `::text` ngay trước
// `IS [NOT] NULL` — mẫu `(@x IS NULL OR cột = @x)` rất phổ biến, PG không suy
// được kiểu từ chỗ IS NULL nên báo "could not determine data type".
const CASTS = {
	Int: 'int',
	BigInt: 'bigint',
	SmallInt: 'smallint',
	TinyInt: 'smallint',
	Bit: 'boolean',
	Decimal: 'numeric',
	Numeric: 'numeric',
	Money: 'numeric',
	SmallMoney: 'numeric',
	Float: 'float8',
	Real: 'float4',
	Date: 'date',
	DateTime: 'timestamp',
	DateTime2: 'timestamp',
	SmallDateTime: 'timestamp',
	DateTimeOffset: 'timestamptz',
	Time: 'time',
	UniqueIdentifier: 'uuid',
};

// mssql chạy với useUTC (mặc định): Date gửi xuống theo giờ UTC của đối tượng.
// Quy ước của hệ thống: DB lưu giờ VN không múi giờ, JS giữ Date "gắn nhãn UTC"
// (backend/README.md, mục Viết SQL) → định dạng theo UTC là đúng.
const formatDate = (d) => d.toISOString().slice(0, 10);
const formatTimestamp = (d) => d.toISOString().replace('T', ' ').replace('Z', '');

const truthy = (v) => v === true || v === 1 || v === '1' || v === 'true';

// Kiểu ép trước `IS [NOT] NULL` cho tham số không có trong CASTS (chuỗi, hoặc
// input(tên, giá trị) không khai báo kiểu): suy theo giá trị.
const IS_NULL_AFTER = /\s*IS\s+(NOT\s+)?NULL\b/iy;
// `OFFSET @x ROWS` / `FETCH NEXT @x ROWS ONLY`: PG chỉ nhận số / tham số trần hoặc
// biểu thức trong ngoặc ở đây — `$1::int ROWS` là lỗi cú pháp nên phải bọc ngoặc.
const ROWS_AFTER = /\s*ROWS?\b/iy;
const nullCheckCast = (p) => {
	if (p.type) return 'text';
	const v = p.value;
	if (typeof v === 'number') return Number.isInteger(v) ? 'bigint' : 'float8';
	if (typeof v === 'boolean') return 'boolean';
	if (v instanceof Date) return 'timestamp';
	return 'text';
};

/** Giá trị tham số gửi cho `pg`, theo kiểu khai báo (có thể không có). */
const toPgValue = (type, value) => {
	if (value === undefined || value === null) return null;
	const name = typeNameOf(type);
	if (value instanceof Date) return name === 'Date' ? formatDate(value) : formatTimestamp(value);
	if (name === 'Bit') return truthy(value);
	// mssql cho truyền true/false vào tham số số (Int...) → 1/0
	if (typeof value === 'boolean' && ['int', 'bigint', 'smallint', 'numeric'].includes(CASTS[name]))
		return value ? 1 : 0;
	return value;
};

const IDENT = /[A-Za-z_][A-Za-z0-9_]*/y;
const DOLLAR_TAG = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/y;

// Vị trí ngay sau chuỗi/tên trong ngoặc bắt đầu ở `start` (ký tự `q`); `''` /
// `""` bên trong là ký tự thoát.
const endOfQuoted = (text, start, q) => {
	let i = start + 1;
	while (i < text.length) {
		if (text[i] === q) {
			if (text[i + 1] === q) i += 2;
			else return i + 1;
		} else i++;
	}
	return text.length;
};

/**
 * Đổi `@ten` → `$n` (cùng tên dùng lại cùng số). Bỏ qua phần trong chuỗi `'...'`,
 * tên `"..."`, comment `--` và `/* *\/`, chuỗi `$tag$...$tag$`, và `@@`.
 * `params`: Map tên chữ thường → { name, type, value } (tên tham số của SQL
 * Server không phân biệt hoa/thường). Tên không có trong `params` → ném lỗi.
 * @returns {{ text: string, values: any[] }}
 */
const toPositional = (text, params) => {
	const index = new Map();
	const values = [];
	let out = '';
	let i = 0;
	const n = text.length;
	while (i < n) {
		const c = text[i];
		const d = text[i + 1];
		let end = -1;
		if (c === "'" || c === '"') end = endOfQuoted(text, i, c);
		else if (c === '-' && d === '-') {
			const nl = text.indexOf('\n', i);
			end = nl === -1 ? n : nl;
		} else if (c === '/' && d === '*') {
			const close = text.indexOf('*/', i + 2);
			end = close === -1 ? n : close + 2;
		} else if (c === '$') {
			DOLLAR_TAG.lastIndex = i;
			const m = DOLLAR_TAG.exec(text);
			if (m) {
				const close = text.indexOf(m[0], i + m[0].length);
				end = close === -1 ? n : close + m[0].length;
			}
		}
		if (end !== -1) {
			out += text.slice(i, end);
			i = end;
			continue;
		}
		if (c === '@' && d === '@') {
			out += '@@';
			i += 2;
			continue;
		}
		if (c === '@') {
			IDENT.lastIndex = i + 1;
			const m = IDENT.exec(text);
			if (m) {
				const key = m[0].toLowerCase();
				const p = params.get(key);
				if (!p) throw new Error(`Câu SQL dùng @${m[0]} nhưng chưa input() tham số này`);
				if (!index.has(key)) {
					values.push(toPgValue(p.type, p.value));
					index.set(key, values.length);
				}
				const after = i + 1 + m[0].length;
				IS_NULL_AFTER.lastIndex = after;
				const cast =
					CASTS[typeNameOf(p.type)] ?? (IS_NULL_AFTER.test(text) ? nullCheckCast(p) : null);
				ROWS_AFTER.lastIndex = after;
				const ref = `$${index.get(key)}${cast ? `::${cast}` : ''}`;
				out += cast && ROWS_AFTER.test(text) ? `(${ref})` : ref;
				i = after;
				continue;
			}
		}
		out += c;
		i++;
	}
	return { text: out, values };
};

// Kết quả đổi kiểu khi đọc (giống mssql trả về):
//   timestamp → Date gắn nhãn UTC; date → Date 00:00 UTC; numeric → number;
//   bigint (COUNT(*), SUM) → number khi an toàn, quá 2^53 thì giữ chuỗi;
//   json/jsonb → chuỗi nguyên văn (code hiện tại tự JSON.parse).
const parseTimestamp = (s) => new Date(`${s.replace(' ', 'T')}Z`);
const parseDate = (s) => new Date(`${s}T00:00:00Z`);
const parseInt8 = (s) => {
	const v = Number(s);
	return Number.isSafeInteger(v) ? v : s;
};
const raw = (s) => s;
const TYPE_PARSERS = {
	1114: parseTimestamp, // timestamp
	1082: parseDate, // date
	1700: parseFloat, // numeric
	20: parseInt8, // int8
	114: raw, // json
	3802: raw, // jsonb
};

// ── pgpass ───────────────────────────────────────────────────────────────
// DB_PASSWORD trống → tìm mật khẩu trong file pgpass như psql: PGPASSFILE,
// hoặc %APPDATA%\postgresql\pgpass.conf (Windows) / ~/.pgpass. Dòng dạng
// host:port:database:user:password, `*` khớp mọi giá trị, `\:` và `\\` là ký
// tự thoát. (pg@8 tự làm việc này nhưng đã báo sẽ bỏ ở pg@9.)
const pgpassFile = (env = process.env) => {
	if (env.PGPASSFILE) return env.PGPASSFILE;
	const os = require('os');
	const path = require('path');
	return process.platform === 'win32'
		? path.join(env.APPDATA || os.homedir(), 'postgresql', 'pgpass.conf')
		: path.join(os.homedir(), '.pgpass');
};

const splitPgpassLine = (line) => {
	const fields = [];
	let cur = '';
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '\\' && i + 1 < line.length) cur += line[++i];
		else if (c === ':' && fields.length < 4) {
			fields.push(cur);
			cur = '';
		} else cur += c;
	}
	fields.push(cur);
	return fields.length === 5 ? fields : null;
};

/** Mật khẩu khớp { host, port, database, user } trong nội dung file pgpass, hoặc undefined. */
const pgpassLookup = (content, { host, port, database, user }) => {
	const want = [host, String(port), database, user];
	for (const raw of String(content).split(/\r?\n/)) {
		if (!raw.trim() || raw.startsWith('#')) continue;
		const f = splitPgpassLine(raw);
		if (f && want.every((w, i) => f[i] === '*' || f[i] === w)) return f[4];
	}
	return undefined;
};

module.exports = {
	pgpassFile,
	pgpassLookup,
	TYPES,
	CASTS,
	typeNameOf,
	toPgValue,
	toPositional,
	formatDate,
	formatTimestamp,
	TYPE_PARSERS,
};
