const router = require('express').Router();
const ctrl = require('../controllers/notificationController');
const { authenticate } = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Thông báo người dùng
 */

router.use(authenticate);

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Lấy danh sách thông báo của người dùng hiện tại
 *     tags: [Notifications]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *       - in: query
 *         name: unread_only
 *         schema: { type: boolean, example: false }
 *     responses:
 *       200:
 *         description: Danh sách thông báo
 */
router.get('/', ctrl.getAll);

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: Lấy số thông báo chưa đọc
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: '{ count: number }'
 */
router.get('/unread-count', ctrl.getCount);

/**
 * @swagger
 * /notifications/read-all:
 *   put:
 *     summary: Đánh dấu tất cả thông báo đã đọc
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: Thành công
 */
router.put('/read-all', ctrl.markAll);

/**
 * @swagger
 * /notifications/{id}/read:
 *   put:
 *     summary: Đánh dấu một thông báo đã đọc
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Thành công
 *       404:
 *         description: Không tìm thấy thông báo
 */
router.put('/:id/read', ctrl.markOne);

module.exports = router;
