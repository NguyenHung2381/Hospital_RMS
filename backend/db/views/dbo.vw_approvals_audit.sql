-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE VIEW [dbo].[vw_approvals_audit] AS
SELECT
    a.id, a.topic_id, a.status, a.comment,
    a.created_at,
    uc.full_name    AS created_by_name,
    a.updated_at,
    uu.full_name    AS updated_by_name,
    t.title         AS topic_title
FROM approvals a
LEFT JOIN users uc ON uc.id = a.created_by
LEFT JOIN users uu ON uu.id = a.updated_by
LEFT JOIN topics t  ON t.id  = a.topic_id;
