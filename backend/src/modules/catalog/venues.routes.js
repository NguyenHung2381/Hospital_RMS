const router = require('express').Router();
const { body } = require('express-validator');
const { createCrudService } = require('../../shared/crudService');
const { createCrudController } = require('../../shared/crudController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { sql } = require('../../config/db');

// ─── Venues (Địa điểm: phòng họp bảo vệ đề cương / phòng học) ─────────────────
// Dùng chung NCKH + Đào tạo ⇒ resource riêng 'venues' (migration 2026-10-07_venues).
// GET chỉ cần đăng nhập: form hội đồng / buổi học / chương trình của khóa đều
// cần danh sách để chọn. Tên địa điểm được lưu dạng text sang bảng nghiệp vụ
// (councils.location, class_sessions.room, course_programs.location) nên
// không có deleteGuards — xoá địa điểm không ảnh hưởng dữ liệu đã lưu.
{
	const VENUE_EXTRA_FIELDS = [
		{ column: 'address', sqlType: sql.NVarChar(255) },
		{ column: 'capacity', sqlType: sql.Int },
		{ column: 'usage_scope', sqlType: sql.VarChar(20), default: 'both' },
		{ column: 'is_active', sqlType: sql.Bit, default: true },
	];
	const venueRules = (isCreate) => [
		isCreate
			? body('name').trim().notEmpty().withMessage('Tên địa điểm không được để trống')
			: body('name').optional().trim().notEmpty().withMessage('Tên địa điểm không được để trống'),
		body('usage_scope')
			.optional()
			.isIn(['defense', 'training', 'both'])
			.withMessage('Phạm vi sử dụng không hợp lệ'),
		body('capacity')
			.optional({ values: 'null' })
			.isInt({ min: 1 })
			.withMessage('Sức chứa phải là số nguyên dương'),
		body('is_active').optional().isBoolean().withMessage('Trạng thái không hợp lệ'),
	];

	const svc = createCrudService('venues', 20, 'DD', [], VENUE_EXTRA_FIELDS);
	const ctrl = createCrudController(svc);

	router.get('/venues', authenticate, ctrl.getAll);
	router.get('/venues/:id', authenticate, ctrl.getById);
	router.post(
		'/venues',
		authenticate,
		authorizePermission(['venues', 'create']),
		venueRules(true),
		validate,
		ctrl.createOne,
	);
	router.put(
		'/venues/:id',
		authenticate,
		authorizePermission(['venues', 'update']),
		venueRules(false),
		validate,
		ctrl.updateOne,
	);
	router.delete(
		'/venues/:id',
		authenticate,
		authorizePermission(['venues', 'delete']),
		ctrl.removeOne,
	);
}

module.exports = router;
