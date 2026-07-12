const { getPool } = require('../config/db');

const getStats = async () => {
	const pool = await getPool();

	const result = await pool.request().query(`
    -- Overview counts by status
    SELECT status, COUNT(*) AS cnt
    FROM topics
    GROUP BY status;

    -- Topics by department: article_type + status breakdown (for full dept stats table)
    SELECT
      ISNULL(d.name, N'Chưa xác định') AS dept_name,
      t.article_type,
      t.status,
      COUNT(t.id) AS cnt
    FROM topics t
    LEFT JOIN departments d ON d.id = t.department_id
    GROUP BY d.name, t.article_type, t.status;

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

    -- Recent approvals (last 8)
    SELECT TOP 8
      a.id, a.topic_id, t.title AS topic_title,
      a.status, a.comment, a.created_at,
      u.full_name AS approver_name
    FROM approvals a
    LEFT JOIN topics t ON t.id = a.topic_id
    LEFT JOIN users u ON u.id = a.created_by
    ORDER BY a.created_at DESC;
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

	return {
		overview: { total, by_status: byStatus },
		by_department: (() => {
			const deptMap = {};
			for (const row of result.recordsets[1]) {
				const dept = row.dept_name;
				if (!deptMap[dept])
					deptMap[dept] = {
						name: dept,
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
					};
				const d = deptMap[dept];
				d.total += row.cnt;
				d[row.article_type === 'bai_bao' ? 'bai_bao' : 'de_tai'] += row.cnt;
				if (d.by_status[row.status] !== undefined)
					d.by_status[row.status] += row.cnt;
				if (row.status === 'approved') d.approved += row.cnt;
			}
			return Object.values(deptMap)
				.map((d) => ({
					...d,
					approval_rate: d.total > 0 ? d.approved / d.total : 0,
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
	};
};

module.exports = { getStats };
