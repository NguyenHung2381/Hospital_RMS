const router = require('express').Router();
const ctrl = require('./activityLogController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');

router.use(authenticate, authorizePermission(['activity_logs', 'read']));

router.get('/', ctrl.getAll);

router.get('/stats', ctrl.getStats);

module.exports = router;
