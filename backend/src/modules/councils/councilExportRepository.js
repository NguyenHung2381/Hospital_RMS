const { getPool, sql } = require('../../config/db');

// Dữ liệu cho file "Lịch bảo vệ đề cương" của 1 đợt (councilExportService.js).
// Chỉ SQL, trả recordset.

const request = async (roundId) =>
	(await getPool()).request().input('round_id', sql.VarChar(10), roundId);

const findRound = async (roundId) =>
	(
		await (
			await request(roundId)
		).query('SELECT name, year FROM research_rounds WHERE id = @round_id')
	).recordset[0] ?? null;

// Đề tài đã gán hội đồng, theo hội đồng → phiên (sáng, chiều) → thời điểm tạo
const listTopics = async (roundId) =>
	(
		await (
			await request(roundId)
		).query(`
      SELECT t.id, t.title, t.[session], t.council_id,
             d.name AS department_name, cat.name AS category_name,
             c.location
      FROM topics t
      INNER JOIN councils c ON c.id = t.council_id
      LEFT JOIN departments d ON d.id = t.department_id
      LEFT JOIN categories cat ON cat.id = t.category_id
      WHERE c.round_id = @round_id
      ORDER BY c.id,
        CASE t.[session] WHEN 'morning' THEN 0 WHEN 'afternoon' THEN 1 ELSE 2 END,
        t.created_at
    `)
	).recordset;

const listMembers = async (roundId) =>
	(
		await (
			await request(roundId)
		).query(`
      SELECT tm.topic_id, tm.name AS ho_ten, tm.staff_number, tm.role
      FROM topic_members tm
      INNER JOIN topics t ON t.id = tm.topic_id
      INNER JOIN councils c ON c.id = t.council_id
      WHERE c.round_id = @round_id
      ORDER BY tm.topic_id,
        CASE tm.role WHEN 'leader' THEN 0 WHEN 'secretary' THEN 1 ELSE 2 END
    `)
	).recordset;

// Ghế hội đồng (thành viên cố định của từng hội đồng)
const listSeats = async (roundId) =>
	(
		await (
			await request(roundId)
		).query(`
      SELECT cm.council_id, cm.role, u.full_name,
             q.code AS qualification, d.name AS department_name
      FROM council_members cm
      INNER JOIN councils c ON c.id = cm.council_id
      LEFT JOIN users u ON u.id = cm.user_id
      LEFT JOIN qualifications q ON q.id = u.qualification_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE c.round_id = @round_id
    `)
	).recordset;

// Ghế thay thế theo từng đề tài
const listSubstitutes = async (roundId) =>
	(
		await (
			await request(roundId)
		).query(`
      SELECT s.topic_id, s.role, u.full_name,
             q.code AS qualification, d.name AS department_name
      FROM council_seat_substitutes s
      INNER JOIN topics t ON t.id = s.topic_id
      INNER JOIN councils c ON c.id = t.council_id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN qualifications q ON q.id = u.qualification_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE c.round_id = @round_id
    `)
	).recordset;

module.exports = { findRound, listTopics, listMembers, listSeats, listSubstitutes };
