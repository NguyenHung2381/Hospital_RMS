// /api/v1/bank-webhooks/:provider — ngân hàng (hoặc dịch vụ trung gian) báo giao dịch tiền vào
// tài khoản nhận học phí. Route công khai: không đăng nhập, xác thực bằng chữ ký của bộ chuyển
// đổi (providers/<id>.verify) trên body THÔ ⇒ mount ở app.js TRƯỚC parser json dùng chung.
// Lớp chặn: giới hạn tốc độ theo IP → công tắc phân hệ → đúng bộ chuyển đổi đang bật →
// IP cho phép (nếu cấu hình) → chữ ký → giới hạn số giao dịch mỗi lần gửi.
const express = require('express');
const rateLimit = require('../../../../utils/rateLimit');
const logger = require('../../../../config/logger');
const { requireModule } = require('../../../../middlewares/moduleGuard');
const { asyncHandler } = require('../../../../utils/asyncHandler');
const { normalizeIp } = require('../../../../utils/activityDescribe');
const { ipAllowed } = require('../../../../utils/attendancePolicy');
const securityEvents = require('../../../audit/securityEventService');
const { getProvider } = require('./providers');
const { getConfig } = require('./bankSettings');
const reconcile = require('./bankReconcileService');

const MAX_TXNS = 500;

const router = express.Router();

router.use(
	rateLimit({
		name: 'bankWebhook',
		windowMs: 60 * 1000,
		limit: Number(process.env.BANK_WEBHOOK_RATE_LIMIT) || 120,
		standardHeaders: false,
		legacyHeaders: false,
		message: { success: false, message: 'Too many requests' },
	}),
);
router.use(requireModule('TRAINING'), requireModule('TUITION'));

const reject = (req, res, status, detail) => {
	const ip = normalizeIp(req.ip);
	logger.warn(`[tuition-bank] từ chối webhook ${req.params.provider} từ ${ip}: ${detail}`);
	securityEvents
		.log({
			eventType: 'bank_webhook_rejected',
			targetType: 'bank_webhook',
			targetId: String(req.params.provider).slice(0, 50),
			ip,
			detail: detail.slice(0, 1000),
		})
		.catch(() => {});
	// Không trả chi tiết lý do ra ngoài (người dò không biết sai ở bước nào)
	return res.status(status).json({ success: false, message: 'Rejected' });
};

router.post(
	'/:provider',
	express.raw({ type: () => true, limit: '512kb' }),
	asyncHandler(async (req, res) => {
		const cfg = await getConfig();
		const provider = getProvider(String(req.params.provider));
		// Chưa bật / bật bộ khác ⇒ như không có route (không lộ đang dùng ngân hàng nào)
		if (!provider || cfg.provider !== provider.id)
			return res.status(404).json({ success: false, message: 'Not found' });
		if (cfg.ipRanges.length && !ipAllowed(req.ip, cfg.ipRanges))
			return reject(req, res, 403, 'IP ngoài danh sách cho phép');
		const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
		const why = provider.verify({ headers: req.headers, rawBody, secret: cfg.secret });
		if (why) return reject(req, res, 401, why);
		let body;
		try {
			body = JSON.parse(rawBody);
		} catch {
			return res.status(400).json({ success: false, message: 'Body phải là JSON' });
		}
		const txns = provider.parse(body);
		if (!txns.length || txns.length > MAX_TXNS)
			return res
				.status(400)
				.json({ success: false, message: `Mỗi lần gửi 1–${MAX_TXNS} giao dịch` });
		const result = await reconcile.ingest(provider.id, txns);
		return res.json({ success: true, data: result });
	}),
);

module.exports = router;
