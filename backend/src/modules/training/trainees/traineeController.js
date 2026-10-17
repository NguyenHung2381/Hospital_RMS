const traineeService = require('./traineeService');
const traineeImportService = require('./traineeImportService');
const { success, created, notFound } = require('../../../utils/response');

const getAll = async (req, res, next) => {
	try {
		const result = await traineeService.getAll(req.query, req.user);
		return success(res, result);
	} catch (err) {
		next(err);
	}
};

const getById = async (req, res, next) => {
	try {
		const item = await traineeService.getById(req.params.id, req.user);
		if (!item) return notFound(res);
		return success(res, item);
	} catch (err) {
		next(err);
	}
};

const createOne = async (req, res, next) => {
	try {
		const item = await traineeService.create(req.body, req.user.id);
		return created(res, item);
	} catch (err) {
		next(err);
	}
};

const updateOne = async (req, res, next) => {
	try {
		const item = await traineeService.update(req.params.id, req.body, req.user.id);
		return success(res, item, 'Cập nhật thành công');
	} catch (err) {
		next(err);
	}
};

const removeOne = async (req, res, next) => {
	try {
		await traineeService.remove(req.params.id, req.user.id);
		return success(res, null, 'Xóa thành công');
	} catch (err) {
		next(err);
	}
};

const listEnrollments = async (req, res, next) => {
	try {
		return success(res, await traineeService.listEnrollments(req.params.id));
	} catch (err) {
		next(err);
	}
};

const listDocuments = async (req, res, next) => {
	try {
		return success(res, await traineeService.listDocuments(req.params.id));
	} catch (err) {
		next(err);
	}
};

const addDocument = async (req, res, next) => {
	try {
		if (!req.file) {
			return res.status(400).json({ success: false, message: 'Vui lòng chọn file để tải lên' });
		}
		return created(res, await traineeService.addDocument(req.params.id, req.body.doc_type, req.file, req.user.id));
	} catch (err) {
		next(err);
	}
};

const removeDocument = async (req, res, next) => {
	try {
		await traineeService.removeDocument(req.params.docId, req.user.id);
		return success(res, null, 'Đã xoá hồ sơ');
	} catch (err) {
		next(err);
	}
};

const grantAccounts = async (req, res, next) => {
	try {
		const result = await traineeService.grantAccounts(
			req.body.trainee_ids,
			req.user.id,
		);
		return success(res, result);
	} catch (err) {
		next(err);
	}
};

const importExcel = async (req, res, next) => {
	try {
		if (!req.file) {
			return res.status(400).json({ success: false, message: 'Chưa chọn file Excel.' });
		}
		const out = await traineeImportService.importExcel(
			{
				buffer: req.file.buffer,
				dry_run: req.body.dry_run === '1' || req.body.dry_run === 'true',
			},
			req.user.id,
		);
		return success(res, out);
	} catch (err) {
		next(err);
	}
};

module.exports = {
	getAll,
	getById,
	createOne,
	updateOne,
	removeOne,
	listEnrollments,
	listDocuments,
	addDocument,
	removeDocument,
	grantAccounts,
	importExcel,
};
