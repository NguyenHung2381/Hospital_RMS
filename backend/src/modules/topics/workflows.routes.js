const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('./workflowController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');

router.use(authenticate);
const canManage = authorizePermission(['workflows', 'manage']);

router.get('/definitions', canManage, ctrl.listDefinitions);
router.get('/definitions/:id', canManage, ctrl.getDefinition);
router.post(
	'/definitions',
	canManage,
	[
		body('resource').trim().notEmpty().withMessage('Vui lòng chọn loại đối tượng áp dụng'),
		body('name').trim().notEmpty().withMessage('Tên workflow không được để trống'),
		body('steps').optional().isArray(),
	],
	validate,
	ctrl.createDefinition,
);
router.put(
	'/definitions/:id',
	canManage,
	[body('name').optional().trim().notEmpty(), body('steps').optional().isArray()],
	validate,
	ctrl.updateDefinition,
);
router.delete('/definitions/:id', canManage, ctrl.removeDefinition);

// Trạng thái workflow của 1 đối tượng cụ thể — dùng quyền đọc rộng hơn (chỉ
// cần đăng nhập) vì đây là thông tin hiển thị kèm màn phê duyệt, không phải
// cấu hình.
router.get('/status/:entityId', ctrl.getStatus);

module.exports = router;
