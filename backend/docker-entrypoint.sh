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

exec "$@"
