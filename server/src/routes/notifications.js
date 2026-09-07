const router = require('express').Router();
const ctrl = require('../controllers/notificationController');
const { authenticate, authorizePermission } = require('../middlewares/auth');

// Quản trị thông báo hệ thống — tách theo thao tác.
// authorizePermission luôn cho 'notifications:manage' đi qua nên vai trò cũ giữ nguyên quyền.
const canReadNotifAdmin = authorizePermission(['notifications', 'read']);
const canSendNotifications = authorizePermission(['notifications', 'create']);
const canDeleteNotifications = authorizePermission(['notifications', 'delete']);

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

/**
 * @swagger
 * /notifications/send:
 *   post:
 *     summary: Gửi thông báo đến người dùng (admin only)
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, title, target_type]
 *             properties:
 *               type: { type: string }
 *               title: { type: string }
 *               message: { type: string }
 *               ref_id: { type: string }
 *               ref_type: { type: string }
 *               target_type:
 *                 type: string
 *                 enum: [all, department, users]
 *               target_ids:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200:
 *         description: Đã gửi
 */
router.post('/send', canSendNotifications, ctrl.send);

/**
 * @swagger
 * /notifications/admin:
 *   get:
 *     summary: Lấy toàn bộ thông báo trong hệ thống (admin only)
 *     tags: [Notifications]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách thông báo
 */
router.get('/admin', canReadNotifAdmin, ctrl.adminList);

/**
 * @swagger
 * /notifications/admin/{batchKey}/recipients:
 *   get:
 *     summary: Lấy danh sách người nhận của 1 lượt gửi (admin only)
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: batchKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách người nhận
 */
router.get('/admin/:batchKey/recipients', canReadNotifAdmin, ctrl.getBatchRecipients);

/**
 * @swagger
 * /notifications/admin/batch/{batchKey}:
 *   delete:
 *     summary: Xoá cả 1 lượt gửi thông báo (admin only)
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: batchKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Đã xoá
 *       404:
 *         description: Không tìm thấy
 */
router.delete('/admin/batch/:batchKey', canDeleteNotifications, ctrl.deleteBatch);

/**
 * @swagger
 * /notifications/{id}:
 *   delete:
 *     summary: Xoá thông báo (admin only)
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Đã xoá
 *       404:
 *         description: Không tìm thấy
 */
router.delete('/:id', canDeleteNotifications, ctrl.deleteOne);

module.exports = router;
