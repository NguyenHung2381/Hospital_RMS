// Thống kê dashboard Hội thảo - Hội nghị & CME — tách khỏi dashboardService.js cho gọn
// (dashboardService vẫn re-export getSeminarStats).
const { getPool, sql, queryAll, datePart, nstr } = require('../../config/db');
const { remember } = require('../../utils/cache');
const { todayVN } = require('../../utils/vnDate');

// Dashboard riêng cho Hội thảo - Hội nghị & CME (theo năm hiện tại — nghiệp vụ
// CME đếm theo năm, SQĐ reset mỗi năm).
const getSeminarStats = async () =>
	remember('dash:seminar-stats', 90, async () => {
		const pool = await getPool();
		const today = todayVN();
		const resultSets = await queryAll(
			pool.request().input('year', sql.Int, today.getUTCFullYear()).input('today', sql.Date, today),
			[
				`
    -- KPI trong năm
    SELECT
      (SELECT COUNT(*) FROM seminars WHERE event_year = @year) AS seminars_this_year,
      (SELECT COUNT(*) FROM seminars WHERE event_year = @year AND scope = 'hosted') AS hosted_this_year,
      (SELECT COUNT(*) FROM seminars WHERE event_year = @year AND scope = 'external') AS external_this_year,
      (SELECT COUNT(*) FROM seminars WHERE event_year = @year AND grants_cme = 'true') AS cme_seminars_this_year,
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
      (SELECT COALESCE(SUM(cme_credits), 0) FROM seminar_participants
         WHERE cme_year = @year AND cme_status IN ('issued', 'signed')) AS cme_credits_this_year,
      @year AS current_year
			`,
				`
    -- Sự kiện trong năm theo loại hình
    SELECT event_type, COUNT(*) AS cnt
    FROM seminars
    WHERE event_year = @year
    GROUP BY event_type
    ORDER BY cnt DESC
			`,
				`
    -- Sự kiện & lượt tham dự theo tháng trong năm
    SELECT ${datePart('MONTH', 's.start_date')} AS m,
      COUNT(DISTINCT s.id) AS seminars,
      COUNT(sp.id) AS participants
    FROM seminars s
    LEFT JOIN seminar_participants sp ON sp.seminar_id = s.id
    WHERE s.start_date IS NOT NULL AND ${datePart('YEAR', 's.start_date')} = @year
    GROUP BY ${datePart('MONTH', 's.start_date')}
			`,
				`
    -- Hội thảo sắp diễn ra
    SELECT s.id, s.title, s.start_date, s.end_date, s.location, s.scope, s.grants_cme,
      (SELECT COUNT(*) FROM seminar_participants sp WHERE sp.seminar_id = s.id) AS participant_count
    FROM seminars s
    WHERE s.start_date >= @today
    ORDER BY s.start_date ASC OFFSET 0 ROWS FETCH NEXT 8 ROWS ONLY
			`,
				`
    -- Khoa/phòng có nhiều lượt tham dự nhất trong năm (nhân sự nội viện)
    SELECT COALESCE(NULLIF(LTRIM(RTRIM(sp.department_raw)), ''), ${nstr('Chưa xác định')}) AS name,
      COUNT(*) AS cnt,
      SUM(CASE WHEN sp.cme_status IN ('issued', 'signed') THEN 1 ELSE 0 END) AS cme_cnt
    FROM seminar_participants sp
    INNER JOIN seminars s ON s.id = sp.seminar_id
    WHERE s.event_year = @year AND sp.source = 'internal'
    GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(sp.department_raw)), ''), ${nstr('Chưa xác định')})
    ORDER BY cnt DESC OFFSET 0 ROWS FETCH NEXT 8 ROWS ONLY
			`,
			],
		);

		const byMonth = Object.fromEntries(resultSets[2].map((r) => [r.m, r]));
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
				...resultSets[0][0],
				cme_credits_this_year: Number(resultSets[0][0].cme_credits_this_year),
			},
			by_event_type: resultSets[1],
			monthly,
			upcoming: resultSets[3],
			top_departments: resultSets[4],
		};
	});

module.exports = { getSeminarStats };
