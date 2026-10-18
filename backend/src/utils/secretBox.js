const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

// Mã hoá dữ liệu bí mật lưu trong DB (secret TOTP của 2FA) bằng AES-256-GCM.
// Mục đích: lộ riêng DB (bản sao lưu, SQL injection, người có quyền đọc bảng)
// không đủ để sinh mã 2FA của người dùng — cần thêm khoá nằm NGOÀI DB.
//
// Khoá: biến TOTP_ENC_KEY (64 ký tự hex) nếu có; không thì file
// <SECRETS_DIR>/totp.key (mặc định ./secrets — Docker: volume server_secrets),
// tự sinh ở lần chạy đầu. KHÔNG dẫn xuất từ JWT_SECRET: JWT secret được xoay
// định kỳ (scripts/rotate-jwt-secrets.ps1), còn khoá này đổi là mọi secret 2FA
// đã lưu không giải mã được nữa. Mất file khoá = người dùng phải thiết lập lại
// 2FA → sao lưu volume server_secrets cùng DB.
const PREFIX = 'v1:';
let _key = null;

const keyFile = () => path.resolve(process.env.SECRETS_DIR || 'secrets', 'totp.key');

const loadKey = () => {
	if (_key) return _key;
	const fromEnv = process.env.TOTP_ENC_KEY;
	if (fromEnv) {
		if (!/^[0-9a-fA-F]{64}$/.test(fromEnv))
			throw new Error('TOTP_ENC_KEY phải là 64 ký tự hex (32 byte)');
		_key = Buffer.from(fromEnv, 'hex');
		return _key;
	}
	const file = keyFile();
	if (!fs.existsSync(file)) {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		try {
			// 'wx' = chỉ tạo nếu chưa có — 2 tiến trình khởi động cùng lúc không ghi đè nhau
			fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
			logger.info(`🔑 Đã sinh khoá mã hoá secret 2FA tại ${file} — nhớ sao lưu cùng DB.`);
		} catch (err) {
			if (err.code !== 'EEXIST') throw err;
		}
	}
	const hex = fs.readFileSync(file, 'utf8').trim();
	if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`File khoá ${file} không hợp lệ`);
	_key = Buffer.from(hex, 'hex');
	return _key;
};

const isEncrypted = (value) => typeof value === 'string' && value.startsWith(PREFIX);

const encrypt = (plain) => {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', loadKey(), iv);
	const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
	return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
};

// Giá trị chưa mã hoá (lưu từ trước khi có module này) được trả nguyên — nơi
// gọi mã hoá lại ở lần dùng thành công kế tiếp (authService).
const decrypt = (value) => {
	if (!isEncrypted(value)) return value;
	const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
	// Ghim tag 16 byte: không có thì chuỗi bị cắt ngắn được kiểm bằng tag ngắn hơn (dễ giả mạo)
	const decipher = crypto.createDecipheriv('aes-256-gcm', loadKey(), buf.subarray(0, 12), {
		authTagLength: 16,
	});
	decipher.setAuthTag(buf.subarray(12, 28));
	return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
};

// Băm có khoá (HMAC) cho mã khôi phục 2FA: mã chỉ ~40 bit nên băm thường
// (sha256) để lộ DB là dò ngược được; có khoá bí mật ngoài DB thì không.
let _hashKey = null;
const keyedHash = (value) => {
	_hashKey ??= Buffer.from(crypto.hkdfSync('sha256', loadKey(), 'rms', 'backup-codes', 32));
	return crypto.createHmac('sha256', _hashKey).update(value).digest('hex');
};

// Cho test
const reset = () => {
	_key = null;
	_hashKey = null;
};

module.exports = { encrypt, decrypt, isEncrypted, keyedHash, reset };
