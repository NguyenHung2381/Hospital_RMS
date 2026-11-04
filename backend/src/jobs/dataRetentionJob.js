const db = require('../config/db');
const { getPool, sql } = db;
const { markOnce } = require('./dedupe');
const { todayVN, todayKeyVN } = require('../utils/vnDate');
const logger = require('../config/logger');

// Dọn dữ liệu nhật ký cũ để bảng không phình mãi (database/DB_SCALING_PLAN.md
// mục 6, giai đoạn 1). Mỗi ngày chạy 1 lần dù nhiều worker (markOnce).
//
//  1. security_events cũ hơn SECURITY_EVENTS_RETENTION_MONTHS tháng (mặc định
//     24). Không cho đặt dưới 12 tháng: code đang đọc lại bảng này trong cửa sổ
//     tới 181 ngày (thiết bị quen bị thu hồi — trustedDeviceService.isRevoked),
//     xoá sớm hơn thì thiết bị đã thu hồi được tin cậy lại. Đặt 0 = không xoá.
//  2. job_execution_log cũ hơn 180 ngày, CHỈ của các job có khoá theo ngày
//     (todayKeyVN). Khoá của job khác là "đã làm việc X cho bản ghi Y"
//     (password_expiry_warning, deadline_reminder, supplement_auto_reject): xoá
//     đi thì job coi như chưa làm và gửi lại thông báo.
//
// Mốc thời gian tính ở JS, xoá theo lô bằng OFFSET ... FETCH.
//
// security_events chia partition theo tháng. Mỗi ngày
// gọi rms_maintain_monthly_partitions — tạo sẵn partition 2 tháng tới (luôn
// chạy, kể cả khi không xoá: thiếu partition thì dòng mới rơi vào DEFAULT) và
// DROP partition cũ hơn hạn giữ (nhanh, không để lại bảng phình). Phần lẻ trong
// tháng ranh giới vẫn xoá theo lô.

const JOB = 'data_retention';
const DEFAULT_SECURITY_EVENT_MONTHS = 24;
const MIN_SECURITY_EVENT_MONTHS = 12;
const JOB_LOG_RETENTION_DAYS = 180;
// Job ghi markOnce(job, todayKeyVN()) — mỗi dòng chỉ chặn chạy lại trong đúng ngày đó.
const DAILY_KEY_JOBS = ['deactivate_expired_accounts', 'notification_cleanup', JOB];
const BATCH_SIZE = 2000;
const PAUSE_MS = 1000;

// Số tháng giữ security_events: null = không xoá.
const securityEventMonths = (raw = process.env.SECURITY_EVENTS_RETENTION_MONTHS) => {
	if (raw === undefined || String(raw).trim() === '') return DEFAULT_SECURITY_EVENT_MONTHS;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 0) {
		logger.warn(
			`[job:${JOB}] SECURITY_EVENTS_RETENTION_MONTHS=${JSON.stringify(raw)} không hợp lệ — dùng ${DEFAULT_SECURITY_EVENT_MONTHS} tháng.`,
		);
		return DEFAULT_SECURITY_EVENT_MONTHS;
	}
	if (n === 0) return null;
	if (n < MIN_SECURITY_EVENT_MONTHS) {
		logger.warn(
			`[job:${JOB}] SECURITY_EVENTS_RETENTION_MONTHS=${n} quá ngắn — dùng tối thiểu ${MIN_SECURITY_EVENT_MONTHS} tháng.`,
		);
		return MIN_SECURITY_EVENT_MONTHS;
	}
	return n;
};

// Mốc "00:00 hôm nay giờ VN, lùi `months` tháng / `days` ngày", dạng Date gắn
// nhãn UTC — đúng quy ước cột DATETIME lưu giờ VN của driver mssql (useUTC).
const cutoffVN = ({ months = 0, days = 0 }, today = todayVN()) =>
	new Date(
		Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, today.getUTCDate() - days),
	);

const deleteSecurityEventsBatch = async (cutoff) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('cutoff', sql.DateTime, cutoff)
		.input('batch', sql.Int, BATCH_SIZE).query(`
			DELETE FROM security_events
			WHERE id IN (
				SELECT id FROM security_events
				WHERE created_at < @cutoff
				ORDER BY id
				OFFSET 0 ROWS FETCH NEXT @batch ROWS ONLY
			)
		`);
	return r.rowsAffected?.[0] ?? 0;
};

const deleteJobLogBatch = async (cutoff) => {
	const pool = await getPool();
	const req = pool
		.request()
		.input('cutoff', sql.DateTime, cutoff)
		.input('batch', sql.Int, BATCH_SIZE);
	const names = DAILY_KEY_JOBS.map((name, i) => {
		req.input(`job${i}`, sql.VarChar(50), name);
		return `@job${i}`;
	});
	const r = await req.query(`
		DELETE FROM job_execution_log
		WHERE id IN (
			SELECT id FROM job_execution_log
			WHERE job_name IN (${names.join(', ')}) AND run_at < @cutoff
			ORDER BY id
			OFFSET 0 ROWS FETCH NEXT @batch ROWS ONLY
		)
	`);
	return r.rowsAffected?.[0] ?? 0;
};

// Chỉ PG: tạo partition tháng tới, bỏ partition hết hạn giữ (months = null: không bỏ).
const maintainPartitions = async (months) => {
	const pool = await getPool();
	await pool
		.request()
		.input('keep', sql.Int, months)
		.query("SELECT rms_maintain_monthly_partitions('security_events', 0, 2, @keep)");
};

// Gọi deleteBatch tới khi 1 lô không đầy; nghỉ giữa các lô để không khoá bảng lâu.
const drain = async (deleteBatch, pauseMs) => {
	let total = 0;
	for (;;) {
		const n = await deleteBatch();
		total += n;
		if (n < BATCH_SIZE) return total;
		await new Promise((r) => setTimeout(r, pauseMs));
	}
};

const run = async ({ pauseMs = PAUSE_MS } = {}) => {
	if (!(await markOnce(JOB, todayKeyVN()))) return { skipped: true };

	const months = securityEventMonths();
	await module.exports.maintainPartitions(months);
	const securityEvents = months
		? await drain(() => module.exports.deleteSecurityEventsBatch(cutoffVN({ months })), pauseMs)
		: 0;
	const jobLogs = await drain(
		() => module.exports.deleteJobLogBatch(cutoffVN({ days: JOB_LOG_RETENTION_DAYS })),
		pauseMs,
	);

	if (securityEvents || jobLogs)
		logger.info(
			`[job:${JOB}] Đã xoá ${securityEvents} sự kiện bảo mật (> ${months} tháng), ${jobLogs} dòng job_execution_log (> ${JOB_LOG_RETENTION_DAYS} ngày).`,
		);
	return { skipped: false, securityEvents, jobLogs };
};

module.exports = {
	run,
	deleteSecurityEventsBatch,
	deleteJobLogBatch,
	maintainPartitions,
	securityEventMonths,
	cutoffVN,
	BATCH_SIZE,
	DAILY_KEY_JOBS,
	JOB_LOG_RETENTION_DAYS,
	MIN_SECURITY_EVENT_MONTHS,
};
