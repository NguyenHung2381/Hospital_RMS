// Hàm dùng chung cho chương trình đào tạo và bài học (trainingProgramService / programLessonService).
const { httpError } = require('../../../utils/httpError');
const { formatDuration, UNITS } = require('../../../utils/trainingDuration');

const emptyToNull = (v) => (v === '' || v === undefined ? null : v);

const withDurationText = (data) => {
	if (data.duration_unit !== undefined && data.duration_unit && !UNITS.includes(data.duration_unit))
		throw httpError(400, 'Đơn vị thời lượng không hợp lệ');
	if (data.duration_value === undefined) return data;
	const text = formatDuration(data.duration_value || null, data.duration_unit);
	return { ...data, duration: text ?? data.duration ?? null };
};

module.exports = {
	emptyToNull,
	withDurationText,
};
