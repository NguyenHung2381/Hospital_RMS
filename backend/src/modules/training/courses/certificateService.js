const { broadcast } = require('../../events/eventService');
const { httpError } = require('../../../utils/httpError');
// Gọi qua `repo.xxx` (không destructure) để test thay được từng hàm.
const repo = require('./certificateRepository');

// ─── Chứng chỉ ────────────────────────────────────────────────────────────
// Quy tắc nghiệp vụ ở đây; SQL ở certificateRepository.js.

const listCertificates = (courseId) => repo.listByCourse(courseId);

// Chỉ cấp chứng chỉ cho đăng ký đã duyệt ('approved'), mỗi đăng ký 1 chứng chỉ.
// Số chứng chỉ dạng CC<năm><số thứ tự 4 chữ số>, sinh tuần tự theo năm hiện tại.
const issueCertificate = async (enrollmentId, actorId, expiryDate) => {
	const status = await repo.findEnrollmentStatus(enrollmentId);
	if (!status) throw httpError(404, 'Không tìm thấy đăng ký.');
	if (status !== 'approved') {
		throw httpError(409, 'Chỉ có thể cấp chứng chỉ cho học viên đã được duyệt tham gia khóa học.');
	}
	const cert = await repo.insert({
		enrollmentId,
		actorId,
		year: new Date().getFullYear(),
		expiryDate,
	});
	if (!cert) throw httpError(409, 'Học viên này đã được cấp chứng chỉ cho khóa học này rồi.');
	broadcast('update', { entity: 'certificate' });
	return cert;
};

// Xoá cứng — chỉ dùng khi cấp nhầm (không giữ lịch sử). Muốn hủy giá trị
// pháp lý của chứng chỉ đã cấp đúng, dùng revokeCertificate (thu hồi mềm).
const removeCertificate = async (certId) => {
	await repo.deleteById(certId);
	broadcast('update', { entity: 'certificate' });
};

// Thu hồi mềm — giữ lại dòng dữ liệu (khác removeCertificate xoá cứng).
const revokeCertificate = async (certId, reason, actorId) => {
	const affected = await repo.revoke({ certId, reason, actorId });
	if (!affected) {
		throw httpError(404, 'Không tìm thấy chứng chỉ hoặc chứng chỉ đã bị thu hồi trước đó.');
	}
	broadcast('update', { entity: 'certificate' });
};

module.exports = {
	listCertificates,
	issueCertificate,
	removeCertificate,
	revokeCertificate,
};
