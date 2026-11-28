const { asyncHandler } = require('../../../utils/asyncHandler');
const { success, created, error } = require('../../../utils/response');
const { paging } = require('../../../utils/paging');
const service = require('./signRequestService');
const v = require('./signRequestValidators');

const idOf = (req) => Number(req.valid?.params?.id ?? req.params.id);

const create = asyncHandler(async (req, res) => {
	let raw;
	try {
		raw = JSON.parse(req.body.data);
	} catch {
		return error(res, 'Thông tin hồ sơ không hợp lệ', 400);
	}
	const parsed = v.createData.safeParse(raw);
	if (!parsed.success) {
		const errors = parsed.error.issues.map((i) => ({
			type: 'field',
			location: 'body',
			path: i.path.join('.'),
			msg: i.message,
		}));
		return error(res, errors[0]?.msg || 'Dữ liệu đầu vào không hợp lệ', 400, errors);
	}
	const files = /** @type {any[]} */ (req.files || []);
	return created(res, await service.create(req.user, files, parsed.data), 'Đã gửi hồ sơ trình ký');
});

const list = asyncHandler(async (req, res) => {
	const q = req.valid?.query ?? {};
	return success(res, await service.list(req.user, q, paging(q.page, q.limit ?? 30)));
});

const todoCount = asyncHandler(async (req, res) =>
	success(res, { count: await service.todoCount(req.user) }),
);

const detail = asyncHandler(async (req, res) =>
	success(res, await service.getDetail(idOf(req), req.user)),
);

const file = asyncHandler(async (req, res) => {
	const { id, docId } = req.valid.params;
	const out = await service.getDocumentFile(id, docId, req.user, req.valid.query?.version ?? null);
	res.setHeader('Content-Type', 'application/pdf');
	res.setHeader(
		'Content-Disposition',
		`inline; filename*=UTF-8''${encodeURIComponent(out.fileName)}`,
	);
	res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
	res.setHeader('Cache-Control', 'private, no-store');
	return res.end(out.buffer);
});

const sign = asyncHandler(async (req, res) => {
	const o = await service.sign(idOf(req), req.user, req.body);
	return success(
		res,
		await service.getDetail(idOf(req), req.user),
		o.status === 'completed' ? 'Đã ký — hồ sơ đã hoàn tất' : 'Đã ký số các văn bản',
	);
});

const batchSign = asyncHandler(async (req, res) => {
	const r = await service.batchSign(req.body.ids, req.user);
	return success(
		res,
		r,
		r.failed ? `Đã ký ${r.signed} hồ sơ, ${r.failed} hồ sơ lỗi` : `Đã ký ${r.signed} hồ sơ`,
	);
});

const reject = asyncHandler(async (req, res) =>
	success(res, await service.reject(idOf(req), req.user, req.body.reason), 'Đã từ chối ký'),
);

const cancel = asyncHandler(async (req, res) =>
	success(res, await service.cancel(idOf(req), req.user, req.body.reason ?? null), 'Đã hủy hồ sơ'),
);

module.exports = { create, list, todoCount, detail, file, sign, batchSign, reject, cancel };
