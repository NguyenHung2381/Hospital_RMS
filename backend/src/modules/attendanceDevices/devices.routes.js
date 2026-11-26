// /api/v1/attendance-devices — quản trị máy chấm công vân tay (deviceAdminService).
// Phía máy gửi lên ở iclock.routes.js.
const router = require('express').Router();
const { body, param, query } = require('express-validator');
const service = require('./deviceAdminService');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

router.use(authenticate);

const canRead = authorizePermission(
	['attendance_devices', 'read'],
	['attendance_devices', 'manage'],
);
const canManage = authorizePermission(['attendance_devices', 'manage']);
const idParam = param('id').isInt({ min: 1 }).toInt();
const dateQ = (f) => query(f).optional({ values: 'falsy' }).isISO8601({ strict: true });

router.get(
	'/',
	canRead,
	asyncHandler(async (_req, res) => success(res, await service.listDevices())),
);

// GET /punches?status=unmatched|matched|skipped|all&from=&to=&device_id=
router.get(
	'/punches',
	canRead,
	[
		query('status').optional({ values: 'falsy' }).isIn(['unmatched', 'matched', 'skipped', 'all']),
		dateQ('from'),
		dateQ('to'),
		query('device_id').optional({ values: 'falsy' }).isInt({ min: 1 }).toInt(),
	],
	validate,
	asyncHandler(async (req, res) => success(res, await service.listPunches(req.query))),
);

// Ghép lại lượt chấm chưa khớp trong N ngày gần nhất (mặc định 7)
router.post(
	'/punches/rematch',
	canManage,
	[body('days').optional().isInt({ min: 1, max: 90 }).toInt()],
	validate,
	asyncHandler(async (req, res) => {
		const r = await service.rematch(req.body.days || 7);
		return success(res, r, `Đã ghép thêm ${r.matched}/${r.total} lượt chấm`);
	}),
);

router.get(
	'/commands',
	canRead,
	[
		query('device_id').optional({ values: 'falsy' }).isInt({ min: 1 }).toInt(),
		query('status')
			.optional({ values: 'falsy' })
			.isIn(['pending', 'sent', 'done', 'failed', 'cancelled']),
	],
	validate,
	asyncHandler(async (req, res) => success(res, await service.listCommands(req.query))),
);

// Đồng bộ học viên xuống mọi máy đang hoạt động (nút trong khóa học / trang máy)
router.post(
	'/sync',
	canManage,
	asyncHandler(async (req, res) => {
		const r = await service.syncAll(req.user.id);
		return success(
			res,
			r,
			r.queued
				? `Đã xếp ${r.queued} lệnh, máy sẽ nhận trong ít phút`
				: 'Máy chấm công đã đủ học viên',
		);
	}),
);

// Body: { name?, location?, status?: 'active'|'disabled'|'pending', name_ascii? }
router.patch(
	'/:id',
	canManage,
	[
		idParam,
		body('name').optional({ values: 'null' }).isString().trim().isLength({ max: 150 }),
		body('location').optional({ values: 'null' }).isString().trim().isLength({ max: 255 }),
		body('status').optional().isIn(['active', 'disabled', 'pending']),
		body('name_ascii').optional().isBoolean().toBoolean(),
	],
	validate,
	asyncHandler(async (req, res) => {
		await service.updateDevice(req.params.id, req.body, req.user.id);
		return success(res, null, 'Đã lưu máy chấm công');
	}),
);

router.delete(
	'/:id',
	canManage,
	[idParam],
	validate,
	asyncHandler(async (req, res) => {
		await service.deleteDevice(req.params.id);
		return success(res, null, 'Đã xóa máy chấm công');
	}),
);

// Gửi lại toàn bộ học viên (+ vân tay) xuống 1 máy
router.post(
	'/:id/resync',
	canManage,
	[idParam],
	validate,
	asyncHandler(async (req, res) => {
		const r = await service.resync(req.params.id, req.user.id);
		return success(res, r, `Đã xếp ${r.queued} lệnh gửi lại xuống máy`);
	}),
);

// Body: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } — máy gửi lại lượt chấm trong khoảng
router.post(
	'/:id/pull-attlog',
	canManage,
	[idParam, body('from').isISO8601({ strict: true }), body('to').isISO8601({ strict: true })],
	validate,
	asyncHandler(async (req, res) => {
		await service.pullAttlog(req.params.id, req.body.from, req.body.to, req.user.id);
		return success(res, null, 'Đã gửi lệnh, máy sẽ gửi lại lượt chấm trong ít phút');
	}),
);

module.exports = router;
