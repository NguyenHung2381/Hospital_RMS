const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('./examController');
const { authenticate, authorizePermission } = require('../../../middlewares/auth');
const { validate } = require('../../../middlewares/errorHandler');
const { makeImageUpload } = require('../../../middlewares/uploadImage');

// Ảnh minh hoạ câu hỏi — dùng chung thư mục vì 1 câu hỏi nằm được trong nhiều đề
const uploadQuestionImage = makeImageUpload(() => ['questions']);

/**
 * @swagger
 * tags:
 *   name: Exams
 *   description: Ngân hàng câu hỏi & thi online (module Đào tạo)
 */

router.use(authenticate);

// Quản lý ngân hàng câu hỏi / đề thi / bài làm. Trước đây mượn 'courses:update';
// nay là quyền riêng 'exams:manage' (permissions/catalog.js, seedFrom
// courses:update → vai trò đang có quyền cũ được cấp sẵn quyền mới).
const canManage = authorizePermission(['exams', 'manage']);

// ─── Học viên: đề đang mở + làm bài — ĐẶT TRƯỚC route quản trị bên dưới để
// không bị nuốt bởi '/papers/:id' (đều là GET/POST 1 segment sau /papers). ──
router.get('/available', ctrl.listAvailable);
router.post('/papers/:id/start', ctrl.startAttempt);
router.post(
	'/papers/:id/submit',
	[body('answers').isArray().withMessage('answers phải là mảng')],
	validate,
	ctrl.submitAttempt,
);

// ─── Ngân hàng câu hỏi ───────────────────────────────────────────────────────
router.get('/questions', canManage, ctrl.listQuestions);
router.post(
	'/questions',
	canManage,
	[
		body('question_text').trim().notEmpty().withMessage('Nội dung câu hỏi không được để trống'),
		body('question_type').optional().isIn(['single_choice', 'essay']),
		body('points').optional().isFloat({ min: 0.1 }),
	],
	validate,
	ctrl.createQuestion,
);
router.post(
	'/questions/bulk',
	canManage,
	[
		body('questions').isArray({ min: 1, max: 500 }).withMessage('Danh sách câu hỏi phải có 1–500 câu'),
		body('questions.*.question_text').isString().trim().notEmpty().withMessage('Có câu hỏi bị trống nội dung'),
		body('questions.*.question_type').isIn(['single_choice', 'essay']),
		body('questions.*.points').optional().isFloat({ min: 0.1, max: 999 }),
		body('questions.*.options').optional().isArray({ max: 20 }),
		body('questions.*.correct_option')
			.optional({ values: 'null' })
			.isString()
			.isLength({ max: 255 })
			.withMessage('Đáp án quá dài (tối đa 255 ký tự)'),
		body('questions').custom((qs) =>
			qs.every((q) => q.question_type === 'essay' || (Array.isArray(q.options) && q.options.includes(q.correct_option))),
		).withMessage('Câu trắc nghiệm phải có đáp án đúng nằm trong các phương án'),
	],
	validate,
	ctrl.createQuestionsBulk,
);
// Tải ảnh minh hoạ trước, rồi gửi `image_url` trả về trong body tạo/sửa câu hỏi
router.post('/questions/image', canManage, uploadQuestionImage.single('image'), ctrl.uploadQuestionImage);
router.put('/questions/:id', canManage, ctrl.updateQuestion);
router.delete('/questions/:id', canManage, ctrl.removeQuestion);

// ─── Đề thi ──────────────────────────────────────────────────────────────────
router.get('/papers', canManage, ctrl.listPapers);
router.get('/papers/:id', canManage, ctrl.getPaper);
router.post(
	'/papers',
	canManage,
	[
		body('course_id').notEmpty().withMessage('Vui lòng chọn khóa học'),
		body('title').trim().notEmpty().withMessage('Tên đề thi không được để trống'),
		body('paper_type').optional().isIn(['multiple_choice', 'essay']),
		body('duration_minutes').optional().isInt({ min: 1 }),
		body('status').optional().isIn(['draft', 'published', 'closed']),
		body('question_ids').optional().isArray(),
	],
	validate,
	ctrl.createPaper,
);
router.put(
	'/papers/:id',
	canManage,
	[
		body('title').optional().trim().notEmpty(),
		body('paper_type').optional().isIn(['multiple_choice', 'essay']),
		body('duration_minutes').optional().isInt({ min: 1 }),
		body('status').optional().isIn(['draft', 'published', 'closed']),
		body('question_ids').optional().isArray(),
	],
	validate,
	ctrl.updatePaper,
);
router.delete('/papers/:id', canManage, ctrl.removePaper);

// ─── Chấm bài ────────────────────────────────────────────────────────────────
router.get('/papers/:id/attempts', canManage, ctrl.listAttempts);
router.get('/attempts/:attemptId', canManage, ctrl.getAttempt);
router.post(
	'/attempts/:attemptId/grade',
	canManage,
	[body('question_id').notEmpty(), body('score').isFloat({ min: 0 })],
	validate,
	ctrl.gradeAnswer,
);

module.exports = router;
