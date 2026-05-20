const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { addClient, removeClient } = require('../services/eventService');

const HEARTBEAT_MS = 25_000; // 25 giây — dưới ngưỡng timeout của nginx/proxy

router.get('/', (req, res) => {
	const token = req.query.token;
	if (!token) {
		return res.status(401).json({ success: false, message: 'Unauthorized' });
	}

	try {
		jwt.verify(token, process.env.JWT_SECRET || 'secret');
	} catch {
		return res.status(401).json({ success: false, message: 'Invalid token' });
	}

	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive',
		'Access-Control-Allow-Origin': '*',
		'X-Accel-Buffering': 'no', // tắt nginx buffering để SSE qua được proxy
	});

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
