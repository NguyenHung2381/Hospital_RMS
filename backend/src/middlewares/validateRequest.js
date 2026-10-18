const { error } = require('../utils/response');

// Kiểm tra request bằng zod schema — thay dần cho mảng express-validator +
// validate. Lỗi trả đúng dạng cũ (400, errors[] có type/location/path/msg) nên
// frontend không phải đổi; KHÔNG trả lại `value` (tránh lặp lại mật khẩu...).
//
//   const { z } = require('zod');
//   router.post('/', validateRequest({ body: z.object({ name: z.string().min(1, 'Nhập tên') }) }), ctrl.create);
//
// Hợp lệ: req.valid.<body|query|params> = dữ liệu đã parse (đã ép kiểu, bỏ field
// thừa nếu schema không passthrough); req.body cũng được thay bằng dữ liệu đã parse.
const LOCATIONS = ['params', 'query', 'body'];

const validateRequest = (schemas) => (req, res, next) => {
	const errors = [];
	const valid = {};
	for (const location of LOCATIONS) {
		const schema = schemas[location];
		if (!schema) continue;
		const result = schema.safeParse(req[location] ?? {});
		if (result.success) {
			valid[location] = result.data;
			continue;
		}
		for (const issue of result.error.issues) {
			errors.push({ type: 'field', location, path: issue.path.join('.'), msg: issue.message });
		}
	}
	if (errors.length) return error(res, 'Dữ liệu đầu vào không hợp lệ', 400, errors);
	req.valid = { ...req.valid, ...valid };
	if (valid.body !== undefined) req.body = valid.body;
	next();
};

module.exports = { validateRequest };
