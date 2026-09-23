const router = require('express').Router();
const ctrl = require('../controllers/activityLogController');
const { authenticate, authorizePermission } = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: ActivityLogs
 *   description: Nhật ký tác động của người dùng lên hệ thống (admin only)
 */

router.use(authenticate, authorizePermission(['activity_logs', 'read']));

/**
 * @swagger
 * /activity-logs:
 *   get:
 *     summary: Lấy danh sách log tác động (keyset pagination, không dùng OFFSET)
 *     tags: [ActivityLogs]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 50 }
 *       - in: query
 *         name: cursor
 *         description: created_at của dòng cuối trang trước — để null lấy trang đầu
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: actor_id
 *         schema: { type: string }
 *       - in: query
 *         name: method
 *         schema: { type: string, example: POST }
 *       - in: query
 *         name: search
 *         description: Tìm theo path (LIKE)
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách log
 */
router.get('/', ctrl.getAll);

module.exports = router;
