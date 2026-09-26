const router = require('express').Router();
const crypto = require('crypto');
const { addClient, removeClient, MAX_PER_USER } = require('../services/eventService');
const { authenticate, verifySession } = require('../middlewares/auth');
const { signToken, verifyToken } = require('../utils/keys');
const { consumeOnce } = require('../utils/oneTimeToken');

// 15 giây — dưới ngưỡng idle-timeout thấp nhất thường gặp của proxy đứng trước
// (nginx proxy_read_timeout mặc định 60s, IIS ARR 120s, Cloudflare 100s...).
// Heartbeat 25s cũ sát ngưỡng → một số proxy vẫn cắt, trình duyệt nối lại liên
// tục và /events hiện lặp lại hàng loạt trong tab Network.
const HEARTBEAT_MS = 15_000;

// Thời gian trình duyệt chờ trước khi tự nối lại khi kết nối bị đứt (mặc định
// của EventSource chỉ ~3s → proxy cắt liên tục thành "bão" request).
const RETRY_MS = 10_000;

// Một số proxy (IIS ARR, proxy công ty...) giữ response trong bộ đệm tới khi đủ
// vài KB mới đẩy về client — SSE bị "nghẹn" rồi timeout. Gửi trước 2KB comment
// để xả bộ đệm ngay khi mở kết nối.
const FLUSH_PADDING = `:${' '.repeat(2048)}\n\n`;

// Kết nối SSE sống hàng giờ — kiểm tra lại phiên định kỳ để tài khoản bị vô
// hiệu hoá / "đăng xuất mọi thiết bị" / đổi mật khẩu bị ngắt luồng, không tiếp
// tục nhận sự kiện tới khi tự đóng tab. Cùng nhịp TTL của userStatusCache (60s).
const RECHECK_EVERY_BEATS = 4;

// ─── Vé mở kết nối ───────────────────────────────────────────────────────────
// EventSource không gắn được header Authorization nên thông tin xác thực phải
// nằm trên URL — và URL bị ghi vào access log của nginx/proxy, lịch sử trình
// duyệt. Trước đây đó là access token thật; giờ là VÉ: ký bằng khoá riêng
// (không dùng làm access token được), sống 60 giây, chỉ dùng được 1 lần.
const TICKET_TTL_SEC = 60;

router.post('/ticket', authenticate, (req, res) => {
	const ticket = signToken(
		'sse-ticket',
		{ id: req.user.id, tv: req.user.tv ?? 0, jti: crypto.randomUUID() },
		TICKET_TTL_SEC,
	);
	res.json({ success: true, data: { ticket } });
});

router.get('/', async (req, res, next) => {
	let claims;
	try {
		claims = verifyToken('sse-ticket', String(req.query.ticket || ''));
	} catch {
		return res.status(401).json({ success: false, message: 'Vé kết nối không hợp lệ hoặc đã hết hạn' });
	}
	let checked;
	try {
		if (!(await consumeOnce('sse-ticket', claims.jti, TICKET_TTL_SEC))) {
			return res.status(401).json({ success: false, message: 'Vé kết nối đã được sử dụng' });
		}
		// Kiểm tra y hệt middlewares/auth.js (trạng thái, token_version, hạn tài khoản)
		checked = await verifySession(claims.id, claims.tv);
	} catch (err) {
		return next(err);
	}
	if (checked.error) {
		return res.status(401).json({ success: false, message: checked.error });
	}
	// Đăng ký trước khi mở luồng: đã đủ số kết nối cho phép thì trả 429 thay vì
	// giữ thêm socket. Trình duyệt tự thử lại sau `retry` (khi tab khác đóng).
	if (!addClient(res, claims.id)) {
		return res.status(429).json({
			success: false,
			message: `Mỗi tài khoản chỉ mở tối đa ${MAX_PER_USER} kết nối realtime cùng lúc`,
		});
	}

	// Kết nối sống lâu: bỏ timeout socket, tắt Nagle để ping/sự kiện đi ngay
	req.socket.setTimeout(0);
	req.socket.setNoDelay(true);
	req.socket.setKeepAlive(true);

	res.writeHead(200, {
		'Content-Type': 'text/event-stream; charset=utf-8',
		// no-transform: cấm proxy/CDN nén (gzip) hay biến đổi luồng — nén sẽ
		// buffer dữ liệu, sự kiện không tới client cho tới khi kết nối đóng.
		'Cache-Control': 'no-cache, no-transform',
		Connection: 'keep-alive',
		// Không đặt Access-Control-Allow-Origin riêng — middleware cors ở app.js
		// đã áp CORS_ORIGIN cho mọi route, kể cả luồng này.
		'X-Accel-Buffering': 'no', // tắt nginx buffering để SSE qua được proxy
	});

	res.write(FLUSH_PADDING);
	res.write(`retry: ${RETRY_MS}\n`);
	res.write('data: {"message": "connected"}\n\n');

	// Gửi ping định kỳ để giữ kết nối qua proxy/firewall
	let beats = 0;
	const close = () => {
		clearInterval(heartbeat);
		removeClient(res);
		res.end();
	};
	const heartbeat = setInterval(async () => {
		try {
			res.write(':ping\n\n');
		} catch {
			clearInterval(heartbeat);
			removeClient(res);
			return;
		}
		if (++beats % RECHECK_EVERY_BEATS !== 0) return;
		try {
			if ((await verifySession(claims.id, claims.tv)).error) close();
		} catch {
			// Lỗi DB tạm thời — giữ kết nối, lần kiểm tra sau thử lại
		}
	}, HEARTBEAT_MS);

	req.on('close', () => {
		clearInterval(heartbeat);
		removeClient(res);
	});
});

module.exports = router;
