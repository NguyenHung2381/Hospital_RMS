// Nhận diện lỗi từ CSDL. Mọi chỗ cần biết "lỗi này là trùng khoá / vi phạm khoá
// ngoại / thiếu bảng..." gọi các hàm ở đây thay vì so `err.number` trực tiếp.
// Khi chuyển sang PostgreSQL chỉ cần sửa file này (mã SQLSTATE ghi kèm bên dưới).
// Xem backend/database/POSTGRESQL_MIGRATION_PLAN.md mục 4.5.

/**
 * Mã lỗi SQL Server của `err`. Driver `mssql` đặt ở `err.number`; một số lỗi
 * bọc lại (transaction, request lồng) chỉ còn ở `err.originalError.info.number`.
 * @param {any} err
 * @returns {number | undefined}
 */
const dbErrorNumber = (err) => {
	const n = err?.number ?? err?.originalError?.info?.number;
	return Number.isInteger(n) ? n : undefined;
};

/** Lỗi do CSDL trả về (không phải lỗi JS hay lỗi nghiệp vụ tự ném bằng httpError). */
const isDbError = (/** @type {any} */ err) => dbErrorNumber(err) !== undefined;

const has = (/** @type {any} */ err, /** @type {number[]} */ codes) => {
	const n = dbErrorNumber(err);
	return n !== undefined && codes.includes(n);
};

// SQL Server dùng chung số 547 cho vi phạm FOREIGN KEY và CHECK; phân biệt qua message.
const isConstraint547 = (/** @type {any} */ err, /** @type {RegExp} */ kind) =>
	has(err, [547]) && kind.test(String(err?.message || ''));

/** Trùng khoá chính / UNIQUE. SQL Server 2627, 2601 — PostgreSQL 23505. */
const isUniqueViolation = (/** @type {any} */ err) => has(err, [2627, 2601]);

/** Vi phạm khoá ngoại. SQL Server 547 (FOREIGN KEY) — PostgreSQL 23503. */
const isForeignKeyViolation = (/** @type {any} */ err) =>
	isConstraint547(err, /FOREIGN KEY|REFERENCE/i);

/** Vi phạm ràng buộc CHECK. SQL Server 547 (CHECK) — PostgreSQL 23514. */
const isCheckViolation = (/** @type {any} */ err) => isConstraint547(err, /CHECK/i);

/** Thiếu bảng/view. SQL Server 208 — PostgreSQL 42P01. */
const isMissingTable = (/** @type {any} */ err) => has(err, [208]);

/** Thiếu cột. SQL Server 207 — PostgreSQL 42703. */
const isMissingColumn = (/** @type {any} */ err) => has(err, [207]);

/** Thiếu bảng hoặc cột (migration chưa chạy). */
const isMissingObject = (/** @type {any} */ err) => isMissingTable(err) || isMissingColumn(err);

/** Deadlock. SQL Server 1205 — PostgreSQL 40P01. */
const isDeadlock = (/** @type {any} */ err) => has(err, [1205]);

/**
 * Mã lỗi nghiệp vụ do SQL tự ném (`THROW 51003, ...`, `RAISERROR` = 50000).
 * Trả số ≥ 50000, hoặc null nếu không phải lỗi loại này.
 * Trên PostgreSQL: `RAISE EXCEPTION ... USING ERRCODE = 'P0001', DETAIL = '51003'`.
 * @param {any} err
 * @returns {number | null}
 */
const appErrorCode = (err) => {
	const n = dbErrorNumber(err);
	return n !== undefined && n >= 50000 ? n : null;
};

module.exports = {
	dbErrorNumber,
	isDbError,
	isUniqueViolation,
	isForeignKeyViolation,
	isCheckViolation,
	isMissingTable,
	isMissingColumn,
	isMissingObject,
	isDeadlock,
	appErrorCode,
};
