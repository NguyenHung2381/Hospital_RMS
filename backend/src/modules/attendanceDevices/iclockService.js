// Xử lý các yêu cầu máy chấm công gửi tới /iclock/* (xem iclockProtocol.js).
// Máy nhận diện bằng số serial (SN) — giao thức không có xác thực, nên chỉ máy đã được
// quản trị duyệt (status = 'active') mới được nhận dữ liệu. Máy lạ được ghi 'pending'
// (tối đa MAX_PENDING) và nhận câu trả lời lỗi ⇒ máy giữ dữ liệu, gửi lại sau khi duyệt.
const { getPool, sql } = require('../../config/db');
const logger = require('../../config/logger');
const { broadcast } = require('../events/eventService');
const protocol = require('./iclockProtocol');
const commands = require('./deviceCommandService');

// require muộn — tránh vòng require qua courseAttendanceService
const matcher = () => require('./punchMatcher');
const fingerprints = () => require('./fingerprintService');
const sync = () => require('./deviceSyncService');

const MAX_PENDING = 20;
// ICLOCK_DEBUG_RAW=true ⇒ ghi cả nội dung máy gửi vào log (dùng khi chốt định dạng firmware)
const debugRaw = () => process.env.ICLOCK_DEBUG_RAW === 'true';

class DeviceRejected extends Error {}

const logRaw = (sn, what, body) => {
	if (!debugRaw()) return;
	const text = String(body || '');
	logger.info(`[iclock] ${sn} ${what} (${text.length} ký tự): ${text.slice(0, 4000)}`);
};

const findDevice = async (pool, sn) =>
	(
		await pool
			.request()
			.input('sn', sql.VarChar(40), sn)
			.query('SELECT * FROM attendance_devices WHERE serial_no = @sn')
	).recordset[0] || null;

/**
 * Máy theo SN (tạo 'pending' nếu chưa có) + cập nhật lần liên lạc cuối.
 * @param {string} sn
 * @param {{ ip?: string|null, pushVersion?: string|null, info?: ReturnType<typeof protocol.parseInfo> }} meta
 */
const resolveDevice = async (sn, { ip = null, pushVersion = null, info = null } = {}) => {
	if (!protocol.isValidSerial(sn)) throw new DeviceRejected('SN không hợp lệ');
	const pool = await getPool();
	let device = await findDevice(pool, sn);
	if (!device) {
		const pending = (
			await pool
				.request()
				.query("SELECT COUNT(*) AS n FROM attendance_devices WHERE status = 'pending'")
		).recordset[0].n;
		if (Number(pending) >= MAX_PENDING) throw new DeviceRejected('Quá nhiều máy chờ duyệt');
		await pool
			.request()
			.input('sn', sql.VarChar(40), sn)
			.query(
				"INSERT INTO attendance_devices (serial_no, status) VALUES (@sn, 'pending') ON CONFLICT (serial_no) DO NOTHING",
			);
		logger.warn(
			`[iclock] Máy chấm công mới ${sn} (${ip || '?'}) — chờ duyệt ở trang Máy chấm công`,
		);
		broadcast('update', { entity: 'attendance_device' });
		device = await findDevice(pool, sn);
	}
	const r = await pool
		.request()
		.input('id', sql.Int, device.id)
		.input('ip', sql.VarChar(45), ip ? String(ip).slice(0, 45) : null)
		.input('push', sql.VarChar(20), pushVersion ? String(pushVersion).slice(0, 20) : null)
		.input('fw', sql.VarChar(100), info?.firmware ?? null)
		.input('users', sql.Int, info?.userCount ?? null)
		.input('fps', sql.Int, info?.fpCount ?? null)
		.input('algo', sql.VarChar(20), info?.fpAlgorithm ?? null).query(`
      UPDATE attendance_devices SET
        last_seen_at = (now() AT TIME ZONE 'UTC'),
        last_ip = COALESCE(@ip, last_ip),
        push_version = COALESCE(@push, push_version),
        firmware = COALESCE(@fw, firmware),
        user_count = COALESCE(@users, user_count),
        fp_count = COALESCE(@fps, fp_count),
        fp_algorithm = COALESCE(@algo, fp_algorithm)
      WHERE id = @id
      RETURNING *`);
	return r.recordset[0];
};

const requireActive = (device) => {
	if (device.status !== 'active')
		throw new DeviceRejected(`Máy ${device.serial_no} chưa được duyệt`);
};

/** GET /iclock/cdata — chào hỏi */
const handshake = async (sn, query, ip) => {
	const device = await resolveDevice(sn, { ip, pushVersion: query.pushver || null });
	logRaw(sn, 'handshake', JSON.stringify(query));
	return protocol.formatOptions(device);
};

// stamp = null ⇒ xóa (máy gửi lại từ đầu)
const setStamp = async (deviceId, column, stamp) => {
	if (stamp !== null && (!stamp || !/^\d{1,20}$/.test(String(stamp)))) return;
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.Int, deviceId)
		.input('stamp', sql.VarChar(20), stamp === null ? null : String(stamp))
		.query(`UPDATE attendance_devices SET ${column} = @stamp WHERE id = @id`);
};

const saveAttlog = async (device, body) => {
	const { records, invalid } = protocol.parseAttlog(body);
	if (invalid)
		logger.warn(`[iclock] ${device.serial_no}: bỏ ${invalid} dòng ATTLOG không đọc được`);
	if (!records.length) return 0;
	const pool = await getPool();
	const r = await pool
		.request()
		.input('device_id', sql.Int, device.id)
		.input(
			'rows',
			sql.NVarChar(sql.MAX),
			JSON.stringify(
				records.map((x) => ({
					pin: x.pin,
					at: x.punchedAt.toISOString(),
					inout: x.inOut,
					verify: x.verifyMode,
				})),
			),
		).query(`
      INSERT INTO attendance_punches (device_id, pin, punched_at, in_out, verify_mode)
      SELECT @device_id, j.pin, (j.at AT TIME ZONE 'UTC'), j.inout, j.verify
      FROM jsonb_to_recordset(CAST(@rows AS jsonb)) AS j(pin varchar(24), at timestamptz, inout smallint, verify smallint)
      ON CONFLICT (device_id, pin, punched_at) DO NOTHING
      RETURNING id`);
	const ids = r.recordset.map((x) => x.id);
	if (ids.length) await matcher().matchPunches(ids);
	return records.length;
};

/** POST /iclock/cdata?table=... — dữ liệu máy gửi lên. Trả chuỗi "OK: n". */
const receive = async (sn, query, body, ip) => {
	const device = await resolveDevice(sn, { ip });
	const table = String(query.table || '').toUpperCase();
	logRaw(sn, `POST ${table}`, body);
	requireActive(device);
	if (table === 'ATTLOG') {
		const n = await saveAttlog(device, body);
		await setStamp(device.id, 'attlog_stamp', query.Stamp ?? query.stamp);
		return `OK: ${n}`;
	}
	if (['OPERLOG', 'BIODATA', 'USERINFO', 'FINGERTMP'].includes(table)) {
		const parsed = protocol.parseOperlog(body);
		await fingerprints().saveFromDevice(device, parsed.fingers);
		if (parsed.fingers.length) sync().requestSync();
		if (table === 'OPERLOG')
			await setStamp(device.id, 'operlog_stamp', query.OpStamp ?? query.Stamp);
		return `OK: ${parsed.users.length + parsed.fingers.length + parsed.other}`;
	}
	if (table === 'OPTIONS') {
		const pool = await getPool();
		await pool
			.request()
			.input('id', sql.Int, device.id)
			.input('info', sql.NVarChar(sql.MAX), String(body || '').slice(0, 4000))
			.query('UPDATE attendance_devices SET device_info = @info WHERE id = @id');
		return 'OK';
	}
	// Bảng khác (ảnh chấm công, nhật ký lỗi...) — nhận để máy không gửi lại mãi
	return 'OK';
};

/** GET /iclock/getrequest — máy hỏi lệnh */
const getRequest = async (sn, query, ip) => {
	const info = protocol.parseInfo(query.INFO);
	const device = await resolveDevice(sn, { ip, info });
	if (info) logRaw(sn, 'INFO', query.INFO);
	if (device.status !== 'active') return 'OK';
	const cmds = await commands.takePending(device.id);
	if (cmds.length) logger.info(`[iclock] ${sn}: gửi ${cmds.length} lệnh`);
	// CHECK: máy hỏi lại cấu hình — trả OPERLOGStamp=None để máy gửi lại toàn bộ người dùng
	// + vân tay (lấy vân tay đăng ký từ trước). Xóa stamp đúng lúc giao lệnh, không lúc xếp
	// lệnh: lượt gửi OPERLOG thường xen giữa sẽ ghi stamp mới đè mất.
	if (cmds.some((c) => c.command === protocol.CHECK_COMMAND))
		await setStamp(device.id, 'operlog_stamp', null);
	return protocol.formatCommands(cmds);
};

/** POST /iclock/devicecmd — máy báo kết quả lệnh */
const deviceCmd = async (sn, body, ip) => {
	const device = await resolveDevice(sn, { ip });
	logRaw(sn, 'devicecmd', body);
	const results = protocol.parseDeviceCmdResult(body);
	const done = await commands.complete(device.id, results);
	const failed = done.filter((c) => c.status === 'failed');
	if (failed.length)
		logger.warn(
			// Không ghi mẫu vân tay (TMP=...) vào log
			`[iclock] ${sn}: ${failed.length} lệnh lỗi (vd. #${failed[0].id} "${failed[0].command.replace(/TMP=\S+/, 'TMP=…').slice(0, 80)}")`,
		);
	await sync().applyCompleted(device.id, done);
	return 'OK';
};

module.exports = { handshake, receive, getRequest, deviceCmd, DeviceRejected, MAX_PENDING };
