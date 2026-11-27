const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('./examController');
const { authenticate, authorizePermission } = require('../../../middlewares/auth');
const { validate } = require('../../../middlewares/errorHandler');
const { makeImageUpload } = require('../../../middlewares/uploadImage');
const { getPool, sql } = require('../../../config/db');
const { httpError } = require('../../../utils/httpError');
const coursePolicy = require('../courses/coursePolicy');
const { questionRules } = require('./questionValidators');

// Ảnh minh họa câu hỏi — dùng chung thư mục vì 1 câu hỏi nằm được trong nhiều đề
const uploadQuestionImage = makeImageUpload(() => ['questions']);

router.use(authenticate);

// Quản lý ngân hàng câu hỏi / đề thi / bài làm. Trước đây mượn 'courses:update';
// nay là quyền riêng 'exams:manage' (permissions/catalog.js, seedFrom
// courses:update → vai trò đang có quyền cũ được cấp sẵn quyền mới).
const canManage = authorizePermission(['exams', 'manage']);

// L-13: đề/bài thi thuộc một khóa học — người có phạm vi khóa học 'assigned' chỉ thao
// tác được đề của khóa mình được phân công (như courses.routes.js cho :id và mã con).
// Phạm vi 'all'/không có quyền courses ⇒ coursePolicy trả ngay, không tốn truy vấn.
const COURSE_OF = {
	paper: 'SELECT course_id FROM exam_papers WHERE id = @id',
	attempt: `SELECT p.course_id FROM exam_attempts a
	          JOIN exam_papers p ON p.id = a.paper_id WHERE a.id = @id`,
};
const scopeByRecord = (kind, param) => async (req, _res, next) => {
	try {
		if (coursePolicy.courseScope(req.user, 'update') !== 'assigned') return next();
		const row = (
			await (
				await getPool()
			)
				.request()
				.input('id', sql.VarChar(40), String(req.params[param]))
				.query(COURSE_OF[kind])
		).recordset[0];
		if (!row) throw httpError(404, 'Không tìm thấy dữ liệu');
		await coursePolicy.assertCourseInScope(row.course_id, req.user, 'update');
		next();
	} catch (err) {
		next(err);
	}
};
const scopeByCourseId =
	(source, { required = false } = {}) =>
	async (req, _res, next) => {
		try {
			if (coursePolicy.courseScope(req.user, 'update') !== 'assigned') return next();
			const courseId = req[source]?.course_id;
			if (!courseId) {
				if (required) throw httpError(400, 'Vui lòng chọn khóa học');
				return next();
			}
			await coursePolicy.assertCourseInScope(courseId, req.user, 'update');
			next();
		} catch (err) {
			next(err);
		}
	};
const paperScope = scopeByRecord('paper', 'id');
const attemptScope = scopeByRecord('attempt', 'attemptId');

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
// Tạo lẻ / nhập hàng loạt / sửa dùng chung 1 bộ kiểm (questionValidators.js)
router.post('/questions', canManage, questionRules(), validate, ctrl.createQuestion);
router.post(
	'/questions/bulk',
	canManage,
	[
		body('questions')
			.isArray({ min: 1, max: 500 })
			.withMessage('Danh sách câu hỏi phải có 1–500 câu'),
		...questionRules({ bulk: true }),
	],
	validate,
	ctrl.createQuestionsBulk,
);
// Tải ảnh minh họa trước, rồi gửi `image_url` trả về trong body tạo/sửa câu hỏi
router.post(
	'/questions/image',
	canManage,
	uploadQuestionImage.single('image'),
	ctrl.uploadQuestionImage,
);
router.put(
	'/questions/:id',
	canManage,
	questionRules({ partial: true }),
	validate,
	ctrl.updateQuestion,
);
router.delete('/questions/:id', canManage, ctrl.removeQuestion);

// ─── Đề thi ──────────────────────────────────────────────────────────────────
router.get('/papers', canManage, scopeByCourseId('query', { required: true }), ctrl.listPapers);
router.get('/papers/:id', canManage, paperScope, ctrl.getPaper);
router.post(
	'/papers',
	canManage,
	scopeByCourseId('body'),
	[
		body('course_id').notEmpty().withMessage('Vui lòng chọn khóa học'),
		body('title').trim().notEmpty().withMessage('Tên đề thi không được để trống'),
		body('paper_type').optional({ nullable: true }).isIn(['multiple_choice', 'essay']),
		body('duration_minutes').optional().isInt({ min: 1 }),
		body('status').optional().isIn(['draft', 'published', 'closed']),
		body('question_ids').optional().isArray(),
		body('exam_part').optional().isIn(['theory', 'practice']),
		body('blind_grading').optional().isBoolean(),
		body('grader_ids').optional().isArray(),
		// Đề đầu vào / cuối khóa, lớp (chương trình), bốc ngẫu nhiên N câu, kiểu mã đề, trọng số
		body('purpose').optional().isIn(['entrance', 'final']),
		body('program_id').optional({ nullable: true }).isString(),
		body('gen_mc_count').optional({ nullable: true }).isInt({ min: 0, max: 500 }),
		body('gen_essay_count').optional({ nullable: true }).isInt({ min: 0, max: 100 }),
		body('code_mode').optional({ nullable: true }).isIn(['per_trainee', 'shuffled', 'codes']),
		body('code_count').optional({ nullable: true }).isInt({ min: 2, max: 10 }),
		body('weight').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 100 }),
	],
	validate,
	ctrl.createPaper,
);
router.put(
	'/papers/:id',
	canManage,
	paperScope,
	scopeByCourseId('body'),
	[
		body('title').optional().trim().notEmpty(),
		body('paper_type').optional({ nullable: true }).isIn(['multiple_choice', 'essay']),
		body('duration_minutes').optional().isInt({ min: 1 }),
		body('status').optional().isIn(['draft', 'published', 'closed']),
		body('question_ids').optional().isArray(),
		body('exam_part').optional().isIn(['theory', 'practice']),
		body('blind_grading').optional().isBoolean(),
		body('grader_ids').optional().isArray(),
		// Đề đầu vào / cuối khóa, lớp (chương trình), bốc ngẫu nhiên N câu, kiểu mã đề, trọng số
		body('purpose').optional().isIn(['entrance', 'final']),
		body('program_id').optional({ nullable: true }).isString(),
		body('gen_mc_count').optional({ nullable: true }).isInt({ min: 0, max: 500 }),
		body('gen_essay_count').optional({ nullable: true }).isInt({ min: 0, max: 100 }),
		body('code_mode').optional({ nullable: true }).isIn(['per_trainee', 'shuffled', 'codes']),
		body('code_count').optional({ nullable: true }).isInt({ min: 2, max: 10 }),
		body('weight').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 100 }),
	],
	validate,
	ctrl.updatePaper,
);
router.delete('/papers/:id', canManage, paperScope, ctrl.removePaper);

// ─── Chấm bài ────────────────────────────────────────────────────────────────
router.get('/papers/:id/attempts', canManage, paperScope, ctrl.listAttempts);
router.get('/attempts/:attemptId', canManage, attemptScope, ctrl.getAttempt);
router.post(
	'/attempts/:attemptId/grade',
	canManage,
	attemptScope,
	[body('question_id').notEmpty(), body('score').isFloat({ min: 0 })],
	validate,
	ctrl.gradeAnswer,
);

module.exports = router;
