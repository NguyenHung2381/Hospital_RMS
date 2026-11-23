// Nhập giảng viên giảng dạy theo buổi học từ Excel — tách khỏi courses.routes.js cho gọn.
// Đăng ký THẲNG vào router của khóa học để router.param kiểm phạm vi khóa cho :id.
// File mẫu điền sẵn các buổi (POST như các route xuất file khác); nhập = thêm / sửa
// buổi, không xóa buổi nào.
const ctrl = require('./sessionImportController');
const uploadExcel = require('../../../middlewares/uploadExcel');
const { authorizePermission } = require('../../../middlewares/auth');

/** @param {import('express').Router} router */
module.exports = (router) => {
	router.post(
		'/:id/sessions/lecturers/template',
		authorizePermission(['courses', 'read']),
		ctrl.sessionLecturerTemplate,
	);
	router.post(
		'/:id/sessions/lecturers/import',
		authorizePermission(['courses', 'update']),
		uploadExcel.single('file'),
		ctrl.importSessionLecturers,
	);
};
