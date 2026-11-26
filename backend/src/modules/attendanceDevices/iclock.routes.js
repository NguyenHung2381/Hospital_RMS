// /iclock/* — máy chấm công vân tay tự gửi lên (ADMS). Công khai (máy không đăng nhập
// được): nhận diện bằng SN đã được duyệt (iclockService), giới hạn tốc độ riêng, chỉ
// nhận text. Mount ở app.js TRƯỚC các parser json/urlencoded dùng chung, ngoài /api/v1
// (đường dẫn do firmware cố định). nginx: location /iclock/ (frontend/nginx.conf).
const express = require('express');
const rateLimit = require('../../utils/rateLimit');
const logger = require('../../config/logger');
const { requireModule } = require('../../middlewares/moduleGuard');
const service = require('./iclockService');

const router = express.Router();

// Các máy có thể đi chung 1 IP (proxy của viện) — mỗi máy ≈ 6–10 yêu cầu/phút
const limiter = rateLimit({
	name: 'iclock',
	windowMs: 60 * 1000,
	limit: 600,
	standardHeaders: false,
	legacyHeaders: false,
	message: 'ERROR: too many requests',
});

router.use(limiter);
router.use(requireModule('TRAINING'));
// Máy gửi lại toàn bộ vân tay sau lệnh CHECK: ~1–2 KB/ngón × vài nghìn ngón
router.use(express.text({ type: () => true, limit: '10mb' }));

const sn = (req) => String(req.query.SN || req.query.sn || '');
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
// Firmware PUSH 2.2+ "ping" giữa các lần gửi dữ liệu lớn
router.get('/ping', (_req, res) => res.type('text/plain').send('OK'));

module.exports = router;
