/**
 * customFormCrud.js — 5 handler CRUD cho thực thể đào tạo có trường tùy chỉnh (Cấu hình
 * form, formCustomValueService): đọc thì gắn `custom`, ghi thì lưu req.formCustom (đã qua
 * formConfigGuard ở route). Giống shared/crudController nhưng thêm bước trường tùy chỉnh.
 * Kiểm tra quyền / validate vẫn nằm ở route và service như trước.
 *
 * opts.scoped: truyền req.user cho service.getAll / getById (lọc theo phạm vi, che trường
 *   nhạy cảm), và `{ actor: req.user }` làm tham số cuối cho service.create / update để bản
 *   ghi trả về che / hiện trường nhạy cảm giống getById (service không dùng thì bỏ qua).
 *   opts.removeCustom: xóa giá trị trường tùy chỉnh khi xóa bản ghi.
 */
const { success, created, notFound } = require('../../utils/response');
const formCustomValueService = require('../forms/formCustomValueService');
const { asyncHandler } = require('../../utils/asyncHandler');

const createCustomFormCrud = (entity, service, { scoped = false, removeCustom = false } = {}) => {
	const getAll = asyncHandler(async (req, res) => {
		const result = scoped
			? await service.getAll(req.query, req.user)
			: await service.getAll(req.query);
		return success(res, await formCustomValueService.attachResult(entity, result));
	});

	const getById = asyncHandler(async (req, res) => {
		const item = scoped
			? await service.getById(req.params.id, req.user)
			: await service.getById(req.params.id);
		if (!item) return notFound(res);
		item.custom = await formCustomValueService.get(entity, item.id);
		return success(res, item);
	});

	const writeOpts = (req) => (scoped ? [{ actor: req.user }] : []);

	const createOne = asyncHandler(async (req, res) => {
		const item = await service.create(req.body, req.user.id, ...writeOpts(req));
		const custom = await formCustomValueService.save(entity, item.id, req.formCustom, req.user.id);
		return created(res, custom ? { ...item, custom } : item);
	});

	const updateOne = asyncHandler(async (req, res) => {
		const item = await service.update(req.params.id, req.body, req.user.id, ...writeOpts(req));
		if (!item) return notFound(res);
		const custom = await formCustomValueService.save(
			entity,
			req.params.id,
			req.formCustom,
			req.user.id,
		);
		return success(res, custom ? { ...item, custom } : item, 'Cập nhật thành công');
	});

	const removeOne = asyncHandler(async (req, res) => {
		await service.remove(req.params.id, req.user.id);
		if (removeCustom) await formCustomValueService.remove(entity, req.params.id);
		return success(res, null, 'Xóa thành công');
	});

	return { getAll, getById, createOne, updateOne, removeOne };
};

module.exports = { createCustomFormCrud };
