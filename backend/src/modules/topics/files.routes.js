const router = require('express').Router();
const fileCtrl = require('./fileController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');

router.use(authenticate);

router.delete(
	'/:file_id',
	authorizePermission(['files', 'delete']),
	fileCtrl.checkDeleteWindow,
	fileCtrl.deleteFile,
);

module.exports = router;
