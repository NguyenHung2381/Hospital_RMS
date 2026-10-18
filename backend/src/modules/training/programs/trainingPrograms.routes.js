const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('./trainingProgramController');
const { authenticate, authorizePermission } = require('../../../middlewares/auth');
const { validate } = require('../../../middlewares/errorHandler');
const { createTrainingUpload } = require('../../../middlewares/uploadTraining');

const uploadLessonDoc = createTrainingUpload('lesson_document', {
	maxSizeMB: Number(process.env.TRAINING_MEDIA_MAX_MB || 300),
	allowMedia: true,
});

router.use(authenticate);

router.get('/', authorizePermission(['training_programs', 'read']), ctrl.getAll);
router.get('/:id', authorizePermission(['training_programs', 'read']), ctrl.getById);

router.post(
	'/',
	authorizePermission(['training_programs', 'create']),
	[
		body('name').trim().notEmpty().withMessage('Tên chương trình không được để trống'),
		body('code').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
		body('duration').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
		body('max_capacity').optional({ checkFalsy: true }).isInt({ min: 1 }),
		body('display_order').optional({ checkFalsy: true }).isInt(),
	],
	validate,
	ctrl.createOne,
);

router.put(
	'/:id',
	authorizePermission(['training_programs', 'update']),
	[
		body('name').optional().trim().notEmpty(),
		body('code').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
		body('duration').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
		body('max_capacity').optional({ checkFalsy: true }).isInt({ min: 1 }),
		body('display_order').optional({ checkFalsy: true }).isInt(),
	],
	validate,
	ctrl.updateOne,
);

router.delete('/:id', authorizePermission(['training_programs', 'delete']), ctrl.removeOne);

// ─── Bài học (program_lessons) — nội dung dùng chung, tách khỏi lịch học cụ
// thể của khóa (class_sessions ở module Khóa học). 1 bài học có thể gắn vào
// NHIỀU chương trình (N:N qua lesson_programs) — xem
// 2026-09-18_lesson_programs_bridge. '/lessons/all' đặt trước để không bị
// route '/:id' (2 ký tự) ở đầu file nuốt mất — nhưng '/lessons/all' có 2
// segment nên không thể trùng '/:id' (1 segment) dù đặt ở đâu trong file.
router.get('/:id/lessons', authorizePermission(['training_programs', 'read']), ctrl.listLessons);
router.get('/lessons/all', authorizePermission(['training_programs', 'read']), ctrl.listAllLessons);
// Tạo bài học KHÔNG còn gắn sẵn theo :id chương trình — chương trình áp dụng
// chọn qua multi-select ở form, lưu bằng PUT /lessons/:lessonId/programs.
router.post(
	'/lessons',
	authorizePermission(['training_programs', 'update']),
	[
		body('title').trim().notEmpty().withMessage('Tên bài học không được để trống'),
		body('code').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
	],
	validate,
	ctrl.createLesson,
);
router.get(
	'/lessons/:lessonId/programs',
	authorizePermission(['training_programs', 'read']),
	ctrl.getLessonPrograms,
);
router.put(
	'/lessons/:lessonId/programs',
	authorizePermission(['training_programs', 'update']),
	[body('program_ids').isArray().withMessage('program_ids phải là mảng')],
	validate,
	ctrl.setLessonPrograms,
);
// Quick-action ở danh sách bài học theo 1 chương trình cụ thể — đính kèm bài
// học có sẵn / đổi thứ tự / gỡ khỏi chương trình này (không mở form đầy đủ).
router.post(
	'/:id/lessons/link',
	authorizePermission(['training_programs', 'update']),
	[body('lesson_id').notEmpty().withMessage('Vui lòng chọn bài học')],
	validate,
	ctrl.linkLesson,
);
// Đính kèm nhiều bài học cùng lúc (checkbox multi-select) / sắp xếp lại thứ
// tự toàn bộ bài học của chương trình sau khi kéo-thả ở FE.
router.post(
	'/:id/lessons/link-many',
	authorizePermission(['training_programs', 'update']),
	[body('lesson_ids').isArray({ min: 1 }).withMessage('Vui lòng chọn ít nhất 1 bài học')],
	validate,
	ctrl.linkLessons,
);
router.put(
	'/:id/lessons/reorder',
	authorizePermission(['training_programs', 'update']),
	[body('link_ids').isArray().withMessage('link_ids phải là mảng')],
	validate,
	ctrl.reorderLessons,
);
router.put(
	'/lesson-links/:linkId',
	authorizePermission(['training_programs', 'update']),
	ctrl.updateLessonLink,
);
router.delete(
	'/lesson-links/:linkId',
	authorizePermission(['training_programs', 'update']),
	ctrl.unlinkLesson,
);
router.put(
	'/lessons/:lessonId',
	authorizePermission(['training_programs', 'update']),
	ctrl.updateLesson,
);
router.delete(
	'/lessons/:lessonId',
	authorizePermission(['training_programs', 'update']),
	ctrl.removeLesson,
);

// ─── Tài liệu riêng của bài học (lesson_documents) — upload file/video hoặc
// dán link ngoài, giống course_documents ─────────────────────────────────────
router.get(
	'/lessons/:id/documents',
	authorizePermission(['training_programs', 'read']),
	ctrl.listLessonDocuments,
);
router.post(
	'/lessons/:id/documents',
	authorizePermission(['training_programs', 'update']),
	uploadLessonDoc.single('file'),
	ctrl.addLessonDocument,
);
router.delete(
	'/lesson-documents/:docId',
	authorizePermission(['training_programs', 'update']),
	ctrl.removeLessonDocument,
);
router.patch(
	'/lesson-documents/:docId/download',
	authorizePermission(['training_programs', 'read']),
	ctrl.incrementLessonDocumentDownload,
);

// ─── Kết quả học tập theo chương trình (view chỉ-đọc, dữ liệu từ grades của
// courseService) — cùng bảng grades nên dùng lại permission 'courses:read'.
router.get('/:id/results', authorizePermission(['courses', 'read']), ctrl.listProgramResults);

module.exports = router;
