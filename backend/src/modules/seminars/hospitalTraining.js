/**
 * hospitalTraining.js — phần riêng của Tập huấn bệnh viện trong module Hội thảo.
 * Buổi tập huấn = seminars có event_type 'training' + scope 'hosted' (menu
 * /admin/hospital-trainings). Xem migration 2026-11-21_hospital_trainings.sql.
 */
const { sql } = require('../../config/db');

// Tập huấn bệnh viện = loại 'training' do BV tổ chức — có menu riêng; trang
// Hội thảo gửi hospital_training=0 để không hiện các buổi này.
const HOSPITAL_TRAINING_SQL = "(s.event_type = 'training' AND s.scope = 'hosted')";
// Bộ lọc danh sách: '1' = chỉ tập huấn bệnh viện, '0' = loại trừ, khác = không lọc
const trainingFilter = (v) =>
	v === '1' || v === true
		? HOSPITAL_TRAINING_SQL
		: v === '0' || v === false
			? `NOT ${HOSPITAL_TRAINING_SQL}`
			: '';

// Tên khoa tổ chức + chủ đề + khoa bắt buộc (JSON) — trường riêng của tập huấn bệnh viện
const trainingSelect = `od.name AS organizer_department_name, ht.name AS topic_name,
  (SELECT d.id, d.name FROM seminar_required_departments r JOIN departments d ON d.id = r.department_id
   WHERE r.seminar_id = s.id ORDER BY d.name FOR JSON PATH) AS required_departments`;
const parseTraining = (row) => ({
	...row,
	required_departments: JSON.parse(row.required_departments || '[]'),
});
const trainingJoin = `
  LEFT JOIN departments od ON od.id = s.organizer_department_id
  LEFT JOIN hospital_training_topics ht ON ht.id = s.topic_id`;

// Cột riêng sửa được qua PUT /seminars/:id (gộp vào FIELD_TYPES của seminarService)
const TRAINING_FIELD_TYPES = {
	organizer_department_id: sql.VarChar(20),
	topic_id: sql.VarChar(20),
	lesson_hours: sql.Decimal(4, 1),
};

// Tập huấn: 1 tiết = 1 giờ tín chỉ CME (Phụ lục I TT 32/2023/TT-BYT) — số tiết
// ghi đè tín chỉ mặc định để issueCme cấp đúng số giờ.
const applyLessonCredits = (data) =>
	data.event_type === 'training' && data.lesson_hours != null && data.lesson_hours !== ''
		? { ...data, cme_default_credits: data.lesson_hours }
		: data;

// Ghi đè danh sách khoa bắt buộc tham dự (undefined = không đổi)
const setRequiredDepartments = async (pool, seminarId, ids) => {
	if (!Array.isArray(ids)) return;
	const req = pool.request().input('sid', sql.VarChar(20), seminarId);
	const values = [...new Set(ids.filter(Boolean))]
		.map((id, i) => {
			req.input(`d${i}`, sql.VarChar(20), id);
			return `(@sid, @d${i})`;
		})
		.join(', ');
	await req.query(`
    DELETE FROM seminar_required_departments WHERE seminar_id = @sid;
    ${values ? `INSERT INTO seminar_required_departments (seminar_id, department_id) VALUES ${values};` : ''}
  `);
};

module.exports = {
	HOSPITAL_TRAINING_SQL,
	TRAINING_FIELD_TYPES,
	trainingFilter,
	trainingSelect,
	trainingJoin,
	parseTraining,
	applyLessonCredits,
	setRequiredDepartments,
};
