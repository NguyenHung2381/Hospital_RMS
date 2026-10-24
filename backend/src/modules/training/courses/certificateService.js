const { broadcast } = require('../../events/eventService');
const { httpError } = require('../../../utils/httpError');
const logger = require('../../../config/logger');
// Gọi qua `repo.xxx` / `cme.xxx` (không destructure) để test thay được từng hàm.
const repo = require('./certificateRepository');
const cme = require('./courseCmeService');

// CME đi kèm giấy chứng nhận (courseCmeService). Lỗi ghi CME không làm hỏng việc
// cấp / thu hồi giấy — ghi log, cán bộ bấm "Ghi lại CME" ở tab Kết quả để chạy lại.
const syncCme = (label, fn) =>
	fn().catch((err) => logger.error(`[course-cme] ${label}: ${err.message}`));

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
	if (cert.course_id)
		await syncCme('cấp giấy', () => cme.syncTrainees(cert.course_id, actorId, { enrollmentId }));
	return cert;
};

// Xoá cứng — chỉ dùng khi cấp nhầm (không giữ lịch sử). Muốn hủy giá trị
// pháp lý của chứng chỉ đã cấp đúng, dùng revokeCertificate (thu hồi mềm).
const removeCertificate = async (certId, actorId) => {
	await syncCme('xoá giấy', () => cme.withdrawForCertificate(certId, actorId, { remove: true }));
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
	await syncCme('thu hồi giấy', () => cme.withdrawForCertificate(certId, actorId, { reason }));
};

module.exports = {
	listCertificates,
	issueCertificate,
	removeCertificate,
	revokeCertificate,
};
