const fs = require('fs');
const net = require('net');

// Quét virus file upload bằng ClamAV (clamd) — TUỲ CHỌN, bật khi đặt
// CLAMAV_HOST (vd service `clamav` trong docker-compose.prod.yml, profile "av").
// Gửi nội dung qua lệnh INSTREAM của clamd (không cần chung ổ đĩa).
//
// Khi đã bật mà clamd không trả lời được: mặc định TỪ CHỐI upload (fail-closed)
// — bật quét rồi mà lặng lẽ bỏ qua thì không khác gì không quét. Đặt
// CLAMAV_FAIL_OPEN=true nếu muốn vẫn nhận file khi ClamAV tạm hỏng.
//
// clamd mặc định chỉ nhận luồng tối đa 25MB (StreamMaxLength) — file lớn hơn
// CLAMAV_MAX_MB (mặc định 25) không quét, ghi log (thường là video bài giảng).
const CHUNK = 64 * 1024;

const config = () => ({
	host: process.env.CLAMAV_HOST || null,
	port: Number(process.env.CLAMAV_PORT) || 3310,
	maxBytes: (Number(process.env.CLAMAV_MAX_MB) || 25) * 1024 * 1024,
	timeoutMs: Number(process.env.CLAMAV_TIMEOUT_MS) || 60_000,
	failOpen: process.env.CLAMAV_FAIL_OPEN === 'true',
});

const enabled = () => !!config().host;

// Trả về chuỗi phản hồi của clamd, vd "stream: OK" / "stream: Eicar-Test-Signature FOUND"
const instream = (source, { host, port, timeoutMs }) =>
	new Promise((resolve, reject) => {
		const socket = net.createConnection({ host, port });
		let reply = '';
		socket.setTimeout(timeoutMs, () => socket.destroy(new Error('ClamAV quá thời gian chờ')));
		socket.on('error', reject);
		socket.on('data', (d) => (reply += d.toString('utf8')));
		socket.on('end', () => resolve(reply.replace(/\0/g, '').trim()));
		socket.on('connect', async () => {
			try {
				socket.write('zINSTREAM\0');
				for await (const chunk of source) {
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
	const cfg = config();
	if (!cfg.host) return { skipped: 'disabled' };
	const size = file.buffer ? file.buffer.length : file.size;
	if (size > cfg.maxBytes) {
		console.warn(
			`[clamav] Bỏ qua quét ${file.originalname} (${Math.round(size / 1048576)}MB > CLAMAV_MAX_MB)`,
		);
		return { skipped: 'too_large' };
	}
	try {
		const source = file.buffer ? [file.buffer] : fs.createReadStream(file.path);
		const reply = await instream(source, cfg);
		if (/\bOK$/.test(reply)) return { clean: true };
		const found = reply.match(/: (.+) FOUND$/);
		if (found) return { clean: false, virus: found[1] };
		throw new Error(`Phản hồi ClamAV không rõ: ${reply || '(rỗng)'}`);
	} catch (err) {
		if (cfg.failOpen) {
			console.error(
				`[clamav] Lỗi quét ${file.originalname} — vẫn nhận (CLAMAV_FAIL_OPEN):`,
				err.message,
			);
			return { skipped: 'error' };
		}
		throw err;
	}
};

module.exports = { scanFile, enabled };
