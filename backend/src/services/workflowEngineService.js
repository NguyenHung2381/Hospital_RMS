/**
 * workflowEngineService.js — engine chạy SONG SONG với đường duyệt 1 bước cũ
 * (sp_approve_topic). Mặc định KHÔNG có workflow_definitions nào active nên
 * KHÔNG ảnh hưởng gì tới hành vi hiện tại — chỉ kích hoạt khi admin chủ động
 * tạo + bật 1 định nghĩa cho đúng resource (xem 2026-10-06_workflow_engine.sql).
 *
 * v1 chỉ hỗ trợ resource 'topics' ở bước cuối (gọi topicService.update để đổi
 * status thật) — muốn dùng cho resource khác cần thêm nhánh tương tự, KHÔNG
 * tự suy diễn generic vì mỗi resource có luật đổi trạng thái riêng.
 */
const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');

// GỌI Ở ĐẦU MỌI LUỒNG DUYỆT (topicController.approve) — phải fail-safe tuyệt
// đối về "không có workflow" nếu bảng chưa tồn tại (migration
// 2026-10-06_workflow_engine.sql chưa chạy), nếu không toàn bộ tính năng
// duyệt đề tài hiện có (không liên quan gì tới workflow) sẽ bị lỗi 500 lây —
// đã xác nhận bằng test sống, đây KHÔNG phải giả định lý thuyết.
const hasActiveDefinition = async (resource) => {
	const pool = await getPool();
	try {
		const r = await pool
			.request()
			.input('resource', sql.VarChar(50), resource)
			.query('SELECT TOP 1 id FROM workflow_definitions WHERE resource = @resource AND is_active = 1');
		return !!r.recordset[0];
	} catch (err) {
		if (err.number === 208) return false; // Invalid object name — bảng chưa migrate
		throw err;
	}
};

const getActiveDefinition = async (resource) => {
	const pool = await getPool();
	const defRes = await pool
		.request()
		.input('resource', sql.VarChar(50), resource)
		.query('SELECT TOP 1 * FROM workflow_definitions WHERE resource = @resource AND is_active = 1');
	const def = defRes.recordset[0];
	if (!def) return null;
	const stepsRes = await pool
		.request()
		.input('definition_id', sql.VarChar(20), def.id)
		.query('SELECT * FROM workflow_steps WHERE definition_id = @definition_id ORDER BY step_order ASC');
	def.steps = stepsRes.recordset;
	return def;
};

// ─── Quản lý định nghĩa (admin) ──────────────────────────────────────────────
const listDefinitions = async (resource) => {
	const pool = await getPool();
	const req = pool.request();
	const where = resource ? 'WHERE resource = @resource' : '';
	if (resource) req.input('resource', sql.VarChar(50), resource);
	const r = await req.query(`
    SELECT d.*, (SELECT COUNT(*) FROM workflow_steps s WHERE s.definition_id = d.id) AS step_count
    FROM workflow_definitions d ${where}
    ORDER BY d.created_at DESC
  `);
	return r.recordset;
};

const getDefinition = async (id) => {
	const pool = await getPool();
	const r = await pool.request().input('id', sql.VarChar(20), id).query('SELECT * FROM workflow_definitions WHERE id = @id');
	const def = r.recordset[0];
	if (!def) return null;
	const stepsRes = await pool
		.request()
		.input('definition_id', sql.VarChar(20), id)
		.query('SELECT * FROM workflow_steps WHERE definition_id = @definition_id ORDER BY step_order ASC');
	def.steps = stepsRes.recordset;
	return def;
};

const setSteps = async (definitionId, steps) => {
	const pool = await getPool();
	await pool.request().input('definition_id', sql.VarChar(20), definitionId).query('DELETE FROM workflow_steps WHERE definition_id = @definition_id');
	let order = 0;
	for (const s of steps || []) {
		if (!s || !s.name) continue;
		order += 1;
		await pool
			.request()
			.input('definition_id', sql.VarChar(20), definitionId)
			.input('step_order', sql.Int, order)
			.input('name', sql.NVarChar(255), s.name)
			.input('approver_role_id', sql.VarChar(20), s.approver_role_id || null)
			.input('sla_days', sql.Int, s.sla_days || null).query(`
        DECLARE @new_id VARCHAR(20) = 'WFS' + LEFT(REPLACE(NEWID(),'-',''), 17);
        INSERT INTO workflow_steps (id, definition_id, step_order, name, approver_role_id, sla_days)
        VALUES (@new_id, @definition_id, @step_order, @name, @approver_role_id, @sla_days);
      `);
	}
	broadcast('update', { entity: 'workflow_definition' });
};

// CHỈ CHO PHÉP 1 định nghĩa active / resource tại 1 thời điểm — bật cái này
// tự tắt các cái khác cùng resource, tránh xung đột 2 workflow chạy song song
// trên cùng loại đối tượng.
const createDefinition = async (data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('resource', sql.VarChar(50), data.resource)
		.input('name', sql.NVarChar(255), data.name)
		.input('is_active', sql.Bit, data.is_active ? 1 : 0)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      DECLARE @new_id VARCHAR(20) = 'WFD' + LEFT(REPLACE(NEWID(),'-',''), 17);
      INSERT INTO workflow_definitions (id, resource, name, is_active, created_by)
      VALUES (@new_id, @resource, @name, @is_active, @actor_id);
      SELECT @new_id AS id;
    `);
	const id = result.recordset[0].id;
	if (data.is_active) await deactivateOthers(id, data.resource);
	if (Array.isArray(data.steps)) await setSteps(id, data.steps);
	broadcast('update', { entity: 'workflow_definition' });
	return getDefinition(id);
};

const deactivateOthers = async (keepId, resource) => {
	const pool = await getPool();
	await pool
		.request()
		.input('keep_id', sql.VarChar(20), keepId)
		.input('resource', sql.VarChar(50), resource)
		.query('UPDATE workflow_definitions SET is_active = 0 WHERE id <> @keep_id AND resource = @resource');
};

const updateDefinition = async (id, data, actorId) => {
	const pool = await getPool();
	const current = await getDefinition(id);
	if (!current) return null;
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool.request().input('id', sql.VarChar(20), id).input('actor_id', sql.VarChar(20), actorId);
	if (data.name !== undefined) {
		sets.push('name = @name');
		req.input('name', sql.NVarChar(255), data.name);
	}
	if (data.is_active !== undefined) {
		sets.push('is_active = @is_active');
		req.input('is_active', sql.Bit, data.is_active ? 1 : 0);
	}
	await req.query(`UPDATE workflow_definitions SET ${sets.join(', ')} WHERE id = @id`);
	if (data.is_active) await deactivateOthers(id, current.resource);
	if (Array.isArray(data.steps)) await setSteps(id, data.steps);
	broadcast('update', { entity: 'workflow_definition' });
	return getDefinition(id);
};

const removeDefinition = async (id) => {
	const pool = await getPool();
	await pool.request().input('id', sql.VarChar(20), id).query('DELETE FROM workflow_definitions WHERE id = @id');
	broadcast('update', { entity: 'workflow_definition' });
};

// ─── Vận hành (dùng khi có ai đó thao tác "phê duyệt") ──────────────────────
const getOrCreateInstance = async (definition, entityId, actorId) => {
	const pool = await getPool();
	const existing = await pool
		.request()
		.input('definition_id', sql.VarChar(20), definition.id)
		.input('entity_id', sql.VarChar(20), entityId)
		.query('SELECT TOP 1 * FROM workflow_instances WHERE definition_id = @definition_id AND entity_id = @entity_id ORDER BY created_at DESC');
	if (existing.recordset[0]) return existing.recordset[0];

	const firstStep = definition.steps[0];
	const created = await pool
		.request()
		.input('definition_id', sql.VarChar(20), definition.id)
		.input('entity_id', sql.VarChar(20), entityId).query(`
      DECLARE @new_id VARCHAR(20) = 'WFI' + LEFT(REPLACE(NEWID(),'-',''), 17);
      INSERT INTO workflow_instances (id, definition_id, entity_id) VALUES (@new_id, @definition_id, @entity_id);
      SELECT @new_id AS id;
    `);
	const instanceId = created.recordset[0].id;

	if (firstStep) {
		await pool
			.request()
			.input('instance_id', sql.VarChar(20), instanceId)
			.input('step_id', sql.VarChar(20), firstStep.id)
			.input('assignee_role_id', sql.VarChar(20), firstStep.approver_role_id || null).query(`
        DECLARE @new_id VARCHAR(20) = 'WFT' + LEFT(REPLACE(NEWID(),'-',''), 17);
        INSERT INTO workflow_tasks (id, instance_id, step_id, assignee_role_id)
        VALUES (@new_id, @instance_id, @step_id, @assignee_role_id);
      `);
	}

	const instRes = await pool.request().input('id', sql.VarChar(20), instanceId).query('SELECT * FROM workflow_instances WHERE id = @id');
	void actorId;
	return instRes.recordset[0];
};

const getCurrentTask = async (instanceId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('instance_id', sql.VarChar(20), instanceId)
		.query("SELECT * FROM workflow_tasks WHERE instance_id = @instance_id AND status = 'pending' ORDER BY id DESC");
	return r.recordset[0] || null;
};

// Chỉ resource 'topics' được nối vào topicService ở v1 — resource khác nếu
// dùng workflow sẽ dừng lại ở trạng thái instance (approved/rejected) mà
// KHÔNG tự đổi status của đối tượng gốc (chưa có nhánh xử lý).
const applyOutcomeToEntity = async (resource, entityId, outcome, actorId) => {
	if (resource !== 'topics') return;
	// eslint-disable-next-line global-require -- tránh vòng lặp require ở đầu file (topicService không cần biết workflow engine)
	const topicService = require('./topicService');
	await topicService.update(entityId, { status: outcome }, actorId, true);
};

// decision: 'approved' | 'rejected'. Trả về trạng thái mới nhất của instance.
const advance = async (resource, entityId, decision, actor, comment) => {
	if (!['approved', 'rejected'].includes(decision)) {
		const err = new Error('Quyết định không hợp lệ cho workflow (chỉ approved/rejected).');
		err.statusCode = 400;
		throw err;
	}
	const definition = await getActiveDefinition(resource);
	if (!definition || !definition.steps.length) {
		const err = new Error('Chưa cấu hình workflow hợp lệ cho loại đối tượng này.');
		err.statusCode = 400;
		throw err;
	}

	const pool = await getPool();
	const instance = await getOrCreateInstance(definition, entityId, actor.id);
	if (instance.status !== 'in_progress') {
		return { instance_id: instance.id, status: instance.status, current_step: instance.current_step, total_steps: definition.steps.length };
	}

	const task = await getCurrentTask(instance.id);
	if (!task) {
		const err = new Error('Không tìm thấy nhiệm vụ duyệt đang chờ.');
		err.statusCode = 409;
		throw err;
	}

	const { hasPermission } = require('../middlewares/auth');
	const authorized =
		hasPermission(actor, 'workflows', 'manage') ||
		!task.assignee_role_id ||
		task.assignee_role_id === actor.role_id;
	if (!authorized) {
		const err = new Error('Bạn không thuộc vai trò được phân công duyệt bước này.');
		err.statusCode = 403;
		throw err;
	}

	// Chỉ ghi quyết định khi bước vẫn đang chờ — 2 người bấm duyệt cùng lúc thì
	// người sau nhận 409, không đẩy quy trình đi thêm 1 bước ngoài ý muốn.
	// OUTPUT ... INTO: an toàn cả khi bảng có trigger.
	const decided = await pool
		.request()
		.input('id', sql.VarChar(20), task.id)
		.input('status', sql.VarChar(20), decision)
		.input('decided_by', sql.VarChar(20), actor.id)
		.input('comment', sql.NVarChar(sql.MAX), comment || null).query(`
			DECLARE @r TABLE (id VARCHAR(20));
			UPDATE workflow_tasks SET status = @status, decided_by = @decided_by, decided_at = GETDATE(), comment = @comment
			OUTPUT INSERTED.id INTO @r
			WHERE id = @id AND status = 'pending';
			SELECT COUNT(*) AS n FROM @r;
		`);
	if (decided.recordset[0].n !== 1) {
		const err = new Error('Bước duyệt này vừa được người khác xử lý, vui lòng tải lại.');
		err.statusCode = 409;
		throw err;
	}

	if (decision === 'rejected') {
		await pool
			.request()
			.input('id', sql.VarChar(20), instance.id)
			.query("UPDATE workflow_instances SET status = 'rejected', updated_at = GETDATE() WHERE id = @id");
		await applyOutcomeToEntity(resource, entityId, 'rejected', actor.id);
		broadcast('update', { entity: 'workflow_instance' });
		return { instance_id: instance.id, status: 'rejected', current_step: instance.current_step, total_steps: definition.steps.length };
	}

	const nextStep = definition.steps.find((s) => s.step_order === instance.current_step + 1);
	if (!nextStep) {
		await pool
			.request()
			.input('id', sql.VarChar(20), instance.id)
			.query("UPDATE workflow_instances SET status = 'approved', updated_at = GETDATE() WHERE id = @id");
		await applyOutcomeToEntity(resource, entityId, 'approved', actor.id);
		broadcast('update', { entity: 'workflow_instance' });
		return { instance_id: instance.id, status: 'approved', current_step: instance.current_step, total_steps: definition.steps.length };
	}

	await pool
		.request()
		.input('id', sql.VarChar(20), instance.id)
		.input('step', sql.Int, nextStep.step_order)
		.query('UPDATE workflow_instances SET current_step = @step, updated_at = GETDATE() WHERE id = @id');
	await pool
		.request()
		.input('instance_id', sql.VarChar(20), instance.id)
		.input('step_id', sql.VarChar(20), nextStep.id)
		.input('assignee_role_id', sql.VarChar(20), nextStep.approver_role_id || null).query(`
      DECLARE @new_id VARCHAR(20) = 'WFT' + LEFT(REPLACE(NEWID(),'-',''), 17);
      INSERT INTO workflow_tasks (id, instance_id, step_id, assignee_role_id)
      VALUES (@new_id, @instance_id, @step_id, @assignee_role_id);
    `);
	broadcast('update', { entity: 'workflow_instance' });
	return { instance_id: instance.id, status: 'in_progress', current_step: nextStep.step_order, total_steps: definition.steps.length };
};

const getStatusForEntity = async (resource, entityId) => {
	const pool = await getPool();
	const definition = await getActiveDefinition(resource);
	if (!definition) return null;
	const instRes = await pool
		.request()
		.input('definition_id', sql.VarChar(20), definition.id)
		.input('entity_id', sql.VarChar(20), entityId)
		.query('SELECT TOP 1 * FROM workflow_instances WHERE definition_id = @definition_id AND entity_id = @entity_id ORDER BY created_at DESC');
	const instance = instRes.recordset[0];
	if (!instance) return { definition_name: definition.name, total_steps: definition.steps.length, status: null, current_step: null };
	const tasksRes = await pool
		.request()
		.input('instance_id', sql.VarChar(20), instance.id)
		.query('SELECT * FROM workflow_tasks WHERE instance_id = @instance_id ORDER BY id ASC');
	return {
		definition_name: definition.name,
		total_steps: definition.steps.length,
		status: instance.status,
		current_step: instance.current_step,
		tasks: tasksRes.recordset,
	};
};

module.exports = {
	hasActiveDefinition,
	listDefinitions,
	getDefinition,
	createDefinition,
	updateDefinition,
	removeDefinition,
	advance,
	getStatusForEntity,
};
