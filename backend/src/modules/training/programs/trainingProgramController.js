const trainingProgramService = require('./trainingProgramService');
const programCatalogImportService = require('./programCatalogImportService');
const { success, created, notFound } = require('../../../utils/response');
const formCustomValueService = require('../../forms/formCustomValueService');
const { asyncHandler } = require('../../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
	return success(
		res,
		await formCustomValueService.attachResult(
			'training_program',
			await trainingProgramService.getAll(req.query),
		),
	);
});

const getById = asyncHandler(async (req, res) => {
	const item = await trainingProgramService.getById(req.params.id);
	if (!item) return notFound(res);
	item.custom = await formCustomValueService.get('training_program', item.id);
	return success(res, item);
});

const createOne = asyncHandler(async (req, res) => {
	const item = await trainingProgramService.create(req.body, req.user.id);
	const custom = await formCustomValueService.save(
		'training_program',
		item.id,
		req.formCustom,
		req.user.id,
	);
	return created(res, custom ? { ...item, custom } : item);
});

const updateOne = asyncHandler(async (req, res) => {
	const item = await trainingProgramService.update(req.params.id, req.body, req.user.id);
	if (!item) return notFound(res);
	const custom = await formCustomValueService.save(
		'training_program',
		req.params.id,
		req.formCustom,
		req.user.id,
	);
	return success(res, custom ? { ...item, custom } : item, 'Cập nhật thành công');
});

const removeOne = asyncHandler(async (req, res) => {
	await trainingProgramService.remove(req.params.id, req.user.id);
	await formCustomValueService.remove('training_program', req.params.id);
	return success(res, null, 'Xóa thành công');
});

const importCatalog = asyncHandler(async (req, res) => {
	if (!req.file) {
		return res.status(400).json({ success: false, message: 'Chưa chọn file Excel.' });
	}
	const out = await programCatalogImportService.importExcel(
		{
			buffer: req.file.buffer,
			dry_run: req.body.dry_run === '1' || req.body.dry_run === 'true',
		},
		req.user.id,
	);
	return success(res, out);
});

// ─── Bài học ─────────────────────────────────────────────────────────────
const listLessons = asyncHandler(async (req, res) => {
	return success(
		res,
		await formCustomValueService.attachResult(
			'lesson',
			await trainingProgramService.listLessons(req.params.id),
			'lesson_id',
		),
	);
});

const listAllLessons = asyncHandler(async (req, res) => {
	return success(
		res,
		await formCustomValueService.attachResult(
			'lesson',
			await trainingProgramService.listAllLessons(),
		),
	);
});

const createLesson = asyncHandler(async (req, res) => {
	const item = await trainingProgramService.createLesson(req.body, req.user.id);
	await formCustomValueService.save('lesson', item.id, req.formCustom, req.user.id);
	return created(res, item);
});

const getLessonPrograms = asyncHandler(async (req, res) => {
	return success(res, await trainingProgramService.getLessonProgramIds(req.params.lessonId));
});

const setLessonPrograms = asyncHandler(async (req, res) => {
	const ids = await trainingProgramService.setLessonPrograms(
		req.params.lessonId,
		req.body.program_ids,
		req.user.id,
	);
	return success(res, ids, 'Đã cập nhật chương trình đào tạo cho bài học');
});

const linkLesson = asyncHandler(async (req, res) => {
	return created(
		res,
		await trainingProgramService.linkLesson(
			req.params.id,
			req.body.lesson_id,
			req.body.display_order,
			req.user.id,
		),
	);
});

const linkLessons = asyncHandler(async (req, res) => {
	return success(
		res,
		await trainingProgramService.linkLessons(req.params.id, req.body.lesson_ids, req.user.id),
		'Đã đính kèm bài học đã chọn',
	);
});

const reorderLessons = asyncHandler(async (req, res) => {
	return success(
		res,
		await trainingProgramService.reorderLessons(req.params.id, req.body.link_ids, req.user.id),
		'Đã cập nhật thứ tự bài học',
	);
});

const updateLessonLink = asyncHandler(async (req, res) => {
	await trainingProgramService.updateLessonLink(req.params.linkId, req.body, req.user.id);
	return success(res, null, 'Đã cập nhật thứ tự');
});

const unlinkLesson = asyncHandler(async (req, res) => {
	await trainingProgramService.unlinkLesson(req.params.linkId);
	return success(res, null, 'Đã gỡ bài học khỏi chương trình');
});

const updateLesson = asyncHandler(async (req, res) => {
	await trainingProgramService.updateLesson(req.params.lessonId, req.body, req.user.id);
	await formCustomValueService.save('lesson', req.params.lessonId, req.formCustom, req.user.id);
	return success(res, null, 'Cập nhật bài học thành công');
});

const removeLesson = asyncHandler(async (req, res) => {
	await trainingProgramService.removeLesson(req.params.lessonId, req.user.id);
	await formCustomValueService.remove('lesson', req.params.lessonId);
	return success(res, null, 'Đã xóa bài học');
});

// ─── Tài liệu bài học ────────────────────────────────────────────────────
const listLessonDocuments = asyncHandler(async (req, res) => {
	return success(res, await trainingProgramService.listLessonDocuments(req.params.id));
});

const addLessonDocument = asyncHandler(async (req, res) => {
	const sourceType = req.body.source_type === 'link' ? 'link' : 'file';
	if (sourceType === 'file' && !req.file) {
		return res.status(400).json({ success: false, message: 'Vui lòng chọn file để tải lên' });
	}
	if (sourceType === 'link' && !req.body.external_url) {
		return res.status(400).json({ success: false, message: 'Vui lòng nhập đường dẫn tài liệu' });
	}
	return created(
		res,
		await trainingProgramService.addLessonDocument(req.params.id, req.body, req.file, req.user.id),
	);
});

const removeLessonDocument = asyncHandler(async (req, res) => {
	await trainingProgramService.removeLessonDocument(req.params.docId, req.user.id);
	return success(res, null, 'Đã xóa tài liệu');
});

const incrementLessonDocumentDownload = asyncHandler(async (req, res) => {
	return success(
		res,
		await trainingProgramService.incrementLessonDocumentDownload(req.params.docId),
	);
});

const listProgramResults = asyncHandler(async (req, res) => {
	return success(res, await trainingProgramService.listProgramResults(req.params.id, req.user));
});

module.exports = {
	getAll,
	getById,
	createOne,
	updateOne,
	removeOne,
	importCatalog,
	listLessons,
	listAllLessons,
	createLesson,
	getLessonPrograms,
	setLessonPrograms,
	linkLesson,
	linkLessons,
	reorderLessons,
	updateLessonLink,
	unlinkLesson,
	updateLesson,
	removeLesson,
	listLessonDocuments,
	addLessonDocument,
	removeLessonDocument,
	incrementLessonDocumentDownload,
	listProgramResults,
};
