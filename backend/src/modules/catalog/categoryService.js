const { getPool, sql } = require('../../config/db');
const { createCrudService } = require('../../shared/crudService');
const { broadcast } = require('../events/eventService');

// Constraint CHK_cat_id yêu cầu id LIKE 'LDT[0-9][0-9]' → LDT01, LDT02, ...
// crudService dùng NEWID() (hex) nên phải override hàm create riêng.
const _catBase = createCrudService('categories', 5, 'LDT', [
	{ table: 'topics', column: 'category_id', label: 'đề tài' },
]);
const catService = {
	..._catBase,
	create: async (data, actorId) => {
		const pool = await getPool();
		const result = await pool
			.request()
			.input('actor_id', sql.VarChar(20), actorId)
			.input('name', sql.NVarChar(500), data.name)
			.input('description', sql.NVarChar(sql.MAX), data.description || null)
			.input('abbr', sql.VarChar(10), data.abbr || null).query(`
				DECLARE @seq INT;
				SELECT @seq = ISNULL(MAX(CAST(RIGHT(id, 2) AS INT)), 0) + 1
				FROM categories
				WHERE id LIKE 'LDT[0-9][0-9]';
				IF @seq > 99 THROW 50001, N'Đã đạt giới hạn 99 danh mục', 1;
				DECLARE @new_id VARCHAR(5) = 'LDT' + RIGHT('0' + CAST(@seq AS VARCHAR(2)), 2);
				EXEC sp_set_actor @actor_id;
				INSERT INTO categories (id, name, description, abbr, created_by)
				VALUES (@new_id, @name, @description, @abbr, @actor_id);
				SELECT * FROM categories WHERE id = @new_id;
			`);
		broadcast('update', { entity: 'category' });
		return result.recordset[0];
	},
};

module.exports = catService;
