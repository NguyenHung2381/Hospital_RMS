const { getPool, sql } = require('../config/db');
const topicService = require('../modules/topics/topicService');
const { markOnce } = require('./dedupe');
const { todayVN, fmtDateVN } = require('../utils/vnDate');
const logger = require('../config/logger');

// Đề tài "Yêu cầu bổ sung" quá hạn mốc bổ sung của đợt ⇒ tự TỪ CHỐI (quyết
// định nghiệp vụ 18/10/2026). Thay phần B của proc SQL cũ sp_process_daily_deadlines
// (proc đó tự DUYỆT, và chỉ chạy nếu có SQL Agent job — xem database/README.md).
//
// Từ chối qua đúng đường của người duyệt (topicService.approve → sp_approve_topic):
// cập nhật approvals, trạng thái, topic_progress, thông báo chủ nhiệm + thành viên.
// Chặt hơn proc cũ:
//   - Xét mốc bổ sung MUỘN NHẤT của đợt (đợt có nhiều mốc bổ sung thì chưa
//     từ chối khi mốc sau còn hạn).
//   - Bỏ qua (ghi log, để xử lý tay) đề tài được yêu cầu bổ sung SAU khi mốc
//     đã qua — admin yêu cầu muộn mà không mở mốc mới, không nên bị từ chối ngay.
//   - topic_progress.created_by bắt buộc là tài khoản thật ⇒ ghi theo người đã
//     yêu cầu bổ sung (approvals.updated_by); không xác định được thì bỏ qua.
// Mỗi (đề tài, mốc) chỉ xử lý 1 lần kể cả khi nhiều worker cùng chạy (markOnce).

const JOB = 'supplement_auto_reject';

const findOverdue = async (today) => {
	const pool = await getPool();
	const r = await pool.request().input('today', sql.Date, today).query(`
    SELECT t.id, dl.id AS deadline_id, dl.name AS deadline_name, dl.deadline_date,
           a.updated_by AS requested_by,
           CASE WHEN a.updated_at >= DATEADD(DAY, 1, CAST(dl.deadline_date AS DATETIME2))
                THEN 1 ELSE 0 END AS requested_after_deadline
    FROM topics t
    CROSS APPLY (
      SELECT TOP 1 rd.id, rd.name, rd.deadline_date
      FROM round_deadlines rd
      WHERE rd.round_id = t.round_id AND rd.deadline_type = 'supplement'
      ORDER BY rd.deadline_date DESC
    ) dl
    LEFT JOIN approvals a ON a.topic_id = t.id AND a.status = 'supplement'
    WHERE t.status = 'supplement' AND dl.deadline_date < @today
  `);
	return r.recordset;
};

// Một đề tài quá hạn: 'reject' | lý do bỏ qua (chuỗi để ghi log)
const decide = (row) => {
	if (!row.requested_by) return 'không xác định người yêu cầu bổ sung (approvals.updated_by trống)';
	if (row.requested_after_deadline) return 'được yêu cầu bổ sung sau khi mốc đã qua';
	return 'reject';
};

const run = async () => {
	const rows = await module.exports.findOverdue(todayVN());
	let rejected = 0;
	for (const row of rows) {
		const decision = decide(row);
		if (decision !== 'reject') {
			logger.warn(`[job:${JOB}] Bỏ qua đề tài ${row.id}: ${decision} — cần xử lý tay.`);
			continue;
		}
		if (!(await markOnce(JOB, `${row.id}:${row.deadline_id}`))) continue;
		const comment = `Tự động từ chối: quá hạn bổ sung "${row.deadline_name}" (${fmtDateVN(row.deadline_date)}) mà chưa được duyệt lại.`;
		await topicService.approve(row.id, 'rejected', comment, row.requested_by);
		rejected++;
	}
	if (rows.length) {
		logger.info(`[job:${JOB}] ${rows.length} đề tài quá hạn bổ sung, đã từ chối ${rejected}.`);
	}
	return { overdue: rows.length, rejected };
};

module.exports = { run, decide, findOverdue };
