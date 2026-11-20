// Kiểm tra query GET /seminars/cme-cycle-compliance (zod, xem middlewares/validateRequest.js).
const { z } = require('zod');
const { STATUSES } = require('./cmeCycle');

// "?search=" / "?page=" để trống (bộ lọc giao diện chưa chọn) = không gửi
const blank = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema);

const cycleComplianceQuery = z.object({
	page: blank(
		z.coerce
			.number('Trang không hợp lệ')
			.int('Trang không hợp lệ')
			.min(1, 'Trang phải ≥ 1')
			.optional(),
	),
	// limit=0 → lấy tất cả (như các danh sách khác)
	limit: blank(
		z.coerce
			.number('Số dòng mỗi trang không hợp lệ')
			.int('Số dòng mỗi trang không hợp lệ')
			.min(0, 'Số dòng mỗi trang phải ≥ 0')
			.max(1000, 'Số dòng mỗi trang tối đa 1000')
			.optional(),
	),
	scope: blank(
		z.enum(['licensed', 'all'], { error: 'scope phải là licensed hoặc all' }).default('licensed'),
	),
	department_id: blank(z.string().max(20, 'Mã khoa/phòng không hợp lệ').optional()),
	search: blank(z.string().trim().max(100, 'Từ khóa tối đa 100 ký tự').optional()),
	// 1 hoặc nhiều trạng thái, cách nhau bằng dấu phẩy: status=at_risk,overdue_window
	status: blank(
		z
			.string('status không hợp lệ')
			.transform((s) =>
				s
					.split(',')
					.map((x) => x.trim())
					.filter(Boolean),
			)
			.pipe(
				z
					.array(z.enum(STATUSES, { error: `status phải thuộc: ${STATUSES.join(', ')}` }))
					.min(1, 'status không hợp lệ'),
			)
			.optional(),
	),
	sort: blank(
		z.enum(['urgency', 'name'], { error: 'sort phải là urgency hoặc name' }).default('urgency'),
	),
});

module.exports = { cycleComplianceQuery };
