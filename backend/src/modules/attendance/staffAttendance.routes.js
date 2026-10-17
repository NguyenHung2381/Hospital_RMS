const router = require('express').Router();
const { body, param, query } = require('express-validator');
const staffAttendanceService = require('./staffAttendanceService');
const shiftService = require('./shiftService');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { success } = require('../../utils/response');

/**
 * @swagger
 * tags:
 *   name: StaffAttendance
 *   description: Bảng chấm công nhân viên (IP bệnh viện + GPS)
 */

router.use(authenticate);

// GET /staff-attendance?date=YYYY-MM-DD (mặc định hôm nay) — phạm vi khoa: chỉ khoa mình
router.get(
	'/',
	authorizePermission(['staff_attendance', 'read']),
	[query('date').optional({ values: 'falsy' }).isISO8601()],
	validate,
	async (req, res, next) => {
		try {
			return success(res, await staffAttendanceService.getByDate(req.query.date, req.user));
		} catch (err) {
			next(err);
		}
	},
);

// ─── Ca làm việc, mẫu ca tuần, phân ca theo ngày — shiftService ──────────────
const canManage = authorizePermission(['staff_attendance', 'manage']);
const canRoster = authorizePermission(['staff_attendance', 'roster']);
// Danh sách ca cần cho cả người cấu hình lẫn người phân ca
const canManageOrRoster = authorizePermission(
	['staff_attendance', 'manage'],
	['staff_attendance', 'roster'],
);
const handle = (fn) => async (req, res, next) => {
	try {
		await fn(req, res);
	} catch (err) {
		next(err);
	}
};
const idParam = [param('id').isInt({ min: 1 }).toInt()];
const minutes = (field) => body(field).isInt({ min: 0, max: 720 }).toInt();

router.get(
	'/shifts',
	canManageOrRoster,
	handle(async (req, res) => success(res, await shiftService.listShifts())),
);
const shiftBody = [
	body('name').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Tên ca 1–100 ký tự'),
	body('code').isString().trim().isLength({ min: 1, max: 10 }).withMessage('Ký hiệu ca 1–10 ký tự'),
	body('start_time')
		.matches(/^([01]\d|2[0-3]):[0-5]\d$/)
		.withMessage('Giờ vào phải dạng HH:mm'),
	body('end_time')
		.matches(/^([01]\d|2[0-3]):[0-5]\d$/)
		.withMessage('Giờ ra phải dạng HH:mm'),
	minutes('checkin_before_min'),
	minutes('checkout_after_min'),
	body('grace_min').isInt({ min: 0, max: 240 }).toInt(),
	body('is_active').optional().isBoolean().toBoolean(),
];
router.post(
	'/shifts',
	canManage,
	shiftBody,
	validate,
	handle(async (req, res) =>
		success(res, await shiftService.saveShift(null, req.body), 'Đã thêm ca làm', 201),
	),
);
router.put(
	'/shifts/:id',
	canManage,
	[...idParam, ...shiftBody],
	validate,
	handle(async (req, res) =>
		success(res, await shiftService.saveShift(req.params.id, req.body), 'Đã cập nhật ca làm'),
	),
);
router.delete(
	'/shifts/:id',
	canManage,
	idParam,
	validate,
	handle(async (req, res) => {
		await shiftService.removeShift(req.params.id);
		return success(res, null, 'Đã xoá ca làm');
	}),
);

router.get(
	'/patterns',
	canManageOrRoster,
	handle(async (req, res) => success(res, await shiftService.listPatterns())),
);
router.get(
	'/patterns/users',
	canManage,
	handle(async (req, res) => success(res, await shiftService.listUsers())),
);
const patternBody = [
	body('name').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Tên mẫu 1–100 ký tự'),
	body('days').isObject().withMessage('Thiếu ca theo ngày trong tuần'),
	body('is_default').optional().isBoolean().toBoolean(),
];
router.post(
	'/patterns',
	canManage,
	patternBody,
	validate,
	handle(async (req, res) =>
		success(res, await shiftService.savePattern(null, req.body), 'Đã thêm mẫu ca tuần', 201),
	),
);
router.put(
	'/patterns/:id',
	canManage,
	[...idParam, ...patternBody],
	validate,
	handle(async (req, res) =>
		success(
			res,
			await shiftService.savePattern(req.params.id, req.body),
			'Đã cập nhật mẫu ca tuần',
		),
	),
);
router.delete(
	'/patterns/:id',
	canManage,
	idParam,
	validate,
	handle(async (req, res) => {
		await shiftService.removePattern(req.params.id);
		return success(res, null, 'Đã xoá mẫu ca tuần');
	}),
);
// Body: { user_ids: string[] } — đúng danh sách người dùng mẫu này
router.put(
	'/patterns/:id/users',
	canManage,
	[
		...idParam,
		body('user_ids').isArray({ max: 20000 }),
		body('user_ids.*').isString().isLength({ min: 1, max: 20 }),
	],
	validate,
	handle(async (req, res) => {
		await shiftService.setPatternUsers(req.params.id, req.body.user_ids);
		return success(res, null, 'Đã cập nhật người áp dụng mẫu ca');
	}),
);

// GET /staff-attendance/roster?from=&to=&department_id= — tối đa 62 ngày.
// Phân ca phạm vi khoa (staff_attendance:roster@department): chỉ thấy/xếp ca khoa mình.
router.get(
	'/roster',
	canRoster,
	[
		query('from').isISO8601({ strict: true }),
		query('to')
			.isISO8601({ strict: true })
			.custom((to, { req }) => {
				const days = (Date.parse(to) - Date.parse(req.query.from)) / 86400000;
				if (days < 0 || days > 62) throw new Error('Khoảng ngày 0–62 ngày');
				return true;
			}),
		query('department_id').optional({ values: 'falsy' }).isString().isLength({ max: 20 }),
	],
	validate,
	handle(async (req, res) => success(res, await shiftService.getRoster(req.query, req.user))),
);
// Body: { user_ids, dates: ['YYYY-MM-DD'], mode: 'shifts'|'off'|'pattern', shift_ids? }
router.put(
	'/roster',
	canRoster,
	[
		body('user_ids').isArray({ min: 1, max: 5000 }),
		body('user_ids.*').isString().isLength({ min: 1, max: 20 }),
		body('dates').isArray({ min: 1, max: 62 }),
		body('dates.*').isISO8601({ strict: true }),
		body('mode').isIn(['shifts', 'off', 'pattern']),
		body('shift_ids').optional().isArray({ max: 10 }),
		body('shift_ids.*').isInt({ min: 1 }).toInt(),
	],
	validate,
	handle(async (req, res) =>
		success(res, await shiftService.setRoster(req.body, req.user), 'Đã cập nhật phân ca'),
	),
);

module.exports = router;
