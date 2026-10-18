const { getPool, sql } = require('../../config/db');
const { createCrudService } = require('../../shared/crudService');
const { broadcast } = require('../events/eventService');
const roundService = require('../rounds/roundService');

// ─── Levels ───────────────────────────────────────────────────────────────────
// Constraint CHK_lv_id yêu cầu id LIKE 'CD[0-9][0-9]' → CD01, CD02, ...
// crudService dùng NEWID() (hex) nên phải override hàm create riêng.

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
const createWithSeqId = (table, prefix, errNo, limitMsg, entity) => async (data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('name', sql.NVarChar(500), data.name)
		.input('description', sql.NVarChar(sql.MAX), data.description || null).query(`
			DECLARE @seq INT;
			SELECT @seq = ISNULL(MAX(CAST(RIGHT(id, 2) AS INT)), 0) + 1
			FROM ${table}
			WHERE id LIKE '${prefix}[0-9][0-9]';
			IF @seq > 99 THROW ${errNo}, '${limitMsg}', 1;
			DECLARE @new_id VARCHAR(20) = '${prefix}' + RIGHT('0' + CAST(@seq AS VARCHAR(2)), 2);
			EXEC sp_set_actor @actor_id;
			INSERT INTO ${table} (id, name, description, created_by)
			VALUES (@new_id, @name, @description, @actor_id);
			SELECT * FROM ${table} WHERE id = @new_id;
		`);
	broadcast('update', { entity });
	return result.recordset[0];
};

const _lvlBase = createCrudService('levels', 4, 'CD', [
	{ table: 'topics', column: 'level_id', label: 'đề tài' },
]);
const lvlService = {
	..._lvlBase,
	create: createWithSeqId('levels', 'CD', 50001, 'Đã đạt giới hạn 99 cấp độ', 'level'),
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
