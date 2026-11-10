/* ============================================================================
 * 2026-12-21_dat_lai_seq_person_id
 * ----------------------------------------------------------------------------
 *   seq_person_id (personService.createPerson sinh mã persons.id = 'PS' + 8 số)
 *   bị tụt sau dữ liệu khi chuyển từ SQL Server sang PostgreSQL: sequence chép
 *   last_used_value bên SQL Server (243) trong khi persons đã tới PS00001622 →
 *   mọi person mới trùng khóa chính "persons_pkey", tài khoản tạo ra không gắn
 *   được person (lỗi lộ ra khi nhập nhân viên hàng loạt bằng import:staff).
 *
 *   Đặt sequence = max(giá trị hiện tại, số lớn nhất trong mã PS đang dùng) —
 *   lần nextval kế tiếp ra mã chưa có. Không bao giờ kéo sequence lùi lại.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

SELECT setval(
	'seq_person_id',
	GREATEST(
		(SELECT last_value FROM seq_person_id),
		(SELECT coalesce(max(substring(id FROM 3)::bigint), 0) FROM persons WHERE id ~ '^PS[0-9]+$')
	)
);
