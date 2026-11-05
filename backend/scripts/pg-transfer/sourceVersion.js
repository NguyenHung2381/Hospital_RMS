// DB SQL Server nguồn phải ở ĐÚNG phiên bản schema mà baseline PG được sinh ra
// (database/baseline/). Repo không còn migration T-SQL, nên DB nguồn cũ hơn thì
// không nâng cấp được nữa: phải chạy hết migration trên SQL Server (bản code cuối
// còn SQL Server, commit dd0f62e) TRƯỚC khi lấy backup.

// Migration T-SQL cuối cùng. Migration chạy theo thứ tự tên file nên có dòng này
// trong schema_migrations nghĩa là các file trước đó đã chạy.
const LAST_TSQL_MIGRATION = '2026-12-15_unique_nulls_not_distinct.sql';

// Stored procedure / function / trigger / view của hệ thống cũ (đã chuyển hết
// về JS hoặc trigger PG). Object khác có trong DB
// nguồn là thứ ngoài repo — sẽ không được chuyển, precheck cảnh báo.
const KNOWN_OBJECTS = new Set(
	`fn_normalize_phone sp_approve_topic sp_cleanup_expired_tokens sp_cleanup_old_notifications
	sp_close_supplement_window sp_create_refresh_token sp_deactivate_expired_accounts
	sp_gen_approval_id sp_gen_attendance_id sp_gen_batch_id sp_gen_category_id sp_gen_certificate_id
	sp_gen_certificate_no sp_gen_class_session_id sp_gen_cme_no sp_gen_council_id
	sp_gen_council_member_id sp_gen_course_document_id sp_gen_course_enrollment_id sp_gen_course_id
	sp_gen_course_program_id sp_gen_dept_id sp_gen_external_reviewer_id sp_gen_file_id
	sp_gen_grade_id sp_gen_lecturer_assignment_id sp_gen_level_id sp_gen_member_id
	sp_gen_permission_id sp_gen_pgroup_id sp_gen_progress_id sp_gen_role_id sp_gen_round_id
	sp_gen_token_id sp_gen_topic_id sp_gen_trainee_id sp_gen_user_id sp_grant_member_accounts
	sp_process_daily_deadlines sp_push_notification sp_remind_deadlines sp_resolve_recipients
	sp_set_actor sp_upload_files sp_use_refresh_token trg_approvals_audit trg_cat_audit
	trg_councils_audit trg_dept_audit trg_file_batch_count trg_files_audit trg_lv_audit
	trg_research_rounds_audit trg_roles_audit trg_seminar_participants_audit trg_seminars_audit
	trg_tm_audit trg_topic_auto_approval trg_topics_audit trg_users_audit vw_approvals_audit
	vw_topics_audit`.split(/\s+/),
);

/**
 * Lỗi (chuỗi) nếu DB nguồn chưa chạy tới migration T-SQL cuối, null nếu đủ.
 * @param {import('mssql').ConnectionPool} pool kết nối tới DB nguồn
 */
const sourceVersionProblem = async (pool) => {
	// Hai câu riêng: SQL Server biên dịch cả batch, bảng thiếu thì CASE ... (SELECT FROM bảng đó) vẫn lỗi 208
	const exists = await pool
		.request()
		.query(`SELECT OBJECT_ID(N'dbo.schema_migrations', N'U') AS id`);
	const n =
		exists.recordset[0].id == null
			? -1
			: (
					await pool
						.request()
						.input('f', LAST_TSQL_MIGRATION)
						.query(`SELECT COUNT(*) AS n FROM dbo.schema_migrations WHERE filename = @f`)
				).recordset[0].n;
	if (n > 0) return null;
	return (
		(n < 0
			? 'DB nguồn không có bảng dbo.schema_migrations'
			: `DB nguồn chưa chạy migration ${LAST_TSQL_MIGRATION}`) +
		' — backup lấy từ bản code cũ. Deploy bản cuối còn SQL Server (commit dd0f62e) lên server' +
		' SQL Server cho chạy hết migration, rồi lấy backup lại.'
	);
};

module.exports = { LAST_TSQL_MIGRATION, KNOWN_OBJECTS, sourceVersionProblem };
