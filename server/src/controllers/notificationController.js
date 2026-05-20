const svc = require('../services/notificationService');
const { success, error, notFound } = require('../utils/response');

const getAll = async (req, res) => {
	try {
		const { page = 1, limit = 20, unread_only } = req.query;
		const result = await svc.getForUser(req.user.id, {
			page: parseInt(page),
			limit: Math.min(parseInt(limit), 100),
			unread_only: unread_only === 'true',
		});
		success(res, result);
	} catch (err) {
		error(res, err.message);
	}
};

const getCount = async (req, res) => {
	try {
		const count = await svc.getUnreadCount(req.user.id);
		success(res, { count });
	} catch (err) {
		error(res, err.message);
	}
};

const markOne = async (req, res) => {
	try {
		const ok = await svc.markRead(req.params.id, req.user.id);
		if (!ok) return notFound(res, 'Không tìm thấy thông báo');
		success(res, null, 'Đã đánh dấu đã đọc');
	} catch (err) {
		error(res, err.message);
	}
};

const markAll = async (req, res) => {
	try {
		await svc.markAllRead(req.user.id);
		success(res, null, 'Đã đánh dấu tất cả đã đọc');
	} catch (err) {
		error(res, err.message);
	}
};

module.exports = { getAll, getCount, markOne, markAll };
