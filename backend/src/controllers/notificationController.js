const svc = require('../services/notificationService');
const { success, notFound } = require('../utils/response');

const getAll = async (req, res, next) => {
	try {
		const { page = 1, limit = 20, unread_only } = req.query;
		const result = await svc.getForUser(req.user.id, {
			page: parseInt(page),
			limit: Math.min(parseInt(limit), 100),
			unread_only: unread_only === 'true',
		});
		success(res, result);
	} catch (err) {
		next(err);
	}
};

const getCount = async (req, res, next) => {
	try {
		const count = await svc.getUnreadCount(req.user.id);
		success(res, { count });
	} catch (err) {
		next(err);
	}
};

const markOne = async (req, res, next) => {
	try {
		const ok = await svc.markRead(req.params.id, req.user.id);
		if (!ok) return notFound(res, 'Không tìm thấy thông báo');
		success(res, null, 'Đã đánh dấu đã đọc');
	} catch (err) {
		next(err);
	}
};

const markAll = async (req, res, next) => {
	try {
		await svc.markAllRead(req.user.id);
		success(res, null, 'Đã đánh dấu tất cả đã đọc');
	} catch (err) {
		next(err);
	}
};

const send = async (req, res, next) => {
	try {
		const { type, title, message, ref_id, ref_type, target_type, target_ids } = req.body;
		if (!type || !title || !target_type) {
			const err = new Error('Thiếu thông tin bắt buộc');
			err.statusCode = 400;
			throw err;
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
		next(err);
	}
};

const adminList = async (req, res, next) => {
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
		next(err);
	}
};

const deleteOne = async (req, res, next) => {
	try {
		const ok = await svc.deleteNotif(req.params.id);
		if (!ok) return notFound(res, 'Không tìm thấy thông báo');
		success(res, null, 'Đã xoá thông báo');
	} catch (err) {
		next(err);
	}
};

const getBatchRecipients = async (req, res, next) => {
	try {
		const data = await svc.getBatchRecipients(req.params.batchKey);
		success(res, data);
	} catch (err) {
		next(err);
	}
};

const deleteBatch = async (req, res, next) => {
	try {
		const ok = await svc.deleteBatch(req.params.batchKey);
		if (!ok) return notFound(res, 'Không tìm thấy thông báo');
		success(res, null, 'Đã xoá thông báo');
	} catch (err) {
		next(err);
	}
};

module.exports = {
	getAll,
	getCount,
	markOne,
	markAll,
	send,
	adminList,
	deleteOne,
	getBatchRecipients,
	deleteBatch,
};
