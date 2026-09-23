// Dashboard và Reports gọi chung endpoint GET /dashboard/stats — dùng chung 1 type
// để tránh 2 bản khai báo lệch nhau (bản cũ ở đây thiếu by_article_type/approval_rate/
// council_progress và có draft/completed thay vì cancelled — sai so với DB thực tế).
export type { DashboardStats } from '../../reports/types/report.type';
