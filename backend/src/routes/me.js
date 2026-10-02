const router = require('express').Router();
const portalService = require('../services/portalService');
const { authenticate } = require('../middlewares/auth');
const { success, created } = require('../utils/response');

/**
 * @swagger
 * tags:
 *   name: Me
 *   description: Cổng người dùng — khóa học, lịch học, CME của chính mình
 */

router.use(authenticate);

router.get('/training', async (req, res, next) => {
	try {
		return success(res, await portalService.getMyTraining(req.user));
	} catch (err) {
		next(err);
	}
});

router.get('/courses/:id', async (req, res, next) => {
	try {
		return success(res, await portalService.getMyCourse(req.params.id, req.user));
	} catch (err) {
		next(err);
	}
});

router.patch('/documents/:docId/download', async (req, res, next) => {
	try {
		return success(res, await portalService.openDocument(req.params.docId, req.user));
	} catch (err) {
		next(err);
	}
});

router.patch('/lesson-documents/:docId/download', async (req, res, next) => {
	try {
		return success(res, await portalService.openDocument(req.params.docId, req.user, 'lesson'));
	} catch (err) {
		next(err);
	}
});

router.post('/courses/:id/register', async (req, res, next) => {
	try {
		return created(res, await portalService.registerCourse(req.params.id, req.user), 'Đã gửi đăng ký, chờ duyệt');
	} catch (err) {
		next(err);
	}
});

router.get('/cme', async (req, res, next) => {
	try {
		const year = Number(req.query.year) || new Date().getFullYear();
		return success(res, await portalService.getMyCme(req.user, year));
	} catch (err) {
		next(err);
	}
});

module.exports = router;
