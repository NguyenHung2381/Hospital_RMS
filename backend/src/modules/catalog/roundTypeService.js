const { sql, withTransaction } = require('../../config/db');
const { createCrudService } = require('../../shared/crudService');
const { broadcast } = require('../events/eventService');
const { createWithSeqId, getLevelIdsForRoundType } = require('./levelService');

// Constraint CHK_round_types_id yêu cầu id LIKE 'RT[0-9][0-9]' → RT01, RT02, ...
// crudService mặc định dùng NEWID() (hex) nên override hàm create riêng.
const _rtBase = createCrudService('round_types', 6, 'RT');
const rtService = {
	..._rtBase,
	create: createWithSeqId('round_types', 'RT', 50002, 'Đã đạt giới hạn 99 loại đợt', 'round_type'),
};

// Cấp độ được phép theo loại đợt (round_type_levels)
const getLevels = (roundTypeId) => getLevelIdsForRoundType(roundTypeId);

// Thay toàn bộ cấp độ của loại đợt; mã cấp độ không tồn tại thì bỏ qua.
// Trong 1 transaction: lỗi giữa chừng không để loại đợt mất hết cấp độ.
const setLevels = async (roundTypeId, levelIds) => {
	const ids = [...new Set((levelIds || []).filter(Boolean))];
	await withTransaction(async (tx) => {
		await tx
			.request()
			.input('rt', sql.VarChar(6), roundTypeId)
			.query('DELETE FROM round_type_levels WHERE round_type_id = @rt');
		for (const lid of ids) {
			await tx.request().input('rt', sql.VarChar(6), roundTypeId).input('lid', sql.VarChar(5), lid)
				.query(`
					IF EXISTS (SELECT 1 FROM levels WHERE id = @lid)
					INSERT INTO round_type_levels (round_type_id, level_id)
					VALUES (@rt, @lid)`);
		}
	});
	broadcast('update', { entity: 'round_type' });
	return getLevelIdsForRoundType(roundTypeId);
};

module.exports = { ...rtService, getLevels, setLevels };
