const router = require('express').Router();
const { createCrudController } = require('../../shared/crudController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');

const catService = require('./categoryService');
const catCtrl = createCrudController(catService);

router.get('/categories', authenticate, catCtrl.getAll);
router.post(
	'/categories',
	authenticate,
	authorizePermission(['catalog', 'create']),
	catCtrl.createOne,
);

router.get('/categories/:id', authenticate, catCtrl.getById);
router.put(
	'/categories/:id',
	authenticate,
	authorizePermission(['catalog', 'update']),
	catCtrl.updateOne,
);
router.delete(
	'/categories/:id',
	authenticate,
	authorizePermission(['catalog', 'delete']),
	catCtrl.removeOne,
);

module.exports = router;
