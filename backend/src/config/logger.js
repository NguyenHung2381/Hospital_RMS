// .env trước: LOG_LEVEL / NODE_ENV có thể khai báo trong đó (logger nạp rất sớm)
require('./loadEnv');
const util = require('util');
const pino = require('pino');

// Log ứng dụng (khởi động, lỗi, cảnh báo, job nền...) — tách khỏi auditLogger.js
// (nhật ký thao tác người dùng, ghi file cho trang /activity-logs).
//   production: JSON 1 dòng/sự kiện ra stdout — trình thu gom log (docker logs,
//               promtail...) lọc được theo level, có stack của lỗi.
//   dev/test:   dạng dễ đọc qua pino-pretty (devDependency; thiếu thì vẫn JSON).
//   LOG_LEVEL:  trace | debug | info (mặc định) | warn | error | silent
//
// Ghi ĐỒNG BỘ (sync): log ít, và dòng lỗi ngay trước process.exit() không bị mất.
// Không đọc config/env.js — env.js dùng logger để báo lỗi cấu hình.

const isProduction = process.env.NODE_ENV === 'production';

const prettyStream = () => {
	if (isProduction) return null;
	try {
		return require('pino-pretty')({
			sync: true,
			colorize: process.stdout.isTTY ?? false,
			translateTime: 'SYS:HH:MM:ss',
			ignore: 'pid,hostname,app',
		});
	} catch {
		return null;
	}
};

const base = pino(
	{
		level: process.env.LOG_LEVEL || 'info',
		base: { app: 'rms-hospital', pid: process.pid },
		serializers: { err: pino.stdSerializers.err },
	},
	prettyStream() ?? pino.destination({ dest: 1, sync: true }),
);

// API giống console (logger.error('Không gửi được mail:', err.message)): các
// tham số ghép thành msg bằng util.format như console. Tham số là Error thì
// thêm trường `err` (kèm stack) để không mất dấu vết lỗi.
const level =
	(name) =>
	(...args) => {
		if (!base.isLevelEnabled(name)) return;
		const err = args.find((a) => a instanceof Error);
		const msg = util.format(...args.map((a) => (a instanceof Error ? a.message : a)));
		if (err) base[name]({ err }, msg);
		else base[name](msg);
	};

const logger = {
	debug: level('debug'),
	info: level('info'),
	warn: level('warn'),
	error: level('error'),
	// Logger pino gốc — cho nơi cần log có cấu trúc: logger.pino.child({ job }).info({...}, 'msg')
	pino: base,
};

module.exports = logger;
