-- 00_extensions — chạy ĐẦU TIÊN trên DB PostgreSQL rỗng (viết tay, không sinh).
-- DB phải được tạo theo infra/postgresql/01_tao_db_va_role.sql (UTF-8, locale
-- builtin C.UTF-8, múi giờ Asia/Ho_Chi_Minh). Chạy bằng role rms_migrate.
-- Thứ tự chạy: 00_extensions → 01_tables → nạp dữ liệu → 02_constraints_indexes
-- → 03_toi_uu → 04_trigger (npm run pg:transfer load làm đúng thứ tự này).
SET client_min_messages = warning;

-- Kiểm tra DB tạo đúng cách: sai locale / thiếu ICU thì dừng ngay, không tạo
-- schema lệch (sắp xếp tên tiếng Việt sai, LIKE không dùng được index).
DO $$
BEGIN
	IF pg_encoding_to_char((SELECT encoding FROM pg_database WHERE datname = current_database())) <> 'UTF8' THEN
		RAISE EXCEPTION 'DB phải dùng encoding UTF8 (xem infra/postgresql/01_tao_db_va_role.sql)';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'vi-VN-x-icu') THEN
		RAISE EXCEPTION 'PostgreSQL thiếu collation ICU vi-VN-x-icu (bản cài không có ICU)';
	END IF;
	IF (SELECT datlocprovider FROM pg_database WHERE datname = current_database()) <> 'b' THEN
		RAISE WARNING 'DB không dùng locale builtin C.UTF-8 — sắp xếp/so sánh mã sẽ chậm hơn dự kiến';
	END IF;
	IF current_setting('server_version_num')::int < 180000 THEN
		RAISE EXCEPTION 'Cần PostgreSQL ≥ 18 (LIKE trên collation rms_ci không phân biệt hoa thường)';
	END IF;
END $$;

-- rms_ci: cột username/email/code so sánh / UNIQUE / LIKE không phân biệt hoa
-- thường, phân biệt dấu (như SQL Server *_CI_AS). ICU "und-u-ks-level2", không
-- tất định. Thay cho citext: với citext, tham số kiểu text làm phép so sánh
-- thành phân biệt hoa thường (scripts/pg/schemaRules.js).
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'rms_ci') THEN
		CREATE COLLATION rms_ci (provider = icu, locale = 'und-u-ks-level2', deterministic = false);
	END IF;
END $$;

-- pg_trgm: index cho tìm kiếm chứa chuỗi LIKE/ILIKE '%...%' (03_toi_uu.sql)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- unaccent: chỉ dùng nếu bật tìm không dấu ("nguyen" khớp "Nguyễn") — DB_SCALING_PLAN.md mục 4.3
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Partition theo tháng cho bảng ghi theo thời gian (security_events).
-- Tạo partition <bảng>_YYYY_MM từ (tháng này - p_months_back) tới
-- (tháng này + p_months_ahead); nếu p_keep_months khác NULL thì DROP partition
-- có mốc cuối cũ hơn (tháng này - p_keep_months). Chạy lại an toàn.
-- Job Node gọi hằng ngày khi chạy trên PG: (bảng, 0, 2, SECURITY_EVENTS_RETENTION_MONTHS).
-- SECURITY DEFINER: chạy với quyền chủ hàm (rms_migrate, chủ các bảng), vì
-- role ứng dụng rms_app không được tạo/xoá bảng. Chỉ nhận bảng đã chia partition.
CREATE OR REPLACE FUNCTION rms_maintain_monthly_partitions(
	p_table text, p_months_back int, p_months_ahead int, p_keep_months int
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
	this_month date := date_trunc('month', LOCALTIMESTAMP)::date;
	m date;
	m_next date;
	pname text;
	parent oid;
	key_col text;
	default_part text;
	has_rows boolean;
	part record;
	part_month date;
BEGIN
	SELECT c.oid, substring(pg_get_partkeydef(c.oid) FROM '^RANGE \((\w+)\)$')
	INTO parent, key_col
	FROM pg_partitioned_table pt JOIN pg_class c ON c.oid = pt.partrelid
	WHERE c.relname = p_table AND c.relnamespace = 'public'::regnamespace;
	IF parent IS NULL THEN
		RAISE EXCEPTION 'Bảng % không chia partition', p_table;
	END IF;
	IF key_col IS NULL THEN
		RAISE EXCEPTION 'Bảng % không chia partition RANGE theo 1 cột', p_table;
	END IF;
	IF p_keep_months IS NOT NULL AND p_keep_months < 12 THEN
		RAISE EXCEPTION 'p_keep_months tối thiểu 12 (xem dataRetentionJob.js)';
	END IF;
	SELECT c.relname INTO default_part
	FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
	WHERE i.inhparent = parent AND pg_get_expr(c.relpartbound, c.oid) = 'DEFAULT';

	FOR i IN -p_months_back .. p_months_ahead LOOP
		m := (this_month + make_interval(months => i))::date;
		m_next := (m + interval '1 month')::date;
		pname := p_table || '_' || to_char(m, 'YYYY_MM');
		CONTINUE WHEN to_regclass(pname) IS NOT NULL;
		has_rows := false;
		IF default_part IS NOT NULL THEN
			EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE %I >= %L AND %I < %L)',
				default_part, key_col, m, key_col, m_next) INTO has_rows;
		END IF;
		IF NOT has_rows THEN
			EXECUTE format('CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
				pname, p_table, m, m_next);
		ELSE
			-- Partition DEFAULT đã có dòng của tháng này (job ngừng chạy một thời
			-- gian): tạo bảng riêng, chuyển dòng sang, rồi gắn làm partition —
			-- tạo thẳng PARTITION OF sẽ lỗi vì DEFAULT vi phạm ràng buộc mới.
			EXECUTE format('CREATE TABLE %I (LIKE %I INCLUDING DEFAULTS INCLUDING CONSTRAINTS)', pname, p_table);
			EXECUTE format(
				'WITH moved AS (DELETE FROM %I WHERE %I >= %L AND %I < %L RETURNING *) INSERT INTO %I SELECT * FROM moved',
				default_part, key_col, m, key_col, m_next, pname);
			EXECUTE format('ALTER TABLE %I ATTACH PARTITION %I FOR VALUES FROM (%L) TO (%L)',
				p_table, pname, m, m_next);
			RAISE NOTICE 'Đã chuyển dòng từ % sang partition mới %', default_part, pname;
		END IF;
	END LOOP;

	IF p_keep_months IS NOT NULL THEN
		FOR part IN
			SELECT c.relname
			FROM pg_inherits i
			JOIN pg_class c ON c.oid = i.inhrelid
			JOIN pg_class p ON p.oid = i.inhparent
			WHERE p.relname = p_table AND c.relname ~ ('^' || p_table || '_\d{4}_\d{2}$')
		LOOP
			part_month := to_date(right(part.relname, 7), 'YYYY_MM');
			IF part_month + interval '1 month' <= this_month - make_interval(months => p_keep_months) THEN
				EXECUTE format('DROP TABLE %I', part.relname);
				RAISE NOTICE 'Đã xoá partition %', part.relname;
			END IF;
		END LOOP;
	END IF;
END $$;

REVOKE ALL ON FUNCTION rms_maintain_monthly_partitions(text, int, int, int) FROM PUBLIC;
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rms_app') THEN
		GRANT EXECUTE ON FUNCTION rms_maintain_monthly_partitions(text, int, int, int) TO rms_app;
	END IF;
END $$;
