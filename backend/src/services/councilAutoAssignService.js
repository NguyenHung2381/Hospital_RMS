const { getPool, sql } = require('../config/db');
const councilService = require('./councilService');
const councilAssignmentService = require('./councilAssignmentService');
const { ROLE, inputRoleId } = require('../modules/access/roleCodes');

const SEAT_ORDER = ['chairman', 'secretary', 'reviewer1', 'reviewer2', 'member'];
const SEAT_LABELS = {
	chairman: 'Chủ tịch',
	secretary: 'Thư ký',
	reviewer1: 'Phản biện 1',
	reviewer2: 'Phản biện 2',
	member: 'Thành viên',
};

// Chia đều n đề tài (đã sort theo khoa) thành clusterCount cụm liên tiếp —
// giữ đề tài cùng khoa cạnh nhau, không xáo trộn như round-robin.
const splitEven = (items, clusterCount) => {
	const base = Math.floor(items.length / clusterCount);
	const remainder = items.length % clusterCount;
	const clusters = [];
	let idx = 0;
	for (let c = 0; c < clusterCount; c++) {
		const size = base + (c < remainder ? 1 : 0);
		clusters.push(items.slice(idx, idx + size));
		idx += size;
	}
	return clusters;
};

// Chọn 1 ứng viên TRONG VIỆN cho 1 ghế: ưu tiên đủ cờ (can_chair_council/
// can_sit_council) rồi ưu tiên đúng hệ chuyên môn rồi ưu tiên người đang ngồi
// ít ghế nhất trong đợt (cân tải). Loại cứng người cùng khoa với bất kỳ đề tài
// nào trong cụm và người đã ngồi ghế khác của chính hội đồng này. Trả về ứng
// viên tốt nhất tìm được kèm has_flag — người gọi tự quyết có dùng hay không
// (không đủ cờ thì autoAssignOne chuyển sang tìm người ngoài viện thay vì nới
// lỏng nhét người trong viện không đủ điều kiện).
const pickInternal = async (pool, { roundId, specialtyGroup, deptIds, usedUserIds, requireChair }) => {
	const flagCol = requireChair ? 'can_chair_council' : 'can_sit_council';
	const req = pool
		.request()
		.input('round_id', sql.VarChar(10), roundId)
		.input('sg', sql.NVarChar(100), specialtyGroup);
	await inputRoleId(req, 'dept_head_role', ROLE.DEPT_HEAD);
	const deptParams = deptIds.map((id, i) => {
		req.input(`d${i}`, sql.VarChar(20), id);
		return `@d${i}`;
	});
	const usedParams = usedUserIds.map((id, i) => {
		req.input(`u${i}`, sql.VarChar(20), id);
		return `@u${i}`;
	});
	const result = await req.query(`
    SELECT TOP 1 u.id, u.${flagCol} AS has_flag, d.specialty_group AS user_sg
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN (
      SELECT cm.user_id, COUNT(*) AS load_count
      FROM council_members cm
      INNER JOIN councils c ON c.id = cm.council_id
      WHERE c.round_id = @round_id
      GROUP BY cm.user_id
    ) lt ON lt.user_id = u.id
    WHERE u.is_active = 1 AND u.role_id <> @dept_head_role -- loại tài khoản khoa dùng chung (vai trò dept_head)
      ${deptParams.length ? `AND (u.department_id IS NULL OR u.department_id NOT IN (${deptParams.join(',')}))` : ''}
      ${usedParams.length ? `AND u.id NOT IN (${usedParams.join(',')})` : ''}
    ORDER BY
      CASE WHEN u.${flagCol} = 1 THEN 0 ELSE 1 END,
      CASE WHEN d.specialty_group = @sg THEN 0 ELSE 1 END,
      ISNULL(lt.load_count, 0) ASC,
      u.full_name ASC
  `);
	return result.recordset[0] || null;
};

// Chọn 1 người NGOÀI VIỆN cùng hệ chuyên môn cho 1 ghế — dùng khi hết người
// trong viện đủ cờ can_sit/can_chair_council. Không có khái niệm "cùng khoa"
// nên không cần loại xung đột khoa như pickInternal. allowedIds (nếu có, do
// admin chọn tay trong modal auto-assign) giới hạn pool xuống đúng những
// người đã xác nhận tham gia đợt này — không có thì dùng cả danh bạ.
const pickExternal = async (pool, { specialtyGroup, usedExternalReviewerIds, allowedIds }) => {
	const req = pool.request().input('sg', sql.NVarChar(100), specialtyGroup);
	const usedParams = usedExternalReviewerIds.map((id, i) => {
		req.input(`x${i}`, sql.VarChar(20), id);
		return `@x${i}`;
	});
	let allowedClause = '';
	if (Array.isArray(allowedIds) && allowedIds.length) {
		const allowedParams = allowedIds.map((id, i) => {
			req.input(`a${i}`, sql.VarChar(20), id);
			return `@a${i}`;
		});
		allowedClause = `AND id IN (${allowedParams.join(',')})`;
	}
	const result = await req.query(`
    SELECT TOP 1 id, full_name
    FROM external_reviewers
    WHERE is_active = 1 AND specialty_group = @sg
      ${allowedClause}
      ${usedParams.length ? `AND id NOT IN (${usedParams.join(',')})` : ''}
    ORDER BY full_name
  `);
	return result.recordset[0] || null;
};

// Tự động phân công hội đồng cho MỘT hệ chuyên môn của MỘT đợt: gom đề tài
// approved/chưa gán council thành các cụm [min_size, max_size] đề tài, tạo
// hội đồng draft cho mỗi cụm, gán 5 ghế theo pickInternal/pickExternal, gán đề tài + chia phiên
// sáng/chiều. Ghế thay thế theo từng đề tài KHÔNG tự động — để tay qua UI có sẵn.
const autoAssignOne = async (
	{ round_id, specialty_group, min_size, max_size, external_reviewer_ids },
	actorId,
) => {
	const minSize = Math.max(1, Number(min_size) || 6);
	const maxSize = Math.max(minSize, Number(max_size) || 10);
	const pool = await getPool();

	const topicsRes = await pool
		.request()
		.input('round_id', sql.VarChar(10), round_id)
		.input('sg', sql.NVarChar(100), specialty_group).query(`
      SELECT t.id, t.department_id, d.name AS department_name
      FROM topics t
      INNER JOIN departments d ON d.id = t.department_id
      WHERE t.round_id = @round_id AND t.status = 'approved' AND t.council_id IS NULL
        AND d.specialty_group = @sg
      ORDER BY d.name, t.created_at
    `);
	const topics = topicsRes.recordset;
	const warnings = [];
	if (!topics.length) {
		return {
			councils_created: 0,
			topics_assigned: 0,
			warnings: [`Không có đề tài nào (đã duyệt, chưa gán hội đồng) thuộc hệ "${specialty_group}" trong đợt này.`],
		};
	}

	// Ưu tiên tuyệt đối số hội đồng ít nhất: làm tròn thay vì luôn làm tròn lên,
	// nên sẵn sàng vượt cận trên (maxSize) khi điều đó gộp được về ít cụm hơn.
	// Sau đó vẫn gộp thêm nếu cụm nhỏ nhất còn dưới cận dưới (minSize).
	let clusterCount = Math.max(1, Math.round(topics.length / maxSize));
	while (clusterCount > 1 && Math.floor(topics.length / clusterCount) < minSize) {
		clusterCount--;
	}
	const clusters = splitEven(topics, clusterCount);
	if (topics.length < minSize) {
		warnings.push(
			`Hệ "${specialty_group}": chỉ có ${topics.length} đề tài (ít hơn cận dưới ${minSize}) — vẫn tạo 1 hội đồng ${topics.length} đề tài.`,
		);
	}

	let topicsAssigned = 0;
	for (let i = 0; i < clusters.length; i++) {
		const cluster = clusters[i];
		if (cluster.length > maxSize) {
			warnings.push(
				`Hội đồng "${specialty_group} #${i + 1}": có ${cluster.length} đề tài, vượt cận trên ${maxSize} để giữ số hội đồng ít nhất — cân nhắc tách tay nếu quá tải 1 buổi chấm.`,
			);
		}
		const deptIds = [...new Set(cluster.map((t) => t.department_id))];
		const usedUserIds = [];
		const usedExternalReviewerIds = [];
		const seats = {};

		for (const role of SEAT_ORDER) {
			const internal = await pickInternal(pool, {
				roundId: round_id,
				specialtyGroup: specialty_group,
				deptIds,
				usedUserIds,
				requireChair: role === 'chairman',
			});
			if (internal && internal.has_flag) {
				seats[role] = { type: 'user', id: internal.id };
				usedUserIds.push(internal.id);
				continue;
			}

			const external = await pickExternal(pool, {
				specialtyGroup: specialty_group,
				usedExternalReviewerIds,
				allowedIds: external_reviewer_ids,
			});
			if (external) {
				seats[role] = { type: 'external', id: external.id };
				usedExternalReviewerIds.push(external.id);
				warnings.push(
					`Hội đồng "${specialty_group} #${i + 1}": hết người trong viện đủ điều kiện cho ghế ${SEAT_LABELS[role]}, đã xếp người ngoài viện "${external.full_name}" — cần rà lại.`,
				);
				continue;
			}

			warnings.push(
				`Hội đồng "${specialty_group} #${i + 1}": không tìm được ai (trong lẫn ngoài viện) cho ghế ${SEAT_LABELS[role]}, để trống — cần bổ sung tay.`,
			);
		}

		// Gợi ý địa điểm mặc định = phòng khoa của Chủ tịch (mẫu thật từ lịch bảo vệ
		// đề cương 2026: phòng đi theo khoa chủ tịch, không theo hệ chuyên môn —
		// 1 hệ có thể sinh nhiều hội đồng song song ở nhiều phòng khác nhau). Chỉ là
		// gợi ý, admin sửa tay qua dropdown địa điểm nếu phòng đã có người dùng.
		let location = null;
		if (seats.chairman?.type === 'user') {
			const deptRes = await pool
				.request()
				.input('uid', sql.VarChar(20), seats.chairman.id)
				.query(`
          SELECT d.name AS dept_name
          FROM users u
          LEFT JOIN departments d ON d.id = u.department_id
          WHERE u.id = @uid
        `);
			const deptName = deptRes.recordset[0]?.dept_name;
			if (deptName) location = `VP khoa ${deptName}`;
		}

		const council = await councilService.create(
			{
				round_id,
				name: `Hội đồng ${specialty_group} #${i + 1}`,
				specialty_group,
				location,
			},
			actorId,
		);

		for (const role of SEAT_ORDER) {
			const seat = seats[role];
			if (!seat) continue;
			await councilService.addMember(
				council.id,
				{
					user_id: seat.type === 'user' ? seat.id : null,
					external_reviewer_id: seat.type === 'external' ? seat.id : null,
					role,
				},
				actorId,
			);
		}

		const topicIds = cluster.map((t) => t.id);
		await councilAssignmentService.assignTopics(council.id, topicIds, actorId);
		const half = Math.ceil(topicIds.length / 2);
		for (let j = 0; j < topicIds.length; j++) {
			await councilAssignmentService.setTopicSession(
				council.id,
				topicIds[j],
				j < half ? 'morning' : 'afternoon',
				actorId,
			);
		}
		topicsAssigned += topicIds.length;
	}

	return { councils_created: clusters.length, topics_assigned: topicsAssigned, warnings };
};

// Chạy autoAssignOne cho nhiều hệ chuyên môn cùng lúc (thay vì bấm modal lại
// từng hệ) — specialty_group có thể là 1 chuỗi hoặc mảng chuỗi.
const autoAssign = async (
	{ round_id, specialty_group, min_size, max_size, external_reviewer_ids },
	actorId,
) => {
	const groups = Array.isArray(specialty_group) ? specialty_group : [specialty_group];
	let councils_created = 0;
	let topics_assigned = 0;
	const warnings = [];
	for (const sg of groups) {
		const res = await autoAssignOne(
			{ round_id, specialty_group: sg, min_size, max_size, external_reviewer_ids },
			actorId,
		);
		councils_created += res.councils_created;
		topics_assigned += res.topics_assigned;
		warnings.push(...res.warnings);
	}
	return { councils_created, topics_assigned, warnings };
};

module.exports = { autoAssign };
