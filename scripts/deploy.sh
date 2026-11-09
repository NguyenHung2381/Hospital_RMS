#!/usr/bin/env bash
# Triển khai (hoặc rollback) 1 phiên bản đã build sẵn trên CI lên server Ubuntu chạy Docker.
#
# .github/workflows/deploy.yml gọi script này trên self-hosted runner đặt tại server.
# GitHub sự cố thì chạy tay trên server với cùng tham số:
#
#   scripts/deploy.sh <commit sha 40 ký tự> [registry]
#   scripts/deploy.sh <sha bản cũ>                     # rollback tay
#
#   1. Ghi nhớ image đang chạy (để tự quay lại khi hỏng).
#   2. Kéo image backend/frontend tag = commit SHA từ registry (không build lại).
#   3. Có migration mới + đặt MIGRATION_BACKUP_DIR: pg_dump DB ra thư mục đó (trên
#      máy này). Chạy migration bằng image MỚI (backend/scripts/migrate.js). Lỗi →
#      dừng, bản cũ vẫn chạy.
#   4. docker compose up -d --no-build.
#   5. Smoke test: /health trả đúng version (GIT_SHA trong image), /health/db, trang chủ; theo dõi thêm
#      SOAK_SECONDS giây xem container có bị restart không.
#   6. Hỏng → quay lại image cũ. Migration KHÔNG tự hoàn tác: chỉ viết migration
#      tương thích ngược (thêm cột/bảng, không xoá/đổi tên ngay); cần thì
#      pg_restore từ file backup ở bước 3.
# Lịch sử triển khai ghi vào $DEPLOY_DIR/logs/deploy-history.log.
#
# Biến môi trường (đều tuỳ chọn):
#   REGISTRY            ghcr.io/<owner> (hoặc tham số thứ 2)
#   DEPLOY_DIR          thư mục chứa backend/.env, backend/.env.production, .env của
#                       compose trên server (mặc định: thư mục gốc repo này)
#   COMPOSE_PROJECT     GIỮ "hospital_rms" cho production — volume dữ liệu mang tiền tố này
#   BACKEND_URL         mặc định http://127.0.0.1:3001
#   FRONTEND_URL        mặc định http://127.0.0.1:8081
#   SOAK_SECONDS        mặc định 60
#   MIGRATION_DB_USER / MIGRATION_DB_PASSWORD
#                       role có quyền ALTER (rms_migrate), chỉ dùng cho bước migration
#                       và pg_dump. Trống: migration chạy bằng DB_USER trong backend/.env.
#   MIGRATION_BACKUP_DIR thư mục backup trước migration (pg_dump chạy trên máy này)
#   MIGRATION_DB_HOST / MIGRATION_DB_PORT / MIGRATION_DB_NAME
#                       nơi pg_dump kết nối (mặc định 127.0.0.1 / 5432 / rms_hospital)
set -euo pipefail

TAG="${1:-${TAG:-}}"
REGISTRY="${2:-${REGISTRY:-}}"
[[ "$TAG" =~ ^[0-9a-f]{40}$ ]] || {
	echo "Cách dùng: scripts/deploy.sh <commit sha 40 ký tự> [registry]" >&2
	exit 2
}
[ -n "$REGISTRY" ] || {
	echo "Thiếu registry (tham số thứ 2 hoặc biến REGISTRY), vd ghcr.io/<owner>" >&2
	exit 2
}

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-$REPO_DIR}"
PROJECT="${COMPOSE_PROJECT:-hospital_rms}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3001}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:8081}"
SOAK_SECONDS="${SOAK_SECONDS:-60}"
COMPOSE_FILE="$REPO_DIR/docker-compose.prod.yml"

compose() { docker compose -p "$PROJECT" --project-directory "$DEPLOY_DIR" -f "$COMPOSE_FILE" "$@"; }

container_id() { compose ps -q "$1" 2>/dev/null | head -n 1; }

running_image() {
	local id
	id="$(container_id "$1")"
	[ -n "$id" ] && docker inspect --format '{{.Config.Image}}' "$id" || true
}

restart_counts() {
	local out="" s id
	for s in backend frontend; do
		id="$(container_id "$s")"
		out+="$( [ -n "$id" ] && docker inspect --format '{{.RestartCount}}' "$id" || echo -)",
	done
	echo "$out"
}

# In mô tả lỗi khi chưa khoẻ; không in gì (exit 0) khi khoẻ
health_error() {
	local expect="$1" body version
	if ! body="$(curl -fsS --max-time 5 "$BACKEND_URL/health" 2>&1)"; then
		echo "backend /health: $body"
		return 1
	fi
	if [ -n "$expect" ]; then
		version="$(printf '%s' "$body" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
		if [ "$version" != "$expect" ]; then
			echo "backend đang chạy version '$version', chờ '$expect'"
			return 1
		fi
	fi
	curl -fsS --max-time 15 -o /dev/null "$BACKEND_URL/health/db" 2>&1 || {
		echo "backend /health/db lỗi"
		return 1
	}
	curl -fsS --max-time 5 -o /dev/null "$FRONTEND_URL" 2>&1 || {
		echo "frontend $FRONTEND_URL lỗi"
		return 1
	}
}

# In mô tả lỗi nếu hỏng sau timeout; khoẻ thì không in gì
wait_healthy() {
	local expect="$1" timeout="${2:-180}" deadline err before after
	deadline=$((SECONDS + timeout))
	while :; do
		sleep 5
		if err="$(health_error "$expect")"; then break; fi
		if [ "$SECONDS" -ge "$deadline" ]; then
			echo "Smoke test hỏng sau $timeout giây: $err"
			return 1
		fi
	done
	# Khởi động được nhưng crash-loop (vd lỗi lúc chạy job nền) → bắt ở đây
	before="$(restart_counts)"
	sleep "$SOAK_SECONDS"
	after="$(restart_counts)"
	if [ "$before" != "$after" ]; then
		echo "Container restart trong lúc theo dõi ($before → $after)"
		return 1
	fi
	health_error "$expect" || return 1
}

write_history() {
	local status="$1" note="$2" actor
	mkdir -p "$DEPLOY_DIR/logs"
	if [ -n "${GITHUB_ACTOR:-}" ]; then actor="$GITHUB_ACTOR (run ${GITHUB_RUN_ID:-?})"; else actor="${USER:-?}"; fi
	printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$(date +%Y-%m-%dT%H:%M:%S)" "$PROJECT" "$status" "$TAG" "$actor" "$note" \
		>>"$DEPLOY_DIR/logs/deploy-history.log"
	if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
		printf '### Deploy `%s` — %s\n- Commit: `%s`\n- Bản trước: `%s`\n\n' "$PROJECT" "$status" "$TAG" "$note" \
			>>"$GITHUB_STEP_SUMMARY"
	fi
}

# Mật khẩu role migration: MIGRATION_DB_PASSWORD → PGPASSWORD → ~/.pgpass (như backup_db /
# pg_dump và setup-server.sh). Container không đọc được ~/.pgpass nên phải tự lấy ra ở đây.
migration_password() {
	local user="$1" host="${MIGRATION_DB_HOST:-127.0.0.1}" port="${MIGRATION_DB_PORT:-5432}"
	if [ -n "${MIGRATION_DB_PASSWORD:-}" ]; then
		printf '%s' "$MIGRATION_DB_PASSWORD"
	elif [ -n "${PGPASSWORD:-}" ]; then
		printf '%s' "$PGPASSWORD"
	elif [ -f ~/.pgpass ]; then
		awk -F: -v h="$host" -v p="$port" -v u="$user" 			'($1 == h || $1 == "*") && ($2 == p || $2 == "*") && $4 == u { print $5; exit }' ~/.pgpass
	fi
}

# Chạy lệnh migrate trong image mới, LUÔN bằng role migration (mặc định rms_migrate, như
# backup_db). Không rơi về DB_USER của app (rms_app): role đó không có quyền CREATE trên
# schema public nên migrate hỏng ở "permission denied for schema public" — đúng lúc đã
# backup xong và có migration chờ chạy.
migrate() {
	local user="${MIGRATION_DB_USER:-rms_migrate}" pw
	pw="$(migration_password "$user")"
	if [ -z "$pw" ]; then
		echo "Không có mật khẩu cho role migration '$user': đặt secret MIGRATION_DB_PASSWORD hoặc thêm dòng" 			"${MIGRATION_DB_HOST:-127.0.0.1}:${MIGRATION_DB_PORT:-5432}:*:$user:<mật khẩu> vào ~/.pgpass của user chạy runner" >&2
		return 1
	fi
	DB_USER="$user" DB_PASSWORD="$pw" 		compose run --rm --no-deps -T -e DB_USER -e DB_PASSWORD backend node scripts/migrate.js "$@"
}

backup_db() {
	local dir="$MIGRATION_BACKUP_DIR" file
	command -v pg_dump >/dev/null || {
		echo "MIGRATION_BACKUP_DIR đã đặt nhưng máy này không có pg_dump (apt install postgresql-client-18)" >&2
		return 1
	}
	mkdir -p "$dir"
	file="$dir/${MIGRATION_DB_NAME:-rms_hospital}_premigrate_$(date +%Y%m%d_%H%M%S)_${TAG:0:8}.dump"
	echo "Backup (pg_dump) → $file"
	(
		umask 077
		PGPASSWORD="${MIGRATION_DB_PASSWORD:-${PGPASSWORD:-}}" pg_dump -Fc \
			-h "${MIGRATION_DB_HOST:-127.0.0.1}" -p "${MIGRATION_DB_PORT:-5432}" \
			-U "${MIGRATION_DB_USER:-rms_migrate}" -d "${MIGRATION_DB_NAME:-rms_hospital}" -f "$file"
	)
}

# Gắn tên image mặc định của compose (hospital_rms-backend / -frontend, khi không đặt
# BACKEND_IMAGE / FRONTEND_IMAGE) cho bản đang chạy. Lệnh compose chạy tay hoặc theo
# lịch (rotate-jwt-secrets.sh: up -d --force-recreate, setup-server.sh start) không
# biết tag CI — thiếu bước này chúng tạo lại container từ image build tay cũ trên máy.
pin_default_tags() {
	docker tag "$BACKEND_IMAGE" hospital_rms-backend:latest &&
		docker tag "$FRONTEND_IMAGE" hospital_rms-frontend:latest ||
		echo "::warning::Không gắn được tag mặc định — lệnh compose chạy tay có thể dùng image cũ" >&2
}

prev_backend="$(running_image backend)"
prev_frontend="$(running_image frontend)"
echo "Bản đang chạy: ${prev_backend:-không có} | ${prev_frontend:-không có}"

registry_lc="$(printf '%s' "$REGISTRY" | tr '[:upper:]' '[:lower:]')"
export BACKEND_IMAGE="$registry_lc/hospital_rms-backend:$TAG"
export FRONTEND_IMAGE="$registry_lc/hospital_rms-frontend:$TAG"

echo "── Kéo image $TAG"
for i in 1 2 3; do
	if compose pull backend frontend; then break; fi
	[ "$i" -lt 3 ] || exit 1
	echo "Thử lại ($i)..."
	sleep 15
done

# Version /health phải trả = GIT_SHA nhúng trong image backend. Thường bằng $TAG;
# khác khi backend không đổi ở commit này và CI chỉ gắn thêm tag cho image của
# commit trước (build-image.yml) — khi đó GIT_SHA là commit build gốc.
expect_version="$(docker image inspect "$BACKEND_IMAGE" \
	--format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^GIT_SHA=//p')"
expect_version="${expect_version:-$TAG}"
[ "$expect_version" = "$TAG" ] || echo "Backend không đổi ở $TAG — image build từ commit $expect_version"

echo "── Migration DB"
if ! status="$(migrate status)"; then
	printf '%s\n' "$status"
	write_history FAILED-MIGRATION "${prev_backend:-}"
	exit 1
fi
printf '%s\n' "$status"
if printf '%s' "$status" | grep -q '^Chờ chạy:'; then
	if [ -n "${MIGRATION_BACKUP_DIR:-}" ] && ! backup_db; then
		write_history FAILED-BACKUP "${prev_backend:-}"
		exit 1
	fi
	if ! migrate; then
		write_history FAILED-MIGRATION "${prev_backend:-}"
		exit 1
	fi
fi
unset DB_USER DB_PASSWORD

echo "── Khởi động bản mới"
compose up -d --no-build backend frontend
if err="$(wait_healthy "$expect_version")"; then
	pin_default_tags
	write_history OK "${prev_backend:-}"
	echo "Triển khai thành công $TAG"
	exit 0
fi

echo "::error::$err"
compose logs --tail 100 backend || true
if [ -z "$prev_backend" ] || [ -z "$prev_frontend" ]; then
	write_history FAILED 'không có bản cũ để quay lại'
	exit 1
fi
echo "── Quay lại bản cũ: $prev_backend"
export BACKEND_IMAGE="$prev_backend" FRONTEND_IMAGE="$prev_frontend"
compose up -d --no-build backend frontend
note="$prev_backend"
if ! rollback_err="$(wait_healthy "")"; then
	note+=" — bản cũ cũng lỗi: $rollback_err"
else
	pin_default_tags
fi
write_history ROLLED-BACK "$note"
echo "Bản $TAG hỏng, đã quay lại $prev_backend. Lỗi: $err" >&2
exit 1
