const systemSettingService = require('../modules/settings/systemSettingService');
const { asyncHandler } = require('../utils/asyncHandler');

// Bật/tắt module nghiệp vụ ở Cấu hình hệ thống: MODULE_<KEY> = 'false' là tắt, còn lại là bật.
// Module trong DEFAULT_OFF thì ngược lại: chỉ bật khi = 'true' (điểm danh cần cấu hình
// IP + vị trí trước mới dùng được, không nên tự hiện cho mọi bệnh viện).
const MODULES = ['RESEARCH', 'TRAINING', 'SEMINAR', 'SURVEY', 'ATTENDANCE'];
const DEFAULT_OFF = new Set(['ATTENDANCE']);

const isModuleEnabled = async (key) => {
	const value = await systemSettingService.getValue(`MODULE_${key}`);
	return DEFAULT_OFF.has(key) ? value === 'true' : value !== 'false';
};

const requireModule = (key) =>
	asyncHandler(async (req, res, next) => {
		if (await isModuleEnabled(key)) return next();
		return res.status(403).json({
			success: false,
			code: 'MODULE_DISABLED',
			message: 'Chức năng này đã được quản trị viên tắt',
		});
	});

module.exports = { MODULES, isModuleEnabled, requireModule };
