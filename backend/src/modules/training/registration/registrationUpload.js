// Middleware upload hồ sơ bắt buộc của đăng ký khóa ĐTLT, dùng ở route cổng công khai
// (public.routes.js) và cổng nhân viên (me.routes.js).
//
// Cơ chế (multer, secureUpload, file tạm) nằm ở middlewares/uploadRegistration.js; file này
// truyền vào phần nghiệp vụ lấy từ registrationFileKinds.js: đuôi file được nhận và mỗi loại
// hồ sơ 1 phần multipart files[<kind>]. Đặt trong module training vì hạ tầng không được
// require module nghiệp vụ (npm run check:deps).
const { createRegistrationUpload } = require('../../../middlewares/uploadRegistration');
const {
	REGISTRATION_FILE_EXTENSIONS,
	ACCEPT_MESSAGE,
	UPLOADABLE_KINDS,
	FORM_FIELD,
} = require('./registrationFileKinds');

// Tối đa 4 file / lần gửi đăng ký (ngoại viện: 4 loại; nội viện: 2)
const FORM_MAX_FILES = 4;

const { registrationFormUpload, registrationFileUpload } = createRegistrationUpload({
	extensions: REGISTRATION_FILE_EXTENSIONS,
	acceptMessage: ACCEPT_MESSAGE,
	formFields: UPLOADABLE_KINDS.map(FORM_FIELD),
	maxFiles: FORM_MAX_FILES,
});

module.exports = { registrationFormUpload, registrationFileUpload };
