const { getPool, sql, jsonValues, nowSql, upsert } = require('../../config/db');

// Giá trị trường tùy chỉnh (form_custom_values) — 1 dòng JSON / bản ghi.
// save() GỘP vào dữ liệu cũ: trường admin đã xóa khỏi cấu hình vẫn giữ giá trị
// (bật lại là thấy), chỉ ghi đè các key vừa gửi.

const parse = (json) => {
	try {
		const v = JSON.parse(json);
		return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
	} catch {
		return {};
	}
};

const get = async (formKey, recordId, runner) => {
	const req = (runner ?? (await getPool())).request();
	const r = await req
		.input('form_key', sql.VarChar(60), formKey)
		.input('record_id', sql.VarChar(50), String(recordId))
		.query(
			'SELECT data FROM form_custom_values WHERE form_key = @form_key AND record_id = @record_id',
		);
	return r.recordset[0] ? parse(r.recordset[0].data) : {};
};

// Nhiều bản ghi 1 lần (danh sách, xuất Excel) → Map(recordId → data)
const getMany = async (formKey, recordIds) => {
	const ids = [...new Set(recordIds.map(String))];
	const out = new Map();
	if (!ids.length) return out;
	const pool = await getPool();
	for (let i = 0; i < ids.length; i += 500) {
		const chunk = ids.slice(i, i + 500);
		const req = pool.request().input('form_key', sql.VarChar(60), formKey);
		chunk.forEach((id, j) => req.input(`r${j}`, sql.VarChar(50), id));
		const r = await req.query(
			`SELECT record_id, data FROM form_custom_values
       WHERE form_key = @form_key AND record_id IN (${chunk.map((_, j) => `@r${j}`).join(', ')})`,
		);
		for (const row of r.recordset) out.set(row.record_id, parse(row.data));
	}
	return out;
};

// values = req.formCustom (đã kiểm + chuẩn hóa ở formConfigGuard). null/undefined
// = request không gửi trường tùy chỉnh ⇒ không đụng tới.
const save = async (formKey, recordId, values, actorId = null, runner) => {
	if (!values || !Object.keys(values).length) return null;
	const db = runner ?? (await getPool());
	const merged = { ...(await get(formKey, recordId, db)), ...values };
	await db
		.request()
		.input('form_key', sql.VarChar(60), formKey)
		.input('record_id', sql.VarChar(50), String(recordId))
		.input('data', sql.NVarChar(sql.MAX), JSON.stringify(merged))
		.input('actor_id', sql.VarChar(20), actorId)
		.query(
			upsert({
				table: 'form_custom_values',
				key: ['form_key', 'record_id'],
				values: {
					form_key: '@form_key',
					record_id: '@record_id',
					data: '@data',
					created_by: '@actor_id',
				},
				update: { data: '@data', updated_at: nowSql, updated_by: '@actor_id' },
			}),
		);
	return merged;
};

const remove = async (formKey, recordId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('form_key', sql.VarChar(60), formKey)
		.input('record_id', sql.VarChar(50), String(recordId))
		.query('DELETE FROM form_custom_values WHERE form_key = @form_key AND record_id = @record_id');
};

// Xóa hàng loạt (xóa nhiều bản ghi nghiệp vụ 1 lần)
const removeMany = async (formKey, recordIds) => {
	const ids = [...new Set((recordIds || []).map(String))];
	if (!ids.length) return;
	const pool = await getPool();
	await pool
		.request()
		.input('form_key', sql.VarChar(60), formKey)
		.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
		.query(
			`DELETE FROM form_custom_values WHERE form_key = @form_key AND record_id IN ${jsonValues('@ids')}`,
		);
};

// Gắn `custom` vào từng dòng (danh sách / chi tiết) — idKey = cột id bản ghi
const attach = async (formKey, rows, idKey = 'id') => {
	const custom = await getMany(
		formKey,
		rows.map((r) => r[idKey]),
	);
	return rows.map((r) => ({ ...r, custom: custom.get(String(r[idKey])) || {} }));
};

// Như attach nhưng nhận thẳng kết quả list của service: mảng hoặc { data: [...], ... }
const attachResult = async (formKey, result, idKey = 'id') => {
	const rows = Array.isArray(result) ? result : result?.data;
	if (!Array.isArray(rows) || !rows.length) return result;
	const out = await attach(formKey, rows, idKey);
	return Array.isArray(result) ? out : { ...result, data: out };
};

module.exports = { get, getMany, save, remove, removeMany, attach, attachResult };
