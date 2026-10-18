// @ts-nocheck — còn lỗi kiểu khi bật checkJs; sửa xong thì xoá dòng này (xem README, Kiểm tra chất lượng)
const sql = require('mssql');
const { config } = require('./env');
const logger = require('./logger');

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
		trustServerCertificate: config.DB_TRUST_SERVER_CERT,
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
// lại lỗi GỐC. SQL Server có thể đã tự huỷ transaction (XACT_ABORT, lỗi nặng)
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

module.exports = { getPool, sql, dbConfig, withTransaction };
