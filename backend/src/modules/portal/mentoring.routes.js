const router = require('express').Router();
const { body } = require('express-validator');
const practiceResultService = require('../training/courses/practiceResultService');
const { authenticate } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

// Cổng người hướng dẫn thực hành GPHN (/me/mentoring — docs/ke-hoach-thiet-ke-lai-luong-dao-tao.md
// GĐ3). Không dựa vào quyền vai trò courses:* — service kiểm tra
// enrollment_rotations.mentor_user_id = chính mình.
router.use(authenticate);

router.get(
	'/',
	asyncHandler(async (req, res) =>
		success(res, await practiceResultService.listForMentor(req.user.id)),
	),
);

router.get(
	'/count',
	asyncHandler(async (req, res) =>
		success(res, await practiceResultService.countForMentor(req.user.id)),
	),
);

router.put(
	'/rotations/:rotationId/result',
	[
		body('result').isIn(['pending', 'pass', 'fail']).withMessage('Kết quả không hợp lệ'),
		body('comment').optional({ nullable: true }).isString().isLength({ max: 1000 }),
	],
	validate,
	asyncHandler(async (req, res) => {
		await practiceResultService.evaluateAsMentor(req.params.rotationId, req.user.id, req.body);
		return success(res, null, 'Đã lưu đánh giá');
	}),
);

module.exports = router;
