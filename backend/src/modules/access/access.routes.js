const router = require('express').Router();
const { body } = require('express-validator');
const { createCrudController } = require('../../shared/crudController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { success, created } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');
const { assertCanEditRole } = require('./privilegeGuard');
const permService = require('./permissionService');

// ─── Roles ────────────────────────────────────────────────────────────────────
const roleService = require('./roleService');
const roleCtrl = createCrudController(roleService);

router.get('/roles', authenticate, authorizePermission(['roles', 'read']), roleCtrl.getAll);
router.post('/roles', authenticate, authorizePermission(['roles', 'create']), roleCtrl.createOne);

router.get('/roles/:id', authenticate, authorizePermission(['roles', 'read']), roleCtrl.getById);
// Không sửa/xoá được vai trò của chính mình, vai trò toàn quyền, hay vai trò
// có quyền cao hơn mình — xem modules/access/privilegeGuard.js.
const guardRoleEdit = asyncHandler(async (req, res, next) => {
	await assertCanEditRole(req.user, req.params.id);
	next();
});
router.put(
	'/roles/:id',
	authenticate,
	authorizePermission(['roles', 'update']),
	guardRoleEdit,
	roleCtrl.updateOne,
);
router.delete(
	'/roles/:id',
	authenticate,
	authorizePermission(['roles', 'delete']),
	guardRoleEdit,
	roleCtrl.removeOne,
);

// ─── Permissions ──────────────────────────────────────────────────────────────
// GET /permissions/catalog — danh mục quyền nhóm theo module/resource kèm nhãn
// (nguồn: permissions/catalog.js) — màn hình phân quyền dựng ma trận từ đây.
router.get(
	'/permissions/catalog',
	authenticate,
	authorizePermission(['roles', 'read']),
	asyncHandler(async (req, res) => {
		return success(res, await permService.getCatalog());
	}),
);

// POST /roles/:id/clone — nhân bản vai trò (tên mới + đúng quyền & phạm vi của
// vai trò nguồn). Cần cả quyền tạo vai trò lẫn quyền phân quyền.
router.post(
	'/roles/:id/clone',
	authenticate,
	authorizePermission(['roles', 'create']),
	authorizePermission(['roles', 'manage']),
	[body('name').trim().isLength({ min: 2 }).withMessage('Tên vai trò ít nhất 2 ký tự')],
	validate,
	asyncHandler(async (req, res) => {
		const role = await permService.cloneRole(
			req.params.id,
			{ name: req.body.name.trim(), description: req.body.description?.trim() || null },
			req.user,
			req.ip,
		);
		return created(res, role, 'Đã nhân bản vai trò');
	}),
);

// GET /roles/:id/permissions — các lượt cấp quyền hiện tại: [{ permission_id, scope }]
router.get(
	'/roles/:id/permissions',
	authenticate,
	authorizePermission(['roles', 'read']),
	asyncHandler(async (req, res) => {
		return success(res, await permService.getRolePermissions(req.params.id));
	}),
);

// PUT /roles/:id/permissions — thay toàn bộ quyền của vai trò.
// Body: { grants: [{ permission_id, scope }] } — scope chỉ dùng cho resource có
// phạm vi dữ liệu (topics / users / courses), resource khác để null.
router.put(
	'/roles/:id/permissions',
	authenticate,
	authorizePermission(['roles', 'manage']),
	[body('grants').isArray()],
	validate,
	asyncHandler(async (req, res) => {
		const result = await permService.setRolePermissions(
			req.params.id,
			req.body.grants,
			req.user,
			req.ip,
		);
		return success(res, result, 'Cập nhật phân quyền thành công');
	}),
);

module.exports = router;
