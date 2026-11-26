// Mẫu vân tay học viên — dữ liệu sinh trắc học (Nghị định 13/2023): chỉ lưu khi bật
// DEVICE_FP_SYNC, mã hóa AES-GCM (utils/secretBox, khóa ngoài DB), không API nào trả ra,
// xóa khi học viên được dọn khỏi mọi máy (deviceSyncService.reconcile).
const { getPool, sql } = require('../../config/db');
const { encrypt, decrypt, keyedHash } = require('../../utils/secretBox');
const logger = require('../../config/logger');
const { traineeIdFromPin } = require('./iclockProtocol');
const { getDeviceSettings } = require('./deviceSettings');
const { desiredTrainees } = require('./desiredTrainees');

const templateHash = (template) => keyedHash(`fp:${template}`);

const parseHashes = (s) => {
	try {
		const o = JSON.parse(s || '{}');
		return o && typeof o === 'object' ? o : {};
	} catch {
		return {};
	}
};

/**
 * Lưu mẫu vân tay máy gửi lên (OPERLOG FP / BIODATA). Ghi nhận máy nguồn đã có mẫu này
 * (attendance_device_users.fp_hashes) để không gửi ngược lại. Trả số mẫu mới/đổi.
 * @param {{ id: number, fp_algorithm: string|null }} device
 * @param {{ pin: string, fingerIndex: number, size: number|null, valid: number, template: string, majorVer: string|null }[]} fingers
 */
const saveFromDevice = async (device, fingers) => {
	const settings = await getDeviceSettings();
	if (!fingers.length || !settings.fpSync) return 0;
	const pool = await getPool();
	// Chỉ giữ vân tay của học viên đang cần có trên máy — không lưu của người khác trên máy
	// (máy gửi lại toàn bộ sau lệnh CHECK: cả nhân viên, học viên cũ)
	const wanted = new Set(
		(await desiredTrainees(pool, settings.cleanupDays)).map((d) => d.trainee_id),
	);
	let changed = 0;
	for (const f of fingers) {
		const traineeId = traineeIdFromPin(f.pin);
		if (!traineeId || !wanted.has(traineeId)) continue;
		const hash = templateHash(f.template);
		const req = () =>
			pool
				.request()
				.input('trainee_id', sql.VarChar(20), traineeId)
				.input('finger', sql.SmallInt, f.fingerIndex)
				.input('hash', sql.VarChar(64), hash);
		const r = await req()
			.input('enc', sql.NVarChar(sql.MAX), encrypt(f.template))
			.input('size', sql.Int, f.size)
			.input('valid', sql.SmallInt, f.valid)
			.input('algo', sql.VarChar(20), f.majorVer || device.fp_algorithm || null)
			.input('device_id', sql.Int, device.id).query(`
        INSERT INTO trainee_fingerprints AS tgt
          (trainee_id, finger_index, template_enc, template_hash, size, valid, algo_version, source_device_id)
        VALUES (@trainee_id, @finger, @enc, @hash, @size, @valid, @algo, @device_id)
        ON CONFLICT (trainee_id, finger_index) DO UPDATE SET
          template_enc = EXCLUDED.template_enc, template_hash = EXCLUDED.template_hash,
          size = EXCLUDED.size, valid = EXCLUDED.valid, algo_version = EXCLUDED.algo_version,
          source_device_id = EXCLUDED.source_device_id,
          updated_at = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
        WHERE tgt.template_hash <> EXCLUDED.template_hash
        RETURNING trainee_id`);
		if (r.recordset.length) changed += 1;
		// Máy nguồn đã có mẫu này
		const cur = (
			await pool
				.request()
				.input('device_id', sql.Int, device.id)
				.input('trainee_id', sql.VarChar(20), traineeId)
				.query(
					'SELECT fp_hashes FROM attendance_device_users WHERE device_id = @device_id AND trainee_id = @trainee_id',
				)
		).recordset[0];
		const hashes = { ...parseHashes(cur?.fp_hashes), [f.fingerIndex]: hash };
		await req()
			.input('device_id', sql.Int, device.id)
			.input('pin', sql.VarChar(24), f.pin)
			.input('hashes', sql.NVarChar(sql.MAX), JSON.stringify(hashes)).query(`
        INSERT INTO attendance_device_users (device_id, trainee_id, pin, fp_hashes)
        VALUES (@device_id, @trainee_id, @pin, @hashes)
        ON CONFLICT (device_id, trainee_id) DO UPDATE SET fp_hashes = EXCLUDED.fp_hashes`);
	}
	if (changed)
		logger.info(`[attendanceDevices] Nhận ${changed} mẫu vân tay mới từ máy #${device.id}`);
	return changed;
};

/** Thông tin mẫu vân tay (không giải mã) của các học viên: Map trainee_id → [{ fingerIndex, hash, algo }] */
const fingerMeta = async (runner, traineeIds) => {
	const out = new Map();
	if (!traineeIds.length) return out;
	const r = await runner.request().input('ids', sql.NVarChar(sql.MAX), JSON.stringify(traineeIds))
		.query(`
      SELECT trainee_id, finger_index, template_hash, algo_version
      FROM trainee_fingerprints
      WHERE valid > 0 AND trainee_id IN (SELECT value FROM jsonb_array_elements_text(CAST(@ids AS jsonb)))`);
	for (const row of r.recordset) {
		if (!out.has(row.trainee_id)) out.set(row.trainee_id, []);
		out.get(row.trainee_id).push({
			fingerIndex: row.finger_index,
			hash: row.template_hash,
			algo: row.algo_version,
		});
	}
	return out;
};

/** Mẫu vân tay đã giải mã — chỉ dùng nội bộ để dựng lệnh gửi xuống máy; null nếu không giải mã được */
const loadTemplate = async (runner, traineeId, fingerIndex) => {
	const row = (
		await runner
			.request()
			.input('trainee_id', sql.VarChar(20), traineeId)
			.input('finger', sql.SmallInt, fingerIndex)
			.query(
				'SELECT template_enc, size, valid FROM trainee_fingerprints WHERE trainee_id = @trainee_id AND finger_index = @finger',
			)
	).recordset[0];
	if (!row) return null;
	try {
		return { template: decrypt(row.template_enc), size: row.size, valid: row.valid };
	} catch {
		// Mất / đổi khóa mã hóa ⇒ bỏ qua (học viên quét lại vân tay)
		return null;
	}
};

module.exports = { saveFromDevice, fingerMeta, loadTemplate, templateHash, parseHashes };
