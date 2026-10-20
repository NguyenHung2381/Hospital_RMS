const traineeService = require('./traineeService');
const traineeImportService = require('./traineeImportService');
const traineeProgressService = require('./traineeProgressService');
const { success, created, notFound } = require('../../../utils/response');
const { asyncHandler } = require('../../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
	const result = await traineeService.getAll(req.query, req.user);
	return success(res, result);
});

const getById = asyncHandler(async (req, res) => {
	const item = await traineeService.getById(req.params.id, req.user);
	if (!item) return notFound(res);
	return success(res, item);
});

const createOne = asyncHandler(async (req, res) => {
	const item = await traineeService.create(req.body, req.user.id);
	return created(res, item);
});

const updateOne = asyncHandler(async (req, res) => {
	const item = await traineeService.update(req.params.id, req.body, req.user.id);
	return success(res, item, 'Cập nhật thành công');
});

const removeOne = asyncHandler(async (req, res) => {
	await traineeService.remove(req.params.id, req.user.id);
	return success(res, null, 'Xóa thành công');
});

const listEnrollments = asyncHandler(async (req, res) => {
	return success(res, await traineeService.listEnrollments(req.params.id));
});

const getProgress = asyncHandler(async (req, res) => {
	return success(res, await traineeProgressService.getProgress(req.params.id));
});

const listDocuments = asyncHandler(async (req, res) => {
	return success(res, await traineeService.listDocuments(req.params.id));
});

const addDocument = asyncHandler(async (req, res) => {
	if (!req.file) {
		return res.status(400).json({ success: false, message: 'Vui lòng chọn file để tải lên' });
	}
	return created(
		res,
		await traineeService.addDocument(req.params.id, req.body.doc_type, req.file, req.user.id),
	);
});

const removeDocument = asyncHandler(async (req, res) => {
	await traineeService.removeDocument(req.params.docId, req.user.id);
	return success(res, null, 'Đã xoá hồ sơ');
});

const grantAccounts = asyncHandler(async (req, res) => {
	const result = await traineeService.grantAccounts(req.body.trainee_ids, req.user.id);
	return success(res, result);
});

const importExcel = asyncHandler(async (req, res) => {
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
});

module.exports = {
	getAll,
	getById,
	createOne,
	updateOne,
	removeOne,
	listEnrollments,
	getProgress,
	listDocuments,
	addDocument,
	removeDocument,
	grantAccounts,
	importExcel,
};
