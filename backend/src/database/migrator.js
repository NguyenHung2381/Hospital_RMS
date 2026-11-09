const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Bộ chạy migration DUY NHẤT của backend — dùng chung cho CLI (scripts/migrate.js,
// pipeline deploy) và lúc server khởi động ở môi trường dev (database/index.js).
//
//   database/migrations/*.sql  chạy theo thứ tự tên file, mỗi file 1 lần, ghi
//                              vào bảng schema_migrations (tên + checksum).
//   File gộp (nhiều migration cũ nối lại, mỗi phần mở đầu bằng dòng
//   "-- @migration <tên file cũ>.sql"): chỉ chạy phần DB chưa ghi nhận, mỗi
//   phần xong ghi tên file cũ; đủ hết thì ghi tên file gộp, xóa bản ghi phần.
//   DB đã chạy đủ các file cũ = file gộp đã chạy, không chạy lại gì.
//
// Phần chạm DB (PostgreSQL) nằm ở migrator.pg.js: mỗi file 1 transaction,
// pg_advisory_lock, pg_dump, baseline cho DB trống.
//
// Quy ước viết file: backend/README.md, mục Cơ sở dữ liệu.

const driver = require('./migrator.pg');
const { TABLE } = driver;

// Schema ban đầu ở database/baseline/. MIGRATIONS_DIR ghi đè được (test với thư mục tạm).
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.resolve(__dirname, '../../database/migrations');

const listFiles = () =>
	fs
		.readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith('.sql'))
		.sort();

const readFile = (name) => fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8').replace(/\r\n?/g, '\n');

// Bỏ khác biệt xuống dòng / khoảng trắng cuối — checkout CRLF trên Windows
// không bị coi là "file đã sửa".
const checksum = (text) =>
	crypto.createHash('sha256').update(text.replace(/[ \t]+$/gm, '').trim()).digest('hex');

// Các phần của file gộp: [{ name: tên file cũ, text }]; file thường → [].
// Phần trước dòng @migration đầu tiên chỉ là chú thích, không chạy.
const SECTION_MARK = /^--[ \t]*@migration[ \t]+(\S+\.sql)[ \t]*$/gm;
const parseSections = (text) => {
	const marks = [...text.matchAll(SECTION_MARK)];
	return marks.map((m, i) => ({
		name: m[1],
		text: text.slice(m.index + m[0].length, marks[i + 1]?.index ?? text.length),
	}));
};

// Bản ghi thừa khi file gộp đã ghi nhận: bản ghi của từng phần.
const coveredNames = (parts) => parts;

/**
 * Trạng thái thuần (không cần DB) từ danh sách file + bản ghi schema_migrations.
 *   recorded — bản ghi trong bảng, gồm cả tên phần.
 *   applied  — file coi là đã chạy: có bản ghi, hoặc file gộp có đủ bản ghi mọi phần.
 *   sections — file gộp → tên các phần.
 *   squashed — file gộp đã chạy đủ phần nhưng chưa ghi tên file gộp.
 */
const computeStatus = (files, rows, read = readFile) => {
	const recorded = new Map(rows.map((r) => [r.filename, r]));
	const texts = new Map(files.map((f) => [f, read(f)]));
	const sections = new Map();
	for (const f of files) {
		const parts = parseSections(texts.get(f)).map((s) => s.name);
		if (parts.length) sections.set(f, parts);
	}

	const applied = new Map();
	const squashed = [];
	for (const f of files) {
		const parts = sections.get(f);
		if (recorded.has(f)) applied.set(f, recorded.get(f));
		else if (parts?.every((p) => recorded.has(p))) {
			const last = parts.map((p) => recorded.get(p).applied_at).filter(Boolean).sort((a, b) => a - b).pop();
			applied.set(f, { filename: f, applied_at: last });
			squashed.push(f);
		}
	}

	const sectionNames = new Set([...sections.values()].flat());
	const pending = files.filter((f) => !applied.has(f));
	const changed = files.filter((f) => applied.get(f)?.checksum && applied.get(f).checksum !== checksum(texts.get(f)));
	const missing = [...recorded.keys()].filter((f) => !texts.has(f) && !sectionNames.has(f)).sort();
	const lastApplied = files.filter((f) => applied.has(f)).pop() ?? '';
	const outOfOrder = pending.filter((f) => f < lastApplied);
	return { files, recorded, applied, sections, squashed, pending, changed, missing, outOfOrder };
};

const openConnection = () => driver.open();

// Trạng thái từ một kết nối có sẵn (chỉ đọc).
const readStatus = async (conn) => {
	const files = listFiles();
	if (!(await driver.hasTable(conn))) return { ...computeStatus(files, []), tracked: false };
	const rows = await driver.rows(conn);
	return { ...computeStatus(files, rows), tracked: true };
};

const status = async () => {
	const conn = await openConnection();
	try {
		return await readStatus(conn);
	} finally {
		await driver.close(conn);
	}
};

const record = (conn, filename, sum) => driver.record(conn, filename, sum);

const forget = async (conn, names) => {
	if (names.length) await driver.forget(conn, names);
};

// Tạo / nâng cấp bảng theo dõi, điền checksum còn trống
// (bản ghi có từ trước khi có cột checksum = coi như file hiện tại), ghi nhận
// file gộp mà DB đã chạy đủ các phần.
const prepareTable = async (conn, log) => {
	await driver.ensureTable(conn);
	const files = listFiles();
	for (const { filename } of await driver.blankChecksums(conn)) {
		if (!files.includes(filename)) continue;
		await driver.setChecksum(conn, filename, checksum(readFile(filename)));
	}
	const s = await readStatus(conn);
	for (const [f, parts] of s.sections) {
		if (!s.applied.has(f)) continue;
		if (s.squashed.includes(f)) {
			await record(conn, f, checksum(readFile(f)));
			log(`Ghi nhận file gộp ${f} (đã chạy đủ ${parts.length} phần)`);
		}
		await forget(conn, coveredNames(parts));
	}
};

/**
 * Chạy các migration chưa chạy.
 *   dryRun   — chỉ trả trạng thái, không ghi gì.
 *   baseline — DB đã nâng cấp tay: đánh dấu mọi file chưa ghi nhận là đã chạy.
 *   requireTracked — chưa có bảng schema_migrations thì DỪNG (tránh chạy lại
 *              toàn bộ lịch sử trên DB đã nâng cấp tay); false = DB trống, tạo
 *              bảng (DB chưa có bảng nào thì tạo schema từ baseline trước).
 *   backupDir — thư mục ở máy chạy lệnh, pg_dump -Fc. Chỉ khi có file mới.
 *   log      — hàm in tiến độ.
 * Trả { ...trạng thái trước khi chạy, ran: [file đã chạy / đánh dấu] }.
 */
// eslint-disable-next-line no-console -- mặc định cho CLI (scripts/migrate.js); server truyền logger
const migrate = async ({ dryRun = false, baseline = false, requireTracked = true, backupDir = undefined, log = console.log } = {}) => {
	const conn = await openConnection();
	try {
		const before = await readStatus(conn);
		if (!before.tracked && requireTracked && !baseline) {
			throw Object.assign(
				new Error(`Chưa có bảng ${TABLE} — DB đã nâng cấp tay thì chạy 1 lần: npm run migrate baseline`),
				{ code: 'MIGRATIONS_UNTRACKED' },
			);
		}
		const needBaseline = !requireTracked && !dryRun && (await driver.isEmpty(conn));
		if (dryRun || (!needBaseline && !before.pending.length && !before.squashed.length)) return { ...before, ran: [] };

		await driver.lock(conn);
		if (needBaseline && (await driver.isEmpty(conn))) await driver.applyBaseline(conn, log);

		await prepareTable(conn, log);
		const { pending, recorded } = await readStatus(conn); // nơi khác có thể vừa chạy xong trong lúc chờ khóa

		if (baseline) {
			for (const f of pending) await record(conn, f, checksum(readFile(f)));
			return { ...before, pending, ran: pending };
		}
		if (pending.length && backupDir) await driver.backup(conn, backupDir, log);

		const ran = [];
		for (const f of pending) {
			const text = readFile(f);
			const parts = parseSections(text);
			log(`→ ${f}`);
			const started = Date.now();
			for (const part of parts.filter((p) => !recorded.has(p.name))) {
				log(`  · ${part.name}`);
				await driver.inTransaction(conn, part.text, async () => {
					await driver.run(conn, `${f} › ${part.name}`, part.text);
					await record(conn, part.name, checksum(part.text)); // hỏng giữa chừng → lần sau chạy tiếp từ phần này
				});
			}
			await driver.inTransaction(conn, parts.length ? '' : text, async () => {
				if (!parts.length) await driver.run(conn, f, text);
				await record(conn, f, checksum(text));
				await forget(conn, coveredNames(parts.map((p) => p.name)));
			});
			ran.push(f);
			log(`  ✓ ${Date.now() - started}ms`);
		}
		return { ...before, pending, ran };
	} finally {
		await driver.close(conn);
	}
};

// Tên file cho migration mới: <ngày>_<mô-tả>.sql. Ngày = hôm nay, hoặc ngày sau
// file mới nhất nếu file đó đã mang ngày ≥ hôm nay — luôn đứng cuối thứ tự.
const nextFilename = (description, today = new Date()) => {
	const slug = String(description)
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/gi, 'd')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	if (!slug) throw new Error('Thiếu mô tả migration (vd: npm run migrate new seminar_rooms)');
	const iso = (d) => d.toISOString().slice(0, 10);
	const lastDate = listFiles().map((f) => f.slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).pop();
	let date = iso(today);
	if (lastDate && lastDate >= date) {
		const d = new Date(`${lastDate}T00:00:00Z`);
		d.setUTCDate(d.getUTCDate() + 1);
		date = iso(d);
	}
	return `${date}_${slug}.sql`;
};

module.exports = {
	MIGRATIONS_DIR,
	listFiles,
	readFile,
	checksum,
	parseSections,
	computeStatus,
	status,
	migrate,
	nextFilename,
	// Mẫu file mới cho `npm run migrate new`
	template: driver.template,
};
