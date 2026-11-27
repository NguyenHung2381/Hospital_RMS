const systemSettingService = require('../settings/systemSettingService');

// Cấu hình máy chấm công (Cấu hình hệ thống → Đào tạo → Máy chấm công)
const DEFAULTS = {
	DEVICE_CHECKIN_EARLY_MIN: 30, // chấm sớm nhất trước giờ bắt đầu buổi
	DEVICE_LATE_AFTER_MIN: 15, // quá giờ bắt đầu bao nhiêu phút thì tính "đi muộn"
	DEVICE_CLEANUP_DAYS: 30, // khóa kết thúc bao nhiêu ngày thì dọn học viên khỏi máy
};

const intSetting = async (key, min, max) => {
	const n = Number(await systemSettingService.getValue(key, String(DEFAULTS[key])));
	return Number.isInteger(n) && n >= min && n <= max ? n : DEFAULTS[key];
};

const getDeviceSettings = async () => ({
	earlyMin: await intSetting('DEVICE_CHECKIN_EARLY_MIN', 0, 240),
	lateAfterMin: await intSetting('DEVICE_LATE_AFTER_MIN', 0, 240),
	cleanupDays: await intSetting('DEVICE_CLEANUP_DAYS', 0, 365),
	// Mặc định bật; chỉ đúng chuỗi 'false' là tắt (BOOLEAN_KEYS)
	fpSync: (await systemSettingService.getValue('DEVICE_FP_SYNC', 'true')) !== 'false',
});

module.exports = { getDeviceSettings };
