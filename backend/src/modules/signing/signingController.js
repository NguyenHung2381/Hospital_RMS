const { asyncHandler } = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/response');
const { paging } = require('../../utils/paging');
const accountService = require('./signingAccountService');
const signingService = require('./signingService');
const signingConfig = require('./signingConfig');

const sendPdf = (res, pdf, fileName) => {
	res.setHeader('Content-Type', 'application/pdf');
	res.setHeader(
		'Content-Disposition',
		`attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
	);
	res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
	return res.end(pdf);
};

const idOf = (req) => Number(req.valid?.params?.id ?? req.params.id);

// ─── Quản trị (signing:manage) ─────────────────────────────────────────────
const listAccounts = asyncHandler(async (_req, res) =>
	success(res, await accountService.listAccounts()),
);

const getAccount = asyncHandler(async (req, res) =>
	success(res, await accountService.getAccount(idOf(req))),
);

const createAccount = asyncHandler(async (req, res) =>
	created(
		res,
		await accountService.createAccount(req.body, req.user.id),
		'Đã thêm tài khoản ký số',
	),
);

const updateAccount = asyncHandler(async (req, res) =>
	success(
		res,
		await accountService.updateAccount(idOf(req), req.body, req.user.id),
		'Đã lưu tài khoản ký số',
	),
);

const removeAccount = asyncHandler(async (req, res) => {
	await accountService.removeAccount(idOf(req));
	return success(res, null, 'Đã xóa tài khoản ký số');
});

const checkAccount = asyncHandler(async (req, res) => {
	const acc = await accountService.checkAccount(idOf(req));
	return success(
		res,
		acc,
		acc.last_error ? `Kiểm tra lỗi: ${acc.last_error}` : 'Kết nối VIN-HSM thành công',
	);
});

const testSignAccount = asyncHandler(async (req, res) =>
	sendPdf(res, await signingService.testSign(idOf(req), req.user), 'ky-thu-chu-ky-so.pdf'),
);

const listLogs = asyncHandler(async (req, res) => {
	const q = req.valid?.query ?? {};
	return success(res, await signingService.listLogs(q, paging(q.page, q.limit ?? 50)));
});

// ─── Của tôi (chỉ cần đăng nhập) ──────────────────────────────────────────
const getMine = asyncHandler(async (req, res) =>
	success(res, {
		account: await accountService.getMine(req.user.id),
		status: await signingService.myStatus(req.user.id),
	}),
);

const saveMine = asyncHandler(async (req, res) =>
	success(
		res,
		await accountService.saveMine(req.user.id, req.body, req.user.full_name),
		'Đã lưu tài khoản ký số của bạn',
	),
);

const checkMine = asyncHandler(async (req, res) => {
	const acc = await accountService.checkMine(req.user.id);
	return success(
		res,
		acc,
		acc.last_error ? `Kiểm tra lỗi: ${acc.last_error}` : 'Kết nối VIN-HSM thành công',
	);
});

const removeMine = asyncHandler(async (req, res) => {
	await accountService.removeMine(req.user.id);
	return success(res, null, 'Đã xóa tài khoản ký số của bạn');
});

const testSignMine = asyncHandler(async (req, res) => {
	const acc = await accountService.getMine(req.user.id);
	if (!acc) {
		return res
			.status(404)
			.json({ success: false, message: 'Bạn chưa khai báo tài khoản ký số cá nhân.' });
	}
	return sendPdf(res, await signingService.testSign(acc.id, req.user), 'ky-thu-chu-ky-so.pdf');
});

const getMySignatureImage = asyncHandler(async (req, res) =>
	success(res, { image: await accountService.getMySignatureImage(req.user.id) }),
);

const saveMySignatureImage = asyncHandler(async (req, res) =>
	success(
		res,
		await accountService.saveMySignatureImage(req.user.id, req.body),
		req.body.image === null
			? 'Đã xóa ảnh chữ ký'
			: req.body.image
				? 'Đã lưu ảnh chữ ký'
				: 'Đã lưu cách hiển thị chữ ký',
	),
);

// Ký 1 PDF tự tải lên tại vị trí đã chọn — trả file đã ký
const signMyPdf = asyncHandler(async (req, res) => {
	if (!req.file) {
		return res.status(400).json({ success: false, message: 'Chưa chọn file PDF.' });
	}
	const name = req.file.originalname || 'tai-lieu.pdf';
	const signed = await signingService.signUserPdf(req.user, req.file.buffer, {
		fileName: name,
		...req.valid.body,
	});
	return sendPdf(res, signed, name.replace(/\.pdf$/i, '') + ' (ky so).pdf');
});

// Danh mục nhà cung cấp, `enabled` đã tính cả công tắc ở Cấu hình ký số
const listProviders = asyncHandler(async (_req, res) => {
	const cfg = await signingConfig.getConfig();
	return success(
		res,
		require('./providers')
			.listProviders()
			.map((p) => ({ ...p, enabled: p.enabled && cfg.providers[p.key] !== false })),
	);
});

const getConfig = asyncHandler(async (_req, res) => success(res, await signingConfig.describe()));

const saveConfig = asyncHandler(async (req, res) =>
	success(
		res,
		await signingConfig.saveConfig(req.valid.body, req.user.id),
		'Đã lưu cấu hình ký số',
	),
);

const myStatus = asyncHandler(async (req, res) =>
	success(res, await signingService.myStatus(req.user.id)),
);

module.exports = {
	listAccounts,
	getAccount,
	createAccount,
	updateAccount,
	removeAccount,
	checkAccount,
	testSignAccount,
	listLogs,
	getMine,
	saveMine,
	checkMine,
	removeMine,
	testSignMine,
	getMySignatureImage,
	saveMySignatureImage,
	signMyPdf,
	listProviders,
	myStatus,
	getConfig,
	saveConfig,
};
