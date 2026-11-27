// PostgreSQL (giao thức extended, khi có tham số) không nhận nhiều câu SQL trong 1 lần
// query: lỗi 42601 "cannot insert multiple commands into a prepared statement". Adapter
// (config/db.pg.js) chạy nguyên văn chuỗi của .query(), nên code phải tách từng câu
// (queryAll / queryBatch / nhiều lần query trong transaction). Test quét mã nguồn tìm
// template literal truyền thẳng vào .query()/.batch() mà chứa từ 2 câu trở lên.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../src');
const walk = (d) =>
	fs
		.readdirSync(d, { withFileTypes: true })
		.flatMap((e) =>
			e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : [],
		);

// Nội dung template literal bắt đầu ở vị trí i (dấu `); ${…} thay bằng X
const readTemplate = (s, i) => {
	let out = '';
	let j = i + 1;
	while (j < s.length) {
		const c = s[j];
		if (c === '\\') {
			out += s[j + 1];
			j += 2;
		} else if (c === '`') return [out, j];
		else if (c === '$' && s[j + 1] === '{') {
			let depth = 1;
			j += 2;
			while (j < s.length && depth) {
				if (s[j] === '`') j = readTemplate(s, j)[1];
				else if (s[j] === '{') depth++;
				else if (s[j] === '}') depth--;
				j++;
			}
			out += 'X';
		} else {
			out += c;
			j++;
		}
	}
	return [out, j];
};

const statementCount = (sqlText) =>
	sqlText
		.replace(/--[^\n]*/g, '')
		.replace(/'[^']*'/g, "''")
		.split(';')
		.filter((p) => p.trim()).length;

const multiStatementQueries = (source) => {
	const hits = [];
	const re = /\.(query|batch)\(\s*`/g;
	let m;
	while ((m = re.exec(source))) {
		const [body] = readTemplate(source, m.index + m[0].length - 1);
		if (statementCount(body) > 1) hits.push(source.slice(0, m.index).split('\n').length);
	}
	return hits;
};

const scan = () =>
	walk(SRC).flatMap((f) =>
		multiStatementQueries(fs.readFileSync(f, 'utf8')).map(
			(line) => `${path.relative(SRC, f).split(path.sep).join('/')}:${line}`,
		),
	);

// Đã biết, chưa sửa. Hai chỗ cũ (hospitalTraining, topicService) đã tách thành 2 lần query.
/** @type {string[]} */
const KNOWN = [];

test('bộ quét: nhận ra lô nhiều câu (kể cả câu nằm trong ${…}), bỏ qua dấu ; trong chuỗi / chú thích / cuối câu', () => {
	const src = [
		'a.query(`DELETE FROM t WHERE id = @id; INSERT INTO t VALUES (@id)`);',
		'a.query(`\n  DELETE FROM t;\n  ${x ? `INSERT INTO t VALUES (1);` : ""}\n`);',
		"a.query(`SELECT 'a;b' AS x -- chú thích; có dấu chấm phẩy\n`);",
		'a.query(`SELECT 1;\n  `);',
		'a.query(`SELECT ${cols.map((c) => `${c}`).join(",")} FROM t`);',
	].join('\n');
	assert.deepEqual(multiStatementQueries(src), [1, 2]);
});

test('không có query ghép nhiều câu mới (ngoài các chỗ đã biết)', () => {
	const fresh = scan().filter((loc) => !KNOWN.some((k) => loc.startsWith(`${k}:`)));
	assert.deepEqual(fresh, [], 'tách thành nhiều lần query (hoặc dùng queryAll / queryBatch)');
});

test(
	'mọi query chỉ 1 câu SQL',
	() => {
		assert.deepEqual(scan(), []);
	},
);
