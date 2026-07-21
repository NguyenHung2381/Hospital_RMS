const topicService = require('../services/topicService');
const topicMemberService = require('../services/topicMemberService');
const { success, created, notFound } = require('../utils/response');
const { createCrudController } = require('./crudController');

const base = createCrudController(topicService);

const getAll = async (req, res, next) => {
	try {
		const result = await topicService.getAll(req.query, req.user);
		return success(res, result);
	} catch (err) {
		next(err);
	}
};

const getById = async (req, res, next) => {
	try {
		const item = await topicService.getById(req.params.id, req.user);
		if (!item) return notFound(res);
		return success(res, item);
	} catch (err) {
		next(err);
	}
};

const getMembers = async (req, res, next) => {
	try {
		const members = await topicMemberService.getMembers(req.params.id);
		return success(res, members);
	} catch (err) {
		next(err);
	}
};

const addMember = async (req, res, next) => {
	try {
		const member = await topicMemberService.addMember(
			req.params.id,
			req.body,
			req.user.id,
		);
		return created(res, member, 'Thêm thành viên thành công');
	} catch (err) {
		next(err);
	}
};

const updateMember = async (req, res, next) => {
	try {
		const member = await topicMemberService.updateMember(
			req.params.id,
			req.params.member_id,
			req.body,
			req.user.id,
		);
		if (!member) return notFound(res);
		return success(res, member, 'Cập nhật thành viên thành công');
	} catch (err) {
		next(err);
	}
};

const deleteMember = async (req, res, next) => {
	try {
		await topicMemberService.deleteMember(
			req.params.id,
			req.params.member_id,
			req.user.id,
		);
		return success(res, null, 'Xóa thành viên thành công');
	} catch (err) {
		next(err);
	}
};

const grantAccounts = async (req, res, next) => {
	try {
		const result = await topicMemberService.grantAccounts(
			req.params.id,
			req.body.member_ids,
			req.user.id,
		);
		return success(res, result, 'Cấp tài khoản thành công');
	} catch (err) {
		next(err);
	}
};

const submit = async (req, res, next) => {
	try {
		const result = await topicService.submit(req.params.id, req.user.id);
		return success(res, result, 'Nộp đề tài thành công');
	} catch (err) {
		next(err);
	}
};

const approve = async (req, res, next) => {
	try {
		const result = await topicService.approve(
			req.params.id,
			req.body.status,
			req.body.comment,
			req.user.id,
		);
		return success(res, result, 'Xử lý phê duyệt thành công');
	} catch (err) {
		next(err);
	}
};

const getApprovals = async (req, res, next) => {
	try {
		const approvals = await topicService.getApprovals(req.params.id);
		return success(res, approvals);
	} catch (err) {
		next(err);
	}
};

const exportData = async (req, res, next) => {
	try {
		const { ids } = req.body;
		if (!Array.isArray(ids) || ids.length === 0) return success(res, []);
		const data = await topicService.getForExport(ids);
		return success(res, data);
	} catch (err) {
		next(err);
	}
};

const updateOne = async (req, res, next) => {
	try {
		const isAdmin = req.user?.account_type === 'admin';
		const item = await topicService.update(
			req.params.id,
			req.body,
			req.user.id,
			isAdmin,
		);
		if (!item) return notFound(res);
		return success(res, item, 'Cập nhật thành công');
	} catch (err) {
		next(err);
	}
};

module.exports = {
	...base,
	getAll,
	getById,
	updateOne,
	getMembers,
	addMember,
	updateMember,
	deleteMember,
	grantAccounts,
	submit,
	approve,
	getApprovals,
	exportData,
};
