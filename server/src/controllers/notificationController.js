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

const send = async (req, res) => {
	try {
		const { type, title, message, ref_id, ref_type, target_type, target_ids } =
			req.body;
		if (!type || !title || !target_type) {
			return error(res, 'Thiếu thông tin bắt buộc', 400);
		}
		const result = await svc.sendBroadcast({
			type,
			title,
			message: message ?? null,
			refId: ref_id ?? null,
			refType: ref_type ?? null,
			targetType: target_type,
			targetIds: target_ids ?? [],
		});
		success(res, result, `Đã gửi thông báo tới ${result.sent} người dùng`);
	} catch (err) {
		error(res, err.message);
	}
};

const adminList = async (req, res) => {
	try {
		const { page = 1, limit = 20, type, search } = req.query;
		const result = await svc.adminGetAll({
			page: parseInt(page),
			limit: Math.min(parseInt(limit), 100),
			type: type || undefined,
			search: search || undefined,
		});
		success(res, result);
	} catch (err) {
		error(res, err.message);
	}
};

const deleteOne = async (req, res) => {
	try {
		const ok = await svc.deleteNotif(req.params.id);
		if (!ok) return notFound(res, 'Không tìm thấy thông báo');
		success(res, null, 'Đã xoá thông báo');
	} catch (err) {
		error(res, err.message);
	}
};

module.exports = { getAll, getCount, markOne, markAll, send, adminList, deleteOne };
