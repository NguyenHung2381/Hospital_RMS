// /api/v1/tuition-bank — hàng chờ đối soát giao dịch ngân hàng (phòng Đào tạo).
// Giao dịch chưa khớp chưa thuộc khóa nào ⇒ chỉ người có courses:approve phạm vi toàn viện
// (phạm vi 'assigned' chỉ thấy khóa được phân công, không xem được tiền của khóa khác).
const router = require('express').Router();
const { body, param } = require('express-validator');
const { authenticate, authorizePermission } = require('../../../../middlewares/auth');
const { validate } = require('../../../../middlewares/errorHandler');
const { asyncHandler } = require('../../../../utils/asyncHandler');
const { success } = require('../../../../utils/response');
const { forbidden } = require('../../../../utils/httpError');
const reconcile = require('./bankReconcileService');

router.use(authenticate, authorizePermission(['courses', 'approve']));
router.use((req, _res, next) =>
	next(
		reconcile.canSeeAll(req.user)
			? undefined
			: forbidden('Đối soát ngân hàng cần quyền duyệt khóa học phạm vi toàn viện.'),
	),
);

const idParam = [param('id').isInt({ min: 1 })];

router.get(
	'/transactions',
	asyncHandler(async (req, res) => success(res, await reconcile.list(req.query))),
);
router.get(
	'/status',
	asyncHandler(async (_req, res) => success(res, await reconcile.status())),
);
router.post(
	'/preview',
	[body('content').isString().isLength({ max: 500 }), body('amount').isInt({ min: 1 })],
	validate,
	asyncHandler(async (req, res) => success(res, await reconcile.preview(req.body))),
);
router.post(
	'/transactions/:id/assign',
	[...idParam, body('enrollment_id').isString().isLength({ min: 1, max: 20 })],
	validate,
	asyncHandler(async (req, res) =>
		success(
			res,
			await reconcile.assign(req.params.id, req.body.enrollment_id, req.user.id),
			'Đã ghi nhận học phí và cấp phiếu thu',
		),
	),
);
router.post(
	'/transactions/:id/ignore',
	[...idParam, body('note').isString().isLength({ min: 1, max: 500 })],
	validate,
	asyncHandler(async (req, res) =>
		success(res, await reconcile.ignore(req.params.id, req.body.note, req.user.id), 'Đã bỏ qua'),
	),
);

module.exports = router;
