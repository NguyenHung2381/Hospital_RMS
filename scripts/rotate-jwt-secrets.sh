#!/usr/bin/env bash
# Đổi JWT_SECRET + JWT_REFRESH_SECRET rồi tạo lại container backend (Docker).
#
# Secret nằm ở 1 trong 2 nơi (giống backend/docker-entrypoint.sh):
#   - backend/.env.production hoặc backend/.env đã có JWT_SECRET thật
#       → ghi đè trong file đó (backup <file>.bak)
#   - ngược lại → ghi đè trong volume server_secrets (/app/secrets/jwt.env)
# Sau đó tạo lại container backend để nạp secret mới.
#
# LƯU Ý: mỗi lần đổi, mọi phiên đăng nhập bị đăng xuất; link upload cũ mất hiệu
# lực nếu không đặt UPLOAD_URL_SECRET. Vì vậy lịch mặc định là 4 tuần/lần, 02:30
# sáng Chủ nhật.
#
#   scripts/rotate-jwt-secrets.sh                          # đổi ngay (compose prod)
#   scripts/rotate-jwt-secrets.sh --compose-file docker-compose.yml   # compose dev
#   scripts/rotate-jwt-secrets.sh --register               # đăng ký lịch mặc định (crontab)
#   scripts/rotate-jwt-secrets.sh --register --every-weeks 1 --day 6 --at 03:00
#                                                          # (day: 0 = Chủ nhật … 6 = thứ Bảy)
#   scripts/rotate-jwt-secrets.sh --unregister             # gỡ lịch
#
# Lịch chạy bằng crontab của user hiện tại (user phải chạy được `docker`, tức
# thuộc nhóm docker). cron chạy mỗi tuần đúng thứ/giờ đã chọn; script tự bỏ qua
# khi lần đổi trước chưa đủ --every-weeks tuần (mốc lưu ở logs/.jwt-rotated-at).
# Log: logs/jwt-rotate.log
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SELF="$ROOT/scripts/$(basename "${BASH_SOURCE[0]}")"
COMPOSE_FILE="docker-compose.prod.yml"
MODE="rotate"
EVERY_WEEKS=4
DAY=0
AT="02:30"
SCHEDULED_WEEKS=""
LOG_DIR="$ROOT/logs"
LOG_FILE="$LOG_DIR/jwt-rotate.log"
STAMP_FILE="$LOG_DIR/.jwt-rotated-at"
CRON_TAG="# Hospital_RMS rotate-jwt-secrets"

usage() {
	sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d; s/^# \{0,1\}//'
	exit "${1:-1}"
}

while [ $# -gt 0 ]; do
	case "$1" in
	--compose-file) COMPOSE_FILE="${2:?}"; shift ;;
	--register) MODE="register" ;;
	--unregister) MODE="unregister" ;;
	--every-weeks) EVERY_WEEKS="${2:?}"; shift ;;
	--day) DAY="${2:?}"; shift ;;
	--at) AT="${2:?}"; shift ;;
	--scheduled) SCHEDULED_WEEKS="${2:?}"; shift ;;
	-h | --help) usage 0 ;;
	*) usage ;;
	esac
	shift
done

case "$COMPOSE_FILE" in
/*) COMPOSE_PATH="$COMPOSE_FILE" ;;
*) COMPOSE_PATH="$ROOT/$COMPOSE_FILE" ;;
esac

log() {
	mkdir -p "$LOG_DIR"
	printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"
}

# ── Gỡ / đăng ký lịch (crontab) ─────────────────────────────────────────────
current_crontab() { crontab -l 2>/dev/null | grep -vF "$CRON_TAG" || true; }

if [ "$MODE" = "unregister" ]; then
	current_crontab | crontab -
	echo "Đã gỡ lịch đổi JWT secret khỏi crontab của $(id -un)."
	exit 0
fi

if [ "$MODE" = "register" ]; then
	[[ "$EVERY_WEEKS" =~ ^[0-9]+$ ]] && [ "$EVERY_WEEKS" -ge 1 ] && [ "$EVERY_WEEKS" -le 52 ] ||
		{ echo "--every-weeks phải từ 1 đến 52" >&2; exit 2; }
	[[ "$DAY" =~ ^[0-6]$ ]] || { echo "--day phải từ 0 (Chủ nhật) đến 6 (thứ Bảy)" >&2; exit 2; }
	[[ "$AT" =~ ^([01]?[0-9]|2[0-3]):([0-5][0-9])$ ]] || { echo "--at dạng HH:MM" >&2; exit 2; }
	hour=$((10#${BASH_REMATCH[1]}))
	minute=$((10#${BASH_REMATCH[2]}))
	line="$minute $hour * * $DAY \"$SELF\" --compose-file \"$COMPOSE_FILE\" --scheduled $EVERY_WEEKS >/dev/null 2>&1 $CRON_TAG"
	{ current_crontab; echo "$line"; } | crontab -
	echo "Đã đăng ký: $EVERY_WEEKS tuần/lần, thứ $DAY (0 = Chủ nhật) lúc $AT ($COMPOSE_FILE), crontab của $(id -un)."
	echo "Log: $LOG_FILE"
	exit 0
fi

# ── Đổi secret ─────────────────────────────────────────────────────────────
# cron gọi mỗi tuần → bỏ qua khi chưa tới hạn (chừa 1 ngày cho lệch giờ)
if [ -n "$SCHEDULED_WEEKS" ] && [ -s "$STAMP_FILE" ]; then
	last="$(cat "$STAMP_FILE")"
	if [[ "$last" =~ ^[0-9]+$ ]] && [ $(($(date +%s) - last)) -lt $((SCHEDULED_WEEKS * 7 * 86400 - 86400)) ]; then
		exit 0
	fi
fi

compose() { docker compose --project-directory "$ROOT" -f "$COMPOSE_PATH" "$@"; }

# Giá trị cuối cùng của KEY trong file .env (bỏ nháy)
env_value() {
	[ -f "$1" ] || return 0
	sed -n "s/^[[:space:]]*$2[[:space:]]*=[[:space:]]*//p" "$1" | tail -n 1 |
		sed "s/[[:space:]]*\$//; s/^[\"']//; s/[\"']\$//"
}

fail() {
	log "LỖI: $*"
	exit 1
}

log "Bắt đầu đổi JWT secret ($COMPOSE_FILE)"
[ -f "$COMPOSE_PATH" ] || fail "Không thấy $COMPOSE_PATH"
docker info --format '{{.ServerVersion}}' >/dev/null 2>&1 ||
	fail "Không gọi được Docker (dịch vụ docker chưa chạy, hoặc user $(id -un) chưa thuộc nhóm docker)"

# Cả 2 file compose đều đặt tên service API là "backend"
SERVICE="backend"
compose config --services 2>/dev/null | grep -qx "$SERVICE" ||
	fail "Không thấy service '$SERVICE' trong $COMPOSE_FILE"

# Tìm nơi đang giữ secret thật, theo đúng thứ tự ưu tiên khi nạp: ở prod
# .env.production ghi đè .env, nên đổi ở .env khi .env.production có secret thật
# sẽ không có tác dụng. Chỉ bản prod nạp .env.production (env_file).
candidates=(.env)
case "$(basename "$COMPOSE_PATH")" in *prod*) candidates=(.env.production .env) ;; esac
env_name=""
for name in "${candidates[@]}"; do
	value="$(env_value "$ROOT/backend/$name" JWT_SECRET)"
	if [ -n "$value" ] && [[ ! "$value" =~ ^[Cc][Hh][Aa][Nn][Gg][Ee]-[Mm][Ee] ]]; then
		env_name="$name"
		break
	fi
done

# Chạy script trong image backend (máy host không cần Node). --entrypoint node bỏ
# qua entrypoint (không hạ quyền) → tự chọn user: file trên host thì chạy bằng
# chủ file (giữ quyền sở hữu), volume thì bằng user node như app.
if [ -n "$env_name" ]; then
	file="$ROOT/backend/$env_name"
	log "Secret nằm trong backend/$env_name → ghi đè file này (backup backend/$env_name.bak)"
	compose run --rm --no-deps -T --entrypoint node --user "$(stat -c '%u:%g' "$file")" \
		-v "$ROOT/backend:/w" "$SERVICE" \
		/app/scripts/gen-jwt-secrets.js --env "/w/$env_name" --force 2>&1 | tee -a "$LOG_FILE" ||
		fail "Sinh secret lỗi"
else
	log "Secret nằm trong volume server_secrets → ghi đè /app/secrets/jwt.env"
	compose run --rm --no-deps -T --entrypoint node --user node "$SERVICE" \
		/app/scripts/gen-jwt-secrets.js --env /app/secrets/jwt.env --force 2>&1 | tee -a "$LOG_FILE" ||
		fail "Sinh secret lỗi"
fi

# Tạo lại container: env_file được đọc lại, entrypoint nạp secret mới
compose up -d --force-recreate --no-deps "$SERVICE" 2>&1 | tee -a "$LOG_FILE" ||
	fail "Tạo lại container $SERVICE lỗi"
date +%s >"$STAMP_FILE"
log "Hoàn tất — mọi phiên đăng nhập cũ đã hết hiệu lực."
