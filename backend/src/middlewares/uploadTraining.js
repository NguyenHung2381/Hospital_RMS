const { createDiskUpload } = require('./upload');

// 1 middleware upload riêng cho mỗi loại thực thể (trainee/course...) — lưu vào
// uploads/training/<entityType>/<id>/, tách hẳn khỏi file NCKH (uploads/topics/).
//
// options.maxSizeMB: ghi đè dung lượng của Cấu hình hệ thống (UPLOAD_MAX_MB).
// course_document/lesson_document dùng giới hạn lớn hơn để nhận video bài giảng
// — xem modules/training/courses/courses.routes.js, modules/training/programs/trainingPrograms.routes.js (TRAINING_MEDIA_MAX_MB).
// options.allowMedia: cho phép thêm đuôi video/audio (chỉ bật ở 2 route trên).
const createTrainingUpload = (entityType, options = {}) =>
	createDiskUpload({
		idParam: 'id',
		dirParts: (id) => ['training', entityType, id],
		maxSizeMB: options.maxSizeMB,
		allowMedia: options.allowMedia ?? false,
	});

module.exports = { createTrainingUpload };
