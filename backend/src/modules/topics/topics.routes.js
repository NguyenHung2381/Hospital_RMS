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

router.use(authenticate);

// Chống IDOR: MỌI route có mã đề tài (:id / :topic_id) chỉ chạy khi đề tài nằm
// trong phạm vi của người gọi (own = thành viên, department = cùng khoa, all).
// authorizePermission chỉ kiểm tra "có quyền topics:xxx", không kiểm tra đề tài
// cụ thể — trước đây phạm vi khoa thao tác được thành viên / file / tác giả /
// nộp / xoá đề tài của khoa khác.
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
		body('article_type').optional().isIn(['de_tai', 'bai_bao']),
		body('publish_date').optional({ checkFalsy: true }).isISO8601(),
		body('budget_estimated').optional({ checkFalsy: true }).isFloat({ min: 0 }),
	],
	validate,
	ctrl.createOne,
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
	],
	validate,
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
