const router = require('express').Router();
const { body } = require('express-validator');
const { createCrudService } = require('../../shared/crudService');
const { createCrudController } = require('../../shared/crudController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { sql } = require('../../config/db');

// ─── Danh mục Đào tạo (trainee_types, training_forms, training_types, hospital_training_topics, trainee_document_types, cme_credit_categories, cme_credit_groups) ──
// "Môn học" (subjects) đã gộp vào Bài học (program_lessons) — xem 2026-11-01_lessons_replace_subjects.sql.
// Shape id/name/description/audit giống categories/levels ⇒ dùng thẳng crudService(), không cần override.
// 2 bảng CME có thêm cột (công thức quy đổi, thứ tự) + mã tự đặt ⇒ khai báo riêng bên dưới.
const TRAINING_CATALOG_TABLES = {
	'trainee-types': 'trainee_types',
	'training-forms': 'training_forms',
	'training-types': 'training_types',
	'hospital-training-topics': 'hospital_training_topics',
};

const CME_CATEGORY_EXTRA_FIELDS = [
	{ column: 'group_id', sqlType: sql.VarChar(20) },
	{ column: 'conversion_method', sqlType: sql.VarChar(20), default: 'fixed' },
	{ column: 'conversion_value', sqlType: sql.Decimal(6, 2) },
	{ column: 'unit_label', sqlType: sql.NVarChar(40) },
];

for (const [path, table] of Object.entries(TRAINING_CATALOG_TABLES)) {
	const svc = createCrudService(table, 20);
	const ctrl = createCrudController(svc);

	router.get(`/${path}`, authenticate, ctrl.getAll);
	router.get(`/${path}/:id`, authenticate, ctrl.getById);
	router.post(
		`/${path}`,
		authenticate,
		authorizePermission(['training_catalog', 'create']),
		[body('name').trim().notEmpty().withMessage('Tên không được để trống')],
		validate,
		ctrl.createOne,
	);
	router.put(
		`/${path}/:id`,
		authenticate,
		authorizePermission(['training_catalog', 'update']),
		ctrl.updateOne,
	);
	router.delete(
		`/${path}/:id`,
		authenticate,
		authorizePermission(['training_catalog', 'delete']),
		ctrl.removeOne,
	);
}

// Danh mục quy đổi CME = 2 bảng cme_credit_groups (nhóm hoạt động) +
// cme_credit_categories (loại hình, có công thức quy đổi group_id/
// conversion_method/conversion_value/unit_label). Mã do admin tự đặt (DT_KHOAHOC,
// CME_DAOTAO...) giống seed 2026-10-15; bỏ trống thì sinh ngẫu nhiên.
{
	const CME_CODE_RE = /^[A-Za-z0-9_]{1,20}$/;
	const codeRule = body('id')
		.optional({ values: 'falsy' })
		.trim()
		.matches(CME_CODE_RE)
		.withMessage('Mã chỉ gồm chữ không dấu, số, dấu gạch dưới (tối đa 20 ký tự)')
		.customSanitizer((v) => v.toUpperCase());
	const nameRule = (isCreate) =>
		isCreate
			? body('name').trim().notEmpty().withMessage('Tên không được để trống')
			: body('name').optional().trim().notEmpty().withMessage('Tên không được để trống');

	const mount = (path, svc, rules) => {
		const ctrl = createCrudController(svc);
		router.get(`/${path}`, authenticate, ctrl.getAll);
		router.get(`/${path}/:id`, authenticate, ctrl.getById);
		router.post(
			`/${path}`,
			authenticate,
			authorizePermission(['training_catalog', 'create']),
			[codeRule, nameRule(true), ...rules],
			validate,
			ctrl.createOne,
		);
		router.put(
			`/${path}/:id`,
			authenticate,
			authorizePermission(['training_catalog', 'update']),
			[nameRule(false), ...rules],
			validate,
			ctrl.updateOne,
		);
		router.delete(
			`/${path}/:id`,
			authenticate,
			authorizePermission(['training_catalog', 'delete']),
			ctrl.removeOne,
		);
	};

	// Loại giấy tờ hồ sơ học viên (giai đoạn 3): mã tự đặt chữ thường (national_id, degree…
	// trainee_documents.doc_type đang dùng), required_for_types = loại khóa bắt buộc nộp.
	const docCodeRule = body('id')
		.optional({ values: 'falsy' })
		.trim()
		.matches(/^[a-z0-9_]{1,30}$/)
		.withMessage('Mã chỉ gồm chữ thường không dấu, số, dấu gạch dưới (tối đa 30 ký tự)');
	const docTypeRules = [
		body('required_for_types')
			.optional({ values: 'null' })
			.isString()
			.isLength({ max: 500 })
			.withMessage('Danh sách loại khóa không hợp lệ'),
		body('display_order').optional().isInt({ min: 0 }).withMessage('Thứ tự phải là số nguyên ≥ 0'),
	];
	{
		const ctrl = createCrudController(
			createCrudService(
				'trainee_document_types',
				30,
				'',
				[{ table: 'trainee_documents', column: 'doc_type', label: 'hồ sơ học viên' }],
				[
					{ column: 'required_for_types', sqlType: sql.VarChar(500) },
					{ column: 'display_order', sqlType: sql.Int, default: 0 },
				],
				{ allowCustomId: true },
			),
		);
		const path = 'trainee-document-types';
		router.get(`/${path}`, authenticate, ctrl.getAll);
		router.get(`/${path}/:id`, authenticate, ctrl.getById);
		router.post(
			`/${path}`,
			authenticate,
			authorizePermission(['training_catalog', 'create']),
			[docCodeRule, nameRule(true), ...docTypeRules],
			validate,
			ctrl.createOne,
		);
		router.put(
			`/${path}/:id`,
			authenticate,
			authorizePermission(['training_catalog', 'update']),
			[nameRule(false), ...docTypeRules],
			validate,
			ctrl.updateOne,
		);
		router.delete(
			`/${path}/:id`,
			authenticate,
			authorizePermission(['training_catalog', 'delete']),
			ctrl.removeOne,
		);
	}

	mount(
		'cme-credit-groups',
		createCrudService(
			'cme_credit_groups',
			20,
			'',
			[{ table: 'cme_credit_categories', column: 'group_id', label: 'loại hình quy đổi' }],
			[{ column: 'sort_order', sqlType: sql.Int, default: 0 }],
			{ allowCustomId: true },
		),
		[body('sort_order').optional().isInt({ min: 0 }).withMessage('Thứ tự phải là số nguyên ≥ 0')],
	);

	mount(
		'cme-credit-categories',
		createCrudService(
			'cme_credit_categories',
			20,
			'',
			[{ table: 'cme_records', column: 'category_id', label: 'bản ghi CME' }],
			CME_CATEGORY_EXTRA_FIELDS,
			{ allowCustomId: true },
		),
		[
			body('conversion_method')
				.optional()
				.isIn(['per_session', 'fixed', 'per_year'])
				.withMessage('Cách quy đổi không hợp lệ'),
			body('conversion_value')
				.optional({ values: 'null' })
				.isFloat({ min: 0, max: 9999 })
				.withMessage('Số giờ quy đổi phải là số ≥ 0'),
		],
	);
}

module.exports = router;
