const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/examController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');

/**
 * @swagger
 * tags:
 *   name: Exams
 *   description: Ngân hàng câu hỏi & thi online (module Đào tạo)
 */

router.use(authenticate);

// Quản lý (giảng viên/quản lý khóa học) — dùng lại quyền 'courses:update' vì
// ngân hàng câu hỏi/đề thi gắn chặt với khóa học, không tách permission riêng.
const canManage = authorizePermission(['courses', 'update']);

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
