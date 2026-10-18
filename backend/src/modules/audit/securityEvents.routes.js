const router = require('express').Router();
const ctrl = require('./securityEventController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');

router.use(authenticate, authorizePermission(['security_events', 'read']));

router.get('/', ctrl.getAll);

module.exports = router;
