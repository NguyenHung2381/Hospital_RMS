const router = require('express').Router();
const ctrl = require('./signingController');
const v = require('./signingValidators');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validateRequest } = require('../../middlewares/validateRequest');
const uploadPdf = require('../../middlewares/uploadPdf');

router.use(authenticate);
const canManage = authorizePermission(['signing', 'manage']);
const idParams = validateRequest({ params: v.idParams });

// ─── Tài khoản ký số của chính mình (routePolicy.authOnly) ────────────────
router.get('/me', ctrl.getMine);
router.put('/me', validateRequest({ body: v.saveMine }), ctrl.saveMine);
router.delete('/me', ctrl.removeMine);
router.post('/me/check', ctrl.checkMine);
router.post('/me/test-sign', ctrl.testSignMine);
router.get('/me/status', ctrl.myStatus);
router.get('/providers', ctrl.listProviders);
router.get('/me/signature-image', ctrl.getMySignatureImage);
router.post(
	'/me/sign-pdf',
	uploadPdf.single('file'),
	validateRequest({ body: v.signPdf }),
	ctrl.signMyPdf,
);
router.put(
	'/me/signature-image',
	validateRequest({ body: v.signatureImage }),
	ctrl.saveMySignatureImage,
);

// ─── Quản trị ─────────────────────────────────────────────────────────────
router.get('/accounts', canManage, ctrl.listAccounts);
router.post('/accounts', canManage, validateRequest({ body: v.createAccount }), ctrl.createAccount);
router.get('/accounts/:id', canManage, idParams, ctrl.getAccount);
router.put(
	'/accounts/:id',
	canManage,
	validateRequest({ params: v.idParams, body: v.updateAccount }),
	ctrl.updateAccount,
);
router.delete('/accounts/:id', canManage, idParams, ctrl.removeAccount);
router.post('/accounts/:id/check', canManage, idParams, ctrl.checkAccount);
router.post('/accounts/:id/test-sign', canManage, idParams, ctrl.testSignAccount);
router.get('/config', canManage, ctrl.getConfig);
router.put('/config', canManage, validateRequest({ body: v.config }), ctrl.saveConfig);
router.get('/logs', canManage, validateRequest({ query: v.logsQuery }), ctrl.listLogs);

module.exports = router;
