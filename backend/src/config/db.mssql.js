const fs = require('fs');
const sql = require('mssql');
const { config } = require('./env');
const logger = require('./logger');

// Kiểm tra chứng chỉ SQL Server (config/env.js đã kiểm tra file đọc được, đúng PEM).
// Có DB_CA_CERT_FILE ⇒ tin ĐÚNG chứng chỉ trong file (CA nội bộ, hoặc chính chứng
// chỉ tự ký của SQL Server), không tin danh sách CA hệ thống, luôn kiểm tra tên.
const tlsOptions = (cfg) => {
	if (!cfg.DB_CA_CERT_FILE) return { trustServerCertificate: cfg.DB_TRUST_SERVER_CERT };
	return {
		trustServerCertificate: false,
		cryptoCredentialsDetails: { ca: fs.readFileSync(cfg.DB_CA_CERT_FILE, 'utf8') },
		...(cfg.DB_CERT_SERVER_NAME ? { serverName: cfg.DB_CERT_SERVER_NAME } : {}),
	};
};

const dbConfig = {
	server: config.DB_SERVER,
	port: config.DB_PORT,
	database: config.DB_DATABASE,
	user: config.DB_USER,
	password: config.DB_PASSWORD,

	// Timeout kết nối và query — phải đặt ở top-level, KHÔNG nằm trong options
	connectionTimeout: 30000, // 30s chờ thiết lập kết nối
	requestTimeout: 30000, // 30s chờ kết quả query / stored procedure

	options: {
		encrypt: config.DB_ENCRYPT,
		...tlsOptions(config),
		enableArithAbort: true,
	},

	pool: {
		// Mỗi worker (src/cluster.js) có pool riêng: tổng kết nối tới SQL Server
		// = WEB_CONCURRENCY × DB_POOL_MAX.
		max: config.DB_POOL_MAX,
		min: 2, // Giữ 2 connection ấm — tránh cold-start
		idleTimeoutMillis: 60000, // 1 phút mới đóng connection nhàn rỗi (cũ: 30s)
		acquireTimeoutMillis: 30000, // 30s chờ lấy connection từ pool
		createTimeoutMillis: 30000, // 30s chờ tạo connection mới
		destroyTimeoutMillis: 5000,
		createRetryIntervalMillis: 500, // Thử lại sau 500ms nếu tạo thất bại
	},
};

let poolPromise = null;

const getPool = async () => {
	// Kiểm tra pool còn sống không; nếu không — reset để reconnect
	if (poolPromise) {
		try {
			const pool = await poolPromise;
			if (!pool.connected) {
				logger.warn('[DB] Pool đã mất kết nối — đang reconnect...');
				try {
					await pool.close();
				} catch {
					/* bỏ qua */
				}
				poolPromise = null;
			} else {
				return pool;
			}
		} catch {
			poolPromise = null;
		}
	}

	poolPromise = sql
		.connect(dbConfig)
		.then((pool) => {
			logger.info('✅ Connected to SQL Server');

			// Tự reset khi pool phát lỗi (SQL Server restart, network drop…)
			pool.on('error', (err) => {
				logger.error('[DB] Pool error:', err.message);
				poolPromise = null;
			});

			return pool;
		})
		.catch((err) => {
			poolPromise = null;
			throw err;
		});

	return poolPromise;
};

// Chạy fn(tx) trong 1 transaction: xong thì commit, lỗi thì rollback rồi ném
// lại lỗi GỐC. SQL Server có thể đã tự hủy transaction (XACT_ABORT, lỗi nặng)
// ⇒ rollback() ném "Transaction has not begun" — nuốt lỗi đó để không che lỗi thật.
// pool: truyền khi đã có sẵn, bỏ trống thì lấy pool chung.
const withTransaction = async (fn, pool) => {
	const tx = new sql.Transaction(pool ?? (await getPool()));
	await tx.begin();
	try {
		const result = await fn(tx);
		await tx.commit();
		return result;
	} catch (err) {
		await tx.rollback().catch(() => {});
		throw err;
	}
};

// Ghi người thao tác cho trigger audit (updated_by). Thay cho việc viết
// `EXEC sp_set_actor @actor_id;` trong câu SQL — bản PG (db.pg.js) dùng
// set_config, nên code gọi hàm này chạy được trên cả 2 DB.
// Bắt buộc truyền transaction (như bản PG): gọi trên pool thì câu sau chạy ở
// kết nối khác, trigger không thấy người thao tác. Không có transaction sẵn thì
// dùng withActorTransaction (config/db.js).
// Lưu ý: SESSION_CONTEXT của SQL Server gắn với KẾT NỐI (không tự hết khi xong
// transaction) — giống hành vi `EXEC sp_set_actor` hiện nay.
const withActor = (tx, actorId) => {
	if (!(tx instanceof sql.Transaction)) {
		throw new Error(
			'withActor() phải gọi trong transaction (withTransaction / withActorTransaction)',
		);
	}
	return tx
		.request()
		.input('actor_id', sql.VarChar(20), actorId ?? null)
		.query('EXEC sp_set_actor @actor_id;');
};

// Khoá loại trừ theo tên (vd. 'gen_course_id_KH20261103'), giữ tới khi
// transaction COMMIT/ROLLBACK. Dùng cho sinh mã MAX+1 (utils/idGenerator.js).
// Trả true nếu lấy được khoá, false nếu chờ quá timeoutMs.
const lockResource = async (tx, resource, timeoutMs = 5000) => {
	if (!(tx instanceof sql.Transaction)) {
		throw new Error('lockResource() phải gọi trong transaction');
	}
	const r = await tx
		.request()
		.input('res', sql.NVarChar(255), resource)
		.input('timeout', sql.Int, timeoutMs).query(`
			DECLARE @rc INT;
			EXEC @rc = sp_getapplock @Resource = @res, @LockMode = 'Exclusive',
			     @LockOwner = 'Transaction', @LockTimeout = @timeout;
			SELECT @rc AS rc;`);
	return r.recordset[0].rc >= 0;
};

// Lấy `count` số kế tiếp của SEQUENCE `name` (1 câu lệnh). Thứ tự trả về không
// quan trọng. Dùng cho mã có hậu tố từ sequence (vd. thông báo NTF...).
const nextSequenceValues = async (txOrPool, name, count) => {
	if (!/^\w+$/.test(name)) throw new Error(`Tên sequence không hợp lệ: ${name}`);
	if (count < 1) return [];
	const r = await txOrPool
		.request()
		.input('arr', sql.NVarChar(sql.MAX), JSON.stringify(new Array(count).fill(0)))
		.query(
			`SELECT NEXT VALUE FOR dbo.${name} OVER (ORDER BY CAST([key] AS INT)) AS v FROM OPENJSON(@arr)`,
		);
	return r.recordset.map((x) => Number(x.v));
};

// Cột kết quả kiểu boolean (JS nhận true/false) từ 1 điều kiện / 1 biểu thức:
// SQL Server không có kiểu boolean trong SELECT nên đổi sang BIT. Bản PG ở db.pg.js.
/** @param {string} cond điều kiện SQL (vd `x IS NOT NULL`) */
const boolExpr = (cond) => `CAST(CASE WHEN ${cond} THEN 1 ELSE 0 END AS BIT)`;
/** @param {string} expr cột / biểu thức boolean, hoặc NULL */
const castBool = (expr) => `CAST(${expr} AS BIT)`;

// Mảng JSON (1 tham số NVarChar(MAX) = JSON.stringify(mảng)) dùng như 1 bảng:
//   `id IN ${jsonValues('@ids')}`, `FROM ${jsonValues('@ids', { withIndex: true })} j`
// Cột `value` (ép sang `type`), thêm `idx` (vị trí, từ 0) nếu withIndex. Danh sách
// dài vẫn chỉ là 1 tham số (SQL Server giới hạn ~2100 tham số / câu). Bản PG ở db.pg.js.
/**
 * @param {string} param tên tham số, vd '@ids'
 * @param {{ type?: string, withIndex?: boolean }} [opts] type: VARCHAR(50) (mặc định), INT, DATE...
 */
const jsonValues = (param, { type = 'VARCHAR(50)', withIndex = false } = {}) =>
	`(SELECT CAST([value] AS ${type}) AS value${withIndex ? ', CAST([key] AS INT) AS idx' : ''} FROM OPENJSON(${param}))`;

// Mảng JSON các object → bảng có cột đặt kiểu: `JOIN ${jsonRows('@rows', 'j', [['id', 'VARCHAR(20)']])} ON ...`
/**
 * @param {string} param
 * @param {string} alias
 * @param {Array<[string, string]>} cols [tên khoá, kiểu SQL Server]
 */
const jsonRows = (param, alias, cols) =>
	`OPENJSON(${param}) WITH (${cols.map(([c, t]) => `${c} ${t}`).join(', ')}) ${alias}`;

// Mã ngẫu nhiên cho từng dòng khi chèn nhiều dòng 1 câu (INSERT ... SELECT):
// tiền tố + n ký tự hex in hoa. 1 dòng thì sinh bằng JS (utils/idGenerator.randomId).
/**
 * @param {string} prefix chỉ chữ / số / _
 * @param {number} n
 */
const newIdSql = (prefix, n) => {
	if (!/^\w*$/.test(prefix) || !Number.isInteger(n))
		throw new Error('newIdSql: tham số không hợp lệ');
	return `CONCAT('${prefix}', LEFT(REPLACE(CAST(NEWID() AS VARCHAR(36)), '-', ''), ${n}))`;
};

// UPDATE trả về các dòng vừa sửa: `${update} WHERE ${where}` + cột lấy ra. Biểu thức
// cột ghi `new.cột` (giá trị sau khi sửa) / `old.cột` (trước khi sửa). SQL Server:
// OUTPUT ... INTO biến bảng (bảng có trigger thì không được OUTPUT trần); PG: RETURNING.
/**
 * @param {string} update `UPDATE bảng SET ...` (chưa có WHERE)
 * @param {string} where
 * @param {Array<[string, string, string]>} cols [biểu thức, tên cột kết quả, kiểu SQL Server]
 */
const updateReturning = (update, where, cols) => {
	const expr = (e) => e.replace(/\bnew\./g, 'INSERTED.').replace(/\bold\./g, 'DELETED.');
	return `DECLARE @r TABLE (${cols.map(([, n, t]) => `${n} ${t}`).join(', ')});
${update}
OUTPUT ${cols.map(([e]) => expr(e)).join(', ')} INTO @r
WHERE ${where};
SELECT ${cols.map(([, n]) => n).join(', ')} FROM @r`;
};

// Nhiều câu SELECT dùng chung tham số đã gắn vào `req` → mảng tập kết quả, câu thứ
// i ứng với phần tử thứ i (mỗi câu phải trả về đúng 1 tập kết quả). SQL Server: ghép
// thành 1 lô, 1 lượt gọi như trước. Bản PG (db.pg.js) chạy từng câu riêng.
/**
 * @param {any} req request đã `.input(...)` đủ tham số
 * @param {string[]} statements
 * @returns {Promise<any[][]>}
 */
const queryAll = async (req, statements) => (await req.query(statements.join(';\n'))).recordsets;

module.exports = {
	client: 'mssql',
	getPool,
	sql,
	dbConfig,
	withTransaction,
	withActor,
	lockResource,
	nextSequenceValues,
	boolExpr,
	castBool,
	jsonValues,
	jsonRows,
	newIdSql,
	queryAll,
	updateReturning,
	tlsOptions,
};
