#!/usr/bin/env node
// Dựng môi trường DEV bằng 1 lệnh (Windows / macOS / Linux, chỉ cần Node ≥ 20):
//
//   npm run setup:dev                    # backend + frontend chạy trong Docker (mặc định)
//   npm run setup:dev -- --native        # không Docker: npm install 3 chỗ, chạy bằng `npm run dev`
//   npm run setup:dev -- --no-start      # làm hết, chỉ không khởi động app
//   npm run setup:dev -- --db            # nhập lại tài khoản PostgreSQL dù .env đã có
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
//   5. Dựng schema: `migrate init` (DB trống → baseline + mọi migration; DB đã có →
//      chỉ chạy file mới). DB có bảng nhưng chưa có schema_migrations → dừng, không đoán.
//   6. `init:system`: tạo vai trò hệ thống còn thiếu (theo mã) và 2 tài khoản, in mật
//      khẩu tạm 1 lần:
//        superadmin — vai trò Super Admin, toàn quyền
//        admin      — vai trò Admin: chỉ NCKH, đào tạo / CME, người dùng
//      Vai trò đã có thì giữ nguyên quyền; vai trò đã có người dùng thì không tạo thêm.
//   7. `seed:catalogs`: danh mục NCKH, đào tạo / CME, nhân sự — chỉ nạp bảng còn trống.
//   8. docker compose up -d, chờ http://localhost:3001/health và :5173.
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
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const readline = require('readline');
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
const SUPERADMIN = opt('superadmin', 'superadmin');
const ADMIN = opt('admin', 'admin');
const INTERACTIVE = !flag('yes') && !argv.includes('-y') && process.stdin.isTTY;
const IS_WIN = process.platform === 'win32';

// ── In ra màn hình ──────────────────────────────────────────────────────
const TOTAL_STEPS = 8;
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

const createDatabase = async (env) => {
	const user = getKey(env, 'DB_USER');
	const database = getKey(env, 'DB_DATABASE') || 'rms_hospital';
	if (database !== 'rms_hospital')
		fail(`infra/postgresql/01_tao_db_va_role.sql chỉ tạo DB rms_hospital (backend/.env đang là ${database}). Tạo DB bằng tay.`);
	if (!DB_ROLES.includes(user))
		fail(`Chỉ tự tạo được role ${DB_ROLES.join(' / ')} (backend/.env đang dùng ${user}). Tạo role bằng tay.`);

	const psql = findPsql();
	if (!psql)
		fail('Không tìm thấy psql. Thêm thư mục bin của PostgreSQL vào PATH, hoặc đặt SETUP_PSQL=<đường dẫn psql>.');
	const server = getKey(env, 'DB_SERVER') || 'localhost';
	const host = ['localhost', 'host.docker.internal', '127.0.0.1'].includes(server) ? '127.0.0.1' : server;
	const port = getKey(env, 'DB_PORT') || '5432';
	const superuser = process.env.SETUP_PG_SUPERUSER || 'postgres';
	const superpass = process.env.SETUP_PG_SUPERPASS ?? (await askSecret(`Mật khẩu superuser ${superuser} (Enter = đọc pgpass)`));
	const pgEnv = { ...(superpass ? { PGPASSWORD: superpass } : {}), PGCONNECT_TIMEOUT: '10' };
	const base = ['-h', host, '-p', port, '-U', superuser, '-v', 'ON_ERROR_STOP=1', '-w'];

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

const initSystem = () => {
	step('Vai trò hệ thống + tài khoản Super Admin / Admin (init:system)');
	const args = [`--username=${SUPERADMIN}`, `--admin-username=${ADMIN}`];
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
	checkTools();
	await prepareEnv();
	installDeps();
	const s = await ensureDatabase();
	migrate(s);
	initSystem();
	seedCatalogs();
	await start();
	console.log('\n\x1b[32mXong.\x1b[0m Chạy lại lệnh này bất cứ lúc nào — bước đã xong sẽ được bỏ qua.');
};

main().catch((err) => {
	console.error(`\n\x1b[31m✗ ${err instanceof SetupError ? err.message : err.stack}\x1b[0m`);
	process.exit(1);
});
