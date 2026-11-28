const { z } = require('zod');

const idParams = z.object({ id: z.coerce.number().int().positive('Mã hồ sơ không hợp lệ') });
const docParams = idParams.extend({
	docId: z.coerce.number().int().positive('Mã văn bản không hợp lệ'),
});

const coord = (min, max) => z.coerce.number().min(min).max(max);
const rect = {
	page: z.coerce.number().int().min(1).max(10000),
	x: coord(0, 20000),
	y: coord(0, 20000),
	width: coord(40, 1000),
	height: coord(20, 600),
};

// Dữ liệu hồ sơ gửi kèm file (multipart): 1 trường "data" chứa JSON
const createData = z.object({
	title: z.string().trim().min(1, 'Nhập tiêu đề hồ sơ').max(300, 'Tiêu đề tối đa 300 ký tự'),
	message: z.string().trim().max(2000, 'Lời nhắn tối đa 2000 ký tự').nullish(),
	due_date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Hạn ký không hợp lệ')
		.nullish(),
	steps: z
		.array(
			z.object({
				mode: z.enum(['all', 'any']).default('all'),
				signers: z
					.array(z.string().trim().min(1).max(20))
					.min(1, 'Mỗi bước cần ít nhất 1 người ký'),
			}),
		)
		.min(1, 'Hồ sơ cần ít nhất 1 người ký'),
	fields: z
		.array(
			z.object({
				doc: z.number().int().min(0),
				user_id: z.string().trim().min(1).max(20),
				...rect,
			}),
		)
		.max(400)
		.optional(),
});
const createBody = z.object({ data: z.string().min(2, 'Thiếu thông tin hồ sơ') });

const signBody = z.object({
	placements: z
		.array(z.object({ document_id: z.coerce.number().int().positive(), ...rect }))
		.max(20)
		.optional(),
	note: z.string().trim().max(1000).nullish(),
});

const rejectBody = z.object({
	reason: z.string().trim().min(1, 'Cần nêu lý do từ chối').max(1000, 'Lý do tối đa 1000 ký tự'),
});
const cancelBody = z.object({ reason: z.string().trim().max(1000).nullish() });
const batchBody = z.object({
	ids: z
		.array(z.coerce.number().int().positive())
		.min(1, 'Chưa chọn hồ sơ')
		.max(50, 'Tối đa 50 hồ sơ mỗi lần'),
});

const listQuery = z.object({
	box: z.enum(['todo', 'sent', 'involved', 'all']).optional(),
	status: z.enum(['in_progress', 'completed', 'rejected', 'cancelled']).optional(),
	search: z.string().trim().max(100).optional(),
	page: z.coerce.number().int().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).optional(),
});
const fileQuery = z.object({ version: z.coerce.number().int().min(1).optional() });

module.exports = {
	idParams,
	docParams,
	createData,
	createBody,
	signBody,
	rejectBody,
	cancelBody,
	batchBody,
	listQuery,
	fileQuery,
};
