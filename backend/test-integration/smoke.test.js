// Smoke test tích hợp: gọi THẬT mọi API GET qua app Express + SQL Server + Redis
// đang cấu hình (.env / biến môi trường của container). Chỉ GET — không ghi dữ
// liệu nghiệp vụ, an toàn để chạy trên DB dev. Không chạy trên CI (cần DB thật).
//
//   docker exec hospital_rms_dev-backend-1 npm run test:smoke   (khuyên dùng)
//   npm run test:smoke                                          (backend chạy native)
//
// Kiểm tra cho từng route:
//   1. Không lỗi 5xx.
//   2. Route vẫn tồn tại (không rơi vào 404 "Route ... không tồn tại").
//   3. So với baseline (.baseline/get-shapes.json, chỉ nằm trên máy này): cùng mã
//      HTTP và cùng tập trường JSON — bắt được việc refactor làm đổi dạng response
//      mà frontend đang dùng. Lần chạy đầu (hoặc UPDATE_SNAPSHOTS=1) ghi baseline.
//      Nên ghi baseline TRƯỚC khi refactor, chạy lại SAU mỗi bước.
//
// Route có tham số (/topics/:id/...) lấy mã từ phần tử đầu của route danh sách
// tương ứng (/topics). Không lấy được mã thì bỏ qua (báo trong log).
//
// Tài khoản gọi API: SMOKE_USER_ID nếu đặt, không thì tự chọn tài khoản đang hoạt
// động có nhiều quyền nhất ĐÃ ở trạng thái 2FA rõ ràng — tránh để lần đầu nạp
// quyền của tài khoản quản trị chưa bật 2FA ghi users.twofa_required_since
// (bắt đầu đếm hạn bắt buộc 2FA của người thật). Token ký trực tiếp bằng
// JWT_SECRET, không qua đăng nhập, không tạo refresh token/phiên.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const app = require('../src/app');
const { getPool, sql } = require('../src/config/db');
const { signToken } = require('../src/utils/keys');
const { listRoutes } = require('../src/permissions/routeWalker');

const BASELINE = path.join(__dirname, '.baseline', 'get-shapes.json');
// SSE giữ kết nối mãi — không phải API trả lời 1 lần
const SKIP = new Set(['/api/v1/events/']);
const REQUEST_TIMEOUT_MS = 60_000;

// Query bắt buộc của vài route (thiếu thì chỉ thử được nhánh 400). /public/lookup
// cố ý để 400: tham số là CCCD + ngày sinh của người thật.
const monthStart = new Date().toISOString().slice(0, 8) + '01';
const weekEnd = new Date(Date.parse(monthStart) + 6 * 86400000).toISOString().slice(0, 10);
const QUERY = {
	'/api/v1/seminars/cme-compliance': `year=${new Date().getFullYear()}`,
	'/api/v1/courses/sessions/calendar': `from=${monthStart}&to=${weekEnd}`,
	'/api/v1/staff-attendance/roster': `from=${monthStart}&to=${weekEnd}`,
};

const stripSlash = (p) => (p.length > 1 ? p.replace(/\/$/, '') : p);
const keysOf = (v) =>
	v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort() : null;

// Mảng đầu tiên trong data (data là mảng, hoặc {data|items|rows: [...]})
const firstList = (data) => {
	if (Array.isArray(data)) return data;
	if (data && typeof data === 'object') {
		for (const v of Object.values(data)) if (Array.isArray(v)) return v;
	}
	return null;
};

// Dạng response để so sánh: tập key ở thân, ở data, và ở phần tử đầu của danh sách.
// Không so kiểu/giá trị (phụ thuộc dữ liệu); danh sách rỗng ghi null = "không biết".
const shapeOf = (body) => {
	if (!body || typeof body !== 'object') return { body: null };
	const list = firstList(body.data);
	return {
		body: keysOf(body),
		data: Array.isArray(body.data) ? 'array' : keysOf(body.data),
		item: list && list.length ? keysOf(list[0]) : null,
	};
};

const pickUser = async () => {
	const pool = await getPool();
	if (process.env.SMOKE_USER_ID) {
		const r = await pool
			.request()
			.input('id', sql.VarChar(20), process.env.SMOKE_USER_ID)
			.query('SELECT id, username, token_version FROM users WHERE id = @id');
		assert.ok(r.recordset[0], `SMOKE_USER_ID=${process.env.SMOKE_USER_ID} không tồn tại`);
		return r.recordset;
	}
	const r = await pool.request().query(`
		SELECT TOP 10 u.id, u.username, u.token_version
		FROM users u
		INNER JOIN roles r ON r.id = u.role_id
		WHERE u.is_active = 1
		  AND u.must_change_password = 0
		  AND (u.account_expires_at IS NULL OR u.account_expires_at >= CAST(GETDATE() AS date))
		  AND (u.totp_enabled = 1 OR u.twofa_required_since IS NOT NULL)
		ORDER BY r.is_superuser DESC,
		         (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id) DESC`);
	return r.recordset;
};

test('smoke: mọi API GET trả lời không lỗi và giữ nguyên dạng response', async (t) => {
	const server = app.listen(0, '127.0.0.1');
	await new Promise((resolve) => server.once('listening', resolve));
	t.after(() => server.close());
	const base = `http://127.0.0.1:${server.address().port}`;

	let headers;
	const call = async (urlPath) => {
		const res = await fetch(base + urlPath, {
			headers,
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		const isJson = (res.headers.get('content-type') || '').includes('application/json');
		const body = isJson ? await res.json() : (await res.arrayBuffer(), null);
		return { status: res.status, isJson, body };
	};

	// Chọn tài khoản đầu tiên thực sự gọi được API (không bị chặn 2FA / đổi mật khẩu)
	const candidates = await pickUser();
	let user;
	for (const u of candidates) {
		const token = signToken(
			'access',
			{ id: u.id, username: u.username, tv: u.token_version ?? 0 },
			'15m',
		);
		headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
		if ((await call('/api/v1/users/me')).status === 200) {
			user = u;
			break;
		}
	}
	assert.ok(
		user,
		'Không tìm được tài khoản gọi được API. Đặt SMOKE_USER_ID=<mã tài khoản quản trị đã bật 2FA>.',
	);
	t.diagnostic(`Gọi API bằng tài khoản ${user.username} (${user.id})`);

	const baseline =
		process.env.UPDATE_SNAPSHOTS !== '1' && fs.existsSync(BASELINE)
			? JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
			: null;
	t.diagnostic(
		baseline ? 'So sánh với baseline đã ghi' : 'Chưa có baseline — lần này sẽ ghi baseline',
	);

	const gets = listRoutes(app)
		.filter((r) => r.method === 'GET' && !SKIP.has(r.path))
		.map((r) => r.path);
	const listBodies = new Map(); // path danh sách (không có "/" cuối) → body
	const results = {};
	const skipped = [];

	// Route không tham số trước — làm nguồn mã cho route có tham số
	const ordered = [...gets.filter((p) => !p.includes(':')), ...gets.filter((p) => p.includes(':'))];
	for (const route of ordered) {
		let urlPath = route;
		const params = route.match(/:\w+/g) || [];
		if (params.length) {
			const listPath = stripSlash(route.slice(0, route.indexOf('/:')));
			const list = firstList(listBodies.get(listPath)?.data);
			const name = params[0].slice(1);
			const id = list?.[0]?.[name] ?? list?.[0]?.id;
			if (params.length > 1 || id === undefined || id === null) {
				skipped.push(route);
				continue;
			}
			urlPath = route.replace(params[0], encodeURIComponent(String(id)));
		}

		await t.test(`GET ${route}`, async () => {
			const res = await call(QUERY[route] ? `${urlPath}?${QUERY[route]}` : urlPath);
			if (res.isJson && !params.length) listBodies.set(stripSlash(route), res.body);
			const shape = {
				status: res.status,
				...(res.isJson ? shapeOf(res.body) : { body: 'non-json' }),
			};
			results[route] = shape;

			assert.ok(res.status < 500, `${urlPath} → ${res.status}: ${res.body?.message ?? ''}`);
			assert.ok(
				!(res.status === 404 && /không tồn tại$/.test(res.body?.message ?? '')),
				`${urlPath} → route không còn tồn tại`,
			);

			const before = baseline?.[route];
			if (!before) return;
			assert.equal(shape.status, before.status, `${urlPath}: mã HTTP đổi`);
			for (const k of ['body', 'data', 'item']) {
				// null/không có ở 1 trong 2 phía = không đủ dữ liệu để so (vd danh sách rỗng)
				if (before[k] == null || shape[k] == null) continue;
				assert.deepEqual(shape[k], before[k], `${urlPath}: tập trường "${k}" đổi`);
			}
		});
	}

	t.diagnostic(
		`Đã gọi ${Object.keys(results).length} route, bỏ qua ${skipped.length} (không lấy được mã)`,
	);
	if (skipped.length) t.diagnostic(`Bỏ qua: ${skipped.join(', ')}`);

	if (!baseline) {
		fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
		fs.writeFileSync(BASELINE, JSON.stringify(results, null, '\t') + '\n');
		t.diagnostic(`Đã ghi baseline: ${path.relative(process.cwd(), BASELINE)}`);
	}
});
