const formConfigService = require('./formConfigService');
const { validateValues } = require('./fieldRules');
const { error } = require('../../utils/response');
const logger = require('../../config/logger');

// Kiểm body theo cấu hình form (bắt buộc / ràng buộc / trường tùy chỉnh) — đặt
// SAU express-validator `validate` ở route tạo/sửa. express-validator giữ phần
// cứng (kiểu dữ liệu, khóa ngoại); bắt buộc của trường KHÔNG khóa chuyển sang
// đây để admin bật/tắt được.
//   formConfigGuard('topic', { variant: 'admin', mode: 'create' })
//   variant có thể là hàm (req) => 'admin' | 'portal' | ... | null (bỏ qua)
// Kết quả: req.formCustom = giá trị tùy chỉnh đã chuẩn hóa (null = không gửi,
// không ghi đè) — controller lưu bằng formCustomValueService.save().
const formConfigGuard =
	(formKey, { variant, mode = 'create', includeEditOnly = false }) =>
	async (req, res, next) => {
		try {
			const v = typeof variant === 'function' ? variant(req) : variant;
			// null = request không thuộc form nào đã nối cấu hình (vd cùng route nhưng gọi
			// từ màn hình khác) ⇒ bỏ qua, chỉ express-validator kiểm
			if (!v) {
				req.formCustom = null;
				if (req.body) delete req.body.custom;
				return next();
			}
			const resolved = await formConfigService.getResolved(formKey, v);
			let customValues = req.body?.custom;
			// Form công khai gửi multipart (kèm file) ⇒ custom là chuỗi JSON
			if (typeof customValues === 'string') {
				try {
					customValues = JSON.parse(customValues);
				} catch {
					return error(res, 'Dữ liệu trường bổ sung không hợp lệ', 400);
				}
			}
			const { errors, custom } = validateValues(resolved, req.body || {}, {
				mode,
				customValues,
				includeEditOnly,
			});
			const keys = Object.keys(errors);
			if (keys.length) {
				return error(
					res,
					errors[keys[0]],
					400,
					keys.map((path) => ({ path, msg: errors[path], location: 'body' })),
				);
			}
			req.formCustom = custom;
			if (req.body) delete req.body.custom;
			return next();
		} catch (err) {
			// Lỗi đọc cấu hình (DB chưa migrate...) không được chặn nghiệp vụ chính:
			// ghi log rồi cho qua — express-validator vẫn giữ phần kiểm cứng.
			logger.error(`formConfigGuard(${formKey}) lỗi đọc cấu hình: ${err.message}`);
			req.formCustom = null;
			return next();
		}
	};

// Route dùng chung cho nhiều màn hình: chỉ kiểm theo cấu hình khi body ghi rõ
// form_variant (form đã nối Cấu hình form gửi kèm) — màn hình khác (sửa nhanh,
// nhân bản...) bỏ qua, chỉ express-validator kiểm.
//   formConfigGuard('course', { variant: bodyVariant('admin'), mode: 'update' })
const bodyVariant =
	(...allowed) =>
	(req) => {
		const v = req.body?.form_variant;
		if (req.body) delete req.body.form_variant;
		return allowed.includes(v) ? v : null;
	};

module.exports = { formConfigGuard, bodyVariant };
