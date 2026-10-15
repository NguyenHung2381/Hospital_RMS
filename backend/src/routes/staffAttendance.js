const router = require('express').Router();
const { query } = require('express-validator');
const staffAttendanceService = require('../services/staffAttendanceService');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');
const { success } = require('../utils/response');

/**
 * @swagger
 * tags:
 *   name: StaffAttendance
 *   description: Bảng chấm công nhân viên (IP bệnh viện + GPS)
 */

router.use(authenticate);

// GET /staff-attendance?date=YYYY-MM-DD (mặc định hôm nay)
router.get(
	'/',
	authorizePermission(['staff_attendance', 'read']),
	[query('date').optional({ values: 'falsy' }).isISO8601()],
	validate,
	async (req, res, next) => {
		try {
			return success(res, await staffAttendanceService.getByDate(req.query.date));
		} catch (err) {
			next(err);
		}
	},
);

module.exports = router;
