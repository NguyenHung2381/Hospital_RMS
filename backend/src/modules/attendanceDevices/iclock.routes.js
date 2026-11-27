// /iclock/* — máy chấm công vân tay tự gửi lên (ADMS). Máy không đăng nhập được: chỉ nhận
// từ dải IP mạng nội bộ (iclockGuard.ipGate), nhận diện bằng SN đã được duyệt
// (iclockService), giới hạn tốc độ theo IP và theo SN, chỉ nhận text. Mount ở app.js
// TRƯỚC các parser json/urlencoded dùng chung, ngoài /api/v1 (đường dẫn do firmware cố định). nginx: location /iclock/ (frontend/nginx.conf).
const express = require('express');
const rateLimit = require('../../utils/rateLimit');
const logger = require('../../config/logger');
const { requireModule } = require('../../middlewares/moduleGuard');
const service = require('./iclockService');
const { ipGate } = require('./iclockGuard');

const router = express.Router();
const sn = (req) => String(req.query.SN || req.query.sn || '');

// Firmware PUSH 2.2+ "ping" giữa các lần gửi dữ liệu lớn. Để TRƯỚC ipGate: chỉ trả "OK",
// không có dữ liệu — vẫn dùng được để kiểm đường đi (curl trên máy chủ, infra/may-cham-cong.md).
router.get('/ping', (_req, res) => res.type('text/plain').send('OK'));

// Các máy có thể đi chung 1 IP (proxy của viện) — mỗi máy ≈ 6–10 yêu cầu/phút
const limiter = rateLimit({
	name: 'iclock',
	windowMs: 60 * 1000,
	limit: 600,
	standardHeaders: false,
	legacyHeaders: false,
	message: 'ERROR: too many requests',
});

// Theo SN (dù đổi IP): máy thật ≈ 6–10 yêu cầu/phút, gửi lại vân tay sau lệnh CHECK
// thêm vài chục lượt — vượt xa thì là máy giả dội lệnh để giành lệnh của máy thật.
const snLimiter = rateLimit({
	name: 'iclockSn',
	windowMs: 60 * 1000,
	limit: Number(process.env.ICLOCK_SN_RATE_LIMIT) || 240,
	standardHeaders: false,
	legacyHeaders: false,
	keyGenerator: (req) => `sn:${sn(req).slice(0, 40)}`,
	message: 'ERROR: too many requests',
});

router.use(ipGate); // trước mọi xử lý SN và trước khi đọc body (tới 10 MB)
router.use(limiter);
router.use(snLimiter);
router.use(requireModule('TRAINING'));
// Máy gửi lại toàn bộ vân tay sau lệnh CHECK: ~1–2 KB/ngón × vài nghìn ngón
router.use(express.text({ type: () => true, limit: '10mb' }));

const text = (req) => (typeof req.body === 'string' ? req.body : '');

const reply = (handler) => async (req, res) => {
	res.type('text/plain');
	try {
		res.send(await handler(req));
	} catch (e) {
		if (e instanceof service.DeviceRejected) {
			res.status(403).send(`ERROR: ${e.message}`);
			return;
		}
		logger.error(`[iclock] ${req.method} ${req.path} SN=${sn(req)}: ${e.message}`);
		res.status(500).send('ERROR');
	}
};

router.get(
	'/cdata',
	reply((req) => service.handshake(sn(req), req.query, req.ip)),
);
router.post(
	'/cdata',
	reply((req) => service.receive(sn(req), req.query, text(req), req.ip)),
);
router.get(
	'/getrequest',
	reply((req) => service.getRequest(sn(req), req.query, req.ip)),
);
router.post(
	'/devicecmd',
	reply((req) => service.deviceCmd(sn(req), text(req), req.ip)),
);
module.exports = router;
