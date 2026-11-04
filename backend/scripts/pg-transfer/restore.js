// pg:transfer restore <file.bak> [--replace] — nạp file backup SQL Server (.bak) vào
// SQL Server nguồn (thường là container tạm của transfer-from-bak.sh), để precheck /
// load / verify đọc từ đó. Đường dẫn file là đường dẫn TRÊN MÁY SQL Server (trong
// container: /var/opt/mssql/backup/...).
//   1. RESTORE HEADERONLY: lấy bản FULL mới nhất trong file; chặn backup mã hoá và
//      backup từ SQL Server mới hơn server đang chạy.
//   2. RESTORE FILELISTONLY → MOVE từng file vào thư mục dữ liệu mặc định.
//   3. RESTORE DATABASE ... WITH RECOVERY (in tiến độ 10%/lần).
//   4. Kiểm tra collation và phiên bản schema (sourceVersion.js).
// DB đã có thì dừng, trừ khi thêm --replace (ghi đè DB đó).
const { sourceConfig, openSource } = require('./connect');
const { sourceVersionProblem } = require('./sourceVersion');

const EXPECTED_COLLATION = 'SQL_Latin1_General_CP1_CI_AS';
const WAIT_MS = Number(process.env.MSSQL_SOURCE_WAIT_MS || 180000);

/** Hằng chuỗi T-SQL N'...' (đường dẫn, tên file logic lấy từ chính file backup). */
const lit = (s) => `N'${String(s).replace(/'/g, "''")}'`;

// RESTORE/BACKUP lỗi thì SQL Server trả lý do thật (không thấy file, không đủ chỗ…)
// ở các lỗi đứng trước; lỗi cuối chỉ là "... is terminating abnormally".
const withDetail = async (promise) => {
	try {
		return await promise;
	} catch (err) {
		const detail = (err.precedingErrors ?? []).map((e) => e.message).filter(Boolean);
		if (detail.length) err.message = `${detail.join(' ')} (${err.message})`;
		throw err;
	}
};

// SQL Server trong container vừa khởi động cần 10–60 giây mới nhận kết nối.
const connectMaster = async (log) => {
	const deadline = Date.now() + WAIT_MS;
	for (let i = 0; ; i++) {
		try {
			return await openSource({ database: 'master' });
		} catch (err) {
			if (Date.now() > deadline) throw err;
			if (i % 6 === 0) log(`  · chờ SQL Server nhận kết nối (${err.message})`);
			await new Promise((r) => setTimeout(r, 5000));
		}
	}
};

// Tên file đích: <db>_<FileId>.mdf / .ndf / .ldf (filestream, full-text: thư mục).
const targetPath = (db, f, dataDir, logDir) => {
	const id = Number(f.FileId);
	if (f.Type === 'L') return `${logDir}${db}_${id}.ldf`;
	if (f.Type === 'D') return `${dataDir}${db}_${id}.${id === 1 ? 'mdf' : 'ndf'}`;
	return `${dataDir}${db}_${id}`;
};

/**
 * @param {string} file đường dẫn .bak trên máy SQL Server
 * @param {{ replace?: boolean }} opts
 * @param {(m: string) => void} log
 */
const run = async (file, { replace = false } = {}, log) => {
	if (!file) throw new Error('Thiếu đường dẫn file .bak (trên máy SQL Server)');
	const db = sourceConfig().database;
	if (!/^\w+$/.test(db)) throw new Error(`Tên DB không hợp lệ: ${db}`);

	const master = await connectMaster(log);
	try {
		const q = async (text) => (await withDetail(master.request().query(text))).recordset;

		const [server] = await q(`SELECT CAST(SERVERPROPERTY('ProductMajorVersion') AS int) AS major,
			CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(64)) AS version,
			CAST(SERVERPROPERTY('Edition') AS nvarchar(128)) AS edition,
			CAST(SERVERPROPERTY('InstanceDefaultDataPath') AS nvarchar(512)) AS data_dir,
			CAST(SERVERPROPERTY('InstanceDefaultLogPath') AS nvarchar(512)) AS log_dir`);
		log(`SQL Server ${server.version} (${server.edition})`);

		// 1. Bản backup trong file
		const sets = await q(`RESTORE HEADERONLY FROM DISK = ${lit(file)}`);
		const full = sets.filter((s) => Number(s.BackupType) === 1);
		if (!full.length) {
			throw new Error(
				`File không có bản backup FULL (chỉ có ${sets.length} bản differential / log) — lấy bản BACKUP DATABASE ... COPY_ONLY đầy đủ`,
			);
		}
		const set = full.reduce((a, b) => (Number(b.Position) > Number(a.Position) ? b : a));
		log(
			`Backup: DB ${set.DatabaseName}, lúc ${new Date(set.BackupFinishDate).toISOString()}, ` +
				`SQL Server ${set.SoftwareVersionMajor}.x, bản ${set.Position}/${sets.length}` +
				(set.IsCopyOnly ? ', COPY_ONLY' : '') +
				(set.Compressed ? ', nén' : ''),
		);
		if (set.EncryptorThumbprint) {
			throw new Error(
				'Backup có mã hoá — phải tạo lại certificate / key mã hoá trên SQL Server tạm trước khi restore',
			);
		}
		if (Number(set.SoftwareVersionMajor) > Number(server.major)) {
			throw new Error(
				`Backup tạo từ SQL Server ${set.SoftwareVersionMajor}.x, mới hơn server tạm (${server.major}.x) — đổi MSSQL_IMAGE sang bản mới hơn`,
			);
		}

		const [exists] = await q(`SELECT DB_ID(${lit(db)}) AS id`);
		if (exists.id != null && !replace) {
			throw new Error(`Đã có DB ${db} trên server nguồn — thêm --replace để ghi đè`);
		}

		// 2. Vị trí file dữ liệu / log
		const files = await q(
			`RESTORE FILELISTONLY FROM DISK = ${lit(file)} WITH FILE = ${Number(set.Position)}`,
		);
		const dataDir = server.data_dir || '/var/opt/mssql/data/';
		const logDir = server.log_dir || dataDir;
		const moves = files.map(
			(f) => `MOVE ${lit(f.LogicalName)} TO ${lit(targetPath(db, f, dataDir, logDir))}`,
		);

		// 3. Restore
		log(`Restore → ${db} (${files.length} file)`);
		const started = Date.now();
		const req = master.request();
		req.on('info', (m) => {
			if (/percent processed|RESTORE DATABASE successfully/i.test(m.message))
				log(`  · ${m.message}`);
		});
		await withDetail(
			req.batch(
				`RESTORE DATABASE [${db}] FROM DISK = ${lit(file)} WITH FILE = ${Number(set.Position)}, ` +
					`${moves.join(', ')}, RECOVERY, STATS = 10${replace ? ', REPLACE' : ''}`,
			),
		);
		log(`  ✓ ${((Date.now() - started) / 1000).toFixed(1)}s`);

		const [coll] = await q(
			`SELECT CAST(DATABASEPROPERTYEX(${lit(db)}, 'Collation') AS varchar(128)) AS c`,
		);
		if (coll.c !== EXPECTED_COLLATION)
			log(`⚠️  Collation ${coll.c} (hệ thống dùng ${EXPECTED_COLLATION}) — precheck sẽ kiểm tiếp`);
	} finally {
		await master.close();
	}

	// 4. Phiên bản schema
	const pool = await openSource();
	try {
		const problem = await sourceVersionProblem(pool);
		if (problem) throw new Error(problem);
	} finally {
		await pool.close();
	}
	log('✅ Restore xong. Tiếp: npm run pg:transfer precheck');
};

module.exports = { run, targetPath, lit };
