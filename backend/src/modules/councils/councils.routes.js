const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('./councilController');
const exportCtrl = require('./councilExportController');
const progressCtrl = require('./councilProgressController');
const upload = require('../../middlewares/upload');
const uploadImage = require('../../middlewares/uploadImage');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');

router.use(authenticate);

const SEAT_ROLES = ['chairman', 'secretary', 'reviewer1', 'reviewer2', 'member'];

router.get('/', authorizePermission(['councils', 'read']), ctrl.getAll);

router.post(
	'/export-excel',
	authorizePermission(['councils', 'read']),
	[body('round_id').notEmpty().withMessage('Đợt nghiên cứu không được để trống')],
	validate,
	exportCtrl.exportExcel,
);

const uploadExcel = require('../../middlewares/uploadExcel');
router.post(
	'/import-excel',
	authorizePermission(['councils', 'create']),
	uploadExcel.single('file'),
	ctrl.importExcel,
);

// ─── Cổng đánh giá tiến độ của thành viên hội đồng ────────────────────────────
// Quyền theo ghế hội đồng của chính người đăng nhập (kiểm tra trong service),
// KHÔNG dùng authorizePermission — thành viên hội đồng là tài khoản thường.

router.get('/my-progress', progressCtrl.getMyProgress);

router.get('/my-progress/count', progressCtrl.getMySeatCount);

router.put(
	'/progress/:topic_id/review',
	[
		body('progress_percent')
			.optional({ nullable: true })
			.isInt({ min: 0, max: 100 })
			.withMessage('Tiến độ phải từ 0 đến 100 (%)'),
		body('rating')
			.optional({ nullable: true })
			.isIn(['on_track', 'behind', 'at_risk'])
			.withMessage('Xếp loại tiến độ không hợp lệ'),
		body('comment')
			.optional({ nullable: true })
			.isLength({ max: 2000 })
			.withMessage('Nhận xét tối đa 2000 ký tự'),
	],
	validate,
	progressCtrl.upsertReview,
);

router.post(
	'/progress/:topic_id/files',
	progressCtrl.requireSecretary,
	upload.array('files', 30),
	progressCtrl.uploadFiles,
);

router.delete('/progress/:topic_id/files/:file_id', progressCtrl.deleteFile);

router.put(
	'/progress/:topic_id/result',
	[
		body('conclusion')
			.optional({ nullable: true })
			.isIn(['pass', 'fail', 'revise'])
			.withMessage('Kết luận không hợp lệ'),
		body('general_comment')
			.optional({ nullable: true })
			.isLength({ max: 2000 })
			.withMessage('Nhận xét chung tối đa 2000 ký tự'),
	],
	validate,
	progressCtrl.upsertResult,
);

router.post(
	'/progress/:topic_id/minutes',
	progressCtrl.requireSecretary,
	upload.array('files', 30),
	progressCtrl.uploadMinutesFiles,
);

router.delete('/progress/:topic_id/minutes/:file_id', progressCtrl.deleteMinutesFile);

router.post(
	'/progress/:topic_id/comment-image',
	progressCtrl.requireCouncilSeat,
	uploadImage.single('image'),
	progressCtrl.uploadCommentImage,
);

router.get(
	'/unassigned-topics',
	authorizePermission(['councils', 'read']),
	ctrl.getUnassignedTopics,
);

router.post(
	'/auto-assign',
	authorizePermission(['councils', 'create']),
	[
		body('round_id').notEmpty().withMessage('Đợt nghiên cứu không được để trống'),
		body('specialty_group')
			.custom(
				(v) => (typeof v === 'string' && v.trim() !== '') || (Array.isArray(v) && v.length > 0),
			)
			.withMessage('Hệ chuyên môn không được để trống'),
		body('min_size').optional().isInt({ min: 1, max: 20 }),
		body('max_size').optional().isInt({ min: 1, max: 20 }),
	],
	validate,
	ctrl.autoAssign,
);

router.get('/:id', authorizePermission(['councils', 'read']), ctrl.getById);

router.post(
	'/',
	authorizePermission(['councils', 'create']),
	[
		body('round_id').notEmpty().withMessage('Đợt nghiên cứu không được để trống'),
		body('name').notEmpty().withMessage('Tên hội đồng không được để trống'),
		body('defense_date').optional({ checkFalsy: true }).isISO8601(),
	],
	validate,
	ctrl.createOne,
);

router.put(
	'/:id',
	authorizePermission(['councils', 'update']),
	[
		body('name').optional().notEmpty(),
		body('defense_date').optional({ checkFalsy: true }).isISO8601(),
		body('status').optional().isIn(['draft', 'finalized']),
	],
	validate,
	ctrl.updateOne,
);

router.delete('/:id', authorizePermission(['councils', 'delete']), ctrl.removeOne);

// ─── Members (5 ghế cố định: chairman/secretary/reviewer1/reviewer2/member) ───

router.get('/:id/members', authorizePermission(['councils', 'read']), ctrl.getMembers);

router.get('/:id/eligible-users', authorizePermission(['councils', 'read']), ctrl.getEligibleUsers);

router.post(
	'/:id/members',
	authorizePermission(['councils', 'update']),
	[
		body('role').isIn(SEAT_ROLES),
		body().custom((value) => {
			if (!!value.user_id === !!value.external_reviewer_id) {
				throw new Error(
					'Cần đúng 1 trong 2: user_id (trong viện) hoặc external_reviewer_id (ngoài viện)',
				);
			}
			return true;
		}),
	],
	validate,
	ctrl.addMember,
);

router.put(
	'/:id/members/:member_id',
	authorizePermission(['councils', 'update']),
	[
		body('user_id').optional({ nullable: true }).isString(),
		body('external_reviewer_id').optional({ nullable: true }).isString(),
		body('role').optional().isIn(SEAT_ROLES),
	],
	validate,
	ctrl.updateMember,
);

router.delete(
	'/:id/members/:member_id',
	authorizePermission(['councils', 'update']),
	ctrl.removeMember,
);

// ─── Topic assignment (nhiều đề tài -> một hội đồng, cùng đợt nghiên cứu) ─────

router.get('/:id/topics', authorizePermission(['councils', 'read']), ctrl.getTopics);

router.post(
	'/:id/topics',
	authorizePermission(['councils', 'update']),
	[body('topic_ids').isArray({ min: 1 })],
	validate,
	ctrl.assignTopics,
);

router.delete(
	'/:id/topics/:topic_id',
	authorizePermission(['councils', 'update']),
	ctrl.unassignTopic,
);

router.patch(
	'/:id/topics/:topic_id',
	authorizePermission(['councils', 'update']),
	[body('session').optional({ nullable: true }).isIn(['morning', 'afternoon'])],
	validate,
	ctrl.setTopicSession,
);

router.put(
	'/:id/topics/:topic_id/substitute',
	authorizePermission(['councils', 'update']),
	[body('role').isIn(SEAT_ROLES), body('user_id').notEmpty()],
	validate,
	ctrl.setSeatSubstitute,
);

router.delete(
	'/:id/topics/:topic_id/substitute/:role',
	authorizePermission(['councils', 'update']),
	ctrl.removeSeatSubstitute,
);

module.exports = router;
