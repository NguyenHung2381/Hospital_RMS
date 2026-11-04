const fs = require('fs');
const tls = require('tls');
const { Pool, types: pgTypes } = require('pg');
const { config } = require('./env');
const logger = require('./logger');
const { TYPES, toPositional, TYPE_PARSERS, pgpassFile, pgpassLookup } = require('./pgParams');

// Lớp truy cập PostgreSQL có CÙNG giao diện với db.mssql.js, để service giữ
// nguyên cách gọi (POSTGRESQL_MIGRATION_PLAN.md mục 5.1):
//   const { recordset } = await pool.request().input('id', sql.VarChar(20), id)
//     .query('SELECT ... WHERE id = @id');
// Chỉ đổi cách gọi, KHÔNG dịch cú pháp T-SQL: câu SQL phải viết được trên PG
// (chặng 1 và 3 của kế hoạch). Khác biệt cần biết khi sửa SQL:
//   - Lỗi trong transaction làm hỏng cả transaction (mọi câu sau báo 25P02) —
//     SQL Server thì cho chạy tiếp. Đừng bắt lỗi rồi chạy tiếp trong cùng tx.
//   - Một lời gọi có tham số chỉ được 1 câu lệnh; nhiều câu (recordsets[1]...)
//     chỉ chạy được khi không có tham số.
//   - execute('sp_...') không hỗ trợ: chuyển stored procedure về JS.
//   - Tham số chuỗi chỉ được ép `::text` trước `IS [NOT] NULL` (pgParams.js).
//     Chỗ khác PG không tự suy được kiểu (`SELECT @x AS ten`) thì viết rõ `@x::text`.

// Kiểm tra chứng chỉ khi dùng SSL (biến môi trường dùng chung với SQL Server):
//   DB_ENCRYPT=true → SSL; DB_CA_CERT_FILE → chỉ tin chứng chỉ trong file và
//   kiểm tra tên (DB_CERT_SERVER_NAME nếu tên trong chứng chỉ khác DB_SERVER).
const sslOptions = (cfg) => {
	if (!cfg.DB_ENCRYPT) return false;
	if (!cfg.DB_CA_CERT_FILE) return { rejectUnauthorized: !cfg.DB_TRUST_SERVER_CERT };
	return {
		rejectUnauthorized: true,
		ca: fs.readFileSync(cfg.DB_CA_CERT_FILE, 'utf8'),
		...(cfg.DB_CERT_SERVER_NAME
			? {
					checkServerIdentity: (_host, cert) =>
						tls.checkServerIdentity(cfg.DB_CERT_SERVER_NAME, cert),
				}
			: {}),
	};
};

const typeParsers = {
	getTypeParser: (oid, format) =>
		(format !== 'binary' && TYPE_PARSERS[oid]) || pgTypes.getTypeParser(oid, format),
};

// DB_PASSWORD trống: đọc file pgpass (hoặc PGPASSWORD) lúc mở kết nối.
const passwordFrom = (cfg) => {
	if (cfg.DB_PASSWORD) return cfg.DB_PASSWORD;
	if (process.env.PGPASSWORD) return process.env.PGPASSWORD;
	return async () => {
		let content = '';
		try {
			content = fs.readFileSync(pgpassFile(), 'utf8');
		} catch {
			/* không có file pgpass */
		}
		const key = {
			host: cfg.DB_SERVER,
			port: cfg.DB_PORT,
			database: cfg.DB_DATABASE,
			user: cfg.DB_USER,
		};
		return pgpassLookup(content, key) ?? '';
	};
};

const dbConfig = {
	host: config.DB_SERVER,
	port: config.DB_PORT,
	database: config.DB_DATABASE,
	user: config.DB_USER,
	password: passwordFrom(config),
	ssl: sslOptions(config),
	// Mỗi worker có pool riêng: tổng kết nối = WEB_CONCURRENCY × DB_POOL_MAX
	max: config.DB_POOL_MAX,
	idleTimeoutMillis: 60000,
	connectionTimeoutMillis: 30000,
	// Giống requestTimeout 30s của mssql (role rms_app còn có trần 60s ở DB)
	statement_timeout: 30000,
	application_name: 'hospital-rms',
	types: typeParsers,
};

// Kết quả theo dạng của mssql: recordset = tập kết quả đầu tiên, recordsets =
// mọi tập kết quả (câu có cột trả về), rowsAffected = số dòng từng câu.
const toMssqlResult = (res) => {
	const list = Array.isArray(res) ? res : [res];
	const recordsets = list.filter((r) => r.fields?.length).map((r) => r.rows);
	return {
		recordset: recordsets[0],
		recordsets,
		rowsAffected: list.map((r) => r.rowCount ?? 0),
	};
};

const unsupported = (what) =>
	new Error(
		`${what} chưa hỗ trợ trên PostgreSQL — chuyển stored procedure về JS (POSTGRESQL_MIGRATION_PLAN.md chặng 1)`,
	);

class Request {
	/** @param {any} [parent] PoolFacade hoặc Transaction; bỏ trống = pool chung */
	constructor(parent) {
		this.parent = parent;
		this.params = new Map();
	}

	input(name, type, value) {
		if (arguments.length === 2) {
			value = type;
			type = undefined;
		}
		this.params.set(String(name).toLowerCase(), { name, type, value });
		return this;
	}

	output() {
		throw unsupported('output()');
	}

	async execute(proc) {
		throw unsupported(`execute('${proc}')`);
	}

	async query(text) {
		const parent = this.parent ?? (await getPool());
		const { text: pgText, values } = toPositional(String(text), this.params);
		return toMssqlResult(await parent.run(pgText, values));
	}

	// mssql: batch = chạy không chuẩn bị câu lệnh; ở PG giống query
	batch(text) {
		return this.query(text);
	}
}

class PoolFacade {
	constructor(pg) {
		this.pg = pg;
		this.connected = true;
	}

	request() {
		return new Request(this);
	}

	run(text, values) {
		return values.length ? this.pg.query(text, values) : this.pg.query(text);
	}

	on(event, fn) {
		this.pg.on(event, fn);
		return this;
	}

	async close() {
		this.connected = false;
		await this.pg.end();
	}
}

class Transaction {
	/** @param {PoolFacade} [pool] */
	constructor(pool) {
		this.pool = pool;
		this.client = null;
	}

	async begin() {
		const pool = this.pool ?? (await getPool());
		const client = await pool.pg.connect();
		try {
			await client.query('BEGIN');
		} catch (err) {
			client.release(err);
			throw err;
		}
		this.client = client;
		return this;
	}

	request() {
		return new Request(this);
	}

	run(text, values) {
		if (!this.client) throw new Error('Transaction has not begun');
		return values.length ? this.client.query(text, values) : this.client.query(text);
	}

	async end(command) {
		if (!this.client) throw new Error('Transaction has not begun');
		const client = this.client;
		this.client = null;
		try {
			await client.query(command);
			client.release();
		} catch (err) {
			client.release(err); // kết nối hỏng → bỏ khỏi pool
			throw err;
		}
	}

	commit() {
		return this.end('COMMIT');
	}

	rollback() {
		return this.end('ROLLBACK');
	}
}

/** @type {Record<string, any> & { MAX: number, Request: typeof Request, Transaction: typeof Transaction }} */
const sql = { ...TYPES, MAX: -1, Request, Transaction };

let poolPromise = null;

const connect = async () => {
	const pg = new Pool(dbConfig);
	// Lỗi của kết nối đang rảnh (PG restart, mạng rớt): pool tự bỏ kết nối đó
	// và tạo kết nối mới khi cần — chỉ ghi log.
	pg.on('error', (err) => logger.error('[DB] Pool error:', err.message));
	try {
		(await pg.connect()).release();
	} catch (err) {
		await pg.end().catch(() => {});
		throw err;
	}
	logger.info('✅ Connected to PostgreSQL');
	return new PoolFacade(pg);
};

const getPool = async () => {
	if (poolPromise) {
		try {
			const pool = await poolPromise;
			if (pool.connected) return pool;
		} catch {
			/* lần trước lỗi — thử lại bên dưới */
		}
		poolPromise = null;
	}
	poolPromise = connect().catch((err) => {
		poolPromise = null;
		throw err;
	});
	return poolPromise;
};

// Như db.mssql.js: commit khi xong, lỗi thì rollback rồi ném lại lỗi GỐC.
const withTransaction = async (fn, pool) => {
	const tx = new Transaction(pool ?? (await getPool()));
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

// Người thao tác cho trigger audit (database/pg/baseline/04_trigger.sql đọc
// current_setting('app.current_user_id')). is_local = true: hết hiệu lực khi
// transaction kết thúc, không rò sang request khác dùng lại kết nối → PHẢI gọi
// trong transaction.
const withActor = (tx, actorId) => {
	if (!(tx instanceof Transaction)) {
		throw new Error('withActor() trên PostgreSQL phải gọi trong transaction (withTransaction)');
	}
	return tx
		.request()
		.input('actor_id', sql.VarChar(20), actorId ?? null)
		.query("SELECT set_config('app.current_user_id', coalesce(@actor_id, ''), true)");
};

// Khoá loại trừ theo tên, giữ tới khi transaction kết thúc (advisory lock,
// cùng vai trò sp_getapplock LockOwner = Transaction ở bản mssql). Trả false
// nếu chờ quá timeoutMs — khi đó transaction đã hỏng (lỗi lock_timeout), người
// gọi phải ném lỗi để rollback.
const lockResource = async (tx, resource, timeoutMs = 5000) => {
	if (!(tx instanceof Transaction)) {
		throw new Error('lockResource() trên PostgreSQL phải gọi trong transaction');
	}
	const old = (await tx.request().query("SELECT current_setting('lock_timeout') AS v")).recordset[0]
		.v;
	await tx
		.request()
		.input('t', sql.VarChar(20), `${Math.max(1, Math.trunc(timeoutMs))}ms`)
		.query("SELECT set_config('lock_timeout', @t, true)");
	try {
		await tx
			.request()
			.input('res', sql.NVarChar(255), resource)
			.query('SELECT pg_advisory_xact_lock(hashtextextended(@res, 0))');
	} catch (err) {
		if (/** @type {any} */ (err).code === '55P03') return false; // lock_not_available
		throw err;
	}
	await tx
		.request()
		.input('t', sql.VarChar(20), old)
		.query("SELECT set_config('lock_timeout', @t, true)");
	return true;
};

// Lấy `count` số kế tiếp của SEQUENCE `name` (1 câu lệnh). Thứ tự trả về không
// quan trọng. Dùng cho mã có hậu tố từ sequence (vd. thông báo NTF...).
const nextSequenceValues = async (txOrPool, name, count) => {
	if (!/^\w+$/.test(name)) throw new Error(`Tên sequence không hợp lệ: ${name}`);
	if (count < 1) return [];
	const r = await txOrPool
		.request()
		.input('name', sql.VarChar(128), name)
		.input('n', sql.Int, count)
		.query('SELECT nextval(CAST(@name AS regclass)) AS v FROM generate_series(1, @n)');
	return r.recordset.map((x) => Number(x.v));
};

// Cột kết quả kiểu boolean — cùng giao diện với db.mssql.js (bên đó đổi sang BIT).
/** @param {string} cond */
const boolExpr = (cond) => `(CASE WHEN ${cond} THEN TRUE ELSE FALSE END)`;
/** @param {string} expr */
const castBool = (expr) => `CAST(${expr} AS BOOLEAN)`;

// Mảng JSON dùng như bảng — cùng giao diện với db.mssql.js. Kiểu viết theo SQL
// Server được đổi: NVARCHAR(MAX) → text, NVARCHAR(n) → varchar(n).
/** @param {string} t */
const pgType = (t) =>
	t.replace(/\bN?VARCHAR\s*\(\s*MAX\s*\)/gi, 'text').replace(/\bNVARCHAR\b/gi, 'varchar');
/**
 * @param {string} param
 * @param {{ type?: string, withIndex?: boolean }} [opts]
 */
const jsonValues = (param, { type = 'VARCHAR(50)', withIndex = false } = {}) =>
	`(SELECT CAST(j.value AS ${pgType(type)}) AS value${withIndex ? ', CAST(j.ord - 1 AS INT) AS idx' : ''} FROM jsonb_array_elements_text(CAST(${param} AS jsonb)) WITH ORDINALITY AS j(value, ord))`;
/**
 * @param {string} param
 * @param {string} alias
 * @param {Array<[string, string]>} cols
 */
const jsonRows = (param, alias, cols) =>
	`jsonb_to_recordset(CAST(${param} AS jsonb)) AS ${alias}(${cols.map(([c, t]) => `${c} ${pgType(t)}`).join(', ')})`;

// Mã ngẫu nhiên cho từng dòng — cùng giao diện với db.mssql.js (in hoa như NEWID()).
/**
 * @param {string} prefix
 * @param {number} n
 */
const newIdSql = (prefix, n) => {
	if (!/^\w*$/.test(prefix) || !Number.isInteger(n))
		throw new Error('newIdSql: tham số không hợp lệ');
	return `CONCAT('${prefix}', UPPER(LEFT(REPLACE(CAST(gen_random_uuid() AS VARCHAR(36)), '-', ''), ${n})))`;
};

// Thời điểm hiện tại, chèn thẳng vào SQL (cùng tên ở db.mssql.js). DB lưu giờ VN không kèm
// múi giờ (mục 4.3 kế hoạch PG): nowSql = giờ VN (thay GETDATE / SYSDATETIME), utcNowSql =
// giờ UTC cho các cột ghi chú "lưu giờ UTC" (thay GETUTCDATE / SYSUTCDATETIME), vnTodaySql =
// ngày hôm nay theo giờ VN, không phụ thuộc múi giờ máy chủ DB.
// PG: now() là lúc bắt đầu transaction (SQL Server: lúc chạy câu) — trong 1 transaction
// mọi dòng cùng 1 mốc. Đổi múi giờ tường minh nên không phụ thuộc cấu hình timezone của DB.
// Subquery tương quan theo từng dòng (cùng tên ở db.mssql.js): crossApply bỏ dòng khi
// subquery rỗng, outerApply giữ dòng (cột NULL). SQL Server: CROSS / OUTER APPLY; PG: JOIN LATERAL.
/**
 * @param {string} subquery câu SELECT (không có ngoặc ngoài)
 * @param {string} alias
 */
const crossApply = (subquery, alias) => `CROSS JOIN LATERAL (${subquery}) ${alias}`;
/** @param {string} subquery @param {string} alias */
const outerApply = (subquery, alias) => `LEFT JOIN LATERAL (${subquery}) ${alias} ON true`;

const nowSql = "(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')";
const utcNowSql = "(now() AT TIME ZONE 'UTC')";
const vnTodaySql = "CAST(now() AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE)";

// Cùng giao diện với db.mssql.js; PG ≥ 18 cho `RETURNING old.x, new.x`.
/**
 * @param {string} update
 * @param {string} where
 * @param {Array<[string, string, string]>} cols
 */
const updateReturning = (update, where, cols) =>
	`${update} WHERE ${where} RETURNING ${cols.map(([e, n]) => `${e} AS ${n}`).join(', ')}`;

// Cùng giao diện với db.mssql.js: mỗi câu 1 lời gọi, cùng tham số của `req`. Trong
// transaction thì chạy lần lượt (1 kết nối); ngoài transaction chạy song song.
/**
 * @param {Request} req
 * @param {string[]} statements
 * @returns {Promise<any[][]>}
 */
const queryAll = async (req, statements) => {
	const run = (text) => {
		const r = new Request(req.parent);
		r.params = new Map(req.params);
		return r.query(text.replace(/;\s*$/, '')).then((x) => x.recordset ?? []);
	};
	if (!(req.parent instanceof Transaction)) return Promise.all(statements.map(run));
	const out = [];
	for (const s of statements) out.push(await run(s));
	return out;
};

module.exports = {
	client: 'pg',
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
	crossApply,
	outerApply,
	nowSql,
	utcNowSql,
	vnTodaySql,
	queryAll,
	updateReturning,
	sslOptions,
	toMssqlResult,
};
