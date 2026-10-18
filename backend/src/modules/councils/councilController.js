const councilService = require('./councilService');
const councilAssignmentService = require('./councilAssignmentService');
const councilAutoAssignService = require('./councilAutoAssignService');
const councilImportService = require('./councilImportService');
const { success, created, notFound } = require('../../utils/response');
const { createCrudController } = require('../../shared/crudController');

const base = createCrudController(councilService);

const autoAssign = async (req, res, next) => {
	try {
		const result = await councilAutoAssignService.autoAssign(req.body, req.user.id);
		return success(res, result, `Đã tạo ${result.councils_created} hội đồng nháp`);
	} catch (err) {
		next(err);
	}
};

const importExcel = async (req, res, next) => {
	try {
		if (!req.file) {
			return res.status(400).json({ success: false, message: 'Chưa chọn file Excel.' });
		}
		if (!req.body.round_id) {
			return res
				.status(400)
				.json({ success: false, message: 'Đợt nghiên cứu không được để trống.' });
		}
		const result = await councilImportService.importExcel(
			{
				buffer: req.file.buffer,
				round_id: req.body.round_id,
				dry_run: req.body.dry_run === '1' || req.body.dry_run === 'true',
			},
			req.user.id,
		);
		return success(
			res,
			result,
			result.dry_run
				? 'Đã đọc file — kiểm tra trước khi nhập'
				: `Đã nhập ${result.councils_created} hội đồng, gán ${result.topics_assigned} đề tài`,
		);
	} catch (err) {
		next(err);
	}
};

const getMembers = async (req, res, next) => {
	try {
		return success(res, await councilService.getMembers(req.params.id));
	} catch (err) {
		next(err);
	}
};

const addMember = async (req, res, next) => {
	try {
		const member = await councilService.addMember(req.params.id, req.body, req.user.id);
		return created(res, member, 'Thêm thành viên hội đồng thành công');
	} catch (err) {
		next(err);
	}
};

const updateMember = async (req, res, next) => {
	try {
		const member = await councilService.updateMember(
			req.params.id,
			req.params.member_id,
			req.body,
			req.user.id,
		);
		if (!member) return notFound(res);
		return success(res, member, 'Cập nhật thành viên hội đồng thành công');
	} catch (err) {
		next(err);
	}
};

const removeMember = async (req, res, next) => {
	try {
		await councilService.removeMember(req.params.id, req.params.member_id, req.user.id);
		return success(res, null, 'Xóa thành viên hội đồng thành công');
	} catch (err) {
		next(err);
	}
};

const getEligibleUsers = async (req, res, next) => {
	try {
		return success(
			res,
			await councilService.getEligibleUsers(
				req.params.id,
				req.query.search || '',
				req.query.type || 'internal',
			),
		);
	} catch (err) {
		next(err);
	}
};

const getUnassignedTopics = async (req, res, next) => {
	try {
		return success(res, await councilAssignmentService.getUnassignedTopics(req.query.round_id));
	} catch (err) {
		next(err);
	}
};

const getTopics = async (req, res, next) => {
	try {
		return success(res, await councilAssignmentService.getTopics(req.params.id));
	} catch (err) {
		next(err);
	}
};

const assignTopics = async (req, res, next) => {
	try {
		const result = await councilAssignmentService.assignTopics(
			req.params.id,
			req.body.topic_ids,
			req.user.id,
		);
		return success(res, result, 'Gán đề tài vào hội đồng thành công');
	} catch (err) {
		next(err);
	}
};

const unassignTopic = async (req, res, next) => {
	try {
		await councilAssignmentService.unassignTopic(req.params.id, req.params.topic_id, req.user.id);
		return success(res, null, 'Bỏ gán đề tài khỏi hội đồng thành công');
	} catch (err) {
		next(err);
	}
};

const setTopicSession = async (req, res, next) => {
	try {
		await councilAssignmentService.setTopicSession(
			req.params.id,
			req.params.topic_id,
			req.body.session,
			req.user.id,
		);
		return success(res, null, 'Cập nhật buổi bảo vệ thành công');
	} catch (err) {
		next(err);
	}
};

const setSeatSubstitute = async (req, res, next) => {
	try {
		await councilAssignmentService.setSeatSubstitute(
			req.params.id,
			req.params.topic_id,
			req.body.role,
			req.body.user_id,
			req.user.id,
		);
		return success(res, null, 'Cập nhật ghế thay thế thành công');
	} catch (err) {
		next(err);
	}
};

const removeSeatSubstitute = async (req, res, next) => {
	try {
		await councilAssignmentService.removeSeatSubstitute(
			req.params.id,
			req.params.topic_id,
			req.params.role,
			req.user.id,
		);
		return success(res, null, 'Xóa ghế thay thế thành công');
	} catch (err) {
		next(err);
	}
};

module.exports = {
	...base,
	autoAssign,
	importExcel,
	getMembers,
	addMember,
	updateMember,
	removeMember,
	getEligibleUsers,
	getUnassignedTopics,
	getTopics,
	assignTopics,
	unassignTopic,
	setTopicSession,
	setSeatSubstitute,
	removeSeatSubstitute,
};
