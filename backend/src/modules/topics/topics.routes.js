const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('./topicController');
const exportCtrl = require('./topicExportController');
const fileCtrl = require('./fileController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const upload = require('../../middlewares/upload');
const uploadExcel = require('../../middlewares/uploadExcel');
const topicPolicy = require('./topicPolicy');
const { ACCEPTANCE_RATINGS } = require('./topicLegacyService');
const { formConfigGuard } = require('../forms/formConfigGuard');
const { scopeOf } = require('../../permissions/authz');

// Form nào đang gửi (cấu hình form 'topic'): TopicModal gửi form_variant='admin',
// chỉ tài khoản phạm vi khoa/toàn viện mới được kiểm theo form quản trị.
const topicVariant = (req) => {
	const wantsAdmin = req.body?.form_variant === 'admin';
	if (req.body) delete req.body.form_variant;
	const scope = scopeOf(req.user, 'topics');
	return wantsAdmin && (scope === 'all' || scope === 'department') ? 'admin' : 'portal';
};

// Form thành viên ở cổng nhân viên gửi form_variant='portal' ⇒ kiểm theo Cấu hình
// form. Drawer quản trị / trang đăng ký cũng gọi route này nhưng chưa nối cấu
// hình ⇒ null = bỏ qua.
const memberVariant = (req) => {
	const v = req.body?.form_variant;
	if (req.body) delete req.body.form_variant;
	return v === 'portal' ? 'portal' : null;
};

router.use(authenticate);

// Chống IDOR: MỌI route có mã đề tài (:id / :topic_id) chỉ chạy khi đề tài nằm
// trong phạm vi của người gọi (own = thành viên, department = cùng khoa, all).
// authorizePermission chỉ kiểm tra "có quyền topics:xxx", không kiểm tra đề tài
// cụ thể — trước đây phạm vi khoa thao tác được thành viên / file / tác giả /
// nộp / xóa đề tài của khoa khác.
const topicScopeParam = async (req, _res, next, topicId) => {
	try {
		await topicPolicy.assertTopicInScope(topicId, req.user);
		next();
	} catch (err) {
		next(err);
	}
};
router.param('id', topicScopeParam);
router.param('topic_id', topicScopeParam);

router.get('/', authorizePermission(['topics', 'read']), ctrl.getAll);

router.post(
	'/export-data',
	authorizePermission(['reports', 'create']),
	[body('ids').isArray()],
	validate,
	ctrl.exportData,
);

router.post(
	'/export-excel',
	authorizePermission(['reports', 'create']),
	[body('ids').isArray()],
	validate,
	exportCtrl.exportExcel,
);

router.post(
	'/export-report',
	authorizePermission(['reports', 'create']),
	[body('ids').isArray()],
	validate,
	exportCtrl.exportReport,
);

// Nhập danh sách đề tài từ Excel (dry_run=1 để xem trước) — controller chỉ cho phạm vi 'all'
router.post('/import-template', authorizePermission(['topics', 'create']), ctrl.importTemplate);
router.post(
	'/import-excel',
	authorizePermission(['topics', 'create']),
	uploadExcel.single('file'),
	ctrl.importExcel,
);

router.get('/:id', authorizePermission(['topics', 'read']), ctrl.getById);

router.post(
	'/',
	authorizePermission(['topics', 'create']),
	[
		body('title').notEmpty(),
		body('round_id').notEmpty(),
		// Mã đề tài sinh theo ký hiệu thể loại (sp_gen_topic_id) ⇒ bắt buộc
		body('category_id').trim().notEmpty().withMessage('Vui lòng chọn danh mục đề tài'),
		body('article_type').optional().isIn(['de_tai', 'bai_bao']),
		body('publish_date').optional({ checkFalsy: true }).isISO8601(),
		body('budget_estimated').optional({ checkFalsy: true }).isFloat({ min: 0 }),
	],
	validate,
	formConfigGuard('topic', { variant: topicVariant, mode: 'create' }),
	ctrl.createOne,
);

// Nhập bổ sung đề tài đã hoàn thành ở cổng nhân viên (đợt cũ, không xét mốc đăng ký)
router.post(
	'/legacy',
	authorizePermission(['topics', 'create']),
	[
		body('title').trim().notEmpty().withMessage('Tên đề tài không được để trống'),
		body('round_id').trim().notEmpty().withMessage('Vui lòng chọn đợt nghiên cứu'),
		// Mã đề tài sinh theo ký hiệu thể loại (sp_gen_topic_id) ⇒ bắt buộc
		body('category_id').trim().notEmpty().withMessage('Vui lòng chọn danh mục đề tài'),
		body('department_id').trim().notEmpty().withMessage('Vui lòng chọn khoa/phòng'),
		body('acceptance_rating')
			.optional({ checkFalsy: true })
			.isIn(ACCEPTANCE_RATINGS)
			.withMessage('Xếp loại nghiệm thu không hợp lệ'),
		body('acceptance_score')
			.optional({ checkFalsy: true })
			.isFloat({ min: 0, max: 100 })
			.withMessage('Điểm nghiệm thu phải từ 0 đến 100'),
		body('acceptance_date').optional({ checkFalsy: true }).isISO8601(),
		body('members').isArray({ min: 1, max: 50 }).withMessage('Cần ít nhất một thành viên'),
		body('members.*.ho_ten').trim().notEmpty().withMessage('Thành viên thiếu họ tên'),
		body('members.*.email').optional({ checkFalsy: true }).isEmail(),
		body('members.*.role').isIn(['leader', 'secretary', 'member']),
	],
	validate,
	// Đề tài cũ luôn là 'de_tai' (service tự gán) — đặt sẵn để điều kiện `when`
	// của cấu hình form tính đúng, rồi kiểm theo form cổng nhân viên.
	(req, _res, next) => {
		req.body.article_type = 'de_tai';
		next();
	},
	formConfigGuard('topic', { variant: 'portal', mode: 'create' }),
	ctrl.createLegacy,
);

router.put(
	'/:id',
	authorizePermission(['topics', 'update']),
	[
		body('title').optional().notEmpty(),
		body('status')
			.optional()
			.isIn(['submitted', 'approved', 'rejected', 'supplement', 'cancelled']),
		body('article_type').optional().isIn(['de_tai', 'bai_bao']),
		body('publish_date').optional({ checkFalsy: true }).isISO8601(),
		body('budget_estimated').optional({ checkFalsy: true }).isFloat({ min: 0 }),
		body('budget_actual').optional({ checkFalsy: true }).isFloat({ min: 0 }),
		body('approval_decision_date').optional({ checkFalsy: true }).isISO8601(),
		body('recognition_decision_date').optional({ checkFalsy: true }).isISO8601(),
		body('is_featured').optional().isBoolean(),
		body('acceptance_rating').optional({ checkFalsy: true }).isIn(ACCEPTANCE_RATINGS),
		body('acceptance_score').optional({ checkFalsy: true }).isFloat({ min: 0, max: 100 }),
		body('acceptance_date').optional({ checkFalsy: true }).isISO8601(),
	],
	validate,
	formConfigGuard('topic', { variant: topicVariant, mode: 'update' }),
	ctrl.updateOne,
);

router.delete('/:id', authorizePermission(['topics', 'delete']), ctrl.removeOne);

router.get('/:id/members', authorizePermission(['topics', 'read']), ctrl.getMembers);

router.post(
	'/:id/members',
	authorizePermission(['topics', 'update']),
	[
		body('ho_ten').notEmpty(),
		body('email').optional({ checkFalsy: true }).isEmail(),
		body('role').optional().isIn(['leader', 'secretary', 'member']),
	],
	validate,
	formConfigGuard('topic_member', { variant: memberVariant, mode: 'create' }),
	ctrl.addMember,
);

router.put(
	'/:id/members/:member_id',
	authorizePermission(['topics', 'update']),
	[
		body('ho_ten').optional().notEmpty(),
		body('email').optional().isEmail(),
		body('role').optional().isIn(['leader', 'secretary', 'member']),
	],
	validate,
	formConfigGuard('topic_member', { variant: memberVariant, mode: 'update' }),
	ctrl.updateMember,
);

router.delete(
	'/:id/members/:member_id',
	authorizePermission(['topics', 'update']),
	ctrl.deleteMember,
);

router.post(
	'/:id/members/grant-accounts',
	authorizePermission(['topics', 'update']),
	ctrl.grantAccounts,
);

router.post('/:id/submit', authorizePermission(['topics', 'update']), ctrl.submit);

router.get('/:id/approvals', authorizePermission(['topics', 'read']), ctrl.getApprovals);

router.post(
	'/:id/approve',
	authorizePermission(['topics', 'approve']),
	[body('status').isIn(['approved', 'rejected', 'supplement'])],
	validate,
	ctrl.approve,
);

router.get('/:topic_id/files', authorizePermission(['files', 'read']), fileCtrl.getByTopic);

router.get('/:topic_id/files/batches', authorizePermission(['files', 'read']), fileCtrl.getBatches);

router.post(
	'/:topic_id/files',
	authorizePermission(['files', 'create']),
	fileCtrl.checkUploadWindow,
	upload.array('files', 30),
	fileCtrl.upload,
);

// ─── Đồng tác giả (bài báo/tập san) ──────────────────────────────────────────
router.get('/:id/authors', authorizePermission(['topics', 'read']), ctrl.getAuthors);
router.put(
	'/:id/authors',
	authorizePermission(['topics', 'update']),
	[body('authors').isArray().withMessage('authors phải là mảng')],
	validate,
	ctrl.setAuthors,
);

module.exports = router;
