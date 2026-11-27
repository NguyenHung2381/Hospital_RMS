// Nội viện ở form đăng ký công khai: ô người đăng ký để trống mà hồ sơ nhân viên trong CSDL đã
// có thì máy chủ tự điền vào body TRƯỚC khi kiểm (validator + Cấu hình form). Form chỉ hỏi phần
// còn thiếu (staff-check trả known_fields — tên trường, không có giá trị).
const emailOtp = require('../training/registration/registrationEmailOtpService');
const registrationProfileService = require('./registrationProfileService');
const { findStaff, realEmail } = require('./publicCourseRegistrationService');
const { clean } = require('./publicRegistrationSnapshot');

/**
 * Middleware cho đăng ký / đơn nháp nội viện: trường người đăng ký để trống mà hồ sơ trong CSDL
 * đã có thì điền vào body TRƯỚC khi kiểm (validator + Cấu hình form), để ô bắt buộc đã có trong
 * hồ sơ không bị báo thiếu. Không khớp nhân viên ⇒ để nguyên (service báo 404 như cũ).
 * @param {{ draft?: 'application' | 'proposal' | null }} [opts] giấy tờ nháp tải ngay (chưa xác minh
 *   email): đơn nháp không in dữ liệu nhạy cảm từ CSDL; tờ trình nháp chỉ cần năm sinh
 */
const fillFromStaffProfile =
	({ draft = null } = {}) =>
	async (req, _res, next) => {
		try {
			const b = req.body;
			if (!b || (!draft && b.source !== 'internal')) return next();
			const u = await findStaff(b.full_name, b.staff_number).catch((err) => {
				if (err?.statusCode === 404) return null;
				throw err;
			});
			if (!u) return next();
			const { profile } = await registrationProfileService.storedProfileOf(u);
			if (draft === 'proposal') {
				if (!clean(b.dob) && profile.dob) b.dob = profile.dob;
				return next();
			}
			// Đã xác minh mã gửi tới email thật trong hồ sơ nhân sự ⇒ đúng chủ hồ sơ, được dùng cả
			// dữ liệu nhạy cảm (cùng điều kiện registerInternal kiểm lại khi ghi)
			const staffEmail = realEmail(u.email);
			let proven = false;
			if (!draft && staffEmail && (await emailOtp.isRequired())) {
				const proof = emailOtp.readToken(b.email_token);
				proven = proof?.sid === u.id && emailOtp.tokenMatchesEmail(proof, staffEmail);
			}
			registrationProfileService.fillMissing(b, profile, { sensitive: proven });
			return next();
		} catch (err) {
			return next(err);
		}
	};

module.exports = { fillFromStaffProfile };
