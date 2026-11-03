const { getPool, sql, nowSql } = require('../../config/db');
const { broadcast } = require('../events/eventService');
const { httpError } = require('../../utils/httpError');
const registry = require('./formRegistry');
const rules = require('./fieldRules');

// Cấu hình form qua UI (2026-12-11_cau_hinh_form.sql). Cache 15s/worker như
// systemSettingService — guard đọc mỗi lần gửi form; update() xóa cache của
// worker xử lý, worker khác tự hết hạn sau TTL.
const TTL_MS = 15000;
let cache = null;

const parse = (json) => {
	if (!json) return null;
	try {
		return JSON.parse(json);
	} catch {
		return null;
	}
};

const loadRows = async () => {
	if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
	const pool = await getPool();
	const result = await pool
		.request()
		.query('SELECT form_key, config, updated_at, updated_by FROM form_configs');
	const rows = new Map(
		result.recordset.map((r) => [r.form_key, { ...r, config: parse(r.config) }]),
	);
	cache = { at: Date.now(), rows };
	return rows;
};

const requireForm = (formKey) => {
	const form = registry.getForm(formKey);
	if (!form) throw httpError(404, 'Không tìm thấy form');
	return form;
};

const getOverride = async (formKey) => (await loadRows()).get(formKey)?.config || null;

// Cấu hình đã ghép cho 1 form cụ thể — form chạy và guard dùng
const getResolved = async (formKey, variant) => {
	const form = requireForm(formKey);
	if (!form.variants.some((v) => v.key === variant)) throw httpError(404, 'Không tìm thấy form');
	return rules.resolve(form, await getOverride(formKey), variant);
};

// Danh sách cho trang quản trị: định nghĩa registry + phần ghi đè đang lưu
const listForAdmin = async () => {
	const rows = await loadRows();
	return registry.listForms().map((form) => {
		const row = rows.get(form.key);
		return {
			...form,
			override: row?.config || null,
			updated_at: row?.updated_at || null,
			updated_by: row?.updated_by || null,
		};
	});
};

const save = async (formKey, override, actorId) => {
	const form = requireForm(formKey);
	const invalid = rules.validateOverride(form, override);
	if (invalid) throw httpError(400, invalid);
	const pool = await getPool();
	await pool
		.request()
		.input('key', sql.VarChar(60), formKey)
		.input('config', sql.NVarChar(sql.MAX), JSON.stringify(override))
		.input('actor_id', sql.VarChar(20), actorId).query(`
      MERGE form_configs AS tgt
      USING (SELECT @key AS form_key) AS src ON tgt.form_key = src.form_key
      WHEN MATCHED THEN UPDATE SET config = @config, updated_at = ${nowSql}, updated_by = @actor_id
      WHEN NOT MATCHED THEN INSERT (form_key, config, created_by, updated_by) VALUES (@key, @config, @actor_id, @actor_id);
    `);
	cache = null;
	broadcast('update', { entity: 'form_config' });
	return (await listForAdmin()).find((f) => f.key === formKey);
};

// Khôi phục mặc định — giá trị tùy chỉnh đã nhập vẫn giữ trong form_custom_values
const reset = async (formKey) => {
	requireForm(formKey);
	const pool = await getPool();
	await pool
		.request()
		.input('key', sql.VarChar(60), formKey)
		.query('DELETE FROM form_configs WHERE form_key = @key');
	cache = null;
	broadcast('update', { entity: 'form_config' });
	return (await listForAdmin()).find((f) => f.key === formKey);
};

module.exports = { getResolved, getOverride, listForAdmin, save, reset };
