#!/bin/sh
# Đảm bảo JWT_SECRET / JWT_REFRESH_SECRET luôn có giá trị thật trước khi chạy
# server — app.js chỉ kiểm tra "khác rỗng", nên giá trị mẫu "change-me…" từ
# .env.example vẫn lọt qua nếu không chặn ở đây.
#
#  - Có /app/.env (dev: bind mount ./backend): điền thẳng vào backend/.env nếu
#    còn trống/placeholder — dotenv trong app sẽ đọc file này.
#  - Không có (prod: biến lấy từ env_file): secret lưu ở volume
#    $JWT_SECRETS_FILE → giữ nguyên qua restart/redeploy, không đăng xuất
#    người dùng mỗi lần deploy. Đổi định kỳ: scripts/rotate-jwt-secrets.ps1.
set -e

SECRETS_FILE="${JWT_SECRETS_FILE:-/app/secrets/jwt.env}"

is_placeholder() {
	case "$1" in
		"" | change-me*) return 0 ;;
		*) return 1 ;;
	esac
}

# Lấy giá trị 1 key trong file .env
read_key() {
	sed -n "s/^$1=//p" "$SECRETS_FILE" | tail -n 1
}

if [ -f /app/.env ]; then
	node /app/scripts/gen-jwt-secrets.js --env /app/.env
elif is_placeholder "$JWT_SECRET" || is_placeholder "$JWT_REFRESH_SECRET"; then
	mkdir -p "$(dirname "$SECRETS_FILE")"
	node /app/scripts/gen-jwt-secrets.js --env "$SECRETS_FILE"
	# Chỉ thay biến còn thiếu — biến đã set thật qua env_file được giữ nguyên
	if is_placeholder "$JWT_SECRET"; then
		JWT_SECRET="$(read_key JWT_SECRET)"
		export JWT_SECRET
	fi
	if is_placeholder "$JWT_REFRESH_SECRET"; then
		JWT_REFRESH_SECRET="$(read_key JWT_REFRESH_SECRET)"
		export JWT_REFRESH_SECRET
	fi
fi

# Mật khẩu Redis do container redis tự sinh (docker-compose.prod.yml, volume
# redis_secret — chỉ root đọc được nên phải đọc ở đây, trước khi hạ quyền).
# Redis khởi động cùng lúc nên chờ file tối đa 15s; không có thì chạy tiếp —
# Redis chỉ là cache phụ, app tự đọc thẳng DB khi không kết nối được.
if [ -z "${REDIS_PASSWORD:-}" ] && [ -n "${REDIS_PASSWORD_FILE:-}" ]; then
	i=0
	while [ ! -s "$REDIS_PASSWORD_FILE" ] && [ "$i" -lt 15 ]; do
		sleep 1
		i=$((i + 1))
	done
	if [ -s "$REDIS_PASSWORD_FILE" ]; then
		REDIS_PASSWORD="$(cat "$REDIS_PASSWORD_FILE")"
		export REDIS_PASSWORD
	else
		echo "docker-entrypoint: không đọc được $REDIS_PASSWORD_FILE — chạy không có cache Redis" >&2
	fi
fi

# Production: chạy app bằng user thường `node` thay vì root — lỗ hổng trong app
# (RCE qua thư viện, upload...) không kéo theo quyền root trong container.
# Entrypoint vẫn khởi động bằng root để sửa quyền các volume dữ liệu: volume tạo
# từ các bản trước (uploads, logs, secrets) đang thuộc root, node không ghi được.
# Chỉ chown -R khi thư mục gốc chưa thuộc node (lần đầu nâng cấp) — uploads có
# thể rất lớn, không quét lại mỗi lần khởi động.
# Dev (bind mount ./backend từ máy host) giữ nguyên root để không vướng quyền file.
if [ "${NODE_ENV:-}" = "production" ] && [ "$(id -u)" = "0" ]; then
	for dir in /app/uploads /app/logs /app/secrets; do
		mkdir -p "$dir"
		if [ "$(stat -c %U "$dir")" != "node" ]; then
			echo "docker-entrypoint: chuyển quyền $dir cho user node"
			chown -R node:node "$dir"
		fi
	done
	# jwt.env có thể vừa được sinh (bằng root) ở bước trên
	chown -R node:node /app/secrets
	exec su-exec node "$@"
fi

exec "$@"
