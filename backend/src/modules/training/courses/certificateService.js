const { broadcast } = require('../../events/eventService');
const { httpError } = require('../../../utils/httpError');
const logger = require('../../../config/logger');
// Gọi qua `repo.xxx` / `cme.xxx` (không destructure) để test thay được từng hàm.
const repo = require('./certificateRepository');
const cme = require('./courseCmeService');

// Khóa thực hành GPHN (và khóa rolling) không có bảng điểm LT/TH — hoàn thành theo tiến
// độ luân khoa — nên không áp điều kiện "đã khóa điểm + Đạt" cho loại khóa này.
const GPHN_TYPE = 'TRNTP-GPHN';

// CME đi kèm giấy chứng nhận (courseCmeService). Lỗi ghi CME không làm hỏng việc
// cấp / thu hồi giấy — vẫn ghi log, đồng thời trả chuỗi lỗi ngắn (null nếu ổn) để giao
// diện báo cán bộ bấm "Ghi lại CME" ở tab Kết quả chạy lại.
const syncCme = (label, fn) =>
	fn().then(
		() => null,
		(err) => {
			logger.error(`[course-cme] ${label}: ${err.message}`);
			return String(err.message || 'Lỗi không xác định').slice(0, 200);
		},
	);

// ─── Chứng chỉ ────────────────────────────────────────────────────────────
// Quy tắc nghiệp vụ ở đây; SQL ở certificateRepository.js.

const listCertificates = (courseId) => repo.listByCourse(courseId);

// Thông tư 32/2023/TT-BYT Điều 4.1.i: chỉ cấp giấy sau khi HOÀN THÀNH khóa. Khóa có bảng
// điểm (không phải GPHN / rolling) phải khóa điểm và kết quả tính là Đạt — dùng đúng cách
// tính của gradebookService (gradeRules.evaluate), không viết lại quy tắc chấm.
const assertCompleted = async (enrollmentId) => {
	const info = await repo.findEnrollmentCourse(enrollmentId);
	if (!info) throw httpError(404, 'Không tìm thấy đăng ký.');
	if (info.training_type_id === GPHN_TYPE || info.is_rolling) return;
	// require muộn — gradebookService require certificateService (tránh vòng require)
	const outcome = await require('./gradebookService').enrollmentOutcome(
		info.course_id,
		enrollmentId,
	);
	if (!outcome?.locked) {
		throw httpError(
			409,
			'Chưa thể cấp giấy chứng nhận: điểm của học viên chưa được khóa. Cần khóa điểm khóa học trước.',
		);
	}
	if (outcome.result !== 'pass') {
		const why = outcome.reasons?.length ? ` (${outcome.reasons.join('; ')})` : '';
		throw httpError(
			409,
			outcome.result === 'fail'
				? `Chưa thể cấp giấy chứng nhận: học viên chưa đạt kết quả khóa học${why}.`
				: 'Chưa thể cấp giấy chứng nhận: học viên chưa có đủ điểm để xác định kết quả đạt.',
		);
	}
};

// Chỉ cấp chứng chỉ cho đăng ký đã duyệt ('approved') và đã hoàn thành khóa (assertCompleted),
// mỗi đăng ký 1 chứng chỉ. `verified`: nơi gọi vừa kiểm đúng điều kiện hoàn thành (cấp hàng
// loạt từ bảng điểm đã khóa) thì bỏ qua kiểm lại từng người.
// Số chứng chỉ dạng CC<năm><số thứ tự 4 chữ số>, sinh tuần tự theo năm hiện tại.
// Trả cert kèm cme_error (null nếu ghi CME ổn).
const issueCertificate = async (enrollmentId, actorId, expiryDate, { verified = false } = {}) => {
	const status = await repo.findEnrollmentStatus(enrollmentId);
	if (!status) throw httpError(404, 'Không tìm thấy đăng ký.');
	if (status !== 'approved') {
		throw httpError(409, 'Chỉ có thể cấp chứng chỉ cho học viên đã được duyệt tham gia khóa học.');
	}
	if (!verified) await assertCompleted(enrollmentId);
	const cert = await repo.insert({
		enrollmentId,
		actorId,
		year: new Date().getFullYear(),
		expiryDate,
	});
	if (!cert) throw httpError(409, 'Học viên này đã được cấp chứng chỉ cho khóa học này rồi.');
	broadcast('update', { entity: 'certificate' });
	const cme_error = cert.course_id
		? await syncCme('cấp giấy', () => cme.syncTrainees(cert.course_id, actorId, { enrollmentId }))
		: null;
	return { ...cert, cme_error };
};

// Xóa cứng — chỉ dùng khi cấp nhầm VÀ giấy đã thu hồi (không giữ lịch sử). Giấy còn hiệu
// lực phải thu hồi trước (revokeCertificate) để còn dấu vết quản lý hồ sơ (TT 32 Điều 9.4).
const removeCertificate = async (certId, actorId) => {
	const status = await repo.findStatusById(certId);
	if (!status) throw httpError(404, 'Không tìm thấy chứng chỉ.');
	if (status !== 'revoked') {
		throw httpError(409, 'Chứng chỉ còn hiệu lực, cần thu hồi trước khi xóa hẳn.');
	}
	const cme_error = await syncCme('xóa giấy', () =>
		cme.withdrawForCertificate(certId, actorId, { remove: true }),
	);
	await repo.deleteById(certId);
	broadcast('update', { entity: 'certificate' });
	return { cme_error };
};

// Thu hồi mềm — giữ lại dòng dữ liệu (khác removeCertificate xóa cứng).
const revokeCertificate = async (certId, reason, actorId) => {
	const affected = await repo.revoke({ certId, reason, actorId });
	if (!affected) {
		throw httpError(404, 'Không tìm thấy chứng chỉ hoặc chứng chỉ đã bị thu hồi trước đó.');
	}
	broadcast('update', { entity: 'certificate' });
	const cme_error = await syncCme('thu hồi giấy', () =>
		cme.withdrawForCertificate(certId, actorId, { reason }),
	);
	return { cme_error };
};

module.exports = {
	listCertificates,
	issueCertificate,
	removeCertificate,
	revokeCertificate,
};
