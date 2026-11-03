// Nhận diện lỗi từ CSDL. Mọi chỗ cần biết "lỗi này là trùng khoá / vi phạm khoá
// ngoại / thiếu bảng..." gọi các hàm ở đây thay vì so `err.number` / `err.code`
// trực tiếp. Hiểu cả SQL Server (mssql: số lỗi) và PostgreSQL (pg: mã SQLSTATE
// 5 ký tự ở `err.code`). Xem backend/database/POSTGRESQL_MIGRATION_PLAN.md mục 4.5.

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

/**
 * Mã SQLSTATE của lỗi PostgreSQL (`23505`...). Lỗi của driver `pg` có `severity`
 * — phân biệt với lỗi mạng của Node cũng đặt `err.code` (`EPIPE`, `ECONNRESET`).
 * @param {any} err
 * @returns {string | undefined}
 */
const pgErrorCode = (err) =>
	typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) && err.severity
		? err.code
		: undefined;

/** Mã lỗi để ghi log: số của SQL Server hoặc SQLSTATE của PostgreSQL. */
const dbErrorCode = (/** @type {any} */ err) => dbErrorNumber(err) ?? pgErrorCode(err);

/** Lỗi do CSDL trả về (không phải lỗi JS hay lỗi nghiệp vụ tự ném bằng httpError). */
const isDbError = (/** @type {any} */ err) => dbErrorCode(err) !== undefined;

// mssql: danh sách số lỗi; pg: danh sách SQLSTATE
const has = (
	/** @type {any} */ err,
	/** @type {number[]} */ numbers,
	/** @type {string[]} */ states = [],
) => {
	const n = dbErrorNumber(err);
	if (n !== undefined) return numbers.includes(n);
	const s = pgErrorCode(err);
	return s !== undefined && states.includes(s);
};

// SQL Server dùng chung số 547 cho vi phạm FOREIGN KEY và CHECK; phân biệt qua message.
const isConstraint547 = (/** @type {any} */ err, /** @type {RegExp} */ kind) =>
	has(err, [547]) && kind.test(String(err?.message || ''));

/** Trùng khoá chính / UNIQUE. SQL Server 2627, 2601 — PostgreSQL 23505. */
const isUniqueViolation = (/** @type {any} */ err) => has(err, [2627, 2601], ['23505']);

/** Vi phạm khoá ngoại. SQL Server 547 (FOREIGN KEY) — PostgreSQL 23503. */
const isForeignKeyViolation = (/** @type {any} */ err) =>
	isConstraint547(err, /FOREIGN KEY|REFERENCE/i) || has(err, [], ['23503']);

/** Vi phạm ràng buộc CHECK. SQL Server 547 (CHECK) — PostgreSQL 23514. */
const isCheckViolation = (/** @type {any} */ err) =>
	isConstraint547(err, /CHECK/i) || has(err, [], ['23514']);

/** Thiếu bảng/view. SQL Server 208 — PostgreSQL 42P01. */
const isMissingTable = (/** @type {any} */ err) => has(err, [208], ['42P01']);

/** Thiếu cột. SQL Server 207 — PostgreSQL 42703. */
const isMissingColumn = (/** @type {any} */ err) => has(err, [207], ['42703']);

/** Thiếu bảng hoặc cột (migration chưa chạy). */
const isMissingObject = (/** @type {any} */ err) => isMissingTable(err) || isMissingColumn(err);

/** Deadlock. SQL Server 1205 — PostgreSQL 40P01 (40001: xung đột serializable). */
const isDeadlock = (/** @type {any} */ err) => has(err, [1205], ['40P01', '40001']);

/**
 * Tên ràng buộc bị vi phạm (để báo lỗi cụ thể, vd trùng email). pg có sẵn ở
 * `err.constraint`; SQL Server chỉ có trong message. Trả chữ thường (PG hạ
 * chữ thường tên ràng buộc).
 * @param {any} err
 * @returns {string | null}
 */
const constraintName = (err) => {
	if (typeof err?.constraint === 'string') return err.constraint.toLowerCase();
	const m = /(?:constraint|index) '?"?([\w.]+)/i.exec(String(err?.message || ''));
	return m ? m[1].toLowerCase() : null;
};

/**
 * Mã lỗi nghiệp vụ do SQL tự ném (`THROW 51003, ...`, `RAISERROR` = 50000).
 * Trả số ≥ 50000, hoặc null nếu không phải lỗi loại này.
 * Trên PostgreSQL: `RAISE EXCEPTION ... USING ERRCODE = 'P0001', DETAIL = '51003'`.
 * @param {any} err
 * @returns {number | null}
 */
const appErrorCode = (err) => {
	const n = dbErrorNumber(err);
	if (n !== undefined) return n >= 50000 ? n : null;
	if (pgErrorCode(err) === 'P0001') {
		const d = Number(err.detail);
		return Number.isInteger(d) && d >= 50000 ? d : null;
	}
	return null;
};

module.exports = {
	dbErrorNumber,
	pgErrorCode,
	dbErrorCode,
	isDbError,
	isUniqueViolation,
	isForeignKeyViolation,
	isCheckViolation,
	isMissingTable,
	isMissingColumn,
	isMissingObject,
	isDeadlock,
	constraintName,
	appErrorCode,
};
