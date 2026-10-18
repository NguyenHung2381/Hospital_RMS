const router = require('express').Router();

/**
 * @swagger
 * tags:
 *   - name: Departments
 *     description: Quản lý phòng ban
 *   - name: Categories
 *     description: Quản lý danh mục
 *   - name: Levels
 *     description: Quản lý cấp độ
 *   - name: Roles
 *     description: Quản lý vai trò
 *   - name: ResearchRounds
 *     description: Quản lý đợt nghiên cứu
 */

// Route danh mục gắn ở gốc /api/v1 (mỗi file khai báo đường dẫn đầy đủ).
// Thứ tự giữ như lookups.routes.js cũ.
router.use(require('./departments.routes'));
router.use(require('./externalReviewers.routes'));
router.use(require('./categories.routes'));
router.use(require('./levels.routes'));
router.use(require('./roundTypes.routes'));
router.use(require('./trainingCatalog.routes'));
router.use(require('./venues.routes'));
router.use(require('./jobTitles.routes'));

module.exports = router;
