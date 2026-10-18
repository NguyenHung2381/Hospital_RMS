const router = require('express').Router();

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
