// Trang quản trị Máy chấm công: danh sách máy, duyệt máy, lượt chấm, lệnh đồng bộ.
const { getPool, sql, withActorTransaction, jsonValues } = require('../../config/db');
const { httpError } = require('../../utils/httpError');
const logger = require('../../config/logger');
const { broadcast } = require('../events/eventService');
const protocol = require('./iclockProtocol');
const commands = require('./deviceCommandService');
const sync = require('./deviceSyncService');
const matcher = require('./punchMatcher');
const seminarMatcher = require('./seminarPunchMatcher');
const { getDeviceSettings } = require('./deviceSettings');
const { PURPOSES, isTrainingPurpose, trainingDeviceSql } = require('./devicePurpose');

const listDevices = async () => {
	const pool = await getPool();
	return (
		await pool.request().query(`
      SELECT d.id, d.serial_no, d.name, d.location, d.status, d.purpose, d.name_ascii, d.push_version,
             d.firmware, d.fp_algorithm, d.last_seen_at, d.last_ip, d.user_count, d.fp_count,
             d.created_at, d.suspended_at, d.suspend_reason,
             (SELECT COUNT(*) FROM attendance_device_users u WHERE u.device_id = d.id) AS synced_users,
             (SELECT COUNT(*) FROM attendance_device_commands c
               WHERE c.device_id = d.id AND c.status IN ('pending', 'sent')) AS pending_commands,
             (SELECT COUNT(*) FROM attendance_device_commands c
               WHERE c.device_id = d.id AND c.status = 'failed'
                 AND c.created_at > (now() AT TIME ZONE 'UTC') - interval '1 day') AS failed_commands,
             (SELECT MAX(p.punched_at) FROM attendance_punches p WHERE p.device_id = d.id) AS last_punch_at
      FROM attendance_devices d
      ORDER BY (d.status IN ('pending', 'suspended')) DESC, d.name NULLS LAST, d.serial_no`)
	).recordset.map((d) => ({
		...d,
		synced_users: Number(d.synced_users),
		pending_commands: Number(d.pending_commands),
		failed_commands: Number(d.failed_commands),
	}));
};

const getDevice = async (id) => {
	const pool = await getPool();
	const d = (
		await pool
			.request()
			.input('id', sql.Int, id)
			.query('SELECT id, status, purpose FROM attendance_devices WHERE id = @id')
	).recordset[0];
	if (!d) throw httpError(404, 'Không tìm thấy máy chấm công');
	return d;
};

/** Xếp lệnh CHECK (máy gửi lại toàn bộ người dùng + vân tay) nếu chưa có lệnh đang chờ */
const queuePullFingerprints = async (id, actorId) => {
	const pool = await getPool();
	const busy = (
		await pool
			.request()
			.input('id', sql.Int, id)
			.input('cmd', sql.VarChar(20), protocol.CHECK_COMMAND)
			.query(
				"SELECT 1 AS x FROM attendance_device_commands WHERE device_id = @id AND command = @cmd AND status IN ('pending', 'sent')",
			)
	).recordset.length;
	if (busy) return false;
	await commands.enqueue(id, [{ kind: 'other', command: protocol.CHECK_COMMAND }], actorId);
	return true;
};

/** @param {{ name?: string|null, location?: string|null, status?: string, purpose?: string, name_ascii?: boolean }} data */
const updateDevice = async (id, data, actorId) => {
	const before = await getDevice(id);
	if (data.purpose !== undefined && !PURPOSES.includes(data.purpose))
		throw httpError(400, 'Mục đích máy không hợp lệ');
	const sets = [];
	const inputs = [];
	const add = (col, type, value) => {
		sets.push(`${col} = @${col}`);
		inputs.push([col, type, value]);
	};
	if (data.name !== undefined) add('name', sql.NVarChar(150), data.name || null);
	if (data.location !== undefined) add('location', sql.NVarChar(255), data.location || null);
	if (data.status !== undefined) add('status', sql.VarChar(10), data.status);
	// Bật / mở lại máy (kể cả máy bị tạm khoá vì 1 serial gọi từ 2 nơi — iclockGuard): xoá
	// dấu vết đổi IP để theo dõi lại từ đầu; máy giả còn chạy thì sẽ bị khoá lại.
	if (data.status === 'active')
		sets.push(
			'prev_ip = NULL',
			'ip_changed_at = NULL',
			'suspended_at = NULL',
			'suspend_reason = NULL',
		);
	if (data.purpose !== undefined) add('purpose', sql.VarChar(10), data.purpose);
	if (data.name_ascii !== undefined) add('name_ascii', sql.Bit, !!data.name_ascii);
	if (!sets.length) return;
	await withActorTransaction(actorId, async (tx) => {
		const req = tx.request().input('id', sql.Int, id).input('actor_id', sql.VarChar(20), actorId);
		for (const [n, t, v] of inputs) req.input(n, t, v);
		await req.query(`UPDATE attendance_devices SET ${sets.join(', ')},
        updated_at = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'), updated_by = @actor_id WHERE id = @id`);
	});
	broadcast('update', { entity: 'attendance_device' });
	const purposeChanged = data.purpose !== undefined && data.purpose !== before.purpose;
	const purpose = data.purpose ?? before.purpose;
	// Vừa duyệt / bật lại, đổi cách ghi tên hoặc đổi mục đích ⇒ đồng bộ học viên xuống máy
	// (máy chuyển sang chỉ dùng cho hội nghị ⇒ gỡ học viên server đã gửi xuống)
	if (data.status === 'active' && before.status !== 'active') {
		sync.requestSync();
		// Lần đầu nối với hệ thống: lấy vân tay học viên đã đăng ký trên máy từ trước để
		// chép sang máy khác (học viên không phải quét lại)
		if (
			before.status === 'pending' &&
			isTrainingPurpose(purpose) &&
			(await getDeviceSettings()).fpSync
		)
			await queuePullFingerprints(id, actorId);
	} else if (data.name_ascii !== undefined || purposeChanged) sync.requestSync();
	// Máy quay lại dùng cho đào tạo / bắt đầu dùng cho hội nghị ⇒ ghép lại lượt chấm gần đây đã
	// bị bỏ qua vì mục đích máy (chạy nền — có thể tới vài nghìn lượt)
	const gained = (is) => is(purpose) && !is(before.purpose);
	if (purposeChanged && (gained(isTrainingPurpose) || gained(seminarMatcher.isSeminarPurpose)))
		matcher
			.rematchRecent()
			.catch((e) => logger.error(`[attendanceDevices] Ghép lại lượt chấm lỗi: ${e.message}`));
};

const deleteDevice = async (id) => {
	await getDevice(id);
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.Int, id)
		.query('DELETE FROM attendance_devices WHERE id = @id');
	broadcast('update', { entity: 'attendance_device' });
};

// Lượt đã ghép vào hội nghị (seminar_id — seminarPunchMatcher) tính là "đã ghép" dù match_status
// (kết quả ghép buổi học) là gì
const MATCH_FILTERS = {
	unmatched: "p.match_status IN ('pending', 'no_trainee', 'no_session') AND p.seminar_id IS NULL",
	matched: "(p.match_status = 'matched' OR p.seminar_id IS NOT NULL)",
	skipped: "p.match_status IN ('kept_manual', 'locked', 'not_training') AND p.seminar_id IS NULL",
	all: 'TRUE',
};

/** @param {{ status?: string, from?: string, to?: string, device_id?: number }} q */
const listPunches = async (q) => {
	const pool = await getPool();
	const req = pool.request();
	const where = [MATCH_FILTERS[q.status || 'unmatched'] || MATCH_FILTERS.unmatched];
	// Lọc theo ngày giờ Việt Nam (punched_at lưu UTC)
	if (q.from) {
		req.input('from', sql.Date, q.from);
		where.push("p.punched_at >= (CAST(@from AS timestamp) - interval '7 hours')");
	}
	if (q.to) {
		req.input('to', sql.Date, q.to);
		where.push("p.punched_at < (CAST(@to AS timestamp) + interval '17 hours')");
	}
	if (q.device_id) {
		req.input('device_id', sql.Int, q.device_id);
		where.push('p.device_id = @device_id');
	}
	return (
		await req.query(`
      SELECT p.id, p.pin, p.punched_at, p.verify_mode, p.match_status, p.received_at,
             p.trainee_id, t.full_name AS trainee_name,
             p.session_id, s.session_date, s.start_time, s.end_time, c.id AS course_id, c.name AS course_name,
             d.id AS device_id, COALESCE(d.name, d.serial_no) AS device_name,
             p.seminar_id, sem.title AS seminar_title, sp.full_name AS participant_name
      FROM attendance_punches p
      JOIN attendance_devices d ON d.id = p.device_id
      LEFT JOIN trainees t ON t.id = p.trainee_id
      LEFT JOIN class_sessions s ON s.id = p.session_id
      LEFT JOIN courses c ON c.id = s.course_id
      LEFT JOIN seminars sem ON sem.id = p.seminar_id
      LEFT JOIN seminar_participants sp ON sp.id = p.seminar_participant_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.punched_at DESC
      LIMIT 500`)
	).recordset;
};

// Lệnh vân tay chứa mẫu sinh trắc — không bao giờ trả nguyên văn ra ngoài
const commandSummary = (c) => {
	const pin = /\bPIN=([^\t\s]+)/.exec(c.command)?.[1] || '';
	switch (c.kind) {
		case 'user_upsert': {
			const name = /\bName=([^\t]*)/.exec(c.command)?.[1] || '';
			return `Thêm/cập nhật ${pin} — ${name}`;
		}
		case 'user_delete':
			return `Xóa ${pin} khỏi máy`;
		case 'fp_upsert':
			return `Chép vân tay ngón ${/\bFID=(\d+)/.exec(c.command)?.[1] ?? '?'} của ${pin}`;
		case 'query_attlog': {
			const r = attlogRange(c.command);
			if (!r) return `Kéo lại lượt chấm ${c.command.replace(/^DATA QUERY ATTLOG\s*/, '')}`;
			const vi = (d) => d.split('-').reverse().join('/');
			return r.from === r.to
				? `Kéo lại lượt chấm ngày ${vi(r.from)}`
				: `Kéo lại lượt chấm từ ${vi(r.from)} đến ${vi(r.to)}`;
		}
		default:
			return c.command === protocol.CHECK_COMMAND
				? 'Lấy lại người dùng và vân tay có sẵn trên máy'
				: c.command.slice(0, 80);
	}
};

// "DATA QUERY ATTLOG StartTime=2026-11-26 00:00:00	EndTime=2026-11-26 23:59:59" (giờ VN)
const ATTLOG_RANGE_RE =
	/StartTime=(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\s+EndTime=(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/;
const attlogRange = (command) => {
	const m = ATTLOG_RANGE_RE.exec(command || '');
	if (!m) return null;
	return {
		from: m[1],
		to: m[3],
		start: new Date(`${m[1]}T${m[2]}+07:00`),
		end: new Date(`${m[3]}T${m[4]}+07:00`),
	};
};

/**
 * Kết quả lệnh kéo lại lượt chấm: số lượt của máy trong khoảng đã có trên hệ thống, và số
 * lượt mới nhận kể từ lúc tạo lệnh (lượt trùng máy gửi lại bị bỏ qua nên không đếm).
 * @param {{ device_id: number, created_at: Date, sent_at: Date|null, attlog: any }[]} cmds
 */
const addAttlogResults = async (cmds) => {
	if (!cmds.length) return;
	const pool = await getPool();
	const r = await pool.request().input(
		'rows',
		sql.NVarChar(sql.MAX),
		JSON.stringify(
			cmds.map((c, i) => ({
				i,
				device_id: c.device_id,
				start: c.attlog.start.toISOString(),
				end: c.attlog.end.toISOString(),
				// Mốc tạo lệnh (không phải sent_at: lệnh gửi lại sẽ dời sent_at). Chưa giao ⇒ chưa đếm.
				since: c.sent_at ? new Date(c.created_at).toISOString() : null,
			})),
		),
	).query(`
      SELECT j.i,
             COUNT(p.id) AS in_range,
             COUNT(p.id) FILTER (WHERE j.since IS NOT NULL AND p.received_at >= (j.since AT TIME ZONE 'UTC')) AS received
      FROM jsonb_to_recordset(CAST(@rows AS jsonb))
           AS j(i integer, device_id integer, start timestamptz, "end" timestamptz, since timestamptz)
      LEFT JOIN attendance_punches p ON p.device_id = j.device_id
        AND p.punched_at >= (j.start AT TIME ZONE 'UTC') AND p.punched_at <= (j."end" AT TIME ZONE 'UTC')
      GROUP BY j.i`);
	for (const x of r.recordset) {
		const c = cmds[x.i];
		const { from, to } = c.attlog;
		c.attlog = { from, to, in_range: Number(x.in_range), received: Number(x.received) };
	}
};

/** @param {{ device_id?: number, status?: string }} q */
const listCommands = async (q) => {
	const pool = await getPool();
	const req = pool.request();
	const where = ['TRUE'];
	if (q.device_id) {
		req.input('device_id', sql.Int, q.device_id);
		where.push('c.device_id = @device_id');
	}
	if (q.status) {
		req.input('status', sql.VarChar(10), q.status);
		where.push('c.status = @status');
	}
	const rows = (
		await req.query(`
      SELECT c.id, c.device_id, COALESCE(d.name, d.serial_no) AS device_name, c.kind, c.trainee_id,
             t.full_name AS trainee_name, c.command, c.status, c.return_code, c.attempts,
             c.created_at, c.sent_at, c.done_at
      FROM attendance_device_commands c
      JOIN attendance_devices d ON d.id = c.device_id
      LEFT JOIN trainees t ON t.id = c.trainee_id
      WHERE ${where.join(' AND ')}
      ORDER BY c.id DESC
      LIMIT 300`)
	).recordset.map(({ command, ...c }) => ({
		...c,
		summary: commandSummary({ ...c, command }),
		...(c.kind === 'query_attlog' ? { attlog: attlogRange(command) } : {}),
	}));
	await addAttlogResults(rows.filter((c) => c.attlog));
	return rows;
};

const requireActive = async (id) => {
	const d = await getDevice(id);
	if (d.status !== 'active') throw httpError(409, 'Máy chưa được duyệt hoặc đang tắt');
};

const resync = async (id, actorId) => {
	await requireActive(id);
	return sync.resyncDevice(id, actorId);
};

/** Kéo lại lượt chấm trong khoảng ngày (giờ VN) — máy gửi lại, trùng thì bỏ qua */
const pullAttlog = async (id, from, to, actorId) => {
	await requireActive(id);
	const start = new Date(`${from}T00:00:00+07:00`);
	const end = new Date(`${to}T23:59:59+07:00`);
	if (!(start <= end)) throw httpError(400, 'Khoảng ngày không hợp lệ');
	await commands.enqueue(
		id,
		[{ kind: 'query_attlog', command: protocol.formatQueryAttlog(start, end) }],
		actorId,
	);
};

/** Nút "Lấy vân tay có sẵn trên máy" */
const pullFingerprints = async (id, actorId) => {
	await requireActive(id);
	return queuePullFingerprints(id, actorId);
};

/**
 * Đẩy tay học viên xuống mọi máy đào tạo đang hoạt động (trang Tất cả học viên): giữ trên
 * máy DEVICE_CLEANUP_DAYS ngày kể từ hôm nay dù chưa có khóa đang học, rồi đồng bộ ngay.
 * @param {string[]} traineeIds
 */
const pushTrainees = async (traineeIds, actorId) => {
	const pool = await getPool();
	const active = (
		await pool
			.request()
			.query(
				`SELECT COUNT(*) AS n FROM attendance_devices d WHERE d.status = 'active' AND ${trainingDeviceSql('d')}`,
			)
	).recordset[0].n;
	if (!Number(active))
		throw httpError(409, 'Chưa có máy chấm công học viên nào đang hoạt động');
	const ids = [...new Set(traineeIds)];
	const rows = (
		await pool
			.request()
			.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
			.query(
				`SELECT id, full_name, is_active FROM trainees WHERE id IN ${jsonValues('@ids', { type: 'VARCHAR(20)' })}`,
			)
	).recordset;
	const found = new Map(rows.map((r) => [r.id, r]));
	const skipped = [];
	const valid = [];
	for (const id of ids) {
		const t = found.get(id);
		if (!t) skipped.push({ id, reason: 'Không tìm thấy học viên' });
		else if (!t.is_active) skipped.push({ id, reason: `${t.full_name}: học viên đang bị khóa` });
		else if (!protocol.pinFromTraineeId(id))
			skipped.push({ id, reason: `${t.full_name}: mã không đúng dạng HV + 8 số` });
		else valid.push(id);
	}
	if (valid.length) {
		const { cleanupDays } = await getDeviceSettings();
		await pool
			.request()
			.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(valid))
			.input('days', sql.Int, Math.max(cleanupDays, 1))
			.input('actor_id', sql.VarChar(20), actorId).query(`
        INSERT INTO attendance_device_manual AS tgt (trainee_id, until_date, created_by)
        SELECT j.value, CAST(now() AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE) + @days, @actor_id
        FROM ${jsonValues('@ids', { type: 'VARCHAR(20)' })} j
        ON CONFLICT (trainee_id) DO UPDATE SET
          until_date = GREATEST(tgt.until_date, EXCLUDED.until_date),
          updated_at = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'), updated_by = @actor_id`);
	}
	const { queued } = valid.length ? await sync.reconcile({ actorId }) : { queued: 0 };
	return { pushed: valid.length, skipped, queued };
};

const syncAll = (actorId) => sync.reconcile({ actorId });
const rematch = (days) => matcher.rematchRecent(days);

module.exports = {
	listDevices,
	updateDevice,
	deleteDevice,
	listPunches,
	listCommands,
	resync,
	pullAttlog,
	pullFingerprints,
	pushTrainees,
	syncAll,
	rematch,
};
