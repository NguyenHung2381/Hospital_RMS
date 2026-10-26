const fs = require('fs');
const net = require('net');
const systemSettingService = require('../modules/settings/systemSettingService');
const logger = require('../config/logger');

// Quét virus file upload bằng ClamAV (clamd) — TÙY CHỌN, bật khi đặt
// CLAMAV_HOST (vd service `clamav` trong docker-compose.prod.yml, profile "av").
// Gửi nội dung qua lệnh INSTREAM của clamd (không cần chung ổ đĩa).
// Admin chỉnh ở Cấu hình hệ thống → Tải lên (CLAMAV_*), fallback .env.
//
// Khi đã bật mà clamd không trả lời được: mặc định TỪ CHỐI upload (fail-closed)
// — bật quét rồi mà lặng lẽ bỏ qua thì không khác gì không quét. Đặt
// CLAMAV_FAIL_OPEN=true nếu muốn vẫn nhận file khi ClamAV tạm hỏng.
//
// clamd mặc định chỉ nhận luồng tối đa 25MB (StreamMaxLength) — file lớn hơn
// CLAMAV_MAX_MB (mặc định 25) không quét, ghi log (thường là video bài giảng).
const CHUNK = 64 * 1024;
const MAX_MB_CEILING = 4095; // StreamMaxLength của clamd tối đa 4GB

const config = async () => {
	const get = (key) => systemSettingService.getValue(key);
	const [host, port, maxMb, failOpen] = await Promise.all([
		get('CLAMAV_HOST'),
		get('CLAMAV_PORT'),
		get('CLAMAV_MAX_MB'),
		get('CLAMAV_FAIL_OPEN'),
	]);
	return {
		host: String(host ?? '').trim() || null,
		port: Number(port) || 3310,
		maxBytes: (Number(maxMb) || 25) * 1024 * 1024,
		timeoutMs: Number(process.env.CLAMAV_TIMEOUT_MS) || 60_000,
		failOpen: failOpen === 'true',
	};
};

const enabled = async () => !!(await config()).host;

// Gửi 1 lệnh clamd, trả về chuỗi phản hồi (đã bỏ \0). `body` (tùy chọn) là
// nguồn dữ liệu cho INSTREAM: mảng Buffer hoặc stream.
// vd "stream: OK" / "stream: Eicar-Test-Signature FOUND" / "PONG"
const command = (cmd, { host, port, timeoutMs }, body) =>
	new Promise((resolve, reject) => {
		const socket = net.createConnection({ host, port });
		let reply = '';
		socket.setTimeout(timeoutMs, () => socket.destroy(new Error('ClamAV quá thời gian chờ')));
		socket.on('error', reject);
		socket.on('data', (d) => (reply += d.toString('utf8')));
		socket.on('end', () => resolve(reply.replace(/\0/g, '').trim()));
		socket.on('connect', async () => {
			try {
				socket.write(`z${cmd}\0`);
				if (!body) return;
				for await (const chunk of body) {
					for (let i = 0; i < chunk.length; i += CHUNK) {
						const part = chunk.subarray(i, i + CHUNK);
						const len = Buffer.alloc(4);
						len.writeUInt32BE(part.length);
						socket.write(len);
						socket.write(part);
					}
				}
				socket.write(Buffer.alloc(4)); // độ dài 0 = hết dữ liệu
			} catch (err) {
				socket.destroy(err);
			}
		});
	});

// Kết quả: { clean: true } | { clean: false, virus } | { skipped: lý do }
// Ném lỗi khi clamd lỗi và không bật CLAMAV_FAIL_OPEN.
const scanFile = async (file) => {
	const cfg = await config();
	if (!cfg.host) return { skipped: 'disabled' };
	const size = file.buffer ? file.buffer.length : file.size;
	if (size > cfg.maxBytes) {
		logger.warn(
			`[clamav] Bỏ qua quét ${file.originalname} (${Math.round(size / 1048576)}MB > CLAMAV_MAX_MB)`,
		);
		return { skipped: 'too_large' };
	}
	try {
		const source = file.buffer ? [file.buffer] : fs.createReadStream(file.path);
		const reply = await command('INSTREAM', cfg, source);
		if (/\bOK$/.test(reply)) return { clean: true };
		const found = reply.match(/: (.+) FOUND$/);
		if (found) return { clean: false, virus: found[1] };
		throw new Error(`Phản hồi ClamAV không rõ: ${reply || '(rỗng)'}`);
	} catch (err) {
		if (cfg.failOpen) {
			logger.error(
				`[clamav] Lỗi quét ${file.originalname} — vẫn nhận (CLAMAV_FAIL_OPEN):`,
				err.message,
			);
			return { skipped: 'error' };
		}
		throw err;
	}
};

// Nút "Kiểm tra kết nối" ở Cấu hình hệ thống: PING + VERSION + quét thử 1 đoạn
// dữ liệu sạch. Không trả nguyên văn phản hồi lạ — tránh biến nút này thành
// công cụ dò cổng dịch vụ nội bộ (chỉ nhận phản hồi đúng kiểu clamd).
const testConnection = async () => {
	const cfg = { ...(await config()), timeoutMs: 10_000 };
	if (!cfg.host) throw new Error('Chưa cấu hình máy chủ ClamAV');
	const where = `${cfg.host}:${cfg.port}`;
	let pong;
	try {
		pong = await command('PING', cfg);
	} catch (err) {
		throw new Error(`Không kết nối được ${where} (${err.code || err.message})`, { cause: err });
	}
	if (pong !== 'PONG') throw new Error(`${where} không phải máy chủ ClamAV (clamd)`);
	const version = await command('VERSION', cfg).catch(() => '');
	const scan = await command('INSTREAM', cfg, [Buffer.from('rms-clamav-test')]);
	if (!/\bOK$/.test(scan)) throw new Error('ClamAV trả lời nhưng quét thử không thành công');
	return { host: cfg.host, port: cfg.port, version: /^ClamAV /.test(version) ? version : null };
};

// null = hợp lệ; ngược lại là thông báo lỗi (dùng khi admin lưu cấu hình)
const validateSetting = (key, value) => {
	if (value === null || value === '') return null;
	const int = (min, max, msg) => {
		const n = Number(value);
		return Number.isInteger(n) && n >= min && n <= max ? null : msg;
	};
	if (key === 'CLAMAV_HOST') {
		return /^[A-Za-z0-9._:-]{1,253}$/.test(value.trim())
			? null
			: 'Máy chủ ClamAV phải là tên máy hoặc địa chỉ IP (vd clamav, 10.0.0.5)';
	}
	if (key === 'CLAMAV_PORT') return int(1, 65535, 'Cổng phải là số nguyên 1–65535');
	if (key === 'CLAMAV_MAX_MB') {
		return int(1, MAX_MB_CEILING, `Dung lượng quét phải là số nguyên 1–${MAX_MB_CEILING} MB`);
	}
	if (key === 'CLAMAV_FAIL_OPEN') {
		return value === 'true' || value === 'false' ? null : 'Giá trị phải là true/false';
	}
	return null;
};

module.exports = { scanFile, enabled, testConnection, validateSetting };
