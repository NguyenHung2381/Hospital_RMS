// Đồng bộ học viên (và vân tay) xuống máy chấm công theo kiểu so khớp
// "cần có" ↔ "đang có" — không phải chèn hook vào mọi chỗ duyệt ghi danh:
//   cần có  = học viên ghi danh 'approved' của khóa chưa hủy, đã/sắp bắt đầu (≤ 7 ngày)
//             và chưa quá DEVICE_CLEANUP_DAYS ngày sau khi kết thúc
//   đang có = attendance_device_users (những gì server đã gửi xuống từng máy)
// Máy chỉ dành cho hội nghị (purpose = 'seminar', devicePurpose.js) "cần có" = rỗng.
// Chỉ xóa khỏi máy học viên do server gửi xuống — người dùng khác trên máy (nhân viên
// do phần mềm khác thêm) không bao giờ bị đụng tới.
const { getPool, sql, withTransaction, lockResource } = require('../../config/db');
const logger = require('../../config/logger');
const { broadcast, onUpdate } = require('../events/eventService');
const protocol = require('./iclockProtocol');
const commands = require('./deviceCommandService');
const fingerprints = require('./fingerprintService');
const { getDeviceSettings } = require('./deviceSettings');
const { desiredTrainees } = require('./desiredTrainees');
const { isTrainingPurpose } = require('./devicePurpose');

// Lệnh hỏng trong 24 giờ qua ⇒ không tự xếp lại (tránh vòng lặp với lỗi cố định)
const FAILED_COOLDOWN_HOURS = 24;

/**
 * Lên danh sách việc cho 1 máy (hàm thuần — test riêng).
 * @returns {{ kind: 'user_upsert'|'user_delete'|'fp_upsert', traineeId: string, pin: string, name?: string, fingerIndex?: number }[]}
 */
const planDeviceSync = ({ device, desired, current, fingerMeta, busy, fpSync }) => {
	const plan = [];
	const cur = new Map(current.map((c) => [c.trainee_id, c]));
	const isBusy = (kind, traineeId, extra = '') => busy.has(`${kind}:${traineeId}${extra}`);
	const want = new Set();
	for (const d of desired) {
		const pin = protocol.pinFromTraineeId(d.trainee_id);
		if (!pin) continue;
		want.add(d.trainee_id);
		const name = protocol.deviceName(d.full_name, device.name_ascii);
		const c = cur.get(d.trainee_id);
		if ((!c || c.name_sent !== name) && !isBusy('user_upsert', d.trainee_id))
			plan.push({ kind: 'user_upsert', traineeId: d.trainee_id, pin, name });
		if (!fpSync) continue;
		const hashes = fingerprints.parseHashes(c?.fp_hashes);
		for (const f of fingerMeta.get(d.trainee_id) || []) {
			// Chỉ chép giữa các máy cùng phiên bản thuật toán vân tay
			if (f.algo && device.fp_algorithm && String(f.algo) !== String(device.fp_algorithm)) continue;
			if (hashes[f.fingerIndex] === f.hash) continue;
			if (isBusy('fp_upsert', d.trainee_id, `:${f.fingerIndex}`)) continue;
			plan.push({ kind: 'fp_upsert', traineeId: d.trainee_id, pin, fingerIndex: f.fingerIndex });
		}
	}
	for (const c of current) {
		if (!want.has(c.trainee_id) && !isBusy('user_delete', c.trainee_id))
			plan.push({ kind: 'user_delete', traineeId: c.trainee_id, pin: c.pin });
	}
	return plan;
};

// FID trong lệnh vân tay — để biết lệnh đang chờ là của ngón nào
const fidOf = (command) => {
	const m = /\bFID=(\d+)/.exec(command || '');
	return m ? `:${m[1]}` : '';
};

const syncDevice = async (tx, device, desired, meta, settings, actorId) => {
	const current = (
		await tx
			.request()
			.input('device_id', sql.Int, device.id)
			.query(
				'SELECT trainee_id, pin, name_sent, fp_hashes FROM attendance_device_users WHERE device_id = @device_id',
			)
	).recordset;
	const busyRows = (
		await tx
			.request()
			.input('device_id', sql.Int, device.id)
			.input('hours', sql.Int, FAILED_COOLDOWN_HOURS).query(`
        SELECT kind, trainee_id, command FROM attendance_device_commands
        WHERE device_id = @device_id AND trainee_id IS NOT NULL
          AND (status IN ('pending', 'sent')
               OR (status = 'failed' AND created_at > (now() AT TIME ZONE 'UTC') - make_interval(hours => @hours)))`)
	).recordset;
	const busy = new Set(
		busyRows.map(
			(r) => `${r.kind}:${r.trainee_id}${r.kind === 'fp_upsert' ? fidOf(r.command) : ''}`,
		),
	);
	const plan = planDeviceSync({
		device,
		desired,
		current,
		fingerMeta: meta,
		busy,
		fpSync: settings.fpSync,
	});
	const cmds = [];
	for (const p of plan) {
		const pushVersion = device.push_version;
		if (p.kind === 'user_upsert')
			cmds.push({
				kind: p.kind,
				traineeId: p.traineeId,
				command: protocol.formatUserUpsert({
					pin: p.pin,
					name: p.name,
					ascii: device.name_ascii,
					pushVersion,
				}),
			});
		else if (p.kind === 'user_delete')
			cmds.push({
				kind: p.kind,
				traineeId: p.traineeId,
				command: protocol.formatUserDelete({ pin: p.pin, pushVersion }),
			});
		else {
			const t = await fingerprints.loadTemplate(tx, p.traineeId, p.fingerIndex);
			if (!t) continue;
			cmds.push({
				kind: p.kind,
				traineeId: p.traineeId,
				command: protocol.formatFingerUpsert({
					pin: p.pin,
					fingerIndex: p.fingerIndex,
					size: t.size,
					valid: t.valid,
					template: t.template,
					pushVersion,
				}),
			});
		}
	}
	// Thêm người trước, vân tay sau, xóa cuối (máy cần có người rồi mới nhận vân tay)
	const order = { user_upsert: 0, fp_upsert: 1, user_delete: 2 };
	cmds.sort((a, b) => order[a.kind] - order[b.kind]);
	await commands.enqueue(device.id, cmds, actorId, tx);
	return cmds.length;
};

/**
 * So khớp và xếp lệnh cho mọi máy đang hoạt động (hoặc 1 máy). Khóa advisory: nhiều
 * worker gọi cùng lúc thì chạy lần lượt, không xếp trùng lệnh.
 * @param {{ deviceId?: number, actorId?: string|null }} [opts]
 */
const reconcile = async ({ deviceId, actorId = null } = {}) => {
	const settings = await getDeviceSettings();
	return withTransaction(async (tx) => {
		if (!(await lockResource(tx, 'attendance_device_sync', 15000)))
			throw new Error('Đang có lượt đồng bộ máy chấm công khác chạy');
		const devReq = tx.request();
		if (deviceId) devReq.input('id', sql.Int, deviceId);
		const devices = (
			await devReq.query(
				`SELECT id, serial_no, name_ascii, push_version, fp_algorithm, purpose FROM attendance_devices
         WHERE status = 'active'${deviceId ? ' AND id = @id' : ''}`,
			)
		).recordset;
		if (!devices.length) return { queued: 0 };
		const desired = await desiredTrainees(tx, settings.cleanupDays);
		const meta = settings.fpSync
			? await fingerprints.fingerMeta(
					tx,
					desired.map((d) => d.trainee_id),
				)
			: new Map();
		let queued = 0;
		// Máy chỉ dành cho hội nghị không cần học viên nào ⇒ học viên server đã gửi xuống bị gỡ
		for (const device of devices)
			queued += await syncDevice(
				tx,
				device,
				isTrainingPurpose(device.purpose) ? desired : [],
				meta,
				settings,
				actorId,
			);
		// Tối thiểu hóa dữ liệu sinh trắc: học viên không còn cần trên máy nào ⇒ xóa mẫu vân tay
		await tx
			.request()
			.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(desired.map((d) => d.trainee_id))).query(`
        DELETE FROM trainee_fingerprints f
        WHERE f.trainee_id NOT IN (SELECT value FROM jsonb_array_elements_text(CAST(@ids AS jsonb)))
          AND NOT EXISTS (SELECT 1 FROM attendance_device_users u WHERE u.trainee_id = f.trainee_id)`);
		if (queued) logger.info(`[attendanceDevices] Xếp ${queued} lệnh đồng bộ xuống máy chấm công`);
		return { queued };
	});
};

// Gọi ngay sau khi duyệt ghi danh / bấm nút — gộp các lần gọi dồn trong 3 giây
let timer = null;
const requestSync = () => {
	if (timer) return;
	timer = setTimeout(() => {
		timer = null;
		reconcile().catch((e) => logger.error(`[attendanceDevices] Đồng bộ lỗi: ${e.message}`));
	}, 3000);
	timer.unref?.();
};

/**
 * Máy báo xong lệnh ⇒ cập nhật "đang có".
 * @param {number} deviceId
 * @param {{ kind: string, trainee_id: string|null, command: string, status: string }[]} done
 */
const applyCompleted = async (deviceId, done) => {
	const pool = await getPool();
	for (const c of done) {
		if (c.status !== 'done' || !c.trainee_id) continue;
		const req = () =>
			pool
				.request()
				.input('device_id', sql.Int, deviceId)
				.input('trainee_id', sql.VarChar(20), c.trainee_id);
		const pin = protocol.pinFromTraineeId(c.trainee_id);
		if (c.kind === 'user_upsert') {
			const name = /\bName=([^\t]*)/.exec(c.command)?.[1] ?? null;
			await req().input('pin', sql.VarChar(24), pin).input('name', sql.NVarChar(50), name).query(`
        INSERT INTO attendance_device_users (device_id, trainee_id, pin, name_sent, synced_at)
        VALUES (@device_id, @trainee_id, @pin, @name, (now() AT TIME ZONE 'UTC'))
        ON CONFLICT (device_id, trainee_id) DO UPDATE SET
          name_sent = EXCLUDED.name_sent, synced_at = EXCLUDED.synced_at`);
		} else if (c.kind === 'user_delete') {
			await req().query(
				'DELETE FROM attendance_device_users WHERE device_id = @device_id AND trainee_id = @trainee_id',
			);
		} else if (c.kind === 'fp_upsert') {
			const fid = /\bFID=(\d+)/.exec(c.command)?.[1];
			const tmp = /\bTMP=([^\t]+)/.exec(c.command)?.[1];
			if (fid === undefined || !tmp) continue;
			const cur = (
				await req().query(
					'SELECT fp_hashes FROM attendance_device_users WHERE device_id = @device_id AND trainee_id = @trainee_id',
				)
			).recordset[0];
			if (!cur) continue;
			const hashes = {
				...fingerprints.parseHashes(cur.fp_hashes),
				[fid]: fingerprints.templateHash(tmp),
			};
			await req()
				.input('hashes', sql.NVarChar(sql.MAX), JSON.stringify(hashes))
				.query(
					'UPDATE attendance_device_users SET fp_hashes = @hashes WHERE device_id = @device_id AND trainee_id = @trainee_id',
				);
		}
	}
	broadcast('update', { entity: 'attendance_device' });
};

/** Gửi lại toàn bộ cho 1 máy (máy bị xóa dữ liệu / thay máy) */
const resyncDevice = async (deviceId, actorId) => {
	const pool = await getPool();
	await commands.cancelPending(deviceId, ['user_upsert', 'fp_upsert', 'user_delete']);
	// Giữ dòng "đang có" (để còn dọn được khi hết hạn), chỉ xóa dấu đã gửi ⇒ gửi lại hết
	await pool
		.request()
		.input('device_id', sql.Int, deviceId)
		.query(
			'UPDATE attendance_device_users SET name_sent = NULL, fp_hashes = NULL WHERE device_id = @device_id',
		);
	return reconcile({ deviceId, actorId });
};

// Ghi danh khóa học đổi (duyệt / hủy duyệt / chuyển lớp...) ⇒ đồng bộ ngay xuống máy chấm
// công thay vì chờ job 5 phút. Nghe qua eventService để module training không phụ thuộc
// ngược vào module này (scripts/check-deps.js).
onUpdate('course_enrollment', requestSync);

module.exports = { reconcile, requestSync, applyCompleted, resyncDevice, planDeviceSync };
