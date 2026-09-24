const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { addClient, removeClient } = require('../services/eventService');

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

router.get('/', (req, res) => {
	const token = req.query.token;
	if (!token) {
		return res.status(401).json({ success: false, message: 'Unauthorized' });
	}

	try {
		jwt.verify(token, process.env.JWT_SECRET);
	} catch {
		return res.status(401).json({ success: false, message: 'Invalid token' });
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
		'Access-Control-Allow-Origin': '*',
		'X-Accel-Buffering': 'no', // tắt nginx buffering để SSE qua được proxy
	});

	res.write(FLUSH_PADDING);
	res.write(`retry: ${RETRY_MS}\n`);
	res.write('data: {"message": "connected"}\n\n');

	addClient(res);

	// Gửi ping định kỳ để giữ kết nối qua proxy/firewall
	const heartbeat = setInterval(() => {
		try {
			res.write(':ping\n\n');
		} catch {
			clearInterval(heartbeat);
			removeClient(res);
		}
	}, HEARTBEAT_MS);

	req.on('close', () => {
		clearInterval(heartbeat);
		removeClient(res);
	});
});

module.exports = router;
