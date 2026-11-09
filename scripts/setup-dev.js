#!/usr/bin/env node
// Dựng môi trường DEV bằng 1 lệnh (Windows / macOS / Linux, chỉ cần Node ≥ 20):
//
//   npm run setup:dev                    # backend + frontend chạy trong Docker (mặc định)
//   npm run setup:dev -- --native        # không Docker: npm install 3 chỗ, chạy bằng `npm run dev`
//   npm run setup:dev -- --no-start      # làm hết, chỉ không khởi động app
//   npm run setup:dev -- --db            # nhập lại tài khoản PostgreSQL dù .env đã có
//   npm run setup:dev -- --bak="D:\backup\RMS.bak"   # chuyển dữ liệu từ backup SQL Server cũ
//   npm run setup:dev -- --dump="D:\backup\rms_hospital_2026-11-08.dump"
//                                        # khôi phục từ bản backup PostgreSQL (.dump / .sql, có thể .gz)
//   npm run setup:dev -- --uploads="D:\backup\uploads.tar.gz" --secrets="D:\backup\secrets.tar.gz"
//                                        # chép file upload + khoá 2FA/JWT của hệ thống cũ
//   npm run setup:dev -- --import        # bắt buộc chọn file trong import/ (có file thì tự chọn, không cần cờ này)
//   npm run setup:dev -- --import="E:\rms-import"   # … hoặc trong thư mục khác
//                                        # (dump THAY DB đang có — sao lưu trước, lỗi thì trả lại)
//   npm run setup:dev -- --keep-files    # nạp xong KHÔNG xoá file dump / .tar.gz
//   npm run setup:dev -- --superadmin=it01 --admin=nckh01   # tên 2 tài khoản quản trị
//   npm run setup:dev -- --yes           # không hỏi gì (lấy giá trị từ biến SETUP_*, xem dưới)
//
// Các bước (chạy lại an toàn — bước nào đã xong thì bỏ qua / không đổi gì):
//   1. Kiểm tra Node, Docker Desktop đang chạy.
//   2. backend/.env: chưa có thì tạo từ .env.example. Hỏi tài khoản PostgreSQL (máy
//      chủ, cổng, database, role, mật khẩu) khi .env mới tạo / mật khẩu còn là giá trị
//      mẫu / có --db. Điền JWT secret, SWAGGER_PASS nếu còn là giá trị mẫu.
//   3. Build image dev (Docker) hoặc npm install (--native).
//   4. Kiểm tra kết nối PostgreSQL (backend/scripts/db-check.js). Chưa có DB /
//      role thì hỏi mật khẩu superuser `postgres` và chạy
//      infra/postgresql/01_tao_db_va_role.sql bằng psql trên máy này. Sai mật khẩu /
//      không tới được máy chủ thì cho nhập lại tài khoản.
//   4b. DB còn trống: hỏi "Có dữ liệu của hệ thống cũ không?". Có → chép bản backup
//      (+ uploads.tar.gz, secrets.tar.gz) vào thư mục import/ rồi chọn theo số (hoặc dán
//      đường dẫn; --bak= / --dump= khi không hỏi). Không → DB mới (trống).
//      File .bak SQL Server → dựng SQL Server TẠM trong Docker, restore → precheck → load → verify
//      vào PostgreSQL (backend/scripts/pg-transfer, như transfer-from-bak.sh của server)
//      rồi xoá container tạm. Ngay sau khi chuyển: nếu tài khoản
//      toàn quyền duy nhất là "admin" của hệ thống cũ thì bỏ nó (xoá; còn dữ liệu liên
//      kết thì vô hiệu hoá + đổi tên thành admin_cu) và tạo superadmin + admin mới.
//      File dump PostgreSQL thay vì .bak → khôi phục bằng superuser
//      `postgres` (pg_restore / psql trên máy này, giữ nguyên chủ sở hữu + quyền).
//      Nhận .dump (pg_dump -Fc, như backup hằng đêm), -Ft, .sql; nén .gz đều được.
//   5. Dựng schema: `migrate init` (DB trống → baseline + mọi migration; DB đã có →
//      chỉ chạy file mới). DB có bảng nhưng chưa có schema_migrations → dừng, không đoán.
//   6. `init:system`: tạo vai trò hệ thống còn thiếu (theo mã) và 2 tài khoản, in mật
//      khẩu tạm 1 lần:
//        superadmin — vai trò Super Admin, toàn quyền
//        admin      — vai trò Admin: chỉ NCKH, đào tạo / CME, người dùng
//      Vai trò đã có thì giữ nguyên quyền; vai trò đã có người dùng thì không tạo thêm.
//   7. `seed:catalogs`: danh mục NCKH, đào tạo / CME, nhân sự — chỉ nạp bảng còn trống.
//   7b. Có --uploads / --secrets (hoặc vừa chuyển từ .bak / dump và nhập đường dẫn khi được hỏi):
//      giải nén uploads.tar.gz → backend/uploads, secrets.tar.gz → volume server_secrets
//      (file .tar.gz đóng gói từ volume của hệ thống cũ, mục C.6
//      infra/chuyen-du-lieu-sang-postgresql.md) bằng backend/scripts/import-old-files.sh
//      trong container backend. Khoá đang có được chép sang .truoc-import-<thời điểm>/.
//   8. docker compose up -d, chờ http://localhost:3001/health và :5173.
//
// Nạp dữ liệu cũ — cài từ đầu hay cập nhật sau này đều như nhau: chép bản backup PostgreSQL /
// uploads.tar.gz / secrets.tar.gz vào thư mục import/ ở gốc repo (git bỏ qua) rồi chạy
// `npm run setup:dev` (thư mục có file là tự dùng; --import để bắt buộc / thư mục khác). Script
// liệt kê file theo loại (nhận dạng theo nội dung; .tar.gz có "secret" trong tên là khoá
// bí mật), mới nhất trước, chọn theo số (--yes: lấy file mới nhất). Chọn bản backup khi DB
// đã có dữ liệu: sao lưu DB đang dùng vào import/sao-luu/, dừng backend, đổi tên DB cũ
// sang bên, khôi phục vào DB mới; lỗi ở bất kỳ bước nào sau đó thì trả lại DB cũ. Không
// có --import thì hỏi trước khi thay DB đang có dữ liệu (--yes: không thay, chỉ nạp vào DB trống).
// File dump / .tar.gz nạp thành công thì bị XOÁ (cả khi đưa bằng --dump / --uploads /
// --secrets) — chứa toàn bộ dữ liệu + khoá 2FA. Giữ lại: --keep-files.
//
// PostgreSQL 18 phải cài sẵn trên máy (infra/cai-dat-postgresql.md, mục "Máy dev
// Windows"). Backend trong Docker kết nối qua host.docker.internal nên pg_hba.conf
// phải cho dải mạng Docker 172.16.0.0/12 (xem infra/postgresql/pg_hba.rms.conf).
//
// PostgreSQL ở máy khác: nhập địa chỉ máy đó ở bước 2 — script ghi DEV_DB_SERVER vào
// .env cạnh docker-compose.yml để container backend kết nối tới đó.
//
// Biến môi trường tuỳ chọn (dùng khi --yes hoặc không có terminal để hỏi):
//   SETUP_DB_SERVER / SETUP_DB_PORT / SETUP_DB_DATABASE
//                          máy chủ / cổng / database (mặc định localhost / 5432 / rms_hospital)
//   SETUP_DB_USER          role ứng dụng dùng ở dev (mặc định rms_migrate — cần quyền
//                          ALTER để server tự chạy migration lúc khởi động)
//   SETUP_DB_PASSWORD      mật khẩu role đó
//   SETUP_PG_SUPERUSER     superuser để tạo DB / role (mặc định postgres)
//   SETUP_PG_SUPERPASS     mật khẩu superuser (trống = psql tự đọc pgpass)
//   SETUP_PSQL             đường dẫn psql nếu không có trong PATH
//   SETUP_BAK_FILE         file .bak cần chuyển (như --bak=)
//   SETUP_DUMP_FILE        file dump PostgreSQL cần khôi phục (như --dump=)
//   SETUP_UPLOADS_FILE / SETUP_SECRETS_FILE
//                          uploads.tar.gz / secrets.tar.gz của hệ thống cũ (như --uploads= / --secrets=)
//   SETUP_IMPORT_DIR       thư mục của --import (mặc định import/ ở gốc repo)
//   SETUP_MIGRATE_PASSWORD mật khẩu rms_migrate khi backend/.env dùng role khác (load cần
//                          quyền tạo bảng)
//   MSSQL_IMAGE / MSSQL_PID  image SQL Server tạm (mặc định 2025-latest / Express ≤ 10 GB)
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const readline = require('readline');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const ENV_FILE = path.join(BACKEND, '.env');
const ENV_EXAMPLE = path.join(BACKEND, '.env.example');
const COMPOSE_ENV = path.join(ROOT, '.env'); // biến cho docker-compose.yml (không vào container)
const ROLE_SQL = path.join(ROOT, 'infra', 'postgresql', '01_tao_db_va_role.sql');
const DB_ROLES = ['rms_migrate', 'rms_app'];
const PLACEHOLDER_DB_PASSWORD = 'mat_khau_db';

// ── Tham số ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => {
	const hit = argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : def;
};
if (flag('help') || argv.includes('-h')) {
	const head = fs.readFileSync(__filename, 'utf8').split('\n').slice(1);
	console.log(head.slice(0, head.findIndex((l) => !l.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
	process.exit(0);
}
const NATIVE = flag('native');
const NO_START = flag('no-start');
const RECONFIGURE_DB = flag('db');
const BAK_ARG = opt('bak', '');
const DUMP_ARG = opt('dump', '');
const UPLOADS_ARG = opt('uploads', '');
const SECRETS_ARG = opt('secrets', '');
// "Copy as path" của Windows bọc đường dẫn trong nháy kép
const cleanPath = (p) => String(p || '').trim().replace(/^["']|["']$/g, '');
const IMPORT_ON = flag('import') || argv.some((a) => a.startsWith('--import='));
const IMPORT_DIR = path.resolve(cleanPath(opt('import', '') || process.env.SETUP_IMPORT_DIR) || path.join(ROOT, 'import'));
const KEEP_FILES = flag('keep-files');
const SUPERADMIN = opt('superadmin', 'superadmin');
const ADMIN = opt('admin', 'admin');
const INTERACTIVE = !flag('yes') && !argv.includes('-y') && process.stdin.isTTY;
const IS_WIN = process.platform === 'win32';

// ── In ra màn hình ──────────────────────────────────────────────────────
// +1 khi chuyển từ .bak / khôi phục từ dump, +1 khi chép file cũ. Truyền bằng tham số /
// biến môi trường / chọn trong thư mục import thì đếm ngay từ đầu (bộ đếm [n/tổng] không
// nhảy giữa chừng); nhập đường dẫn khi được hỏi thì cộng lúc đó.
let sourceCounted = !!(DUMP_ARG || process.env.SETUP_DUMP_FILE || BAK_ARG || process.env.SETUP_BAK_FILE);
let oldFilesCounted = !!(UPLOADS_ARG || process.env.SETUP_UPLOADS_FILE || SECRETS_ARG || process.env.SETUP_SECRETS_FILE);
let TOTAL_STEPS = 8 + sourceCounted + oldFilesCounted;
let stepNo = 0;
const step = (title) => console.log(`\n\x1b[36m[${++stepNo}/${TOTAL_STEPS}] ${title}\x1b[0m`);
const info = (msg) => console.log(`  ${msg}`);
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const warn = (msg) => console.log(`  \x1b[33m!\x1b[0m ${msg}`);
class SetupError extends Error {}
const fail = (msg) => {
	throw new SetupError(msg);
};

// ── Hỏi người dùng ──────────────────────────────────────────────────────
const ask = (question, def = '') => {
	if (!INTERACTIVE) return Promise.resolve(def);
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) =>
		rl.question(`  ${question}${def ? ` [${def}]` : ''}: `, (a) => {
			rl.close();
			resolve(a.trim() || def);
		}),
	);
};
// Không hiện ký tự đang gõ
const askSecret = (question) => {
	if (!INTERACTIVE) return Promise.resolve('');
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
	let muted = false;
	rl._writeToOutput = (s) => {
		if (!muted) rl.output.write(s);
	};
	return new Promise((resolve) => {
		rl.question(`  ${question}: `, (a) => {
			rl.close();
			process.stdout.write('\n');
			resolve(a);
		});
		muted = true;
	});
};
const confirm = async (question, def = true) => {
	if (!INTERACTIVE) return def;
	const a = (await ask(`${question} (${def ? 'Y/n' : 'y/N'})`)).toLowerCase();
	return a ? a.startsWith('y') || a.startsWith('c') : def;
};

// ── Chạy lệnh ───────────────────────────────────────────────────────────
// capture: trả stdout + stderr thay vì in thẳng ra màn hình
const run = (cmd, args, { cwd = ROOT, env, capture = false, shell = false } = {}) => {
	const r = spawnSync(cmd, args, {
		cwd,
		env: env ? { ...process.env, ...env } : process.env,
		stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
		encoding: 'utf8',
		shell,
	});
	return { status: r.error ? -1 : r.status, error: r.error, out: `${r.stdout || ''}${r.stderr || ''}` };
};
const compose = (args, opts) => run('docker', ['compose', ...args], opts);
const npm = (args, opts) => run('npm', args, { ...opts, shell: IS_WIN }); // npm.cmd trên Windows cần shell

// Chạy 1 script của backend: trong container dev (cùng biến môi trường compose
// đặt cho server, kết nối DB qua host.docker.internal) hoặc bằng Node trên máy (--native).
const runBackend = (script, args = [], opts = {}) =>
	NATIVE
		? run(process.execPath, [script, ...args], { ...opts, cwd: BACKEND, env: { NODE_ENV: 'development' } })
		: compose(['run', '--rm', '--no-deps', '-T', 'backend', 'node', script, ...args], opts);

// ── backend/.env ────────────────────────────────────────────────────────
// [ \t] thay vì \s: trong chế độ m, ^ khớp cả sau \r — \s* sẽ nuốt \n của file CRLF
const keyRe = (key) => new RegExp(`^[ \\t]*${key}[ \\t]*=(.*)$`, 'm');
const getKey = (content, key) => {
	const m = content.match(keyRe(key));
	if (!m) return undefined;
	const v = m[1].trim();
	if (/^'.*'$|^".*"$/.test(v)) return v.slice(1, -1);
	return v.replace(/\s+#.*$/, '');
};
// Giá trị có ký tự đặc biệt thì bọc nháy để dotenv đọc đúng
const quote = (v) => (!/[\s#"'`\\]/.test(v) ? v : v.includes("'") ? `"${v.replace(/"/g, '\\"')}"` : `'${v}'`);
const setKey = (content, key, value) => {
	const line = `${key}=${quote(value)}`;
	if (keyRe(key).test(content)) return content.replace(keyRe(key), line);
	const eol = content.includes('\r\n') ? '\r\n' : '\n';
	return `${content.replace(/(\r?\n)*$/, '')}${eol}${line}${eol}`;
};
const removeKey = (content, key) => content.replace(new RegExp(`^[ \\t]*${key}[ \\t]*=.*(\\r?\\n|$)`, 'm'), '');
const readEnv = () => fs.readFileSync(ENV_FILE, 'utf8');
const LOCAL_HOSTS = ['', 'localhost', '127.0.0.1', '::1', 'host.docker.internal'];

// ── Tài khoản PostgreSQL ────────────────────────────────────────────────
const DB_FIELDS = [
	['DB_SERVER', 'Máy chủ PostgreSQL', 'localhost'],
	['DB_PORT', 'Cổng', '5432'],
	['DB_DATABASE', 'Database', 'rms_hospital'],
	['DB_USER', 'Role (tài khoản)', 'rms_migrate'],
];
const describeDb = (content) =>
	`${getKey(content, 'DB_USER')}@${getKey(content, 'DB_SERVER')}:${getKey(content, 'DB_PORT') || 5432}/${getKey(content, 'DB_DATABASE')}`;

// Hỏi từng trường, Enter = giữ giá trị trong ngoặc. Mật khẩu: Enter = giữ mật khẩu
// đang có (nếu đang có thật). Trả nội dung .env mới (chưa ghi file).
const askDbAccount = async (content) => {
	info('Tài khoản PostgreSQL — Enter để giữ giá trị trong [ngoặc]:');
	for (const [key, label, def] of DB_FIELDS) {
		let cur = getKey(content, key);
		// Giá trị mẫu dành cho docker-compose.prod.yml — ở dev nhập theo máy host
		if (key === 'DB_SERVER' && cur === 'host.docker.internal') cur = 'localhost';
		content = setKey(content, key, process.env[`SETUP_${key}`] || (await ask(label, cur || def)));
	}
	const user = getKey(content, 'DB_USER');
	const curPw = getKey(content, 'DB_PASSWORD') || '';
	const hasPw = curPw && curPw !== PLACEHOLDER_DB_PASSWORD;
	let pw = process.env.SETUP_DB_PASSWORD || '';
	if (!pw && INTERACTIVE) {
		if (!hasPw) info(`Chưa có role ${user} thì nhập mật khẩu muốn đặt — bước 4 sẽ tạo role.`);
		pw = await askSecret(`Mật khẩu ${user}${hasPw ? ' (Enter = giữ mật khẩu hiện có)' : ''}`);
	}
	if (pw) return setKey(content, 'DB_PASSWORD', pw);
	// Container không đọc được file pgpass trên máy host → Docker bắt buộc có mật khẩu
	if (!hasPw && !NATIVE)
		fail('Thiếu mật khẩu PostgreSQL — điền DB_PASSWORD vào backend/.env hoặc đặt SETUP_DB_PASSWORD rồi chạy lại.');
	return hasPw ? content : setKey(content, 'DB_PASSWORD', ''); // native: trống = đọc pgpass
};

// docker-compose.yml đặt DB_SERVER của container = ${DEV_DB_SERVER:-host.docker.internal}.
// PostgreSQL trên máy này → bỏ DEV_DB_SERVER; ở máy khác → ghi địa chỉ đó.
const syncComposeDbServer = (content) => {
	if (NATIVE) return;
	const host = getKey(content, 'DB_SERVER') || '';
	const local = LOCAL_HOSTS.includes(host);
	const before = fs.existsSync(COMPOSE_ENV) ? fs.readFileSync(COMPOSE_ENV, 'utf8') : '';
	const after = local ? removeKey(before, 'DEV_DB_SERVER') : setKey(before, 'DEV_DB_SERVER', host);
	if (after === before) return;
	fs.writeFileSync(COMPOSE_ENV, after, 'utf8');
	ok(local ? 'Bỏ DEV_DB_SERVER — container kết nối PostgreSQL trên máy này' : `Ghi DEV_DB_SERVER=${host} vào .env cạnh docker-compose.yml`);
};

const writeEnv = (content) => {
	fs.writeFileSync(ENV_FILE, content, 'utf8');
	syncComposeDbServer(content);
};

const prepareEnv = async () => {
	step('Cấu hình backend/.env');
	let content;
	let created = false;
	if (fs.existsSync(ENV_FILE)) {
		content = readEnv();
		ok('Đã có backend/.env — chỉ điền giá trị còn trống / còn là giá trị mẫu');
	} else {
		content = fs.readFileSync(ENV_EXAMPLE, 'utf8');
		created = true;
		ok('Tạo backend/.env từ .env.example');
	}
	const before = content;

	const pw = getKey(content, 'DB_PASSWORD') ?? '';
	if (created || RECONFIGURE_DB || pw === PLACEHOLDER_DB_PASSWORD || (!pw && !NATIVE)) {
		content = await askDbAccount(content);
	} else {
		ok(`PostgreSQL: ${describeDb(content)} (nhập lại: --db)`);
	}
	// .env.example để host.docker.internal (cho prod); dev chạy native thì kết nối thẳng
	if (NATIVE && getKey(content, 'DB_SERVER') === 'host.docker.internal') content = setKey(content, 'DB_SERVER', 'localhost');
	if (/^change-me/i.test(getKey(content, 'SWAGGER_PASS') || '')) {
		content = setKey(content, 'SWAGGER_PASS', crypto.randomBytes(12).toString('hex'));
		ok('Sinh SWAGGER_PASS ngẫu nhiên (xem trong backend/.env)');
	}

	if (content !== before) {
		writeEnv(content);
		ok('Đã ghi backend/.env');
	} else syncComposeDbServer(content);
	const r = run(process.execPath, [path.join(BACKEND, 'scripts', 'gen-jwt-secrets.js'), '--env', ENV_FILE], {
		capture: true,
	});
	if (r.status !== 0) fail(`Sinh JWT secret lỗi:\n${r.out}`);
	ok(/Không có gì thay đổi/.test(r.out) ? 'JWT secret đã có' : 'Đã sinh JWT_SECRET / JWT_REFRESH_SECRET');
};

// ── Bước 1: công cụ ─────────────────────────────────────────────────────
const checkTools = () => {
	step('Kiểm tra công cụ');
	const major = Number(process.versions.node.split('.')[0]);
	if (major < 20) fail(`Cần Node.js ≥ 20, máy đang có ${process.version}`);
	ok(`Node ${process.version}`);
	if (NATIVE) return;
	const d = run('docker', ['version', '--format', '{{.Server.Version}}'], { capture: true });
	if (d.error) fail('Không tìm thấy lệnh docker — cài Docker Desktop, hoặc chạy với --native.');
	if (d.status !== 0) fail('Docker chưa chạy — mở Docker Desktop, đợi nó báo "Engine running" rồi chạy lại.');
	ok(`Docker Engine ${d.out.trim()}`);
	const c = compose(['version', '--short'], { capture: true });
	if (c.status !== 0) fail('Thiếu Docker Compose v2 (`docker compose`).');
	ok(`Docker Compose ${c.out.trim()}`);
};

// ── Bước 3: build / cài thư viện ────────────────────────────────────────
const installDeps = () => {
	if (NATIVE) {
		step('Cài thư viện (npm install)');
		for (const dir of [ROOT, BACKEND, path.join(ROOT, 'frontend')]) {
			info(`→ ${path.relative(ROOT, dir) || '.'}`);
			if (npm(['install', '--no-audit', '--no-fund'], { cwd: dir }).status !== 0)
				fail(`npm install lỗi ở ${dir}`);
		}
		ok('Đã cài thư viện');
		return;
	}
	step('Build image dev (lần đầu mất vài phút)');
	if (compose(['build', 'backend', 'frontend']).status !== 0) fail('docker compose build lỗi (xem log ở trên).');
	ok('Đã build image backend + frontend');
};

// ── Bước 4: PostgreSQL ──────────────────────────────────────────────────
const dbCheck = () => {
	const r = runBackend('scripts/db-check.js', [], { capture: true });
	const line = r.out.split(/\r?\n/).find((l) => l.startsWith('@@db-check '));
	if (!line) fail(`Không chạy được scripts/db-check.js:\n${r.out}`);
	return JSON.parse(line.slice('@@db-check '.length));
};

const findPsql = () => {
	if (process.env.SETUP_PSQL) return process.env.SETUP_PSQL;
	if (!run('psql', ['--version'], { capture: true }).error) return 'psql';
	if (!IS_WIN) return null;
	// Bộ cài EDB tạo service postgresql-x64-<bản> chạy <thư mục cài>\bin\pg_ctl.exe —
	// đọc đường dẫn từ service (cài ở ổ khác C: vẫn tìm được), psql.exe nằm cùng thư mục.
	const svc = run(
		'powershell',
		['-NoProfile', '-Command', "(Get-CimInstance Win32_Service -Filter \"Name LIKE 'postgresql%'\").PathName"],
		{ capture: true },
	);
	const bins = [...svc.out.matchAll(/"?([^"\r\n]*?)\\pg_ctl\.exe/gi)].map((m) => m[1]);
	// Không đọc được service: thử chỗ cài mặc định C:\Program Files\PostgreSQL\<bản>\bin
	const base = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL');
	if (fs.existsSync(base))
		for (const v of fs.readdirSync(base).filter((x) => /^\d+$/.test(x)).sort((a, b) => b - a))
			bins.push(path.join(base, v, 'bin'));
	return bins.map((dir) => path.join(dir, 'psql.exe')).find((exe) => fs.existsSync(exe)) || null;
};

// Thêm dòng vào file pgpass (cùng file backend/psql tự đọc khi DB_PASSWORD trống)
const savePgpass = (host, port, user, password) => {
	const file = process.env.PGPASSFILE || (IS_WIN
		? path.join(process.env.APPDATA || os.homedir(), 'postgresql', 'pgpass.conf')
		: path.join(os.homedir(), '.pgpass'));
	const esc = (s) => String(s).replace(/[\\:]/g, '\\$&');
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
	fs.writeFileSync(file, `${prev}${prev && !prev.endsWith('\n') ? '\n' : ''}${[host, port, '*', user, password].map(esc).join(':')}\n`, { mode: 0o600 });
	return file;
};

// Kết nối superuser bằng psql trên máy này (tạo DB / role, khôi phục dump). Mật khẩu
// hỏi 1 lần cho cả lần chạy.
let superpassCache;
const superConn = async (env) => {
	const psql = findPsql();
	if (!psql)
		fail('Không tìm thấy psql. Thêm thư mục bin của PostgreSQL vào PATH, hoặc đặt SETUP_PSQL=<đường dẫn psql>.');
	const server = getKey(env, 'DB_SERVER') || 'localhost';
	const host = ['localhost', 'host.docker.internal', '127.0.0.1'].includes(server) ? '127.0.0.1' : server;
	const port = getKey(env, 'DB_PORT') || '5432';
	const superuser = process.env.SETUP_PG_SUPERUSER || 'postgres';
	superpassCache ??= process.env.SETUP_PG_SUPERPASS ?? (await askSecret(`Mật khẩu superuser ${superuser} (Enter = đọc pgpass)`));
	const pgEnv = { ...(superpassCache ? { PGPASSWORD: superpassCache } : {}), PGCONNECT_TIMEOUT: '10' };
	return { psql, host, port, superuser, pgEnv, conn: ['-h', host, '-p', port, '-U', superuser, '-w'] };
};

const createDatabase = async (env) => {
	const user = getKey(env, 'DB_USER');
	const database = getKey(env, 'DB_DATABASE') || 'rms_hospital';
	if (database !== 'rms_hospital')
		fail(`infra/postgresql/01_tao_db_va_role.sql chỉ tạo DB rms_hospital (backend/.env đang là ${database}). Tạo DB bằng tay.`);
	if (!DB_ROLES.includes(user))
		fail(`Chỉ tự tạo được role ${DB_ROLES.join(' / ')} (backend/.env đang dùng ${user}). Tạo role bằng tay.`);

	const { psql, host, port, superuser, pgEnv, conn } = await superConn(env);
	const base = [...conn, '-v', 'ON_ERROR_STOP=1'];

	const roles = run(psql, [...base, '-d', 'postgres', '-tAc', `SELECT rolname FROM pg_roles WHERE rolname IN ('rms_migrate','rms_app')`], {
		env: pgEnv,
		capture: true,
	});
	if (roles.status !== 0) fail(`psql không kết nối được bằng ${superuser}@${host}:${port}:\n${roles.out.trim()}`);
	const existing = new Set(roles.out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));

	// Role dev dùng mật khẩu trong .env; role còn lại (nếu chưa có) mật khẩu ngẫu nhiên, lưu vào pgpass
	const passwords = {};
	for (const role of DB_ROLES)
		passwords[role] = role === user ? getKey(env, 'DB_PASSWORD') : crypto.randomBytes(18).toString('base64url');
	if (!existing.has(user) && !passwords[user])
		fail(`Role ${user} chưa có — cần DB_PASSWORD trong backend/.env để đặt mật khẩu cho nó.`);
	if (existing.has(user)) warn(`Role ${user} đã có — giữ nguyên mật khẩu của nó (không đổi theo backend/.env)`);

	const r = run(psql, [...base, '-d', 'postgres', '-v', `migrate_password=${passwords.rms_migrate}`, '-v', `app_password=${passwords.rms_app}`, '-f', ROLE_SQL], {
		env: pgEnv,
		capture: true,
	});
	if (r.status !== 0) fail(`Chạy 01_tao_db_va_role.sql lỗi:\n${r.out.trim()}`);
	ok(`Đã tạo DB rms_hospital + role (${DB_ROLES.filter((x) => !existing.has(x)).join(', ') || 'role đã có sẵn'})`);
	for (const role of DB_ROLES) {
		if (role === user || existing.has(role)) continue;
		ok(`Mật khẩu ${role} (ngẫu nhiên) lưu ở ${savePgpass(host, port, role, passwords[role])}`);
	}
};

const DB_HINTS = {
	ECONNREFUSED: 'PostgreSQL chưa chạy, hoặc sai DB_PORT.',
	ETIMEDOUT: 'Không tới được PostgreSQL — firewall chặn cổng 5432?',
	ENOTFOUND: 'Sai DB_SERVER.',
	28000: 'pg_hba.conf không cho kết nối này. Docker: thêm dòng cho 172.16.0.0/12 (infra/postgresql/pg_hba.rms.conf), reload PostgreSQL, mở firewall Windows cổng 5432 cho mạng đó.',
	'28P01': 'Sai mật khẩu — sửa DB_PASSWORD trong backend/.env (role đã có thì script không đổi mật khẩu của nó).',
};
// Lỗi do thông tin kết nối — nhập lại tài khoản có thể sửa được
const RETRYABLE = ['28P01', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH'];

const ensureDatabase = async () => {
	step('Kiểm tra PostgreSQL');
	info(`Kết nối ${describeDb(readEnv())} …`);
	let s = dbCheck();
	// 3D000: DB chưa có · 28P01: sai mật khẩu, cũng là lỗi khi role chưa có
	if (!s.ok && ['3D000', '28P01'].includes(s.code)) {
		warn(s.code === '3D000' ? 'Chưa có database.' : 'Đăng nhập thất bại — role có thể chưa được tạo.');
		if (!(await confirm('Tạo DB rms_hospital + role rms_migrate / rms_app bằng psql?'))) fail(s.message);
		await createDatabase(readEnv());
		s = dbCheck();
	}
	for (let attempt = 0; !s.ok && INTERACTIVE && RETRYABLE.includes(s.code) && attempt < 3; attempt++) {
		warn(`Không kết nối được (${s.code}) ${s.message || ''}${DB_HINTS[s.code] ? ` — ${DB_HINTS[s.code]}` : ''}`);
		if (!(await confirm('Nhập lại tài khoản PostgreSQL?'))) break;
		writeEnv(await askDbAccount(readEnv()));
		s = dbCheck();
	}
	if (!s.ok) {
		const hint = DB_HINTS[s.code] || '';
		fail(`Không kết nối được PostgreSQL (${s.code || 'lỗi'}): ${s.message}${hint ? `\n  → ${hint}` : ''}`);
	}
	ok(`Kết nối được (${s.empty ? 'DB trống' : s.tracked ? `${s.pending} migration chờ chạy` : 'có bảng, chưa có schema_migrations'})`);
	return s;
};

// ── Bước 5–7: schema + dữ liệu khởi tạo ───────────────────────────────
const migrate = (s) => {
	step('Dựng schema (migrate init)');
	if (!s.tracked && !s.empty)
		fail('DB đã có bảng nhưng chưa có schema_migrations (nâng cấp tay / chuyển dữ liệu). Kiểm tra rồi chạy 1 lần `npm run migrate baseline` trong backend — script không tự làm bước này.');
	if (s.tracked && !s.pending) return ok('Schema đã mới nhất');
	if (runBackend('scripts/migrate.js', ['init']).status !== 0)
		fail(`Migration lỗi (xem log ở trên). Role ${getKey(readEnv(), 'DB_USER')} cần quyền tạo bảng — dev nên dùng rms_migrate.`);
	ok('Schema đã sẵn sàng');
};

// ── Bước 4b: chuyển dữ liệu từ file .bak ───────────────────────────────
const MSSQL_CONTAINER = 'rms-mssql-restore';
const BAK_IN_CONTAINER = '/var/opt/mssql/backup/source.bak';

// Nhận dạng bản backup PostgreSQL theo nội dung (đuôi file không đáng tin):
// { kind: 'custom' | 'tar' | 'sql', gz } hoặc null nếu không phải.
const detectDump = (file) => {
	const fd = fs.openSync(file, 'r');
	let head = Buffer.alloc(65536);
	try {
		head = head.subarray(0, fs.readSync(fd, head, 0, head.length, 0));
	} finally {
		fs.closeSync(fd);
	}
	const gz = head[0] === 0x1f && head[1] === 0x8b;
	if (gz) {
		try {
			// Giải nén phần đầu: Z_SYNC_FLUSH trả phần đã giải được, không báo lỗi thiếu đuôi
			head = zlib.gunzipSync(head, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
		} catch {
			return null;
		}
	}
	if (head.subarray(0, 5).toString('latin1') === 'PGDMP') return { kind: 'custom', gz };
	// pg_dump -Ft: mục đầu là toc.dat — gói uploads.tar.gz cũng là tar nhưng không có
	if (head.subarray(257, 262).toString('latin1') === 'ustar' && head.subarray(0, 7).toString('latin1') === 'toc.dat')
		return { kind: 'tar', gz };
	if (head.subarray(0, 4096).toString('utf8').includes('PostgreSQL database dump')) return { kind: 'sql', gz };
	return null;
};

const isGzip = (file) => {
	const fd = fs.openSync(file, 'r');
	const b = Buffer.alloc(2);
	try {
		fs.readSync(fd, b, 0, 2, 0);
	} finally {
		fs.closeSync(fd);
	}
	return b[0] === 0x1f && b[1] === 0x8b;
};
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

// ── --import: chọn file trong thư mục import ───────────────────────────
// File ở cấp cao nhất (thư mục con như sao-luu/ bỏ qua), mới nhất trước, chia theo loại:
// bản backup PostgreSQL (detectDump) / .tar.gz có "secret" trong tên / .tar.gz còn lại.
const scanImportDir = () => {
	fs.mkdirSync(IMPORT_DIR, { recursive: true });
	const found = { dump: [], bak: [], uploads: [], secrets: [] };
	const unknown = [];
	const files = fs
		.readdirSync(IMPORT_DIR, { withFileTypes: true })
		.filter((d) => d.isFile() && !d.name.startsWith('.'))
		.map((d) => {
			const file = path.join(IMPORT_DIR, d.name);
			return { file, name: d.name, stat: fs.statSync(file) };
		})
		.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
	for (const f of files) {
		if (detectDump(f.file)) found.dump.push(f);
		else if (/\.bak$/i.test(f.name)) found.bak.push(f);
		else if (isGzip(f.file)) found[/secret/i.test(f.name) ? 'secrets' : 'uploads'].push(f);
		else unknown.push(f.name);
	}
	if (unknown.length) warn(`Không nhận ra, bỏ qua: ${unknown.join(', ')}`);
	return found;
};

const hasImportFiles = () => {
	try {
		return fs.readdirSync(IMPORT_DIR, { withFileTypes: true }).some((d) => d.isFile() && !d.name.startsWith('.'));
	} catch {
		return false;
	}
};

// Chọn 1 file theo số (Enter = mới nhất, 0 = không dùng); không hỏi được (--yes) thì lấy mới nhất
const chooseFile = async (label, list) => {
	if (!list.length) return '';
	if (!INTERACTIVE) {
		info(`${label}: ${list[0].name}`);
		return list[0].file;
	}
	info(`${label}:`);
	list.forEach((f, i) => info(`  ${i + 1}) ${f.name}   ${fmtSize(f.stat.size)}, ${f.stat.mtime.toLocaleString('vi-VN')}`));
	info('  0) không dùng');
	for (;;) {
		const n = Number(await ask('Chọn', '1'));
		if (Number.isInteger(n) && n >= 0 && n <= list.length) return n ? list[n - 1].file : '';
		warn(`Nhập số từ 0 đến ${list.length}`);
	}
};

// Trả { dump, uploads, secrets } (đường dẫn, '' = không). Loại đã đưa bằng tham số /
// biến môi trường thì giữ, không hỏi.
const pickImportFiles = async () => {
	console.log(`\nChọn file để cập nhật (${IMPORT_DIR}):`);
	const found = scanImportDir();
	const picks = { dump: '', uploads: '', secrets: '' };
	const given = {
		dump: DUMP_ARG || process.env.SETUP_DUMP_FILE || BAK_ARG || process.env.SETUP_BAK_FILE,
		uploads: UPLOADS_ARG || process.env.SETUP_UPLOADS_FILE,
		secrets: SECRETS_ARG || process.env.SETUP_SECRETS_FILE,
	};
	const labels = {
		dump: 'Bản backup PostgreSQL — THAY toàn bộ dữ liệu đang có',
		uploads: 'File upload (.tar.gz) — ghép vào file đang có',
		secrets: 'Khoá 2FA + JWT (.tar.gz) — thay khoá đang có',
	};
	for (const kind of Object.keys(picks)) if (!given[kind]) picks[kind] = await chooseFile(labels[kind], found[kind]);
	if (!Object.values(picks).some(Boolean) && !Object.values(given).some(Boolean)) {
		warn(`Không có file nào để nạp trong ${IMPORT_DIR} — chép bản backup / .tar.gz vào đó rồi chạy lại.`);
	}
	if (picks.dump && !sourceCounted) {
		sourceCounted = true;
		TOTAL_STEPS++;
	}
	if ((picks.uploads || picks.secrets) && !oldFilesCounted) {
		oldFilesCounted = true;
		TOTAL_STEPS++;
	}
	picks.fromDir = true;
	return picks;
};

// Cài từ đầu (DB trống), có dữ liệu cũ: chờ người dùng chép file vào thư mục import rồi chọn.
// Trả đường dẫn bản backup (dump / .bak) hoặc '' (dựng DB trống); uploads / secrets ghi vào chosen.
const askOldDataFromDir = async (chosen) => {
	fs.mkdirSync(IMPORT_DIR, { recursive: true });
	info(`Chép các file của hệ thống cũ vào ${IMPORT_DIR}:`);
	info('  • bản backup: file dump PostgreSQL (.dump / .sql, có thể nén .gz) hoặc file .bak của SQL Server');
	info('  • uploads.tar.gz (file người dùng đã upload), secrets.tar.gz (khoá 2FA + JWT) — nếu có');
	for (;;) {
		const a = cleanPath(await ask('Chép xong nhấn Enter (hoặc dán đường dẫn file backup; b = bỏ qua, dựng DB trống)'));
		if (a.toLowerCase() === 'b') return '';
		if (a) {
			if (fs.existsSync(a) && fs.statSync(a).isFile()) return a;
			warn(`Không thấy file ${a}`);
			continue;
		}
		const found = scanImportDir();
		const backups = [...found.dump, ...found.bak].sort((x, y) => y.stat.mtimeMs - x.stat.mtimeMs);
		if (!backups.length) {
			warn(`Chưa thấy bản backup nào trong ${IMPORT_DIR}.`);
			continue;
		}
		const file = await chooseFile('Bản backup', backups);
		if (!chosen.uploads) chosen.uploads = await chooseFile('File upload (.tar.gz)', found.uploads);
		if (!chosen.secrets) chosen.secrets = await chooseFile('Khoá 2FA + JWT (.tar.gz)', found.secrets);
		chosen.fromDir = true;
		return file;
	}
};

// File nguồn: .bak SQL Server (--bak=) hoặc dump PostgreSQL (--dump= / chọn bằng --import).
// DB trống mà chưa có thì hỏi 1 đường dẫn rồi tự nhận loại. Dump khi DB đã có dữ liệu
// = thay DB (hỏi xác nhận). Trả { type: 'bak' | 'dump', file, dump, replace } hoặc null.
const askSourceFile = async (s, chosen = {}) => {
	const picked = chosen.dump || '';
	let file = cleanPath(picked || DUMP_ARG || process.env.SETUP_DUMP_FILE);
	let type = file ? 'dump' : null;
	if (!file) {
		file = cleanPath(BAK_ARG || process.env.SETUP_BAK_FILE);
		if (file) type = 'bak';
	}
	if (!file && s.empty && INTERACTIVE) {
		if (await confirm('DB đang trống. Có dữ liệu của hệ thống cũ cần chuyển sang không?', false)) {
			file = await askOldDataFromDir(chosen);
			if (!file) info('Không chọn bản backup — dựng DB mới (trống).');
		} else info('Hệ thống mới — dựng DB trống.');
	}
	if (!file) return null;
	if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(`Không thấy file: ${file}`);
	const dump = detectDump(file);
	type ??= dump ? 'dump' : 'bak';
	if (type === 'dump' && !dump)
		fail(`${file} không phải bản backup PostgreSQL (pg_dump -Fc / -Ft / .sql, có thể nén .gz).`);
	if (!s.empty && type === 'bak')
		fail('DB PostgreSQL đã có dữ liệu — chuyển từ .bak cần DB trống. Xoá DB rồi chạy lại (bước 4 tạo lại DB trống), hoặc bỏ --bak.');
	if (!s.empty) {
		// Tự lấy từ thư mục import (không có --import / --dump): không thay DB khi không hỏi được,
		// từ chối thì chỉ bỏ bản backup, các bước khác vẫn chạy
		const auto = picked && !IMPORT_ON;
		if (!auto || INTERACTIVE)
			warn(`DB đang có dữ liệu — ${path.basename(file)} sẽ THAY toàn bộ (DB đang dùng được sao lưu vào ${path.join(IMPORT_DIR, 'sao-luu')} trước).`);
		if (auto && (!INTERACTIVE || !(await confirm('Thay DB?', false)))) {
			info(`Giữ DB đang có, không nạp ${path.basename(file)}${INTERACTIVE ? '' : ' (thay DB khi không hỏi được: thêm --import)'}.`);
			if (sourceCounted) {
				sourceCounted = false;
				TOTAL_STEPS--;
			}
			return null;
		}
		if (!auto && INTERACTIVE && !(await confirm('Thay DB?', false))) fail('Đã huỷ. Không có gì bị thay đổi.');
	}
	if (type === 'bak' && NATIVE) fail('Chuyển dữ liệu từ .bak cần Docker (SQL Server tạm) — chạy lại không có --native.');
	if (!sourceCounted) {
		sourceCounted = true;
		TOTAL_STEPS++;
	}
	return { type, file: path.resolve(file), dump, replace: !s.empty };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pgTool = (psql, name) => (psql === 'psql' ? name : path.join(path.dirname(psql), `${name}${IS_WIN ? '.exe' : ''}`));

// Thay DB đang có dữ liệu: sao lưu (pg_dump) → dừng backend → đổi tên DB sang
// <db>_truoc_import_<thời điểm> → tạo DB trống (01_tao_db_va_role.sql). Trả
// { rollback, dropOld }: lỗi thì rollback() bỏ DB mới + đổi tên DB cũ về; xong hết thì dropOld().
const setAsideDatabase = async () => {
	const env = readEnv();
	const database = getKey(env, 'DB_DATABASE') || 'rms_hospital';
	// Kiểm tra trước khi đụng vào DB: createDatabase chỉ tạo lại được rms_hospital + 2 role này
	if (database !== 'rms_hospital' || !DB_ROLES.includes(getKey(env, 'DB_USER')))
		fail(`Chỉ tự thay được DB rms_hospital với role ${DB_ROLES.join(' / ')} (backend/.env: ${describeDb(env)}).`);
	const { psql, pgEnv, conn } = await superConn(env);
	const sql = (db, c) => run(psql, [...conn, '-d', db, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', c], { env: pgEnv, capture: true });
	const d = new Date();
	const pad = (n) => String(n).padStart(2, '0');
	const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
	const old = `${database}_truoc_import_${stamp}`;
	const backupDir = path.join(IMPORT_DIR, 'sao-luu');
	const backup = path.join(backupDir, `${database}_${stamp}.dump`);

	const running = !NATIVE && compose(['ps', '-q', '--status', 'running', 'backend'], { capture: true }).out.trim() !== '';
	if (running) {
		info('Dừng backend (giữ kết nối DB) …');
		compose(['stop', 'backend'], { capture: true });
	}
	const restart = () => running && compose(['up', '-d', 'backend'], { capture: true });

	fs.mkdirSync(backupDir, { recursive: true });
	info(`Sao lưu DB đang dùng → ${backup}`);
	const b = run(pgTool(psql, 'pg_dump'), [...conn, '-d', database, '-Fc', '-f', backup], { env: pgEnv, capture: true });
	if (b.status !== 0) {
		restart();
		fail(`Sao lưu DB lỗi — không thay DB:\n${b.out.trim()}`);
	}
	ok(`Đã sao lưu (${fmtSize(fs.statSync(backup).size)})`);

	let renamed = false;
	for (let i = 0; i < 5 && !renamed; i++) {
		if (i) await sleep(2000);
		sql('postgres', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${database}' AND pid <> pg_backend_pid()`);
		renamed = sql('postgres', `ALTER DATABASE ${database} RENAME TO ${old}`).status === 0;
	}
	if (!renamed) {
		restart();
		fail(`Không đổi tên được DB ${database} (còn kết nối khác). Không có gì bị thay đổi.`);
	}
	const rollback = () => {
		warn(`Trả lại DB cũ (${old} → ${database})`);
		sql('postgres', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
		const r = sql('postgres', `ALTER DATABASE ${old} RENAME TO ${database}`);
		if (r.status !== 0) warn(`Không trả lại được — làm tay: ALTER DATABASE ${old} RENAME TO ${database};\n${r.out.trim()}`);
		restart();
	};
	try {
		await createDatabase(readEnv());
	} catch (err) {
		rollback();
		throw err;
	}
	return {
		rollback,
		dropOld: () => {
			const r = sql('postgres', `DROP DATABASE ${old} WITH (FORCE)`);
			if (r.status === 0) ok(`Đã bỏ DB cũ (còn bản sao lưu ${backup})`);
			else warn(`Không xoá được DB cũ ${old} — xoá tay khi không cần:\n${r.out.trim()}`);
		},
	};
};

// Nạp xong thì xoá file nguồn (dump chứa toàn bộ dữ liệu, secrets chứa khoá 2FA), trừ khi --keep-files
const removeImported = (files) => {
	for (const f of files) {
		if (!f || !fs.existsSync(f)) continue;
		if (KEEP_FILES) {
			info(`Giữ lại ${f} (--keep-files)`);
			continue;
		}
		fs.rmSync(f, { force: true });
		ok(`Đã xoá file đã nhập: ${f}`);
	}
};

// ── Bước 4b': khôi phục từ file dump PostgreSQL ────────────────────────
// Bằng superuser: rms_migrate không khôi phục được (COMMENT ON EXTENSION
// pg_stat_statements cần chủ extension). Giữ nguyên chủ sở hữu + quyền như DB gốc.
// --single-transaction: lỗi giữa chừng thì DB vẫn trống, chạy lại được.
// replace (DB đang có dữ liệu): setAsideDatabase trước; trả về đối tượng của nó để main
// trả lại DB cũ nếu các bước sau lỗi, hoặc bỏ DB cũ khi xong hết.
const restoreDump = async ({ file, dump, replace }) => {
	step(`${replace ? 'Thay' : 'Khôi phục'} DB từ file dump PostgreSQL (${dump.kind}${dump.gz ? ', nén gzip' : ''})`);
	const swap = replace ? await setAsideDatabase() : null;
	try {
		await restoreInto(file, dump);
	} catch (err) {
		swap?.rollback();
		throw err;
	}
	return swap;
};

const restoreInto = async (file, dump) => {
	const env = readEnv();
	const database = getKey(env, 'DB_DATABASE') || 'rms_hospital';
	const { psql, superuser, pgEnv, conn } = await superConn(env);
	const exe = (name) => pgTool(psql, name);
	let src = file;
	let tmpDir = null;
	try {
		if (dump.gz) {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-restore-'));
			src = path.join(tmpDir, `rms_hospital.${dump.kind}`);
			info(`Giải nén ra ${src} (xoá sau khi khôi phục)`);
			await pipeline(fs.createReadStream(file), zlib.createGunzip(), fs.createWriteStream(src));
		}
		info(`Khôi phục ${path.basename(file)} (${fmtSize(fs.statSync(file).size)}) vào ${database} bằng ${superuser} …`);
		const r =
			dump.kind === 'sql'
				? run(psql, [...conn, '-d', database, '-X', '-q', '-o', os.devNull, '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', src], { env: pgEnv })
				: run(exe('pg_restore'), [...conn, '-d', database, '--single-transaction', '--exit-on-error', src], { env: pgEnv });
		if (r.error) fail(`Không chạy được ${dump.kind === 'sql' ? 'psql' : 'pg_restore'}: ${r.error.message}`);
		if (r.status !== 0) fail('Khôi phục lỗi (xem log ở trên). Không có gì bị thay đổi (chạy trong 1 transaction) — sửa rồi chạy lại.');
		run(psql, [...conn, '-d', database, '-X', '-q', '-c', 'ANALYZE'], { env: pgEnv, capture: true });
		ok('Đã khôi phục DB từ file dump');
	} finally {
		if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
	}
};

const transferFromBak = async (file) => {
	step('Chuyển dữ liệu từ file .bak (SQL Server tạm trong Docker)');
	const env = readEnv();
	// load tạo bảng → cần rms_migrate (chủ DB)
	const pgUser = 'rms_migrate';
	const pgPass =
		getKey(env, 'DB_USER') === pgUser
			? getKey(env, 'DB_PASSWORD')
			: process.env.SETUP_MIGRATE_PASSWORD || (await askSecret(`Mật khẩu ${pgUser} (PostgreSQL)`));
	if (!pgPass) fail(`Thiếu mật khẩu ${pgUser} — đặt SETUP_MIGRATE_PASSWORD rồi chạy lại.`);
	if (run('docker', ['inspect', MSSQL_CONTAINER], { capture: true }).status === 0)
		fail(`Đã có container ${MSSQL_CONTAINER} (lần chạy trước) — xoá trước: docker rm -f -v ${MSSQL_CONTAINER}`);

	// Mạng Docker của project dev (tạo nếu chưa có) — SQL Server tạm chỉ nằm trong mạng này, không mở cổng
	if (compose(['up', '-d', 'redis'], { capture: true }).status !== 0) fail('Không dựng được mạng Docker của project.');
	const network = `${compose(['config', '--format', 'json'], { capture: true }).out.match(/"name":\s*"([^"]+)"/)?.[1] || 'hospital_rms_dev'}_default`;
	const composeEnv = fs.existsSync(COMPOSE_ENV) ? fs.readFileSync(COMPOSE_ENV, 'utf8') : '';
	const pgHost = getKey(composeEnv, 'DEV_DB_SERVER') || 'host.docker.internal';
	const image = process.env.MSSQL_IMAGE || 'mcr.microsoft.com/mssql/server:2025-latest';
	// sa phải đủ phức tạp; chỉ truyền qua biến môi trường (`-e TÊN` không kèm giá trị), không in ra
	const sa = `Rms#${crypto.randomBytes(16).toString('hex')}A`;
	const secrets = { MSSQL_SA_PASSWORD: sa, MSSQL_SOURCE_PASSWORD: sa, PG_TARGET_PASSWORD: pgPass };
	const sizeMb = Math.round(fs.statSync(file).size / 1048576);

	const transfer = (...args) =>
		compose(
			[
				'run', '--rm', '--no-deps', '-T',
				'-e', `MSSQL_SOURCE_HOST=${MSSQL_CONTAINER}`, '-e', 'MSSQL_SOURCE_PASSWORD',
				'-e', `PG_TARGET_HOST=${pgHost}`, '-e', `PG_TARGET_PORT=${getKey(env, 'DB_PORT') || 5432}`,
				'-e', `PG_TARGET_DATABASE=${getKey(env, 'DB_DATABASE') || 'rms_hospital'}`,
				'-e', `PG_TARGET_USER=${pgUser}`, '-e', 'PG_TARGET_PASSWORD',
				'backend', 'node', 'scripts/pg-transfer/index.js', ...args,
			],
			{ env: secrets },
		).status === 0;

	try {
		info(`Dựng SQL Server tạm (${image}) — lần đầu tải image khoảng 1,5 GB`);
		const started = run(
			'docker',
			[
				'run', '-d', '--name', MSSQL_CONTAINER, '--hostname', MSSQL_CONTAINER, '--network', network,
				'-e', 'ACCEPT_EULA=Y', '-e', `MSSQL_PID=${process.env.MSSQL_PID || 'Express'}`, '-e', 'MSSQL_SA_PASSWORD',
				'--label', 'rms.purpose=pg-transfer', image,
			],
			{ env: secrets, capture: true },
		);
		if (started.status !== 0) fail(`Không dựng được SQL Server tạm:\n${started.out.trim()}`);
		info(`Copy ${path.basename(file)} (${sizeMb} MB) vào container`);
		const dir = path.posix.dirname(BAK_IN_CONTAINER);
		const steps = [
			['exec', '-u', '0', MSSQL_CONTAINER, 'mkdir', '-p', dir],
			['cp', file, `${MSSQL_CONTAINER}:${BAK_IN_CONTAINER}`],
			// SQL Server chạy bằng user mssql (uid 10001) — phải đọc được file
			['exec', '-u', '0', MSSQL_CONTAINER, 'chown', '10001', BAK_IN_CONTAINER],
		];
		for (const args of steps) {
			const r = run('docker', args, { capture: true });
			if (r.status !== 0) fail(`docker ${args[0]} lỗi:\n${r.out.trim()}`);
		}
		info('Restore …');
		if (!transfer('restore', BAK_IN_CONTAINER)) fail('Restore file .bak lỗi (xem log ở trên).');
		info('Precheck (chỉ đọc) …');
		if (!transfer('precheck')) fail('Precheck báo lỗi chặn (xem log ở trên) — sửa dữ liệu nguồn rồi chạy lại.');
		info('Load → PostgreSQL …');
		if (!transfer('load'))
			fail('Load lỗi (xem log ở trên). DB PostgreSQL có thể đã có một phần dữ liệu: xoá DB rms_hospital rồi chạy lại.');
		info('Verify …');
		if (!transfer('verify')) fail('Verify thấy chênh lệch giữa SQL Server và PostgreSQL (xem log ở trên).');
		ok('Đã chuyển dữ liệu từ file .bak');
	} finally {
		run('docker', ['rm', '-f', '-v', MSSQL_CONTAINER], { capture: true });
		info('Đã xoá SQL Server tạm cùng bản sao file .bak');
	}
};

// ── Bước 7b: file upload + khoá bí mật của hệ thống cũ ─────────────────
const OLD_FILES = [
	{ kind: 'uploads', arg: UPLOADS_ARG, env: 'SETUP_UPLOADS_FILE', label: 'File upload cũ (uploads.tar.gz)' },
	{ kind: 'secrets', arg: SECRETS_ARG, env: 'SETUP_SECRETS_FILE', label: 'Khoá 2FA + JWT cũ (secrets.tar.gz)' },
];

// Trả [{ kind, file }] cần giải nén. Đường dẫn lấy từ tham số / biến môi trường / chọn
// bằng --import (chosen); vừa chuyển từ .bak / dump (askAll) mà chưa có thì hỏi, Enter = bỏ qua.
const askOldFiles = async (askAll, chosen = {}) => {
	const picked = [];
	let hinted = false;
	for (const { kind, arg, env, label } of OLD_FILES) {
		let file = cleanPath(chosen[kind] || arg || process.env[env]);
		if (!file && askAll && INTERACTIVE) {
			if (!hinted) info('File của hệ thống cũ (đóng gói theo mục C.6 tài liệu chuyển dữ liệu), Enter = bỏ qua:');
			hinted = true;
			for (let i = 0; i < 3; i++) {
				file = cleanPath(await ask(label));
				if (!file || (fs.existsSync(file) && fs.statSync(file).isFile())) break;
				warn(`Không thấy file ${file}`);
			}
		}
		if (!file) continue;
		if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(`Không thấy file ${kind}: ${file}`);
		picked.push({ kind, file: path.resolve(file) });
	}
	if (picked.length && NATIVE)
		fail('Chép file của hệ thống cũ cần Docker (giải nén trong container backend) — chạy lại không có --native.');
	if (picked.length && !oldFilesCounted) {
		oldFilesCounted = true;
		TOTAL_STEPS++;
	}
	return picked;
};

const importOldFiles = (picked) => {
	step('Chép file upload / khoá bí mật của hệ thống cũ');
	for (const { kind, file } of picked) {
		info(`${kind}: giải nén ${path.basename(file)} (${fmtSize(fs.statSync(file).size)})`);
		// Thư mục chứa file mount chỉ đọc; uploads → ./backend/uploads (bind), secrets → volume server_secrets
		const r = compose([
			'run', '--rm', '--no-deps', '-T', '-u', '0', '--entrypoint', 'sh',
			'-v', `${path.dirname(file)}:/import:ro`,
			'backend', 'scripts/import-old-files.sh', kind, `/import/${path.basename(file)}`,
		]);
		if (r.status !== 0) fail(`Giải nén ${path.basename(file)} lỗi (xem log ở trên).`);
		ok(`${kind}: xong`);
	}
	// Backend đang chạy thì khởi động lại để đọc khoá 2FA / JWT vừa chép
	const running = compose(['ps', '-q', '--status', 'running', 'backend'], { capture: true });
	if (picked.some((p) => p.kind === 'secrets') && running.status === 0 && running.out.trim()) {
		if (compose(['restart', 'backend']).status !== 0) fail('Khởi động lại backend lỗi.');
		ok('Đã khởi động lại backend');
	}
};

const initSystem = ({ replaceLegacy = false } = {}) => {
	step('Vai trò hệ thống + tài khoản Super Admin / Admin (init:system)');
	const args = [`--username=${SUPERADMIN}`, `--admin-username=${ADMIN}`];
	// Chỉ ngay sau khi chuyển từ .bak: thay tài khoản "admin" của hệ thống cũ
	if (replaceLegacy) args.push('--replace-legacy-admin');
	if (runBackend('scripts/init-system.js', args).status !== 0) fail('init:system lỗi (xem log ở trên).');
	info('Mật khẩu tạm (nếu vừa tạo) CHỈ in 1 lần ở trên — lưu lại trước khi đóng cửa sổ.');
};

const seedCatalogs = () => {
	step('Danh mục cơ bản: NCKH, đào tạo / CME, nhân sự (seed:catalogs)');
	if (runBackend('scripts/seed-catalogs.js').status !== 0) fail('seed:catalogs lỗi (xem log ở trên).');
};

// ── Bước 8: khởi động ───────────────────────────────────────────────────
const waitHttp = (url, timeoutMs) =>
	new Promise((resolve) => {
		const deadline = Date.now() + timeoutMs;
		const tick = () => {
			const req = http.get(url, { timeout: 2000 }, (res) => {
				res.resume();
				resolve(true);
			});
			const retry = () => {
				req.destroy();
				if (Date.now() > deadline) resolve(false);
				else setTimeout(tick, 2000);
			};
			req.on('error', retry);
			req.on('timeout', retry);
		};
		tick();
	});

const start = async () => {
	step('Khởi động');
	if (NATIVE) return info('Chạy app: npm run dev   (backend :3001, frontend :5173)');
	if (NO_START) return info('Bỏ qua (--no-start). Chạy app: docker compose up -d');
	if (compose(['up', '-d']).status !== 0) fail('docker compose up lỗi (xem log ở trên).');
	info('Chờ backend …');
	if (!(await waitHttp('http://localhost:3001/health', 180_000)))
		fail('Backend chưa trả /health sau 3 phút — xem: docker compose logs backend');
	ok('Backend  http://localhost:3001  (Swagger: /api-docs)');
	info('Chờ frontend (lần đầu Vite pre-bundle hơi lâu) …');
	if (await waitHttp('http://localhost:5173', 180_000)) ok('Frontend http://localhost:5173');
	else warn('Frontend chưa lên sau 3 phút — xem: docker compose logs frontend');
};

const main = async () => {
	console.log(`Hospital RMS — setup môi trường dev (${NATIVE ? 'native' : 'Docker'})`);
	// Chọn file trước khi làm gì khác: biết sớm số bước, người dùng chọn xong là đi
	// Thư mục import có file thì tự dùng (cài từ đầu bằng dữ liệu cũ không cần --import)
	const autoImport = !IMPORT_ON && hasImportFiles();
	const chosen = IMPORT_ON || autoImport ? await pickImportFiles() : {};
	checkTools();
	await prepareEnv();
	installDeps();
	let s = await ensureDatabase();
	const source = await askSourceFile(s, chosen);
	const oldFiles = await askOldFiles(!!source && !chosen.fromDir, chosen);
	let swap = null;
	if (source) {
		if (source.type === 'bak') await transferFromBak(source.file);
		else swap = await restoreDump(source);
		s = dbCheck();
	}
	try {
		migrate(s);
		// Chỉ ngay sau khi chuyển từ .bak SQL Server; dump PostgreSQL đã có tài khoản của hệ thống mới
		initSystem({ replaceLegacy: source?.type === 'bak' });
		seedCatalogs();
		if (oldFiles.length) importOldFiles(oldFiles);
		await start();
	} catch (err) {
		swap?.rollback(); // vừa thay DB mà các bước sau lỗi: trả lại DB cũ
		throw err;
	}
	swap?.dropOld();
	// .bak (SQL Server) giữ lại — chỉ xoá bản backup PostgreSQL và gói .tar.gz đã nạp
	removeImported([source?.type === 'dump' ? source.file : '', ...oldFiles.map((f) => f.file)]);
	console.log('\n\x1b[32mXong.\x1b[0m Chạy lại lệnh này bất cứ lúc nào — bước đã xong sẽ được bỏ qua.');
};

main().catch((err) => {
	console.error(`\n\x1b[31m✗ ${err instanceof SetupError ? err.message : err.stack}\x1b[0m`);
	process.exit(1);
});
