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

module.exports = {
	client: 'mssql',
	getPool,
	sql,
	dbConfig,
	withTransaction,
	withActor,
	lockResource,
	tlsOptions,
};
