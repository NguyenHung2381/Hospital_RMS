const router = require('express').Router();
const { body } = require('express-validator');
const gradebookService = require('../training/courses/gradebookService');
const examService = require('../training/exams/examService');
const { authenticate } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

// Cổng giảng viên (/me/teaching): nhập điểm + chấm tự luận PHẦN MÌNH ĐƯỢC PHÂN
// (docs/ke-hoach-nang-cap-dao-tao.md mục 4.4). Không dựa vào quyền vai trò
// courses:* / exams:manage — mọi kiểm tra theo lecturers.user_id trong service:
//   gradebookService.teachingAccess  — được phân công khóa, phần LT/TH nào;
//   examService.assertGrader          — là người chấm của đề.
router.use(authenticate);

router.get(
	'/courses/:id/gradebook',
	asyncHandler(async (req, res) => {
		const access = await gradebookService.teachingAccess(req.params.id, req.user.id);
		return success(res, await gradebookService.getGradebook(req.params.id, access));
	}),
);

router.put(
	'/courses/:id/grades/bulk',
	[body('rows').isArray({ min: 1, max: 2000 }).withMessage('Danh sách điểm không hợp lệ')],
	validate,
	asyncHandler(async (req, res) => {
		const access = await gradebookService.teachingAccess(req.params.id, req.user.id);
		const r = await gradebookService.saveBulk(req.params.id, req.body.rows, req.user.id, {
			access,
		});
		return success(res, r, `Đã lưu điểm ${r.saved} học viên`);
	}),
);

// Bài tự luận chờ chấm của các đề mình là người chấm
router.get(
	'/grading',
	asyncHandler(async (req, res) =>
		success(res, await examService.listPendingForGrader(req.user.id)),
	),
);

router.get(
	'/attempts/:attemptId',
	asyncHandler(async (req, res) =>
		success(res, await examService.getAttemptForGrader(req.params.attemptId, req.user.id)),
	),
);

router.post(
	'/attempts/:attemptId/grade',
	[body('question_id').notEmpty(), body('score').isFloat({ min: 0 })],
	validate,
	asyncHandler(async (req, res) =>
		success(
			res,
			await examService.gradeEssayAsGrader(
				req.params.attemptId,
				req.body.question_id,
				req.body.score,
				req.user.id,
			),
			'Đã chấm điểm',
		),
	),
);

module.exports = router;
