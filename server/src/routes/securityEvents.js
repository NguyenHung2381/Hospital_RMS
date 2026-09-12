const router = require('express').Router();
const ctrl = require('../controllers/securityEventController');
const { authenticate, authorizePermission } = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: SecurityEvents
 *   description: Nhật ký sự kiện bảo mật — khoá tài khoản, xoay phiên đăng nhập, truy cập dữ liệu nhạy cảm (admin only)
 */

router.use(authenticate, authorizePermission(['security_events', 'read']));

/**
 * @swagger
 * /security-events:
 *   get:
 *     summary: Lấy danh sách sự kiện bảo mật (keyset pagination theo id)
 *     tags: [SecurityEvents]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 50 }
 *       - in: query
 *         name: cursor
 *         description: id của dòng cuối trang trước — để trống lấy trang đầu
 *         schema: { type: string }
 *       - in: query
 *         name: event_type
 *         schema: { type: string, example: login_locked }
 *       - in: query
 *         name: actor_id
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách sự kiện bảo mật
 */
router.get('/', ctrl.getAll);

module.exports = router;
