const { getPool, sql } = require('../config/db');
const { createCrudService } = require('./crudService');
const { broadcast } = require('./eventService');

const base = createCrudService('roles', 4);

const create = async (data, actorId) => {
  const pool = await getPool();
  const result = await pool.request()
    .input('actor_id',    sql.VarChar(20),       actorId)
    .input('name',        sql.NVarChar(500),      data.name)
    .input('description', sql.NVarChar(sql.MAX),  data.description || null)
    .query(`
      DECLARE @count INT, @new_id VARCHAR(4);
      SELECT @count = COUNT(*) + 1 FROM roles;
      SET @new_id = 'VT' + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
      WHILE EXISTS (SELECT 1 FROM roles WHERE id = @new_id)
      BEGIN
        SET @count = @count + 1;
        SET @new_id = 'VT' + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
      END
      EXEC sp_set_actor @actor_id;
      INSERT INTO roles (id, name, description, created_by)
      VALUES (@new_id, @name, @description, @actor_id);
      SELECT * FROM roles WHERE id = @new_id;
    `);
  broadcast('update', { entity: 'role' });
  return result.recordset[0];
};

module.exports = { ...base, create };
