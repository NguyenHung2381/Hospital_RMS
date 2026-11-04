// Nhận diện lỗi từ CSDL (PostgreSQL). Mọi chỗ cần biết "lỗi này là trùng khoá /
// vi phạm khoá ngoại / thiếu bảng..." gọi các hàm ở đây thay vì so `err.code`
// trực tiếp. Driver `pg` đặt mã SQLSTATE 5 ký tự ở `err.code`.

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

/** Mã lỗi để ghi log (SQLSTATE). */
const dbErrorCode = (/** @type {any} */ err) => pgErrorCode(err);

/** Lỗi do CSDL trả về (không phải lỗi JS hay lỗi nghiệp vụ tự ném bằng httpError). */
const isDbError = (/** @type {any} */ err) => dbErrorCode(err) !== undefined;

const has = (/** @type {any} */ err, /** @type {string[]} */ states) => {
	const s = pgErrorCode(err);
	return s !== undefined && states.includes(s);
};

/** Trùng khoá chính / UNIQUE (23505). */
const isUniqueViolation = (/** @type {any} */ err) => has(err, ['23505']);

/** Vi phạm khoá ngoại (23503). */
const isForeignKeyViolation = (/** @type {any} */ err) => has(err, ['23503']);

/** Vi phạm ràng buộc CHECK (23514). */
const isCheckViolation = (/** @type {any} */ err) => has(err, ['23514']);

/** Thiếu bảng/view (42P01). */
const isMissingTable = (/** @type {any} */ err) => has(err, ['42P01']);

/** Thiếu cột (42703). */
const isMissingColumn = (/** @type {any} */ err) => has(err, ['42703']);

/** Thiếu bảng hoặc cột (migration chưa chạy). */
const isMissingObject = (/** @type {any} */ err) => isMissingTable(err) || isMissingColumn(err);

/** Deadlock 40P01 (40001: xung đột serializable). */
const isDeadlock = (/** @type {any} */ err) => has(err, ['40P01', '40001']);

/**
 * Tên ràng buộc bị vi phạm (để báo lỗi cụ thể, vd trùng email). Driver pg đặt ở
 * `err.constraint`; không có thì dò trong message. Trả chữ thường.
 * @param {any} err
 * @returns {string | null}
 */
const constraintName = (err) => {
	if (typeof err?.constraint === 'string') return err.constraint.toLowerCase();
	const m = /(?:constraint|index) '?"?([\w.]+)/i.exec(String(err?.message || ''));
	return m ? m[1].toLowerCase() : null;
};

/**
 * Mã lỗi nghiệp vụ do SQL tự ném:
 * `RAISE EXCEPTION ... USING ERRCODE = 'P0001', DETAIL = '51003'`.
 * Trả số ≥ 50000, hoặc null nếu không phải lỗi loại này.
 * @param {any} err
 * @returns {number | null}
 */
const appErrorCode = (err) => {
	if (pgErrorCode(err) !== 'P0001') return null;
	const d = Number(err.detail);
	return Number.isInteger(d) && d >= 50000 ? d : null;
};

module.exports = {
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
