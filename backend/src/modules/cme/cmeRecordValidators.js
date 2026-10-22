// Kiểm tra body ghi nhận CME — dùng khi SỬA (PUT) cho admin (/cme-records) và người
// dùng tự khai (/me/cme-records), và khi THÊM (POST, kèm các rule bắt buộc riêng). Mọi trường đều tuỳ chọn (cập nhật
// từng phần), nhưng đã gửi thì phải hợp lệ — trước đây không kiểm tra nên
// tín chỉ/ngày sai làm SQL báo lỗi 500.
const { body } = require('express-validator');

const isEmpty = (v) => v === undefined || v === null || v === '';

const updateRules = [
	body('title')
		.optional()
		.custom((v) => String(v ?? '').trim() !== '')
		.withMessage('Vui lòng nhập nội dung hoạt động')
		.bail()
		.custom((v) => String(v).trim().length <= 255)
		.withMessage('Nội dung hoạt động tối đa 255 ký tự'),
	body('role')
		.optional({ values: 'null' })
		.custom((v) => String(v).length <= 100)
		.withMessage('Vai trò tối đa 100 ký tự'),
	body('note')
		.optional({ values: 'null' })
		.custom((v) => String(v).length <= 500)
		.withMessage('Ghi chú tối đa 500 ký tự'),
	body('credits')
		.optional()
		.custom((v) => !isEmpty(v) && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 10000)
		.withMessage('Số tín chỉ không hợp lệ'),
	body('quantity')
		.optional()
		.custom(
			(v) => isEmpty(v) || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 1000000),
		)
		.withMessage('Số lượng không hợp lệ'),
	body('year')
		.optional()
		.custom(
			(v) => isEmpty(v) || (Number.isInteger(Number(v)) && Number(v) >= 1900 && Number(v) <= 2100),
		)
		.withMessage('Năm không hợp lệ'),
	body(['activity_date', 'end_date'])
		.optional()
		.custom((v) => isEmpty(v) || !Number.isNaN(new Date(v).getTime()))
		.withMessage('Ngày không hợp lệ'),
	body('end_date')
		.optional()
		.custom((v, { req }) => {
			const from = req.body.activity_date;
			return isEmpty(v) || isEmpty(from) || String(v).slice(0, 10) >= String(from).slice(0, 10);
		})
		.withMessage('"Đến ngày" phải sau hoặc bằng "Từ ngày"'),
];

module.exports = { updateRules };
