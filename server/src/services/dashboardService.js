const { getPool } = require('../config/db');

const getStats = async () => {
	const pool = await getPool();

	const result = await pool.request().query(`
    -- Overview counts by status
    SELECT status, COUNT(*) AS cnt
    FROM topics
    GROUP BY status;

    -- Topics by department: article_type + status + category breakdown (for full dept stats table)
    SELECT
      ISNULL(d.name, N'Chưa xác định') AS dept_name,
      ISNULL(d.specialty_group, N'Chưa xác định') AS specialty_group,
      t.article_type,
      t.status,
      ISNULL(c.name, N'Chưa xác định') AS category_name,
      COUNT(t.id) AS cnt
    FROM topics t
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN categories c ON c.id = t.category_id
    GROUP BY d.name, d.specialty_group, t.article_type, t.status, c.name;

    -- Overall totals by article_type (đề tài NCKH vs bài báo/tập san)
    SELECT t.article_type, COUNT(t.id) AS cnt
    FROM topics t
    GROUP BY t.article_type;

    -- Topics by category
    SELECT c.name AS name, COUNT(t.id) AS cnt
    FROM topics t
    LEFT JOIN categories c ON c.id = t.category_id
    GROUP BY c.name
    ORDER BY cnt DESC;

    -- Topics by level
    SELECT l.name AS name, COUNT(t.id) AS cnt
    FROM topics t
    LEFT JOIN levels l ON l.id = t.level_id
    GROUP BY l.name
    ORDER BY cnt DESC;

    -- Topics by category per round year
    SELECT
      CAST(r.year AS VARCHAR(4)) AS year,
      ISNULL(c.name, N'Chưa phân loại') AS category_name,
      COUNT(*) AS cnt
    FROM topics t
    LEFT JOIN research_rounds r ON r.id = t.round_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE r.year IS NOT NULL
    GROUP BY r.year, c.name
    ORDER BY year ASC;

    -- Recent approvals (last 8) — chỉ đề tài đã có quyết định, mới nhất trước.
    -- • status lấy theo topics: đây là nguồn sự thật hiển thị ở mọi màn khác
    --   (bảng đề tài, màn Phê duyệt, "Đề tài của tôi"). approvals.status có thể
    --   lệch (vd. sửa trạng thái đề tài trực tiếp không đụng bảng approvals).
    -- • approver/date lấy theo cột audit updated_* mà trg_approvals_audit ghi khi
    --   sp_approve_topic đổi trạng thái. created_by/created_at là người & thời
    --   điểm NỘP hồ sơ, không phải người/lúc phê duyệt.
    SELECT TOP 8
      a.id, a.topic_id, t.title AS topic_title,
      t.status,
      a.comment,
      COALESCE(a.updated_at, a.created_at) AS created_at,
      u.full_name AS approver_name
    FROM approvals a
    INNER JOIN topics t ON t.id = a.topic_id
    LEFT JOIN users u ON u.id = COALESCE(a.updated_by, a.created_by)
    WHERE t.status IN ('approved', 'rejected', 'supplement')
    ORDER BY COALESCE(a.updated_at, a.created_at) DESC;

    -- Council progress-review completion: expected = mỗi ghế hội đồng × mỗi đề tài của hội đồng đó
    SELECT
      (SELECT COUNT(*) FROM council_members cm INNER JOIN topics t ON t.council_id = cm.council_id) AS expected,
      (SELECT COUNT(*) FROM council_progress_reviews pr INNER JOIN topics t ON t.id = pr.topic_id WHERE pr.progress_percent IS NOT NULL) AS completed;

    -- Xếp loại tiến độ trong số các đánh giá đã hoàn thành
    SELECT pr.rating, COUNT(*) AS cnt
    FROM council_progress_reviews pr
    INNER JOIN topics t ON t.id = pr.topic_id
    WHERE pr.progress_percent IS NOT NULL AND pr.rating IS NOT NULL
    GROUP BY pr.rating;

    -- Council progress-review completion theo phòng ban: số đánh giá cần chấm
    SELECT
      ISNULL(d.name, N'Chưa xác định') AS dept_name,
      COUNT(*) AS expected
    FROM council_members cm
    INNER JOIN topics t ON t.council_id = cm.council_id
    LEFT JOIN departments d ON d.id = t.department_id
    GROUP BY d.name;

    -- Council progress-review completion theo phòng ban: số đánh giá đã chấm
    SELECT
      ISNULL(d.name, N'Chưa xác định') AS dept_name,
      COUNT(*) AS completed
    FROM council_progress_reviews pr
    INNER JOIN topics t ON t.id = pr.topic_id
    LEFT JOIN departments d ON d.id = t.department_id
    WHERE pr.progress_percent IS NOT NULL
    GROUP BY d.name;
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
				if (d.by_status[row.status] !== undefined)
					d.by_status[row.status] += row.cnt;
				if (row.status === 'approved') d.approved += row.cnt;
				d.categories[row.category_name] =
					(d.categories[row.category_name] ?? 0) + row.cnt;
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
				rows: Object.values(yearMap).sort((a, b) =>
					String(a.year).localeCompare(String(b.year)),
				),
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
};

module.exports = { getStats };
