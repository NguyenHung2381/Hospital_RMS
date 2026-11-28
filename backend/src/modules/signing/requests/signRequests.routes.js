const router = require('express').Router();
const ctrl = require('./signRequestController');
const v = require('./signRequestValidators');
const { authenticate } = require('../../../middlewares/auth');
const { validateRequest } = require('../../../middlewares/validateRequest');
const uploadPdfs = require('../../../middlewares/uploadPdfs');

// Mọi cán bộ đăng nhập dùng được (routePolicy.authOnly); quyền theo từng hồ sơ kiểm ở service:
// người tạo, người có tên trong danh sách ký, hoặc signing:manage.
router.use(authenticate);

router.get('/', validateRequest({ query: v.listQuery }), ctrl.list);
router.get('/todo-count', ctrl.todoCount);
router.post(
	'/',
	uploadPdfs.array('files', 20),
	validateRequest({ body: v.createBody }),
	ctrl.create,
);
router.post('/batch-sign', validateRequest({ body: v.batchBody }), ctrl.batchSign);
router.get('/:id', validateRequest({ params: v.idParams }), ctrl.detail);
router.get(
	'/:id/documents/:docId/file',
	validateRequest({ params: v.docParams, query: v.fileQuery }),
	ctrl.file,
);
router.post('/:id/sign', validateRequest({ params: v.idParams, body: v.signBody }), ctrl.sign);
router.post(
	'/:id/reject',
	validateRequest({ params: v.idParams, body: v.rejectBody }),
	ctrl.reject,
);
router.post(
	'/:id/cancel',
	validateRequest({ params: v.idParams, body: v.cancelBody }),
	ctrl.cancel,
);

module.exports = router;
