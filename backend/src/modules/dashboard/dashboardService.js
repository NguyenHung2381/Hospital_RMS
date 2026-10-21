const { getPool, sql } = require('../../config/db');
const { remember } = require('../../utils/cache');
const { COURSE_DISPLAY_STATUS } = require('../training/courses/courseService');

// TTL 90s: đủ ngắn để dashboard không lệch số liệu quá lâu sau khi có đề tài
// mới/duyệt, đủ dài để tránh chạy lại chuỗi query aggregate nặng này mỗi lần
// ai đó mở trang Dashboard.
// year = năm của đợt nghiên cứu (như bộ lọc "Năm" của danh sách đề tài); null = mọi năm.
/** @param {number|null} [year] */
const getStats = async (year = null) =>
	remember(`dash:stats:${year ?? 'all'}`, 90, async () => {
		const pool = await getPool();

		const result = await pool.request().input('year', sql.Int, year).query(`
    -- Tập đề tài của năm đang xem — mọi truy vấn bên dưới đọc từ #t thay vì topics
    DROP TABLE IF EXISTS #t;
    SELECT t.id, t.title, t.status, t.department_id, t.category_id, t.level_id,
           t.article_type, t.round_id, t.council_id, t.created_at
    INTO #t
    FROM topics t
    LEFT JOIN research_rounds r ON r.id = t.round_id
    WHERE @year IS NULL OR r.year = @year;

    -- Overview counts by status
    SELECT status, COUNT(*) AS cnt
    FROM #t
    GROUP BY status;

    -- Topics by department: article_type + status + category breakdown (for full dept stats table)
    SELECT
      ISNULL(d.name, N'Chưa xác định') AS dept_name,
      ISNULL(d.specialty_group, N'Chưa xác định') AS specialty_group,
      t.article_type,
      t.status,
      ISNULL(c.name, N'Chưa xác định') AS category_name,
      COUNT(t.id) AS cnt
    FROM #t t
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN categories c ON c.id = t.category_id
    GROUP BY d.name, d.specialty_group, t.article_type, t.status, c.name;

    -- Overall totals by article_type (đề tài NCKH vs bài báo/tập san)
    SELECT t.article_type, COUNT(t.id) AS cnt
    FROM #t t
    GROUP BY t.article_type;

    -- Topics by category
    SELECT c.name AS name, COUNT(t.id) AS cnt
    FROM #t t
    LEFT JOIN categories c ON c.id = t.category_id
    GROUP BY c.name
    ORDER BY cnt DESC;

    -- Topics by level
    SELECT l.name AS name, COUNT(t.id) AS cnt
    FROM #t t
    LEFT JOIN levels l ON l.id = t.level_id
    GROUP BY l.name
    ORDER BY cnt DESC;

    -- Topics by category per round year
    SELECT
      CAST(r.year AS VARCHAR(4)) AS year,
      ISNULL(c.name, N'Chưa phân loại') AS category_name,
      COUNT(*) AS cnt
    FROM #t t
    LEFT JOIN research_rounds r ON r.id = t.round_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE r.year IS NOT NULL
    GROUP BY r.year, c.name
    ORDER BY year ASC;

    -- Recent approvals (last 20) — chỉ đề tài đã có quyết định, mới nhất trước.
    -- • status lấy theo topics: đây là nguồn sự thật hiển thị ở mọi màn khác
    --   (bảng đề tài, màn Phê duyệt, "Đề tài của tôi"). approvals.status có thể
    --   lệch (vd. sửa trạng thái đề tài trực tiếp không đụng bảng approvals).
    -- • approver/date lấy theo cột audit updated_* mà trg_approvals_audit ghi khi
    --   sp_approve_topic đổi trạng thái. created_by/created_at là người & thời
    --   điểm NỘP hồ sơ, không phải người/lúc phê duyệt.
    SELECT TOP 20
      a.id, a.topic_id, t.title AS topic_title,
      t.status,
      a.comment,
      COALESCE(a.updated_at, a.created_at) AS created_at,
      u.full_name AS approver_name
    FROM approvals a
    INNER JOIN #t t ON t.id = a.topic_id
    LEFT JOIN users u ON u.id = COALESCE(a.updated_by, a.created_by)
    WHERE t.status IN ('approved', 'rejected', 'supplement')
    ORDER BY COALESCE(a.updated_at, a.created_at) DESC;

    -- Council progress-review completion: expected = mỗi ghế hội đồng × mỗi đề tài của hội đồng đó
    SELECT
      (SELECT COUNT(*) FROM council_members cm INNER JOIN #t t ON t.council_id = cm.council_id) AS expected,
      (SELECT COUNT(*) FROM council_progress_reviews pr INNER JOIN #t t ON t.id = pr.topic_id WHERE pr.progress_percent IS NOT NULL) AS completed;

    -- Xếp loại tiến độ trong số các đánh giá đã hoàn thành
    SELECT pr.rating, COUNT(*) AS cnt
    FROM council_progress_reviews pr
    INNER JOIN #t t ON t.id = pr.topic_id
    WHERE pr.progress_percent IS NOT NULL AND pr.rating IS NOT NULL
    GROUP BY pr.rating;

    -- Council progress-review completion theo phòng ban: số đánh giá cần chấm
    SELECT
      ISNULL(d.name, N'Chưa xác định') AS dept_name,
      COUNT(*) AS expected
    FROM council_members cm
    INNER JOIN #t t ON t.council_id = cm.council_id
    LEFT JOIN departments d ON d.id = t.department_id
    GROUP BY d.name;

    -- Council progress-review completion theo phòng ban: số đánh giá đã chấm
    SELECT
      ISNULL(d.name, N'Chưa xác định') AS dept_name,
      COUNT(*) AS completed
    FROM council_progress_reviews pr
    INNER JOIN #t t ON t.id = pr.topic_id
    LEFT JOIN departments d ON d.id = t.department_id
    WHERE pr.progress_percent IS NOT NULL
    GROUP BY d.name;

    -- Tóm tắt nhanh riêng NCKH: đợt, hội đồng, đề tài trong năm
    SELECT
      (SELECT COUNT(*) FROM #t WHERE YEAR(created_at) = YEAR(GETDATE())) AS topics_this_year,
      (SELECT COUNT(*) FROM research_rounds WHERE status = 'active') AS rounds_active,
      (SELECT COUNT(*) FROM councils) AS councils_total,
      (SELECT COUNT(*) FROM councils
         WHERE defense_date >= CAST(GETDATE() AS DATE)) AS councils_upcoming;

    DROP TABLE #t;
  `);

		const statusRows = result.recordsets[0];
		const byStatus = {
			submitted: 0,
			approved: 0,
			rejected: 0,
			supplement: 0,
			cancelled: 0,
		};
		let total = 0;
		for (const row of statusRows) {
			const key = row.status;
			byStatus[key] = (byStatus[key] ?? 0) + row.cnt;
			total += row.cnt;
		}

		const deptExpected = {};
		for (const row of result.recordsets[9]) deptExpected[row.dept_name] = row.expected;
		const deptCompleted = {};
		for (const row of result.recordsets[10]) deptCompleted[row.dept_name] = row.completed;

		return {
			overview: { total, by_status: byStatus },
			summary: result.recordsets[11][0],
			by_department: (() => {
				const deptMap = {};
				for (const row of result.recordsets[1]) {
					const dept = row.dept_name;
					if (!deptMap[dept])
						deptMap[dept] = {
							name: dept,
							specialty_group: row.specialty_group,
							total: 0,
							de_tai: 0,
							bai_bao: 0,
							approved: 0,
							by_status: {
								submitted: 0,
								approved: 0,
								rejected: 0,
								supplement: 0,
								cancelled: 0,
							},
							categories: {},
						};
					const d = deptMap[dept];
					d.total += row.cnt;
					d[row.article_type === 'bai_bao' ? 'bai_bao' : 'de_tai'] += row.cnt;
					if (d.by_status[row.status] !== undefined) d.by_status[row.status] += row.cnt;
					if (row.status === 'approved') d.approved += row.cnt;
					d.categories[row.category_name] = (d.categories[row.category_name] ?? 0) + row.cnt;
				}
				return Object.values(deptMap)
					.map((d) => ({
						...d,
						categories: Object.entries(d.categories).map(([name, count]) => ({
							name,
							count,
						})),
						approval_rate: d.total > 0 ? d.approved / d.total : 0,
						council_progress: {
							expected: deptExpected[d.name] ?? 0,
							completed: deptCompleted[d.name] ?? 0,
						},
					}))
					.sort((a, b) => b.total - a.total);
			})(),
			by_article_type: result.recordsets[2].map((r) => ({
				type: r.article_type === 'bai_bao' ? 'bai_bao' : 'de_tai',
				count: r.cnt,
			})),
			by_category: result.recordsets[3].map((r) => ({
				name: r.name || 'Chưa xác định',
				count: r.cnt,
			})),
			by_level: result.recordsets[4].map((r) => ({
				name: r.name || 'Chưa xác định',
				count: r.cnt,
			})),
			trend_by_category: (() => {
				const raw = result.recordsets[5];
				const yearMap = {};
				const catSet = new Set();
				for (const row of raw) {
					if (!yearMap[row.year]) yearMap[row.year] = { year: row.year };
					yearMap[row.year][row.category_name] = row.cnt;
					catSet.add(row.category_name);
				}
				return {
					rows: Object.values(yearMap).sort((a, b) => String(a.year).localeCompare(String(b.year))),
					categories: Array.from(catSet),
				};
			})(),
			recent_approvals: result.recordsets[6],
			council_progress: {
				expected: result.recordsets[7][0]?.expected ?? 0,
				completed: result.recordsets[7][0]?.completed ?? 0,
				by_rating: result.recordsets[8].map((r) => ({
					rating: r.rating,
					count: r.cnt,
				})),
			},
		};
	});

// courses.status chỉ còn giữ cờ 'cancelled' — trạng thái thật suy ra từ ngày tháng.
// Khóa "đang mở" = đang nhận đăng ký hoặc đang diễn ra.
const COURSES_OPEN_SQL = `(SELECT COUNT(*) FROM courses c
      WHERE ${COURSE_DISPLAY_STATUS} IN ('enrolling', 'in_progress'))`;

// Dashboard riêng cho Đào tạo (course/trainee/lecturer/class_sessions) — tách
// khỏi getStats() vì đó chỉ phục vụ NCKH (topics/councils).
const getTrainingStats = async () =>
	remember('dash:training-stats', 90, async () => {
		const pool = await getPool();
		const result = await pool.request().query(`
    -- KPI tổng quan
    SELECT
      ${COURSES_OPEN_SQL} AS open_courses,
      (SELECT COUNT(*) FROM courses) AS total_courses,
      (SELECT COUNT(*) FROM trainees WHERE is_active = 1) AS total_trainees,
      (SELECT COUNT(*) FROM lecturers WHERE is_active = 1) AS total_lecturers,
      (SELECT COUNT(*) FROM course_enrollments WHERE status = 'pending') AS pending_enrollments,
      (SELECT COUNT(*) FROM certificates WHERE status = 'active') AS certificates_issued,
      (SELECT COUNT(*) FROM certificates WHERE status = 'active'
         AND expiry_date >= CAST(GETDATE() AS DATE)
         AND expiry_date <= DATEADD(DAY, 30, CAST(GETDATE() AS DATE))) AS certificates_expiring,
      (SELECT COUNT(*) FROM trainees WHERE YEAR(created_at) = YEAR(GETDATE())) AS trainees_this_year,
      (SELECT COUNT(*) FROM class_sessions
         WHERE session_date >= CAST(GETDATE() AS DATE)
           AND session_date <= DATEADD(DAY, 7, CAST(GETDATE() AS DATE))) AS sessions_next_7_days;

    -- Lịch học 7 ngày tới
    SELECT TOP 20 sess.id, sess.session_date, sess.start_time, sess.end_time, sess.room,
           c.name AS course_name, s.title AS subject_name, l.full_name AS lecturer_name
    FROM class_sessions sess
    JOIN courses c ON c.id = sess.course_id
    LEFT JOIN program_lessons s ON s.id = sess.subject_id
    LEFT JOIN lecturers l ON l.id = sess.lecturer_id
    WHERE sess.session_date >= CAST(GETDATE() AS DATE) AND sess.session_date <= DATEADD(DAY, 7, CAST(GETDATE() AS DATE))
    ORDER BY sess.session_date, sess.start_time;

    -- Top khóa đầy chỗ nhất (có capacity)
    SELECT TOP 10 c.id, c.name, c.capacity,
           (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id AND status = 'approved') AS approved_count
    FROM courses c
    WHERE c.capacity IS NOT NULL AND c.capacity > 0
    ORDER BY (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id AND status = 'approved') * 1.0 / c.capacity DESC;

    -- Học viên theo đối tượng
    SELECT ISNULL(tt.name, N'Chưa phân loại') AS name, COUNT(*) AS cnt
    FROM trainees t
    LEFT JOIN trainee_types tt ON tt.id = t.trainee_type_id
    WHERE t.is_active = 1
    GROUP BY tt.name
    ORDER BY cnt DESC;

    -- Xu hướng đăng ký theo tháng (12 tháng gần nhất).
    -- CONVERT(CHAR(7), x, 126) = 'yyyy-MM', không dùng FORMAT(): FORMAT chạy qua CLR,
    -- lần gọi đầu khi CLR nguội tốn 76–1071ms (Query Store), CONVERT ~1ms.
    SELECT CONVERT(CHAR(7), registered_at, 126) AS month, COUNT(*) AS cnt
    FROM course_enrollments
    WHERE registered_at >= DATEADD(MONTH, -11, CAST(GETDATE() AS DATE))
    GROUP BY CONVERT(CHAR(7), registered_at, 126)
    ORDER BY month;

    -- Khóa học theo trạng thái hiển thị (suy ra từ ngày tháng)
    SELECT status, COUNT(*) AS cnt
    FROM (SELECT ${COURSE_DISPLAY_STATUS} AS status FROM courses c) x
    GROUP BY status
    ORDER BY cnt DESC;
  `);

		return {
			kpi: result.recordsets[0][0],
			courses_by_status: result.recordsets[5],
			upcoming_sessions: result.recordsets[1],
			top_full_courses: result.recordsets[2].map((c) => ({
				...c,
				fill_rate: c.capacity > 0 ? Math.round((c.approved_count / c.capacity) * 1000) / 10 : 0,
			})),
			trainees_by_type: result.recordsets[3],
			enrollment_trend: result.recordsets[4],
		};
	});

// Dashboard chung toàn hệ thống — số liệu gộp của cả 3 mảng (hệ thống/tài
// khoản, NCKH, Đào tạo, Hội thảo-CME). Chi tiết từng mảng nằm ở getStats()
// (NCKH) và getTrainingStats() (Đào tạo).
const getOverviewStats = async () =>
	remember('dash:overview-stats', 90, async () => {
		const pool = await getPool();
		const result = await pool.request().query(`
    DECLARE @year INT = YEAR(GETDATE());

    -- KPI tổng quan
    SELECT
      (SELECT COUNT(*) FROM users) AS users_total,
      (SELECT COUNT(*) FROM users WHERE is_active = 1) AS users_active,
      (SELECT COUNT(*) FROM users WHERE locked_until IS NOT NULL AND locked_until > GETDATE()) AS users_locked,
      (SELECT COUNT(*) FROM departments) AS departments_total,
      (SELECT COUNT(*) FROM topics) AS topics_total,
      (SELECT COUNT(*) FROM topics WHERE YEAR(created_at) = @year) AS topics_this_year,
      (SELECT COUNT(*) FROM topics WHERE status = 'submitted') AS topics_pending,
      (SELECT COUNT(*) FROM topics WHERE status = 'approved') AS topics_approved,
      (SELECT COUNT(*) FROM research_rounds WHERE status = 'active') AS rounds_active,
      (SELECT COUNT(*) FROM councils) AS councils_total,
      (SELECT COUNT(*) FROM courses) AS courses_total,
      ${COURSES_OPEN_SQL} AS courses_open,
      (SELECT COUNT(*) FROM trainees WHERE is_active = 1) AS trainees_active,
      (SELECT COUNT(*) FROM lecturers WHERE is_active = 1) AS lecturers_active,
      (SELECT COUNT(*) FROM course_enrollments WHERE status = 'pending') AS enrollments_pending,
      (SELECT COUNT(*) FROM certificates WHERE status = 'active') AS certificates_active,
      (SELECT COUNT(*) FROM seminars WHERE event_year = @year) AS seminars_this_year,
      (SELECT COUNT(*) FROM seminar_participants sp
         INNER JOIN seminars s ON s.id = sp.seminar_id
         WHERE s.event_year = @year) AS participants_this_year,
      (SELECT COUNT(*) FROM seminar_participants WHERE cme_year = @year AND cme_status IN ('issued', 'signed')) AS cme_issued_this_year,
      @year AS current_year;

    -- Hoạt động theo tháng (12 tháng gần nhất): đề tài mới, lượt đăng ký khóa học, hội thảo
    DECLARE @from DATE = DATEFROMPARTS(YEAR(DATEADD(MONTH, -11, GETDATE())), MONTH(DATEADD(MONTH, -11, GETDATE())), 1);
    SELECT CONVERT(CHAR(7), created_at, 126) AS month, COUNT(*) AS cnt
    FROM topics WHERE created_at >= @from
    GROUP BY CONVERT(CHAR(7), created_at, 126);

    SELECT CONVERT(CHAR(7), registered_at, 126) AS month, COUNT(*) AS cnt
    FROM course_enrollments WHERE registered_at >= @from
    GROUP BY CONVERT(CHAR(7), registered_at, 126);

    SELECT CONVERT(CHAR(7), start_date, 126) AS month, COUNT(*) AS cnt
    FROM seminars WHERE start_date >= @from AND start_date <= GETDATE()
    GROUP BY CONVERT(CHAR(7), start_date, 126);

    -- Tài khoản đang hoạt động theo vai trò
    SELECT COALESCE(r.description, r.name, N'Chưa gán vai trò') AS name, COUNT(*) AS cnt
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    WHERE u.is_active = 1
    GROUP BY COALESCE(r.description, r.name, N'Chưa gán vai trò')
    ORDER BY cnt DESC;

    -- Khoa/Phòng (đủ mọi đơn vị): tài khoản, NCKH, Đào tạo, Hội thảo-CME trong năm.
    -- Người tham dự hội thảo gắn khoa qua tài khoản; không có tài khoản thì khớp
    -- department_raw với tên khoa.
    SELECT d.name,
      (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.is_active = 1) AS users_cnt,
      (SELECT COUNT(*) FROM topics t WHERE t.department_id = d.id) AS topics_cnt,
      (SELECT COUNT(*) FROM trainees tr WHERE tr.department_id = d.id AND tr.is_active = 1) AS trainees_cnt,
      (SELECT COUNT(*) FROM certificates c
         INNER JOIN course_enrollments e ON e.id = c.enrollment_id
         INNER JOIN trainees tr ON tr.id = e.trainee_id
         WHERE tr.department_id = d.id AND c.status = 'active') AS certificates_cnt,
      ISNULL(sp.participants_cnt, 0) AS participants_cnt,
      ISNULL(sp.cme_cnt, 0) AS cme_cnt
    FROM departments d
    LEFT JOIN (
      SELECT COALESCE(u.department_id, dr.id) AS dept_id,
        SUM(CASE WHEN s.event_year = @year THEN 1 ELSE 0 END) AS participants_cnt,
        SUM(CASE WHEN p.cme_year = @year AND p.cme_status IN ('issued', 'signed') THEN 1 ELSE 0 END) AS cme_cnt
      FROM seminar_participants p
      INNER JOIN seminars s ON s.id = p.seminar_id
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN departments dr ON u.department_id IS NULL AND dr.name = LTRIM(RTRIM(p.department_raw))
      WHERE s.event_year = @year OR p.cme_year = @year
      GROUP BY COALESCE(u.department_id, dr.id)
    ) sp ON sp.dept_id = d.id
    ORDER BY topics_cnt DESC, users_cnt DESC, d.name;
  `);

		// Ghép 3 chuỗi theo tháng thành 1 dãy 12 tháng liên tục (tháng trống = 0).
		const toMap = (rows) => Object.fromEntries(rows.map((r) => [r.month, r.cnt]));
		const topicsByMonth = toMap(result.recordsets[1]);
		const enrollByMonth = toMap(result.recordsets[2]);
		const seminarsByMonth = toMap(result.recordsets[3]);
		const now = new Date();
		const monthly = [];
		for (let i = 11; i >= 0; i--) {
			const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
			const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
			monthly.push({
				month: key,
				topics: topicsByMonth[key] ?? 0,
				enrollments: enrollByMonth[key] ?? 0,
				seminars: seminarsByMonth[key] ?? 0,
			});
		}

		return {
			kpi: result.recordsets[0][0],
			monthly_activity: monthly,
			users_by_role: result.recordsets[4],
			top_departments: result.recordsets[5],
		};
	});

// Dashboard riêng cho Hội thảo - Hội nghị & CME (theo năm hiện tại — nghiệp vụ
// CME đếm theo năm, SQĐ reset mỗi năm).
const getSeminarStats = async () =>
	remember('dash:seminar-stats', 90, async () => {
		const pool = await getPool();
		const result = await pool.request().query(`
    DECLARE @year INT = YEAR(GETDATE());
    DECLARE @today DATE = CAST(GETDATE() AS DATE);

    -- KPI trong năm
    SELECT
      (SELECT COUNT(*) FROM seminars WHERE event_year = @year) AS seminars_this_year,
      (SELECT COUNT(*) FROM seminars WHERE event_year = @year AND scope = 'hosted') AS hosted_this_year,
      (SELECT COUNT(*) FROM seminars WHERE event_year = @year AND scope = 'external') AS external_this_year,
      (SELECT COUNT(*) FROM seminars WHERE event_year = @year AND grants_cme = 1) AS cme_seminars_this_year,
      (SELECT COUNT(*) FROM seminars WHERE start_date >= @today) AS upcoming_total,
      (SELECT COUNT(*) FROM seminar_participants sp
         INNER JOIN seminars s ON s.id = sp.seminar_id
         WHERE s.event_year = @year) AS participants_this_year,
      (SELECT COUNT(*) FROM seminar_participants sp
         INNER JOIN seminars s ON s.id = sp.seminar_id
         WHERE s.event_year = @year AND sp.source = 'internal') AS internal_participants_this_year,
      (SELECT COUNT(*) FROM seminar_participants
         WHERE cme_year = @year AND cme_status IN ('issued', 'signed')) AS cme_issued_this_year,
      (SELECT COUNT(*) FROM seminar_participants WHERE cme_status = 'pending') AS cme_pending,
      (SELECT ISNULL(SUM(cme_credits), 0) FROM seminar_participants
         WHERE cme_year = @year AND cme_status IN ('issued', 'signed')) AS cme_credits_this_year,
      @year AS current_year;

    -- Sự kiện trong năm theo loại hình
    SELECT event_type, COUNT(*) AS cnt
    FROM seminars
    WHERE event_year = @year
    GROUP BY event_type
    ORDER BY cnt DESC;

    -- Sự kiện & lượt tham dự theo tháng trong năm
    SELECT MONTH(s.start_date) AS m,
      COUNT(DISTINCT s.id) AS seminars,
      COUNT(sp.id) AS participants
    FROM seminars s
    LEFT JOIN seminar_participants sp ON sp.seminar_id = s.id
    WHERE s.start_date IS NOT NULL AND YEAR(s.start_date) = @year
    GROUP BY MONTH(s.start_date);

    -- Hội thảo sắp diễn ra
    SELECT TOP 8 s.id, s.title, s.start_date, s.end_date, s.location, s.scope, s.grants_cme,
      (SELECT COUNT(*) FROM seminar_participants sp WHERE sp.seminar_id = s.id) AS participant_count
    FROM seminars s
    WHERE s.start_date >= @today
    ORDER BY s.start_date ASC;

    -- Khoa/phòng có nhiều lượt tham dự nhất trong năm (nhân sự nội viện)
    SELECT TOP 8 ISNULL(NULLIF(LTRIM(RTRIM(sp.department_raw)), ''), N'Chưa xác định') AS name,
      COUNT(*) AS cnt,
      SUM(CASE WHEN sp.cme_status IN ('issued', 'signed') THEN 1 ELSE 0 END) AS cme_cnt
    FROM seminar_participants sp
    INNER JOIN seminars s ON s.id = sp.seminar_id
    WHERE s.event_year = @year AND sp.source = 'internal'
    GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(sp.department_raw)), ''), N'Chưa xác định')
    ORDER BY cnt DESC;
  `);

		const byMonth = Object.fromEntries(result.recordsets[2].map((r) => [r.m, r]));
		const monthly = [];
		for (let m = 1; m <= 12; m++) {
			monthly.push({
				month: m,
				seminars: byMonth[m]?.seminars ?? 0,
				participants: byMonth[m]?.participants ?? 0,
			});
		}

		return {
			kpi: {
				...result.recordsets[0][0],
				cme_credits_this_year: Number(result.recordsets[0][0].cme_credits_this_year),
			},
			by_event_type: result.recordsets[1],
			monthly,
			upcoming: result.recordsets[3],
			top_departments: result.recordsets[4],
		};
	});

module.exports = {
	getStats,
	getTrainingStats,
	getOverviewStats,
	getSeminarStats,
};
