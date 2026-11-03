const { getPool, sql, withActorTransaction } = require('../../config/db');
const { createCrudService } = require('../../shared/crudService');
const { broadcast } = require('../events/eventService');
const { genSeq2Id } = require('../../utils/idGenerator');
const roundService = require('../rounds/roundService');

// ─── Levels ───────────────────────────────────────────────────────────────────
// Constraint CHK_lv_id yêu cầu id LIKE 'CD[0-9][0-9]' → CD01, CD02, ...
// crudService sinh mã hex ngẫu nhiên (randomId) nên phải override hàm create riêng.

// ── round_type_levels: cấp độ được phép theo loại đợt ────────────────────────
const getLevelIdsForRoundType = async (roundTypeId) => {
	if (!roundTypeId) return [];
	try {
		const pool = await getPool();
		const r = await pool
			.request()
			.input('rt', sql.VarChar(6), roundTypeId)
			.query('SELECT level_id FROM round_type_levels WHERE round_type_id = @rt');
		return r.recordset.map((x) => x.level_id);
	} catch {
		// Bảng chưa tồn tại (migration chưa chạy) ⇒ coi như chưa cấu hình.
		return [];
	}
};

// create() cho bảng có CHECK id dạng <PREFIX>NN (CD01, RT02…) — crudService mặc
// định sinh id hex nên phải tự cấp số tiếp theo. table/prefix là hằng trong file.
const createWithSeqId = (table, prefix, limitMsg, entity) => async (data, actorId) => {
	const row = await withActorTransaction(actorId, async (tx) => {
		const newId = await genSeq2Id(tx, table, prefix, limitMsg);
		await tx
			.request()
			.input('id', sql.VarChar(20), newId)
			.input('actor_id', sql.VarChar(20), actorId)
			.input('name', sql.NVarChar(500), data.name)
			.input('description', sql.NVarChar(sql.MAX), data.description || null)
			.query(
				`INSERT INTO ${table} (id, name, description, created_by) VALUES (@id, @name, @description, @actor_id)`,
			);
		return (
			await tx
				.request()
				.input('id', sql.VarChar(20), newId)
				.query(`SELECT * FROM ${table} WHERE id = @id`)
		).recordset[0];
	});
	broadcast('update', { entity });
	return row;
};

const _lvlBase = createCrudService('levels', 4, 'CD', [
	{ table: 'topics', column: 'level_id', label: 'đề tài' },
]);
const lvlService = {
	..._lvlBase,
	create: createWithSeqId('levels', 'CD', 'Đã đạt giới hạn 99 cấp độ', 'level'),
};

// Cấp độ dùng ở form đăng ký đề tài, lọc theo đợt (cấu hình riêng của đợt,
// không có thì theo loại đợt) hoặc theo loại đợt. Chưa cấu hình cấp độ nào
// ⇒ trả tất cả (fallback). Cùng dạng { data, pagination } với getAll.
const getForRound = async ({ round_id, round_type_id }) => {
	const allowed = round_id
		? await roundService.getAllowedLevelIds(round_id)
		: await getLevelIdsForRoundType(round_type_id);
	const all = await lvlService.getAll({ limit: 0 });
	const data = allowed.length ? all.data.filter((lv) => allowed.includes(lv.id)) : all.data;
	return { data, pagination: { ...all.pagination, total: data.length } };
};

module.exports = { ...lvlService, getForRound, getLevelIdsForRoundType, createWithSeqId };
