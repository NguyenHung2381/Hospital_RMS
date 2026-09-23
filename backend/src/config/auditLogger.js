const path = require('path');
const pino = require('pino');

// Logger CHUYÊN cho audit/activity log — tách hẳn khỏi console.log ứng dụng.
// Mỗi sự kiện ghi ra 1 dòng JSON vào file, xoay theo ngày, tự xoá file cũ.
// Đây là NGUỒN DỮ LIỆU CHÍNH của trang /activity-logs — không còn INSERT vào
// SQL Server nên bảng activity_logs không phình nữa.
//
//   LOG_DIR      -> mặc định <server>/logs (neo theo mã nguồn, KHÔNG phụ thuộc
//                   thư mục chạy). Đặt LOG_DIR để đổi; đường dẫn tương đối tính
//                   theo cwd. activityLogService.js dùng đúng logic này để đọc lại.
//   LOG_RETENTION_FILES=90  -> giữ tối đa 90 file (≈ 90 ngày)
//   LOG_STDOUT=1             -> ghi thẳng stdout thay vì file

const LOG_DIR = process.env.LOG_DIR
	? path.resolve(process.env.LOG_DIR)
	: path.join(__dirname, '..', '..', 'logs');
const LOG_STDOUT = process.env.LOG_STDOUT === '1';
const RETENTION_FILES = Math.max(
	1,
	parseInt(process.env.LOG_RETENTION_FILES, 10) || 90,
);

// Field cố định — giúp lọc/nhận diện dòng log audit giữa các nguồn khác.
const base = {
	app: 'rms-hospital',
	env: process.env.NODE_ENV || 'development',
	stream: 'audit',
};

// time: ISO cho người đọc. ts: epoch mili-giây kèm phần thập phân (độ phân giải
// micro-giây, tăng đơn điệu trong 1 tiến trình) — dùng làm khoá sắp xếp + con
// trỏ phân trang để không bị đụng-độ khi nhiều sự kiện rơi vào cùng 1 ms.
const timestamp = () => {
	const ms = performance.timeOrigin + performance.now();
	return `,"time":"${new Date(ms).toISOString()}","ts":${ms}`;
};

const transport = LOG_STDOUT
	? pino.transport({ target: 'pino/file', options: { destination: 1 } })
	: pino.transport({
			target: 'pino-roll',
			options: {
				file: path.join(LOG_DIR, 'audit'),
				extension: '.log',
				frequency: 'daily',
				dateFormat: 'yyyy-MM-dd',
				mkdir: true,
				// Giữ tối đa RETENTION_FILES file gần nhất, xoá dần file cũ hơn.
				limit: { count: RETENTION_FILES },
			},
	  });

const auditLogger = pino({ base, timestamp }, transport);

module.exports = auditLogger;
