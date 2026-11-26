// Hàng đợi lệnh gửi xuống máy chấm công. Máy tự hỏi /iclock/getrequest (≈10–30 giây/lần),
// server trả các lệnh 'pending' (đánh dấu 'sent'); máy làm xong báo /iclock/devicecmd.
const { getPool, sql, jsonValues } = require('../../config/db');
const { broadcast } = require('../events/eventService');

const BATCH = 20; // lệnh mỗi lần máy hỏi — lệnh vân tay khá dài
const MAX_ATTEMPTS = 3;
const SENT_TIMEOUT_MIN = 10;

/**
 * Xếp lệnh cho 1 máy.
 * @param {number} deviceId
 * @param {{ kind: string, command: string, traineeId?: string|null }[]} cmds
 * @param {string|null} [actorId]
 * @param {any} [runner] transaction đang mở (mặc định pool)
 */
const enqueue = async (deviceId, cmds, actorId = null, runner = null) => {
	if (!cmds.length) return 0;
	const pool = runner || (await getPool());
	await pool
		.request()
		.input('device_id', sql.Int, deviceId)
		.input('actor_id', sql.VarChar(20), actorId)
		.input(
			'rows',
			sql.NVarChar(sql.MAX),
			JSON.stringify(
				cmds.map((c) => ({ kind: c.kind, command: c.command, trainee_id: c.traineeId ?? null })),
			),
		).query(`
      INSERT INTO attendance_device_commands (device_id, kind, trainee_id, command, created_by)
      SELECT @device_id, j.kind, j.trainee_id, j.command, @actor_id
      FROM jsonb_to_recordset(CAST(@rows AS jsonb)) AS j(kind varchar(20), trainee_id varchar(20), command text)`);
	broadcast('update', { entity: 'attendance_device' });
	return cmds.length;
};

/** Lấy lệnh chờ của máy (cũ trước) và đánh dấu đã gửi */
const takePending = async (deviceId) => {
	const pool = await getPool();
	const r = await pool.request().input('device_id', sql.Int, deviceId).input('n', sql.Int, BATCH)
		.query(`
      UPDATE attendance_device_commands c
      SET status = 'sent', sent_at = (now() AT TIME ZONE 'UTC'), attempts = c.attempts + 1
      WHERE c.id IN (SELECT id FROM attendance_device_commands
                     WHERE device_id = @device_id AND status = 'pending'
                     ORDER BY id LIMIT @n FOR UPDATE SKIP LOCKED)
      RETURNING c.id, c.command`);
	return r.recordset.sort((a, b) => a.id - b.id);
};

/**
 * Máy báo kết quả. Return = 0 là thành công (âm là lỗi). Trả các lệnh vừa xong để bên gọi
 * cập nhật trạng thái đồng bộ (attendance_device_users).
 * @param {number} deviceId
 * @param {{ id: number, returnCode: number }[]} results
 */
const complete = async (deviceId, results) => {
	if (!results.length) return [];
	const pool = await getPool();
	const r = await pool
		.request()
		.input('device_id', sql.Int, deviceId)
		.input(
			'rows',
			sql.NVarChar(sql.MAX),
			JSON.stringify(results.map((x) => ({ id: x.id, rc: x.returnCode }))),
		).query(`
      UPDATE attendance_device_commands c
      SET status = CASE WHEN j.rc >= 0 THEN 'done' ELSE 'failed' END,
          return_code = j.rc, done_at = (now() AT TIME ZONE 'UTC')
      FROM jsonb_to_recordset(CAST(@rows AS jsonb)) AS j(id bigint, rc integer)
      WHERE c.id = j.id AND c.device_id = @device_id AND c.status IN ('sent', 'pending')
      RETURNING c.id, c.kind, c.trainee_id, c.command, c.status`);
	broadcast('update', { entity: 'attendance_device' });
	return r.recordset;
};

/** Lệnh 'sent' quá lâu không có kết quả ⇒ gửi lại; quá số lần ⇒ 'failed' */
const requeueStale = async () => {
	const pool = await getPool();
	await pool.request().input('min', sql.Int, SENT_TIMEOUT_MIN).input('max', sql.Int, MAX_ATTEMPTS)
		.query(`
      UPDATE attendance_device_commands
      SET status = CASE WHEN attempts >= @max THEN 'failed' ELSE 'pending' END
      WHERE status = 'sent' AND sent_at < (now() AT TIME ZONE 'UTC') - make_interval(mins => @min)`);
};

/** Hủy lệnh còn chờ (vd. trước khi đồng bộ lại toàn bộ) */
const cancelPending = async (deviceId, kinds, runner = null) => {
	const pool = runner || (await getPool());
	await pool
		.request()
		.input('device_id', sql.Int, deviceId)
		.input('kinds', sql.NVarChar(sql.MAX), JSON.stringify(kinds)).query(`
      UPDATE attendance_device_commands SET status = 'cancelled'
      WHERE device_id = @device_id AND status = 'pending' AND kind IN ${jsonValues('@kinds')}`);
};

/** Xóa lịch sử lệnh đã xong quá 90 ngày */
const purgeOld = async () => {
	const pool = await getPool();
	await pool.request().query(`
    DELETE FROM attendance_device_commands
    WHERE status IN ('done', 'failed', 'cancelled')
      AND created_at < (now() AT TIME ZONE 'UTC') - interval '90 days'`);
};

module.exports = { enqueue, takePending, complete, requeueStale, cancelPending, purgeOld, BATCH };
