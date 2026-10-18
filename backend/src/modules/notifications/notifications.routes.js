const router = require('express').Router();
const ctrl = require('./notificationController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');

// Quản trị thông báo hệ thống — tách theo thao tác.
// authorizePermission luôn cho 'notifications:manage' đi qua nên vai trò cũ giữ nguyên quyền.
const canReadNotifAdmin = authorizePermission(['notifications', 'read']);
const canSendNotifications = authorizePermission(['notifications', 'create']);
const canDeleteNotifications = authorizePermission(['notifications', 'delete']);

router.use(authenticate);

router.get('/', ctrl.getAll);

router.get('/unread-count', ctrl.getCount);

router.put('/read-all', ctrl.markAll);

router.put('/:id/read', ctrl.markOne);

router.post('/send', canSendNotifications, ctrl.send);

router.get('/admin', canReadNotifAdmin, ctrl.adminList);

router.get('/admin/:batchKey/recipients', canReadNotifAdmin, ctrl.getBatchRecipients);

router.delete('/admin/batch/:batchKey', canDeleteNotifications, ctrl.deleteBatch);

router.delete('/:id', canDeleteNotifications, ctrl.deleteOne);

module.exports = router;
