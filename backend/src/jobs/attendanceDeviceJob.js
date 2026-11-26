// Máy chấm công vân tay (modules/attendanceDevices):
//   run()   5 phút/lần — lệnh treo ⇒ gửi lại, so khớp học viên xuống máy (thêm / dọn / vân
//           tay), ghép lại lượt chấm chưa khớp 7 ngày gần nhất (buổi học / ghi danh có thể
//           được tạo sau khi học viên đã chấm).
//   purge() hằng ngày — xóa lượt chấm thô > 1 năm (điểm danh đã ghi vẫn còn ở bảng
//           attendance) và lịch sử lệnh đã xong > 90 ngày.
const { getPool } = require('../config/db');
const { isModuleEnabled } = require('../middlewares/moduleGuard');
const commands = require('../modules/attendanceDevices/deviceCommandService');
const sync = require('../modules/attendanceDevices/deviceSyncService');
const matcher = require('../modules/attendanceDevices/punchMatcher');

const hasDevices = async () =>
	(
		await (
			await getPool()
		)
			.request()
			.query("SELECT 1 AS x FROM attendance_devices WHERE status = 'active' LIMIT 1")
	).recordset.length > 0;

const run = async () => {
	if (!(await isModuleEnabled('TRAINING')) || !(await hasDevices())) return;
	await commands.requeueStale();
	await sync.reconcile();
	await matcher.rematchRecent(7);
};

const purge = async () => {
	const pool = await getPool();
	await pool.request().query(`
    DELETE FROM attendance_punches
    WHERE received_at < (now() AT TIME ZONE 'UTC') - interval '365 days'`);
	await commands.purgeOld();
};

module.exports = { run, purge };
