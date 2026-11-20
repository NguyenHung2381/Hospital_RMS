const fs = require('fs');
const path = require('path');
const { badRequest } = require('../../../utils/httpError');
const { decodeOriginalName } = require('../trainingFileService');
const { REGISTRATION_FILE_EXTENSIONS } = require('../registration/registrationFileKinds');

// Hồ sơ học viên = 1 file PDF đầy đủ thông tin. Mọi file mới lưu với loại này
// (trainee_documents.doc_type vẫn NOT NULL + FK sang trainee_document_types —
// migration 2026-12-22_ho_so_hoc_vien_1_file_pdf tạo sẵn dòng 'profile').
const PROFILE_DOC_TYPE = 'profile';

const isPdf = (file) => {
	const name = decodeOriginalName(file.originalname || '');
	return path.extname(name).toLowerCase() === '.pdf';
};

// multer đã ghi file xuống đĩa trước khi tới service ⇒ không phải PDF thì xóa rồi báo lỗi.
const assertPdf = async (file) => {
	if (isPdf(file)) return;
	if (file.path) await fs.promises.unlink(file.path).catch(() => {});
	throw badRequest('Hồ sơ học viên chỉ nhận 1 file PDF (gộp đủ thông tin vào một file).');
};

// Giấy tờ đính kèm khi đăng ký khóa đào tạo liên tục của ngoại viện (cùng khóa với
// registrationFileKinds.js doc_type) — nhận PDF / JPG / PNG, khác với hồ sơ 'profile' chỉ nhận PDF.
const REGISTRATION_DOC_TYPES = ['national_id', 'degree', 'license', 'decision'];

const isPdfOrImage = (file) => {
	const name = decodeOriginalName(file.originalname || '');
	return REGISTRATION_FILE_EXTENSIONS.includes(path.extname(name).toLowerCase());
};

const assertPdfOrImage = async (file) => {
	if (isPdfOrImage(file)) return;
	if (file.path) await fs.promises.unlink(file.path).catch(() => {});
	throw badRequest('Giấy tờ chỉ nhận file PDF, JPG hoặc PNG.');
};

module.exports = {
	PROFILE_DOC_TYPE,
	REGISTRATION_DOC_TYPES,
	isPdf,
	assertPdf,
	isPdfOrImage,
	assertPdfOrImage,
};
