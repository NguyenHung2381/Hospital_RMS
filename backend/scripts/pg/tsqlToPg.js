// Đổi định nghĩa schema SQL Server (kiểu cột, DEFAULT, CHECK, điều kiện lọc
// của index) sang PostgreSQL. Hàm thuần, không đụng DB, để test được
// (test/database/pgBaseline.test.js). Dùng bởi gen-baseline.js.
// Gặp mẫu chưa biết thì NÉM LỖI, không đoán: thà sinh baseline thất bại còn hơn
// sinh ra schema sai mà không ai biết.

// Từ khoá PostgreSQL phải đặt trong "..." khi dùng làm tên cột/bảng.
const RESERVED = new Set(
	`all analyse analyze and any array as asc asymmetric authorization binary both case cast check
	collate collation column concurrently constraint create cross current_catalog current_date
	current_role current_schema current_time current_timestamp current_user default deferrable desc
	distinct do else end except false fetch for foreign freeze from full grant group having ilike in
	initially inner intersect into is isnull join lateral leading left like limit localtime
	localtimestamp natural not notnull null offset on only or order outer overlaps placing primary
	references returning right select session_user similar some symmetric system_user table
	tablesample then to trailing true union unique user using variadic verbose when where window with`
		.split(/\s+/)
		.filter(Boolean),
);

// Tên SQL Server → tên PostgreSQL: chữ thường (PG tự hạ chữ thường tên không
// đặt trong "..."; code đang viết tên không ngoặc), ngoặc kép khi là từ khoá.
const ident = (name) => {
	const n = String(name).toLowerCase();
	if (!/^[a-z_][a-z0-9_]*$/.test(n)) throw new Error(`Tên không hợp lệ cho PostgreSQL: ${name}`);
	return RESERVED.has(n) ? `"${n}"` : n;
};

// PG giới hạn tên object 63 byte; tên index/ràng buộc là duy nhất trong cả schema.
const objectName = (name) =>
	String(name)
		.toLowerCase()
		.replace(/[^a-z0-9_]/g, '_')
		.slice(0, 63);

/**
 * Kiểu cột. `col`: { type, max_length, precision, scale } như sys.columns
 * (max_length tính theo byte, -1 = MAX). `override`: kiểu thay thế từ schemaRules.
 */
const mapType = (col, override) => {
	if (override) return override;
	const { type, max_length: len, precision, scale } = col;
	switch (type) {
		case 'varchar':
			return len === -1 ? 'text' : `varchar(${len})`;
		case 'nvarchar':
			return len === -1 ? 'text' : `varchar(${len / 2})`;
		case 'char':
			return `char(${len})`;
		case 'nchar':
			return `char(${len / 2})`;
		case 'text':
		case 'ntext':
			return 'text';
		case 'bit':
			return 'boolean';
		case 'tinyint':
		case 'smallint':
			return 'smallint';
		case 'int':
			return 'integer';
		case 'bigint':
			return 'bigint';
		case 'decimal':
		case 'numeric':
			return `numeric(${precision},${scale})`;
		case 'money':
			return 'numeric(19,4)';
		case 'float':
			return 'double precision';
		case 'real':
			return 'real';
		case 'date':
			return 'date';
		case 'time':
			return 'time';
		case 'datetime':
		case 'smalldatetime':
			return 'timestamp(3)';
		case 'datetime2':
			return `timestamp(${Math.min(scale, 6)})`;
		case 'datetimeoffset':
			return `timestamptz(${Math.min(scale, 6)})`;
		case 'uniqueidentifier':
			return 'uuid';
		case 'varbinary':
		case 'binary':
			return 'bytea';
		default:
			throw new Error(`Chưa có quy tắc đổi kiểu ${type}`);
	}
};

// Bỏ cặp ngoặc bao ngoài cùng: "((0))" → "0", "('a')" → "'a'".
const stripParens = (s) => {
	let t = String(s).trim();
	while (t.startsWith('(') && t.endsWith(')')) {
		let depth = 0;
		let wraps = true;
		for (let i = 0; i < t.length; i++) {
			if (t[i] === '(') depth++;
			else if (t[i] === ')') depth--;
			if (depth === 0 && i < t.length - 1) {
				wraps = false;
				break;
			}
		}
		if (!wraps) break;
		t = t.slice(1, -1).trim();
	}
	return t;
};

/** Giá trị DEFAULT. `pgType` là kiểu đích (để đổi 0/1 của BIT thành false/true). */
const translateDefault = (def, pgType) => {
	const v = stripParens(def);
	const lower = v.toLowerCase();
	if (lower === 'getdate()' || lower === 'sysdatetime()') return 'LOCALTIMESTAMP';
	if (lower === 'sysutcdatetime()' || lower === 'getutcdate()') return "(now() AT TIME ZONE 'UTC')";
	if (/^convert\(\[date\],\s*getdate\(\)\)$/.test(lower)) return 'CURRENT_DATE';
	if (lower === 'newid()') return 'gen_random_uuid()';
	const seq = /^next value for (?:\[?dbo\]?\.)?\[?(\w+)\]?$/i.exec(v);
	if (seq) return `nextval('${objectName(seq[1])}')`;
	if (/^-?\d+(\.\d+)?$/.test(v)) {
		if (pgType === 'boolean') {
			if (v === '0') return 'false';
			if (v === '1') return 'true';
		}
		return v;
	}
	const str = /^N?'((?:[^']|'')*)'$/.exec(v);
	if (str) return `'${str[1]}'`;
	throw new Error(`Chưa có quy tắc đổi DEFAULT ${def}`);
};

// LIKE của SQL Server có lớp ký tự [..]; LIKE của PG thì không, nhưng SIMILAR TO
// có cả [..], % và _ với cùng nghĩa, và cũng so khớp cả chuỗi.
const likeToPg = (pattern) => (/\[/.test(pattern) ? 'SIMILAR TO' : 'LIKE');

/**
 * Biểu thức CHECK / điều kiện lọc index. `columnTypes`: { [tên cột chữ thường]: kiểu PG }.
 * Hỗ trợ các mẫu có trong schema hiện tại; mẫu lạ → ném lỗi.
 */
const translateExpr = (expr, columnTypes = {}) => {
	let s = String(expr);
	// Chuỗi N'...' → '...'
	s = s.replace(/\bN'/g, "'");
	// isjson([x])=(1) → x IS JSON
	s = s.replace(/isjson\(\[(\w+)\]\)\s*=\s*\(1\)/gi, (_, c) => `${ident(c)} IS JSON`);
	// [cột] LIKE 'mẫu'
	s = s.replace(
		/\[(\w+)\]\s+like\s+'((?:[^']|'')*)'/gi,
		(_, c, p) => `${ident(c)} ${likeToPg(p)} '${p}'`,
	);
	// [cột_bit]=(0|1) → cột = false|true
	s = s.replace(/\[(\w+)\]\s*=\s*\(([01])\)/g, (m, c, v) =>
		columnTypes[c.toLowerCase()] === 'boolean'
			? `${ident(c)} = ${v === '1' ? 'true' : 'false'}`
			: `${ident(c)} = ${v}`,
	);
	// [cột] còn lại
	s = s.replace(/\[(\w+)\]/g, (_, c) => ident(c));
	// Số trong ngoặc (0) → 0
	s = s.replace(/\((-?\d+(?:\.\d+)?)\)/g, '$1');
	// Còn sót cú pháp T-SQL (bỏ qua phần trong chuỗi '...', vd mẫu SIMILAR TO có [0-9])
	const outsideStrings = s.replace(/'(?:[^']|'')*'/g, "''");
	const left = /\b(isnull|convert|len|charindex|iif|getdate|isjson)\s*\(|\[/i.exec(outsideStrings);
	if (left) throw new Error(`Chưa đổi được biểu thức: ${expr}`);
	return s;
};

const FK_ACTION = {
	NO_ACTION: 'NO ACTION',
	CASCADE: 'CASCADE',
	SET_NULL: 'SET NULL',
	SET_DEFAULT: 'SET DEFAULT',
};
const fkAction = (desc) => {
	const a = FK_ACTION[desc];
	if (!a) throw new Error(`Chưa có quy tắc cho hành động khoá ngoại ${desc}`);
	return a;
};

module.exports = {
	RESERVED,
	ident,
	objectName,
	mapType,
	stripParens,
	translateDefault,
	translateExpr,
	fkAction,
};
