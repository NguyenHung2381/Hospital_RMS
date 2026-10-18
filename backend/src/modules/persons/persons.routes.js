const router = require('express').Router();
const { body, param, query } = require('express-validator');
const personMergeService = require('./personMergeService');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { success } = require('../../utils/response');

/**
 * @swagger
 * tags:
 *   name: Persons
 *   description: Danh tính hợp nhất — duyệt gộp các hồ sơ người nghi trùng
 */

router.use(authenticate);

// CCCD chỉ hiện đủ cho người có quyền xem dữ liệu nhạy cảm (cùng quy ước với học viên)
const canSeeSensitive = (req) => {
	const perms = req.user?.permissions;
	return !!perms && (perms.has('system:manage') || perms.has('trainees:read_sensitive'));
};

const idParam = [param('id').isInt({ min: 1 }).withMessage('id không hợp lệ').toInt()];
const wrap = (fn) => async (req, res, next) => {
	try {
		return await fn(req, res);
	} catch (err) {
		next(err);
	}
};

router.get(
	'/merge-candidates/stats',
	authorizePermission(['persons', 'read']),
	wrap(async (req, res) => success(res, await personMergeService.getStats())),
);

router.get(
	'/merge-candidates',
	authorizePermission(['persons', 'read']),
	[
		query('status').optional().isIn(personMergeService.STATUSES),
		query('reason').optional({ values: 'falsy' }).isIn(personMergeService.REASONS),
	],
	validate,
	wrap(async (req, res) =>
		success(res, await personMergeService.listCandidates(req.query, canSeeSensitive(req))),
	),
);

router.get(
	'/merge-candidates/:id',
	authorizePermission(['persons', 'read']),
	idParam,
	validate,
	wrap(async (req, res) =>
		success(res, await personMergeService.getCandidate(req.params.id, canSeeSensitive(req))),
	),
);

router.post(
	'/merge-candidates/:id/merge',
	authorizePermission(['persons', 'merge']),
	[
		...idParam,
		body('keep').isIn(['A', 'B']).withMessage('keep phải là A hoặc B'),
		body('fields').optional({ nullable: true }).isObject().withMessage('fields phải là object'),
		body('note')
			.optional({ nullable: true })
			.isString()
			.isLength({ max: 500 })
			.withMessage('Ghi chú tối đa 500 ký tự'),
	],
	validate,
	wrap(async (req, res) =>
		success(
			res,
			await personMergeService.mergeCandidate(req.params.id, req.body, req.user.id),
			'Đã gộp hồ sơ',
		),
	),
);

router.post(
	'/merge-candidates/:id/reject',
	authorizePermission(['persons', 'merge']),
	[...idParam, body('note').optional({ nullable: true }).isString().isLength({ max: 500 })],
	validate,
	wrap(async (req, res) =>
		success(
			res,
			await personMergeService.rejectCandidate(req.params.id, req.body.note, req.user.id),
			'Đã đánh dấu không phải cùng một người',
		),
	),
);

router.post(
	'/merge-candidates/:id/reopen',
	authorizePermission(['persons', 'merge']),
	idParam,
	validate,
	wrap(async (req, res) =>
		success(
			res,
			await personMergeService.reopenCandidate(req.params.id, req.user.id),
			'Đã đưa lại vào hàng đợi',
		),
	),
);

module.exports = router;
