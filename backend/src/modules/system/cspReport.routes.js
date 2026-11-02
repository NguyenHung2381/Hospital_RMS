const router = require('express').Router();
const express = require('express');
const logger = require('../../config/logger');
// Đếm trên Redis, tự rơi về bộ nhớ khi Redis lỗi (utils/rateLimit.js)
const rateLimit = require('../../utils/rateLimit');
// URL trang (vd /hoi-nghi/ve/<mã vé>) có thể chứa mã bí mật — che trước khi ghi log
const { redactUrl } = require('../../utils/logRedact');

// Nhận báo cáo vi phạm Content-Security-Policy từ trình duyệt (frontend/nginx.conf,
// report-uri). CSP đang chặn thật: mỗi vi phạm là 1 thứ đã bị chặn — hoặc tấn công
// (XSS chèn script), hoặc tài nguyên hợp lệ còn thiếu trong CSP (font, ảnh, script
// bên thứ ba...) cần bổ sung. Công khai (trình duyệt gửi không kèm token) nên
// giới hạn chặt kích thước + tần suất, chỉ ghi log vài trường cần thiết.
const cspLimiter = rateLimit({
	name: 'csp',
	windowMs: 15 * 60 * 1000,
	limit: 100,
	standardHeaders: true,
	legacyHeaders: false,
	// Trình duyệt không đọc phản hồi — trả rỗng, không cần thông báo
	handler: (_req, res) => res.status(429).end(),
});

// application/csp-report (report-uri) và application/reports+json (Reporting API)
const parseReport = express.json({
	type: ['application/csp-report', 'application/reports+json', 'application/json'],
	limit: '16kb',
});

const clip = (v) => (typeof v === 'string' ? v.slice(0, 300) : undefined);

router.post('/', cspLimiter, parseReport, (req, res) => {
	const reports = Array.isArray(req.body)
		? req.body
		: [req.body?.['csp-report'] ?? req.body?.body ?? req.body];
	for (const r of reports.slice(0, 10)) {
		if (!r || typeof r !== 'object') continue;
		const body = r.body && typeof r.body === 'object' ? r.body : r;
		logger.warn(
			'[CSP] vi phạm',
			JSON.stringify({
				directive: clip(body['violated-directive'] ?? body.effectiveDirective),
				blocked: clip(redactUrl(body['blocked-uri'] ?? body.blockedURL)),
				page: clip(redactUrl(body['document-uri'] ?? body.documentURL)),
				source: clip(redactUrl(body['source-file'] ?? body.sourceFile)),
				line: Number(body['line-number'] ?? body.lineNumber) || undefined,
			}),
		);
	}
	res.status(204).end();
});

module.exports = router;
