// Thống kê dashboard (dashboardService + dashboardSeminarStats) với CSDL giả: gộp
// số liệu theo trạng thái / khoa / loại bài / năm, điền đủ 12 tháng, tỷ lệ lấp đầy
// lớp, cache theo năm. npm test trỏ Redis vào cổng chết ⇒ cache chỉ còn tầng RAM.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');
const db = require('../../src/config/db');

// Mỗi lời gọi queryAll lấy kết quả từ `next` (mảng các recordset theo thứ tự câu SQL)
let next = [];
let calls = 0;
const log = install(async () => []);
db.queryAll = async (req, statements) => {
	calls++;
	await req.query(statements.join(';\n')); // ghi tham số vào log
	assert.equal(next.length, statements.length, 'số tập kết quả giả khớp số câu SQL');
	return next;
};

const svc = require('../../src/modules/dashboard/dashboardService');

const lastInputs = () => log.at(-1).inputs;

const STATS_SETS = () => [
	// 0 theo trạng thái (có cả trạng thái lạ)
	[
		{ status: 'approved', cnt: 3 },
		{ status: 'submitted', cnt: 2 },
		{ status: 'draft', cnt: 1 },
	],
	// 1 theo khoa × loại bài × trạng thái × phân loại
	[
		{
			dept_name: 'Khoa A',
			specialty_group: 'Nội',
			article_type: 'de_tai',
			status: 'approved',
			category_name: 'LS',
			cnt: 2,
		},
		{
			dept_name: 'Khoa A',
			specialty_group: 'Nội',
			article_type: 'bai_bao',
			status: 'submitted',
			category_name: 'LS',
			cnt: 1,
		},
		{
			dept_name: 'Khoa B',
			specialty_group: 'Ngoại',
			article_type: null,
			status: 'weird',
			category_name: 'CB',
			cnt: 5,
		},
	],
	// 2 theo loại bài
	[
		{ article_type: 'bai_bao', cnt: 1 },
		{ article_type: null, cnt: 7 },
	],
	[{ name: null, cnt: 2 }], // 3 theo phân loại
	[{ name: 'Cơ sở', cnt: 4 }], // 4 theo cấp độ
	// 5 xu hướng theo năm (không theo thứ tự)
	[
		{ year: '2026', category_name: 'LS', cnt: 1 },
		{ year: '2025', category_name: 'CB', cnt: 2 },
		{ year: '2026', category_name: 'CB', cnt: 3 },
	],
	[], // 6 phê duyệt gần đây
	[], // 7 tiến độ hội đồng tổng (không có dòng)
	[{ rating: 'good', cnt: 2 }], // 8
	[{ dept_name: 'Khoa A', expected: 4 }], // 9
	[{ dept_name: 'Khoa A', completed: 1 }], // 10
	[{ topics_this_year: 3, rounds_active: 1, councils_total: 2, councils_upcoming: 0 }], // 11
];

test('getStats: gộp theo trạng thái — tổng gồm cả trạng thái lạ, trạng thái thiếu = 0', async () => {
	next = STATS_SETS();
	const s = await svc.getStats(2001);
	assert.equal(s.overview.total, 6);
	assert.deepEqual(s.overview.by_status, {
		submitted: 2,
		approved: 3,
		rejected: 0,
		supplement: 0,
		cancelled: 0,
		draft: 1,
	});
	assert.deepEqual(s.summary, STATS_SETS()[11][0]);
});

test('getStats: theo khoa — xếp theo tổng giảm dần, tỷ lệ duyệt, tiến độ hội đồng theo khoa', async () => {
	next = STATS_SETS();
	const [b, a] = (await svc.getStats(2002)).by_department;
	assert.equal(b.name, 'Khoa B');
	assert.equal(b.total, 5);
	assert.equal(b.de_tai, 5, 'article_type rỗng ⇒ tính là đề tài');
	assert.equal(b.approval_rate, 0);
	assert.ok(!('weird' in b.by_status), 'trạng thái lạ không thêm cột');
	assert.deepEqual(b.council_progress, { expected: 0, completed: 0 });

	assert.equal(a.name, 'Khoa A');
	assert.deepEqual([a.total, a.de_tai, a.bai_bao, a.approved], [3, 2, 1, 2]);
	assert.equal(a.approval_rate, 2 / 3);
	assert.equal(a.by_status.submitted, 1);
	assert.deepEqual(a.categories, [{ name: 'LS', count: 3 }]);
	assert.deepEqual(a.council_progress, { expected: 4, completed: 1 });
});

test('getStats: loại bài, phân loại không tên, xu hướng theo năm, tiến độ hội đồng rỗng', async () => {
	next = STATS_SETS();
	const s = await svc.getStats(2003);
	assert.deepEqual(s.by_article_type, [
		{ type: 'bai_bao', count: 1 },
		{ type: 'de_tai', count: 7 },
	]);
	assert.deepEqual(s.by_category, [{ name: 'Chưa xác định', count: 2 }]);
	assert.deepEqual(s.by_level, [{ name: 'Cơ sở', count: 4 }]);
	assert.deepEqual(s.trend_by_category, {
		rows: [
			{ year: '2025', CB: 2 },
			{ year: '2026', LS: 1, CB: 3 },
		],
		categories: ['LS', 'CB'],
	});
	assert.deepEqual(s.council_progress, {
		expected: 0,
		completed: 0,
		by_rating: [{ rating: 'good', count: 2 }],
	});
});

test('getStats: lọc theo năm qua tham số @year (null = mọi năm), mọi câu đề tài đi qua bộ lọc', async () => {
	next = STATS_SETS();
	await svc.getStats(null);
	assert.equal(lastInputs().year, null);
	const text = log.at(-1).text;
	assert.match(text, /WHERE @year IS NULL OR r\.year = @year/);
	assert.ok(!/FROM topics t\s+GROUP/.test(text), 'không câu nào đọc thẳng bảng topics bỏ qua năm');

	next = STATS_SETS();
	await svc.getStats(2004);
	assert.equal(lastInputs().year, 2004);
});

test('getStats: cache theo từng năm — gọi lại cùng năm không truy vấn lại, năm khác thì có', async () => {
	next = STATS_SETS();
	const before = calls;
	const first = await svc.getStats(2010);
	const again = await svc.getStats(2010);
	assert.equal(calls, before + 1, 'lần 2 trúng cache');
	assert.deepEqual(again, first);
	again.overview.total = -1;
	assert.equal((await svc.getStats(2010)).overview.total, 6, 'sửa kết quả không làm bẩn cache');
	await svc.getStats(2011);
	assert.equal(calls, before + 2);
});

test('getTrainingStats: tỷ lệ lấp đầy làm tròn 1 chữ số, sĩ số 0 ⇒ 0', async () => {
	next = [
		[{ open_courses: 2 }],
		[{ id: 'S1' }],
		[
			{ id: 'K1', name: 'A', capacity: 3, approved_count: 2 },
			{ id: 'K2', name: 'B', capacity: 0, approved_count: 5 },
			{ id: 'K3', name: 'C', capacity: 20, approved_count: 25 },
		],
		[{ name: 'Điều dưỡng', cnt: 4 }],
		[{ month: '2026-10', cnt: 7 }],
		[{ status: 'enrolling', cnt: 1 }],
	];
	const s = await svc.getTrainingStats();
	assert.deepEqual(
		s.top_full_courses.map((c) => c.fill_rate),
		[66.7, 0, 125],
	);
	assert.deepEqual(s.kpi, { open_courses: 2 });
	assert.deepEqual(s.courses_by_status, [{ status: 'enrolling', cnt: 1 }]);
	assert.deepEqual(s.upcoming_sessions, [{ id: 'S1' }]);
	assert.deepEqual(s.enrollment_trend, [{ month: '2026-10', cnt: 7 }]);
});

test('getSeminarStats: đủ 12 tháng (tháng trống = 0), tín chỉ CME đổi về số, năm theo giờ VN', async () => {
	next = [
		[{ seminars_this_year: 3, cme_credits_this_year: '12.50', current_year: 2026 }],
		[{ event_type: 'hoi_thao', cnt: 3 }],
		[
			{ m: 3, seminars: 2, participants: 40 },
			{ m: 11, seminars: 1, participants: 0 },
		],
		[],
		[],
	];
	const s = await svc.getSeminarStats();
	assert.equal(s.monthly.length, 12);
	assert.deepEqual(
		s.monthly.map((x) => x.month),
		[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
	);
	assert.deepEqual(s.monthly[2], { month: 3, seminars: 2, participants: 40 });
	assert.deepEqual(s.monthly[0], { month: 1, seminars: 0, participants: 0 });
	assert.equal(s.kpi.cme_credits_this_year, 12.5);
	const { todayVN } = require('../../src/utils/vnDate');
	assert.equal(lastInputs().year, todayVN().getUTCFullYear());
});

test('getOverviewStats: chuỗi 12 tháng liên tục kết thúc ở tháng hiện tại, ghép 3 nguồn theo tháng', async () => {
	const now = new Date();
	const key = (offset) => {
		const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	};
	next = [
		[{ users_total: 10 }],
		[
			{ month: key(0), cnt: 4 },
			{ month: '1999-01', cnt: 99 }, // ngoài cửa sổ ⇒ bị bỏ
		],
		[{ month: key(11), cnt: 2 }],
		[{ month: key(5), cnt: 1 }],
		[{ name: 'Quản trị', cnt: 1 }],
		[{ name: 'Khoa A', users_cnt: 3 }],
	];
	const s = await svc.getOverviewStats();
	assert.equal(s.monthly_activity.length, 12);
	assert.equal(s.monthly_activity[11].month, key(0));
	assert.equal(s.monthly_activity[0].month, key(11));
	assert.deepEqual(s.monthly_activity[11], {
		month: key(0),
		topics: 4,
		enrollments: 0,
		seminars: 0,
	});
	assert.equal(s.monthly_activity[0].enrollments, 2);
	assert.equal(s.monthly_activity[6].seminars, 1);
	assert.ok(!s.monthly_activity.some((m) => m.topics === 99));
	assert.deepEqual(s.kpi, { users_total: 10 });
	// @from = ngày 1 của tháng đầu chuỗi
	const from = lastInputs().from;
	assert.equal(from.getUTCDate(), 1);
	assert.equal(from.toISOString().slice(0, 7), key(11));
});
