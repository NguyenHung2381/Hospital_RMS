// GET /seminars/cme-cycle-compliance (tiến độ 120 giờ / 05 năm liên tục) và khối `cycle`
// của CME của tôi. Chạy router + authorizePermission + validate + service thật trên CSDL giả:
// kiểm tra quyền, tham số, số câu SQL (không N+1), cách xếp / lọc / phân trang / tổng hợp.
// Câu SQL tổng hợp giờ tín chỉ được mô phỏng lại bằng JS (không có PostgreSQL ở đây).
process.env.JWT_SECRET = 'test-secret';
require('../../scripts/lib/static-check-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const ROLES = {
	RCME: [{ resource: 'seminars', action: 'cme_manage', scope: 'all' }],
	RREAD: [{ resource: 'seminars', action: 'read', scope: 'all' }],
};
const USERS = { UCME: 'RCME', UREAD: 'RREAD' };

// Cài đặt hệ thống đang lưu ở CSDL (systemSettingService cache 15 giây)
const SETTINGS = [
	{ setting_key: 'CME_CYCLE_YEARS', value: '5' },
	{ setting_key: 'CME_MIN_HOURS', value: '120' },
];

// Nhân sự: NV1 cấp 2019-03-15; NV2 có hồ sơ nhưng chưa có ngày cấp; NV3 không có giấy phép;
// NV4 / NV5 cấp 2021-12-25 / 2022-06-01.
const PEOPLE = [
	{
		id: 'NV1',
		full_name: 'An',
		staff_number: 101,
		department_id: 'K1',
		department_name: 'Khoa Nội',
		license_no: '001/BYT',
		license_issued_date: new Date(Date.UTC(2019, 2, 15)),
		has_license: true,
	},
	{
		id: 'NV2',
		full_name: 'Bình',
		staff_number: 102,
		department_id: 'K1',
		department_name: 'Khoa Nội',
		license_no: '002/BYT',
		license_issued_date: null,
		has_license: true,
	},
	{
		id: 'NV3',
		full_name: 'Chi',
		staff_number: 103,
		department_id: 'K2',
		department_name: 'Khoa Ngoại',
		license_no: null,
		license_issued_date: null,
		has_license: false,
	},
	{
		id: 'NV4',
		full_name: 'Dũng',
		staff_number: 104,
		department_id: 'K2',
		department_name: 'Khoa Ngoại',
		license_no: '004/BYT',
		license_issued_date: new Date(Date.UTC(2021, 11, 25)),
		has_license: true,
	},
	{
		id: 'NV5',
		full_name: 'Em',
		staff_number: 105,
		department_id: 'K2',
		department_name: 'Khoa Ngoại',
		license_no: '005/BYT',
		license_issued_date: new Date(Date.UTC(2022, 5, 1)),
		has_license: true,
	},
];

// Nguồn tín chỉ (gộp cme_records đã duyệt + seminar_participants đã cấp, như UNION ALL trong SQL)
const SOURCES = [
	{ user_id: 'NV1', credits: 50, activity_date: '2024-05-01', yr: 2024 },
	{ user_id: 'NV1', credits: 30, activity_date: '2025-02-10', yr: 2025 }, // seminar đã cấp
	{ user_id: 'NV1', credits: 10, activity_date: null, yr: 2026 }, // không có ngày → theo năm
	{ user_id: 'NV1', credits: 40, activity_date: '2024-03-14', yr: 2024 }, // trước chu kỳ 1 ngày
	{ user_id: 'NV1', credits: 99, activity_date: null, yr: 2023 }, // không ngày, năm trước chu kỳ
	{ user_id: 'NV2', credits: 125, activity_date: '2022-01-01', yr: 2022 },
	{ user_id: 'NV5', credits: 20, activity_date: '2023-01-01', yr: 2023 },
];
const inRange = (x, c) =>
	x.user_id === c.id &&
	(x.activity_date
		? x.activity_date >= c.s && x.activity_date <= c.e
		: x.yr >= c.ys && x.yr <= c.ye);

const log = install(async (text, inputs) => {
	if (/token_version, must_change_password/.test(text)) {
		const role = USERS[inputs.id];
		if (!role) return [];
		return [
			{
				is_active: true,
				role_id: role,
				department_id: 'K1',
				account_expires_at: null,
				token_version: 0,
				must_change_password: false,
				temp_password_issued_at: null,
				totp_enabled: false,
				twofa_required_since: null,
			},
		];
	}
	if (/FROM permissions p\s+INNER JOIN role_permissions/.test(text))
		return ROLES[inputs.role_id] || [];
	if (/FROM system_settings/.test(text)) return SETTINGS;
	if (/JOIN staff_practice_licenses sl/.test(text)) {
		const licensedOnly = /sl\.id IS NOT NULL/.test(text);
		const single = /u\.id = @user_id/.test(text);
		return PEOPLE.filter(
			(p) =>
				(!single || p.id === inputs.user_id) &&
				(!licensedOnly || p.has_license) &&
				(!inputs.department_id || p.department_id === inputs.department_id) &&
				(!inputs.search ||
					p.full_name.toLowerCase().includes(inputs.search.replace(/%/g, '').toLowerCase())),
		);
	}
	if (/jsonb_to_recordset/.test(text)) {
		const cycles = JSON.parse(inputs.cycles);
		return cycles
			.map((c) => {
				const mine = SOURCES.filter((x) => inRange(x, c));
				if (!mine.length) return null;
				return {
					id: c.id,
					earned: mine.reduce((t, x) => t + x.credits, 0),
					undated: mine.filter((x) => !x.activity_date).reduce((t, x) => t + x.credits, 0),
				};
			})
			.filter(Boolean);
	}
	return [];
});

const { signToken } = require('../../src/utils/keys');
const app = require('../../src/app');
const systemSettingService = require('../../src/modules/settings/systemSettingService');
const cmeCycleService = require('../../src/modules/cme/cmeCycleService');
const { computeCycle, evaluateCycle } = require('../../src/modules/cme/cmeCycle');
const { todayKeyVN } = require('../../src/utils/vnDate');

let srv;
let base;
test.before(async () => {
	srv = app.listen(0, '127.0.0.1');
	await new Promise((r) => srv.once('listening', r));
	base = `http://127.0.0.1:${srv.address().port}/api/v1`;
});
test.after(() => srv.close());

const get = async (who, path) => {
	const n = log.length;
	const res = await fetch(base + path, {
		headers: { authorization: `Bearer ${signToken('access', { id: who, tv: 0 }, '1h')}` },
	});
	return { status: res.status, body: await res.json(), entries: log.slice(n) };
};
const sqlOf = (entries, re) => entries.filter((e) => re.test(e.text));

const TODAY = '2026-11-20';
const daysTo = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 10, 20)) / 86400000);

test('quyền: cần seminars:cme_manage — có quyền khác (seminars:read) → 403, chưa đăng nhập → 401', async () => {
	assert.equal((await get('UREAD', '/seminars/cme-cycle-compliance')).status, 403);
	const anon = await fetch(`${base}/seminars/cme-cycle-compliance`);
	assert.equal(anon.status, 401);
});

test('route cố định không bị /:id nuốt: người có quyền nhận báo cáo, không phải chi tiết hội thảo', async () => {
	const r = await get('UCME', '/seminars/cme-cycle-compliance');
	assert.equal(r.status, 200);
	assert.equal(r.body.success, true);
	assert.ok(Array.isArray(r.body.data.data));
	assert.ok(r.body.data.pagination && r.body.data.summary && r.body.data.meta);
});

test('tham số sai → 400, không chạm CSDL', async () => {
	for (const q of [
		'scope=abc',
		'status=met,xyz',
		'page=0',
		'page=abc',
		'limit=-1',
		'limit=5000',
		'sort=random',
		`search=${'x'.repeat(101)}`,
	]) {
		const r = await get('UCME', `/seminars/cme-cycle-compliance?${q}`);
		assert.equal(r.status, 400, q);
		assert.equal(r.body.success, false);
		assert.equal(sqlOf(r.entries, /staff_practice_licenses/).length, 0, q);
	}
});

test('tham số để trống (?search=&status=&page=) coi như không gửi', async () => {
	const r = await get('UCME', '/seminars/cme-cycle-compliance?search=&status=&page=&limit=&scope=');
	assert.equal(r.status, 200);
	assert.equal(r.body.data.pagination.page, 1);
	assert.equal(r.body.data.pagination.limit, 20);
});

test('đúng 2 câu SQL cho cả báo cáo (không N+1): nhân sự + tổng hợp giờ', async () => {
	const r = await get('UCME', '/seminars/cme-cycle-compliance?scope=all');
	assert.equal(r.status, 200);
	assert.equal(r.body.data.data.length, 5);
	assert.equal(sqlOf(r.entries, /JOIN staff_practice_licenses sl/).length, 1);
	assert.equal(sqlOf(r.entries, /jsonb_to_recordset/).length, 1);
	// mặc định bỏ tài khoản khoa/phòng dùng chung
	const people = sqlOf(r.entries, /JOIN staff_practice_licenses sl/)[0].text;
	assert.match(people, /NOT \(\(u\.id LIKE 'NV%0000'\)/);
	assert.match(people, /u\.is_active = 'true'/);
});

test('báo cáo cố định ngày 2026-11-20: chu kỳ theo giấy phép / năm lịch, giờ tích lũy, trạng thái, thứ tự', async () => {
	const report = await cmeCycleService.getCycleReport({ scope: 'all' }, { today: TODAY });
	const rows = Object.fromEntries(report.data.map((r) => [r.id, r]));

	// NV1: cấp 2019-03-15 → 2024-03-15..2029-03-14; 50 + 30 + 10 (không ngày, năm 2026) = 90
	assert.deepEqual(rows.NV1, {
		id: 'NV1',
		full_name: 'An',
		staff_number: 101,
		department_id: 'K1',
		department_name: 'Khoa Nội',
		license_no: '001/BYT',
		cycle_start: '2024-03-15',
		cycle_end: '2029-03-14',
		basis: 'license',
		required: 120,
		earned: 90,
		earned_undated: 10,
		missing: 30,
		days_left: daysTo(2029, 3, 14),
		status: 'on_track',
	});
	// NV2: có hồ sơ nhưng chưa có ngày cấp → 5 năm lịch 2022–2026, 125 giờ → đủ
	assert.equal(rows.NV2.basis, 'calendar');
	assert.equal(rows.NV2.cycle_start, '2022-01-01');
	assert.equal(rows.NV2.cycle_end, '2026-12-31');
	assert.equal(rows.NV2.earned, 125);
	assert.equal(rows.NV2.missing, 0);
	assert.equal(rows.NV2.status, 'met');
	// NV3: không giấy phép (scope=all) → năm lịch, 0 giờ; hạn năm lịch không phải hạn gia hạn
	// thật nên chỉ là 'at_risk' dù còn 41 ngày tới hết năm
	assert.equal(rows.NV3.license_no, null);
	assert.equal(rows.NV3.earned, 0);
	assert.equal(rows.NV3.missing, 120);
	assert.equal(rows.NV3.days_left, 41);
	assert.equal(rows.NV3.status, 'at_risk');
	// NV4: 2021-12-25..2026-12-24, còn 34 ngày, thiếu → tới hạn hồ sơ gia hạn
	assert.equal(rows.NV4.cycle_end, '2026-12-24');
	assert.equal(rows.NV4.days_left, 34);
	assert.equal(rows.NV4.status, 'overdue_window');
	// NV5: 2022-06-01..2027-05-31, còn 192 ngày (< 12 tháng), 20 giờ → có nguy cơ
	assert.equal(rows.NV5.cycle_end, '2027-05-31');
	assert.equal(rows.NV5.earned, 20);
	assert.equal(rows.NV5.status, 'at_risk');

	// xếp theo mức khẩn rồi số ngày còn lại: NV4 (34) → NV3 (41) → NV5 → NV1 → NV2
	assert.deepEqual(
		report.data.map((r) => r.id),
		['NV4', 'NV3', 'NV5', 'NV1', 'NV2'],
	);
	assert.deepEqual(report.summary, {
		total: 5,
		met: 1,
		on_track: 1,
		at_risk: 2,
		overdue_window: 1,
	});
	assert.deepEqual(report.meta, {
		today: TODAY,
		cycle_years: 5,
		required_hours: 120,
		renewal_window_days: 60,
		at_risk_months: 12,
	});
});

test('scope mặc định = licensed: chỉ người có hồ sơ giấy phép hành nghề', async () => {
	const report = await cmeCycleService.getCycleReport({}, { today: TODAY });
	assert.deepEqual(report.data.map((r) => r.id).sort(), ['NV1', 'NV2', 'NV4', 'NV5']);
	assert.equal(report.summary.total, 4);
});

test('lọc theo khoa, trạng thái (nhiều giá trị), tìm tên; summary không bị lọc status thu hẹp', async () => {
	const dept = await cmeCycleService.getCycleReport(
		{ scope: 'all', department_id: 'K2' },
		{ today: TODAY },
	);
	assert.deepEqual(dept.data.map((r) => r.id).sort(), ['NV3', 'NV4', 'NV5']);

	const status = await cmeCycleService.getCycleReport(
		{ scope: 'all', status: ['at_risk', 'overdue_window'] },
		{ today: TODAY },
	);
	assert.deepEqual(
		status.data.map((r) => r.id),
		['NV4', 'NV3', 'NV5'],
	);
	assert.equal(status.pagination.total, 3);
	assert.equal(status.summary.total, 5); // tổng hợp trước khi lọc status

	const search = await cmeCycleService.getCycleReport(
		{ scope: 'all', search: 'bình' },
		{ today: TODAY },
	);
	assert.deepEqual(
		search.data.map((r) => r.id),
		['NV2'],
	);
});

test('phân trang và sort=name; limit=0 lấy tất cả', async () => {
	const p1 = await cmeCycleService.getCycleReport(
		{ scope: 'all', page: 1, limit: 2, sort: 'name' },
		{ today: TODAY },
	);
	assert.deepEqual(
		p1.data.map((r) => r.id),
		['NV3', 'NV4'],
	);
	assert.deepEqual(p1.pagination, { page: 1, limit: 2, total: 5 });
	const p3 = await cmeCycleService.getCycleReport(
		{ scope: 'all', page: 3, limit: 2, sort: 'name' },
		{ today: TODAY },
	);
	assert.equal(p3.data.length, 1);
	const all = await cmeCycleService.getCycleReport({ scope: 'all', limit: 0 }, { today: TODAY });
	assert.equal(all.data.length, 5);
	assert.equal(all.pagination.limit, 0);
});

test('CME_CYCLE_YEARS / CME_MIN_HOURS lấy từ cài đặt hệ thống; thiếu hoặc sai → 5 năm, 120 giờ', async () => {
	const real = systemSettingService.getValue;
	try {
		systemSettingService.getValue = async (key) =>
			({ CME_CYCLE_YEARS: '3', CME_MIN_HOURS: '60' })[key];
		const r = await cmeCycleService.getCycleReport({ scope: 'all' }, { today: TODAY });
		const nv1 = r.data.find((x) => x.id === 'NV1');
		assert.equal(nv1.cycle_start, '2025-03-15'); // N = 3
		assert.equal(nv1.cycle_end, '2028-03-14');
		assert.equal(nv1.required, 60);
		assert.equal(r.meta.cycle_years, 3);
		assert.equal(r.meta.required_hours, 60);

		systemSettingService.getValue = async (key) =>
			({ CME_CYCLE_YEARS: 'abc', CME_MIN_HOURS: '-4' })[key];
		assert.deepEqual(await cmeCycleService.getCycleSettings(), {
			cycleYears: 5,
			requiredHours: 120,
		});
		systemSettingService.getValue = async (_key, fallback) => fallback;
		assert.deepEqual(await cmeCycleService.getCycleSettings(), {
			cycleYears: 5,
			requiredHours: 120,
		});
	} finally {
		systemSettingService.getValue = real;
	}
});

test('giá trị qua route khớp hàm thuần ở ngày hiện tại (không phụ thuộc ngày chạy test)', async () => {
	const r = await get('UCME', '/seminars/cme-cycle-compliance?scope=all&limit=0&sort=name');
	assert.equal(r.status, 200);
	const today = todayKeyVN();
	assert.equal(r.body.data.meta.today, today);
	const nv1 = r.body.data.data.find((x) => x.id === 'NV1');
	assert.equal(nv1.cycle_start, computeCycle({ issuedDate: '2019-03-15', today }).cycle_start);
	assert.equal(typeof nv1.earned, 'number');
	assert.equal(typeof nv1.days_left, 'number');
	assert.ok(['met', 'on_track', 'at_risk', 'overdue_window'].includes(nv1.status));
	// chuỗi ngày dạng YYYY-MM-DD
	assert.match(nv1.cycle_start, /^\d{4}-\d{2}-\d{2}$/);
	assert.match(nv1.cycle_end, /^\d{4}-\d{2}-\d{2}$/);
	assert.equal(
		nv1.status,
		evaluateCycle({
			issuedDate: '2019-03-15',
			today,
			requiredHours: 120,
			earned: nv1.earned,
		}).status,
	);
});

test('getUserCycle (cổng cá nhân): khối cycle của chính người dùng, 2 câu SQL', async () => {
	const n = log.length;
	const c = await cmeCycleService.getUserCycle('NV1', { today: TODAY });
	assert.deepEqual(c, {
		cycle_start: '2024-03-15',
		cycle_end: '2029-03-14',
		basis: 'license',
		cycle_years: 5,
		license_no: '001/BYT',
		required: 120,
		earned: 90,
		earned_undated: 10,
		missing: 30,
		days_left: daysTo(2029, 3, 14),
		status: 'on_track',
	});
	const entries = log.slice(n);
	assert.equal(sqlOf(entries, /JOIN staff_practice_licenses sl/).length, 1);
	assert.equal(sqlOf(entries, /jsonb_to_recordset/).length, 1);

	// tài khoản không có hồ sơ giấy phép vẫn có cycle theo năm lịch
	const cal = await cmeCycleService.getUserCycle('NV3', { today: TODAY });
	assert.equal(cal.basis, 'calendar');
	assert.equal(cal.license_no, null);
	assert.equal(cal.status, 'at_risk');
	// không tồn tại → null
	assert.equal(await cmeCycleService.getUserCycle('NOPE', { today: TODAY }), null);
});

test('getMyCme: giữ nguyên các trường cũ và chỉ thêm cycle; lỗi tính chu kỳ không làm hỏng trang', async () => {
	const portalService = require('../../src/modules/portal/portalService');
	const out = await portalService.getMyCme({ id: 'NV1' }, 2026);
	assert.deepEqual(Object.keys(out), [
		'year',
		'required_credits',
		'earned_credits',
		'seminars',
		'records',
		'cycle',
	]);
	assert.equal(out.year, 2026);
	assert.equal(out.cycle.basis, 'license');
	assert.equal(out.cycle.required, 120);
	assert.equal(out.cycle.cycle_start.length, 10);

	// CSDL lỗi ở phần chu kỳ → cycle = null, các trường cũ vẫn trả
	const failing = await portalService.getMyCme({ id: 'NV_LOI' }, 2026);
	assert.equal(failing.cycle, null);
	assert.equal(failing.year, 2026);
	assert.deepEqual(failing.seminars, []);
});
