const { sql, withActorTransaction } = require('../../config/db');
const { createCrudService } = require('../../shared/crudService');
const { broadcast } = require('../events/eventService');
const { genSeq2Id } = require('../../utils/idGenerator');

// Constraint CHK_cat_id: id = LDT + 2 chữ số → LDT01, LDT02, ...
// crudService sinh mã hex ngẫu nhiên (randomId) nên phải override hàm create riêng.
const _catBase = createCrudService('categories', 5, 'LDT', [
	{ table: 'topics', column: 'category_id', label: 'đề tài' },
]);
const catService = {
	..._catBase,
	create: async (data, actorId) => {
		const PREFIX = 'LDT';
		const FULL = 'Đã đạt giới hạn 99 danh mục';
		const row = await withActorTransaction(actorId, async (tx) => {
			const newId = await genSeq2Id(tx, 'categories', PREFIX, FULL);
			await tx
				.request()
				.input('id', sql.VarChar(20), newId)
				.input('actor_id', sql.VarChar(20), actorId)
				.input('name', sql.NVarChar(500), data.name)
				.input('description', sql.NVarChar(sql.MAX), data.description || null)
				.input('abbr', sql.VarChar(10), data.abbr || null)
				.query(
					`INSERT INTO categories (id, name, description, abbr, created_by) VALUES (@id, @name, @description, @abbr, @actor_id)`,
				);
			return (
				await tx
					.request()
					.input('id', sql.VarChar(20), newId)
					.query('SELECT * FROM categories WHERE id = @id')
			).recordset[0];
		});
		broadcast('update', { entity: 'category' });
		return row;
	},
};

module.exports = catService;
