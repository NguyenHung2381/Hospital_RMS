const router = require('express').Router();
const express = require('express');
// Đếm trên Redis, tự rơi về bộ nhớ khi Redis lỗi (utils/rateLimit.js)
const rateLimit = require('../../utils/rateLimit');

// Nhận báo cáo vi phạm Content-Security-Policy từ trình duyệt (header
// Content-Security-Policy-Report-Only trong frontend/nginx.conf). Giai đoạn chỉ
// báo cáo: gom các vi phạm hợp lệ (font, ảnh, script bên thứ ba...) để chỉnh
// CSP trước khi bật chặn thật. Công khai (trình duyệt gửi không kèm token) nên
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
	const reports = Array.isArray(req.body) ? req.body : [req.body?.['csp-report'] ?? req.body?.body ?? req.body];
	for (const r of reports.slice(0, 10)) {
		if (!r || typeof r !== 'object') continue;
		const body = r.body && typeof r.body === 'object' ? r.body : r;
		console.warn(
			'[CSP] vi phạm',
			JSON.stringify({
				directive: clip(body['violated-directive'] ?? body.effectiveDirective),
				blocked: clip(body['blocked-uri'] ?? body.blockedURL),
				page: clip(body['document-uri'] ?? body.documentURL),
				source: clip(body['source-file'] ?? body.sourceFile),
				line: Number(body['line-number'] ?? body.lineNumber) || undefined,
			}),
		);
	}
	res.status(204).end();
});

module.exports = router;
