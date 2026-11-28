// Kiểu chấm công của khóa học (2027-01-22_kieu_cham_cong_theo_loai_hinh.sql):
//   session  theo buổi học — QR / vân tay ghép vào buổi; không có ca
//   shift    theo ca — giờ vào / ra theo mẫu ca tuần; buổi học không nhận QR / vân tay
//            (giảng viên vẫn điểm danh tay)
//   both     cả hai (mặc định — như trước khi có cấu hình)
//   none     không chấm công
// Kiểu của 1 khóa = courses.attendance_mode ⇒ training_types.attendance_mode ⇒ 'both'.
// Mẫu ca của 1 khóa = courses.shift_pattern_id ⇒ training_types.shift_pattern_id ⇒ mẫu mặc định.
const MODES = ['session', 'shift', 'both', 'none'];
const DEFAULT_MODE = 'both';
const SESSION_MODES = ['session', 'both'];
const SHIFT_MODES = ['shift', 'both'];
// Có lịch học cần xin phép (đơn nghỉ / đi muộn tính cả cho buổi học lẫn ca)
const ATTENDING_MODES = ['session', 'shift', 'both'];

const usesSessions = (mode) => SESSION_MODES.includes(mode ?? DEFAULT_MODE);
const usesShifts = (mode) => SHIFT_MODES.includes(mode ?? DEFAULT_MODE);

const typeCol = (c, col) =>
	`(SELECT tt.${col} FROM training_types tt WHERE tt.id = ${c}.training_type_id)`;

// Biểu thức SQL trên bí danh bảng courses
const courseModeSql = (c = 'c') =>
	`COALESCE(${c}.attendance_mode, ${typeCol(c, 'attendance_mode')}, '${DEFAULT_MODE}')`;
const coursePatternSql = (c = 'c') =>
	`COALESCE(${c}.shift_pattern_id, ${typeCol(c, 'shift_pattern_id')})`;
const modeInSql = (c, modes) => `${courseModeSql(c)} IN (${modes.map((m) => `'${m}'`).join(', ')})`;

module.exports = {
	MODES,
	DEFAULT_MODE,
	SESSION_MODES,
	SHIFT_MODES,
	ATTENDING_MODES,
	usesSessions,
	usesShifts,
	courseModeSql,
	coursePatternSql,
	modeInSql,
};
