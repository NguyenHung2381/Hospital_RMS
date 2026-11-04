// pg:transfer verify — so DB PG với DB SQL Server sau khi load (mục 6.5.4).
// Chỉ đọc cả 2 phía. Chênh lệch → mã thoát 1 (lúc cutover: DỪNG, quay lại SQL Server).
//   - số dòng từng bảng;
//   - checksum từng bảng: mọi cột (cả cột tính toán — kiểm luôn biểu thức PG),
//     giá trị chuẩn hoá (normalize) rồi băm; lệch thì liệt kê khoá chính lệch;
//   - sequence/identity: giá trị kế tiếp > MAX(id);
//   - mọi khoá ngoại / CHECK đã VALIDATE (trừ CHECK WITH NOCHECK ở SQL Server → NOT VALID có chủ đích).
const { pipeline } = require('stream/promises');
const { Writable } = require('stream');
const { StringDecoder } = require('string_decoder');
const { to: copyTo } = require('pg-copy-streams');
const {
	normalize,
	targetExpr,
	parseCopyLine,
	TableDigest,
	bucketOf,
	objectName,
} = require('./columns');
const { readSource, readTarget, buildPlan, sourceSelect } = require('./catalog');
const { openTarget } = require('./connect');
const { parallel } = require('./load');

const MAX_SHOWN = 5;

const keyOf = (entry, values) => {
	const idx = entry.pk.length
		? entry.pk.map((p) => entry.columns.findIndex((c) => c.name === p))
		: entry.columns.map((_, i) => i);
	return idx.map((i) => values[i]).join('\u0001');
};

// Đọc 1 bảng phía SQL Server; onRow(key, fieldsChuẩnHoá)
const scanSource = async (pool, entry, onRow) => {
	const request = pool.request();
	const stream = request.toReadableStream();
	request.query(sourceSelect(entry, entry.columns));
	await pipeline(
		stream,
		new Writable({
			objectMode: true,
			write(row, _enc, cb) {
				const fields = entry.columns.map((c) => normalize(c.kind, row[c.src.name]));
				onRow(keyOf(entry, fields), fields);
				cb();
			},
		}),
	);
};

// Đọc 1 bảng phía PG bằng COPY (SELECT ...) TO STDOUT; tách dòng qua ranh giới chunk.
const scanTarget = async (client, entry, onRow) => {
	const select = entry.columns.map((c) => targetExpr(c.name, c.kind)).join(', ');
	let rest = '';
	// StringDecoder giữ lại byte dở dang: ký tự UTF-8 nhiều byte có thể bị cắt ngang ranh giới chunk
	const decoder = new StringDecoder('utf8');
	const handle = (line) => {
		const fields = parseCopyLine(line).map((v, i) => normalize(entry.columns[i].kind, v));
		onRow(keyOf(entry, fields), fields);
	};
	await pipeline(
		client.query(copyTo(`COPY (SELECT ${select} FROM "${entry.table}") TO STDOUT`)),
		new Writable({
			write(chunk, _enc, cb) {
				const lines = (rest + decoder.write(chunk)).split('\n');
				rest = lines.pop();
				for (const l of lines) handle(l);
				cb();
			},
			final(cb) {
				rest += decoder.end();
				if (rest) handle(rest);
				cb();
			},
		}),
	);
};

// Lượt 2 cho bảng lệch: khoá chính của các dòng khác nhau ở những nhóm lệch.
const locate = async (pool, client, entry, buckets) => {
	const wanted = new Set(buckets);
	const collect = () => new Map();
	const src = collect();
	const tgt = collect();
	await scanSource(pool, entry, (k, f) => wanted.has(bucketOf(k)) && src.set(k, f.join('\u0001')));
	await scanTarget(
		client,
		entry,
		(k, f) => wanted.has(bucketOf(k)) && tgt.set(k, f.join('\u0001')),
	);
	const diffs = [];
	for (const [k, v] of src) {
		if (!tgt.has(k)) diffs.push(`thiếu ở PG: ${k}`);
		else if (tgt.get(k) !== v) {
			const a = v.split('\u0001');
			const b = tgt.get(k).split('\u0001');
			const cols = entry.columns.filter((_, i) => a[i] !== b[i]).map((c) => c.name);
			diffs.push(`khác ở ${k}: ${cols.join(', ')}`);
		}
		if (diffs.length >= MAX_SHOWN) return diffs;
	}
	for (const k of tgt.keys()) {
		if (!src.has(k)) diffs.push(`thừa ở PG: ${k}`);
		if (diffs.length >= MAX_SHOWN) break;
	}
	return diffs;
};

const run = async (pool, log) => {
	const client = await openTarget();
	const problems = [];
	try {
		const { plan, problems: shape } = buildPlan(await readSource(pool), await readTarget(client));
		problems.push(...shape);

		const results = await parallel(plan, 3, async (entry) => {
			const c = await openTarget();
			try {
				const a = new TableDigest();
				const b = new TableDigest();
				await scanSource(pool, entry, (k, f) => a.add(k, f));
				await scanTarget(c, entry, (k, f) => b.add(k, f));
				const buckets = a.diff(b);
				const diffs = buckets.length ? await locate(pool, c, entry, buckets) : [];
				return { entry, rows: [a.rows, b.rows], diffs };
			} finally {
				await c.end();
			}
		});
		let rows = 0;
		for (const r of results) {
			rows += r.rows[0];
			if (r.rows[0] !== r.rows[1])
				problems.push(`${r.entry.table}: số dòng ${r.rows[0]} (nguồn) ≠ ${r.rows[1]} (PG)`);
			if (r.diffs.length) problems.push(`${r.entry.table}: dữ liệu lệch — ${r.diffs.join('; ')}`);
		}
		log(`Đã so ${plan.length} bảng, ${rows} dòng`);

		// Identity / sequence không được sinh lại giá trị đã có
		const { rows: ids } = await client.query(`
			SELECT c.table_name, c.column_name FROM information_schema.columns c
			JOIN pg_class t ON t.relname = c.table_name AND t.relnamespace = 'public'::regnamespace
			WHERE c.table_schema = 'public' AND c.is_identity = 'YES' AND NOT t.relispartition`);
		for (const { table_name: t, column_name: c } of ids) {
			const seq = (await client.query('SELECT pg_get_serial_sequence($1, $2) AS s', [t, c])).rows[0]
				.s;
			const { rows: r } = await client.query(
				`SELECT (SELECT coalesce(max("${c}"), 0) FROM "${t}") AS max_id,
				        (SELECT last_value + CASE WHEN is_called THEN 1 ELSE 0 END FROM ${seq}) AS next`,
			);
			if (Number(r[0].next) <= Number(r[0].max_id))
				problems.push(`${t}.${c}: identity kế tiếp ${r[0].next} ≤ MAX ${r[0].max_id}`);
		}

		const { rows: invalid } = await client.query(`
			SELECT conrelid::regclass::text AS t, conname FROM pg_constraint
			WHERE connamespace = 'public'::regnamespace AND NOT convalidated`);
		// CHECK WITH NOCHECK ở SQL Server → NOT VALID có chủ đích (02_constraints_indexes.sql)
		const { recordset: nocheck } = await pool
			.request()
			.query('SELECT name FROM sys.check_constraints WHERE is_not_trusted = 1');
		const expected = new Set(nocheck.map((r) => objectName(r.name)));
		let kept = 0;
		for (const x of invalid) {
			if (expected.has(x.conname)) kept++;
			else problems.push(`Ràng buộc chưa VALIDATE: ${x.t}.${x.conname}`);
		}
		if (kept) log(`  · ${kept} CHECK giữ NOT VALID như WITH NOCHECK ở SQL Server`);

		const { rows: def } = await client.query(
			'SELECT count(*)::int AS n FROM security_events_default',
		);
		if (def[0].n)
			problems.push(`security_events_default có ${def[0].n} dòng (thiếu partition tháng)`);
		return { problems };
	} finally {
		await client.end();
	}
};

module.exports = { run };
