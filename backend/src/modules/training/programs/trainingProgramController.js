const trainingProgramService = require('./trainingProgramService');
const { success, created, notFound } = require('../../../utils/response');

const getAll = async (req, res, next) => {
	try {
		return success(res, await trainingProgramService.getAll(req.query));
	} catch (err) {
		next(err);
	}
};

const getById = async (req, res, next) => {
	try {
		const item = await trainingProgramService.getById(req.params.id);
		if (!item) return notFound(res);
		return success(res, item);
	} catch (err) {
		next(err);
	}
};

const createOne = async (req, res, next) => {
	try {
		return created(res, await trainingProgramService.create(req.body, req.user.id));
	} catch (err) {
		next(err);
	}
};

const updateOne = async (req, res, next) => {
	try {
		const item = await trainingProgramService.update(req.params.id, req.body, req.user.id);
		if (!item) return notFound(res);
		return success(res, item, 'Cập nhật thành công');
	} catch (err) {
		next(err);
	}
};

const removeOne = async (req, res, next) => {
	try {
		await trainingProgramService.remove(req.params.id, req.user.id);
		return success(res, null, 'Xóa thành công');
	} catch (err) {
		next(err);
	}
};

// ─── Bài học ─────────────────────────────────────────────────────────────
const listLessons = async (req, res, next) => {
	try {
		return success(res, await trainingProgramService.listLessons(req.params.id));
	} catch (err) {
		next(err);
	}
};

const listAllLessons = async (req, res, next) => {
	try {
		return success(res, await trainingProgramService.listAllLessons());
	} catch (err) {
		next(err);
	}
};

const createLesson = async (req, res, next) => {
	try {
		return created(res, await trainingProgramService.createLesson(req.body, req.user.id));
	} catch (err) {
		next(err);
	}
};

const getLessonPrograms = async (req, res, next) => {
	try {
		return success(res, await trainingProgramService.getLessonProgramIds(req.params.lessonId));
	} catch (err) {
		next(err);
	}
};

const setLessonPrograms = async (req, res, next) => {
	try {
		const ids = await trainingProgramService.setLessonPrograms(
			req.params.lessonId,
			req.body.program_ids,
			req.user.id,
		);
		return success(res, ids, 'Đã cập nhật chương trình đào tạo cho bài học');
	} catch (err) {
		next(err);
	}
};

const linkLesson = async (req, res, next) => {
	try {
		return created(
			res,
			await trainingProgramService.linkLesson(
				req.params.id,
				req.body.lesson_id,
				req.body.display_order,
				req.user.id,
			),
		);
	} catch (err) {
		next(err);
	}
};

const linkLessons = async (req, res, next) => {
	try {
		return success(
			res,
			await trainingProgramService.linkLessons(req.params.id, req.body.lesson_ids, req.user.id),
			'Đã đính kèm bài học đã chọn',
		);
	} catch (err) {
		next(err);
	}
};

const reorderLessons = async (req, res, next) => {
	try {
		return success(
			res,
			await trainingProgramService.reorderLessons(req.params.id, req.body.link_ids, req.user.id),
			'Đã cập nhật thứ tự bài học',
		);
	} catch (err) {
		next(err);
	}
};

const updateLessonLink = async (req, res, next) => {
	try {
		await trainingProgramService.updateLessonLink(req.params.linkId, req.body, req.user.id);
		return success(res, null, 'Đã cập nhật thứ tự');
	} catch (err) {
		next(err);
	}
};

const unlinkLesson = async (req, res, next) => {
	try {
		await trainingProgramService.unlinkLesson(req.params.linkId, req.user.id);
		return success(res, null, 'Đã gỡ bài học khỏi chương trình');
	} catch (err) {
		next(err);
	}
};

const updateLesson = async (req, res, next) => {
	try {
		await trainingProgramService.updateLesson(req.params.lessonId, req.body, req.user.id);
		return success(res, null, 'Cập nhật bài học thành công');
	} catch (err) {
		next(err);
	}
};

const removeLesson = async (req, res, next) => {
	try {
		await trainingProgramService.removeLesson(req.params.lessonId, req.user.id);
		return success(res, null, 'Đã xoá bài học');
	} catch (err) {
		next(err);
	}
};

// ─── Tài liệu bài học ────────────────────────────────────────────────────
const listLessonDocuments = async (req, res, next) => {
	try {
		return success(res, await trainingProgramService.listLessonDocuments(req.params.id));
	} catch (err) {
		next(err);
	}
};

const addLessonDocument = async (req, res, next) => {
	try {
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
	} catch (err) {
		next(err);
	}
};

const removeLessonDocument = async (req, res, next) => {
	try {
		await trainingProgramService.removeLessonDocument(req.params.docId, req.user.id);
		return success(res, null, 'Đã xoá tài liệu');
	} catch (err) {
		next(err);
	}
};

const incrementLessonDocumentDownload = async (req, res, next) => {
	try {
		return success(res, await trainingProgramService.incrementLessonDocumentDownload(req.params.docId));
	} catch (err) {
		next(err);
	}
};

const listProgramResults = async (req, res, next) => {
	try {
		return success(res, await trainingProgramService.listProgramResults(req.params.id));
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
