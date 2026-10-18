const router = require('express').Router();
const fileCtrl = require('./fileController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Files
 *   description: Quản lý file đính kèm
 */

/**
 * @swagger
 * /files/{file_id}:
 *   delete:
 *     summary: Xoá file theo ID
 *     tags: [Files]
 *     parameters:
 *       - in: path
 *         name: file_id
 *         required: true
 *         schema:
 *           type: string
 *         example: "FILE001"
 *     responses:
 *       200:
 *         description: Xoá file thành công
 *       404:
 *         description: Không tìm thấy file
 *       401:
 *         description: Chưa xác thực
 */
router.delete(
	'/:file_id',
	authorizePermission(['files', 'delete']),
	fileCtrl.checkDeleteWindow,
	fileCtrl.deleteFile,
);

module.exports = router;
