const systemSettingService = require('../services/systemSettingService');

// Bật/tắt module nghiệp vụ ở Cấu hình hệ thống: MODULE_<KEY> = 'false' là tắt, còn lại là bật.
const MODULES = ['RESEARCH', 'TRAINING', 'SEMINAR', 'SURVEY'];

const isModuleEnabled = async (key) => (await systemSettingService.getValue(`MODULE_${key}`)) !== 'false';

const requireModule = (key) => async (req, res, next) => {
	try {
		if (await isModuleEnabled(key)) return next();
		return res.status(403).json({ success: false, code: 'MODULE_DISABLED', message: 'Chức năng này đã được quản trị viên tắt' });
	} catch (err) {
		next(err);
	}
};

module.exports = { MODULES, isModuleEnabled, requireModule };
