-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
-- ============================================================
-- VIEW: xem audit trail đầy đủ
-- ============================================================
CREATE VIEW [dbo].[vw_topics_audit] AS
SELECT
    t.id, t.title, t.status,
    t.created_at,
    uc.full_name    AS created_by_name,
    t.updated_at,
    uu.full_name    AS updated_by_name,
    rr.name         AS round_name,
    d.name          AS department_name
FROM topics t
LEFT JOIN users uc ON uc.id = t.created_by
LEFT JOIN users uu ON uu.id = t.updated_by
LEFT JOIN research_rounds rr ON rr.id = t.round_id
LEFT JOIN departments d      ON d.id  = t.department_id;
