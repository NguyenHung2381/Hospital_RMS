const { createDiskUpload } = require('./upload');

// 1 middleware upload riêng cho mỗi loại thực thể (trainee/course...) — lưu vào
// uploads/training/<entityType>/<id>/, tách hẳn khỏi file NCKH (uploads/topics/).
//
// options.maxSizeMB: ghi đè giới hạn mặc định (20MB, TRAINING_UPLOAD_MAX_MB).
// course_document/lesson_document dùng giới hạn lớn hơn để nhận video bài giảng
// — xem routes/courses.js, routes/trainingPrograms.js (TRAINING_MEDIA_MAX_MB).
// options.allowMedia: cho phép thêm đuôi video/audio (chỉ bật ở 2 route trên).
const createTrainingUpload = (entityType, options = {}) =>
	createDiskUpload({
		idParam: 'id',
		dirParts: (id) => ['training', entityType, id],
		maxSizeMB: options.maxSizeMB ?? Number(process.env.TRAINING_UPLOAD_MAX_MB || 20),
		allowMedia: options.allowMedia ?? false,
	});

module.exports = { createTrainingUpload };
