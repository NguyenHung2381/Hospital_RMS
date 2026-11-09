#!/usr/bin/env bash
# Chuyển dữ liệu từ 1 file backup SQL Server (.bak) sang PostgreSQL, trên máy Ubuntu
# chạy Hospital RMS. Không cần cài SQL Server: script dựng 1 container SQL Server
# TẠM (không mở cổng ra ngoài, chỉ nằm trong mạng Docker của stack), restore file
# vào đó, chạy pg:transfer (restore → precheck → load → verify) trong container
# backend, xong thì xoá container tạm cùng bản sao file .bak.
#
#   backend/scripts/pg-transfer/transfer-from-bak.sh <file.bak> [bước] [--keep]
#
#   bước:   all (mặc định) | precheck (chỉ restore + precheck, không ghi PG)
#           | load | verify (chạy lại 1 bước trên container đã giữ bằng --keep)
#   --keep: giữ container tạm sau khi chạy (để chạy lại verify, xem dữ liệu nguồn).
#           Xoá tay: docker rm -f -v rms-mssql-restore
#
# Biến môi trường (tuỳ chọn):
#   PG_TARGET_PASSWORD    mật khẩu rms_migrate trên PostgreSQL (không đặt thì hỏi)
#   PG_TARGET_HOST        mặc định host.docker.internal (PostgreSQL trên chính máy này)
#   PG_TARGET_USER / PG_TARGET_DATABASE / PG_TRANSFER_PARALLEL — xem connect.js, load.js
#   MSSQL_IMAGE           mặc định mcr.microsoft.com/mssql/server:2025-latest — phải
#                         cùng hoặc mới hơn bản SQL Server đã tạo file .bak
#   MSSQL_PID             mặc định Express (miễn phí, DB tối đa 10 GB); DB lớn hơn: Developer
#   COMPOSE_PROJECT       mặc định hospital_rms; COMPOSE_FILE mặc định docker-compose.prod.yml
#
# Yêu cầu: Docker, stack đã `docker compose up` ít nhất 1 lần (có mạng Docker của
# project), image backend là bản có scripts/pg-transfer/restore.js, PostgreSQL đã
# cài theo infra/cai-dat-may-ao-ubuntu.md mục 6 (DB rms_hospital RỖNG). Máy cần
# ≥ 2 GB RAM trống cho SQL Server tạm và ổ trống ≈ 3 lần kích thước file .bak.
# Hướng dẫn đầy đủ: infra/chuyen-du-lieu-sang-postgresql.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PROJECT="${COMPOSE_PROJECT:-hospital_rms}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker-compose.prod.yml}"
NETWORK="${PROJECT}_default"
CONTAINER="rms-mssql-restore"
MSSQL_IMAGE="${MSSQL_IMAGE:-mcr.microsoft.com/mssql/server:2025-latest}"
MSSQL_PID="${MSSQL_PID:-Express}"
BAK_IN_CONTAINER="/var/opt/mssql/backup/source.bak"
# Mật khẩu sa của container tạm, chỉ để chạy lại bước sau khi --keep
PASS_FILE="${XDG_RUNTIME_DIR:-/tmp}/rms-mssql-restore.pass"

usage() {
	sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d; s/^# \{0,1\}//'
	exit 1
}

log() { printf '\n── %s\n' "$*"; }
die() {
	printf '❌ %s\n' "$*" >&2
	exit 1
}

BAK=""
STEP="all"
KEEP=0
for arg in "$@"; do
	case "$arg" in
	--keep) KEEP=1 ;;
	-h | --help) usage ;;
	all | precheck | load | verify) STEP="$arg" ;;
	*) [ -z "$BAK" ] && BAK="$arg" || usage ;;
	esac
done

command -v docker >/dev/null || die "Chưa cài Docker"
compose() { docker compose -p "$PROJECT" --project-directory "$ROOT" -f "$COMPOSE_FILE" "$@"; }
docker network inspect "$NETWORK" >/dev/null 2>&1 ||
	die "Chưa có mạng Docker $NETWORK — chạy stack 1 lần trước: docker compose -f docker-compose.prod.yml up -d redis"

running() { [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" = "true" ]; }

cleanup() {
	if [ "$KEEP" = 1 ]; then
		echo
		echo "Giữ container $CONTAINER (--keep). Xoá khi xong: docker rm -f -v $CONTAINER && rm -f $PASS_FILE"
		return
	fi
	if docker inspect "$CONTAINER" >/dev/null 2>&1; then
		log "Xoá SQL Server tạm ($CONTAINER) cùng bản sao file .bak"
		docker rm -f -v "$CONTAINER" >/dev/null
	fi
	rm -f "$PASS_FILE"
}

# ── Mật khẩu ──────────────────────────────────────────────────────────────────
if [ -z "${PG_TARGET_PASSWORD:-}" ]; then
	read -rsp "Mật khẩu ${PG_TARGET_USER:-rms_migrate} (PostgreSQL): " PG_TARGET_PASSWORD
	echo
fi
export PG_TARGET_PASSWORD

if [ "$STEP" = "load" ] || [ "$STEP" = "verify" ]; then
	# Chạy lại 1 bước trên container đã giữ
	running || die "Không thấy container $CONTAINER đang chạy — chạy lại từ đầu với file .bak (bước all / precheck)"
	[ -s "$PASS_FILE" ] || die "Không thấy $PASS_FILE (mật khẩu sa của container tạm)"
	MSSQL_SOURCE_PASSWORD="$(cat "$PASS_FILE")"
else
	[ -n "$BAK" ] || usage
	[ -f "$BAK" ] && [ -r "$BAK" ] || die "Không đọc được file $BAK"
	if docker inspect "$CONTAINER" >/dev/null 2>&1; then
		die "Đã có container $CONTAINER (lần chạy trước còn giữ) — xoá trước: docker rm -f -v $CONTAINER"
	fi
	# sa phải đủ phức tạp (hoa, thường, số, ký tự đặc biệt). Không in ra màn hình.
	MSSQL_SOURCE_PASSWORD="Rms#$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')A"
fi
export MSSQL_SOURCE_PASSWORD
trap cleanup EXIT

# Chạy pg:transfer trong image backend (cùng code với bản đang deploy). `-e TÊN`
# không kèm giá trị: lấy từ biến cùng tên của shell, mật khẩu không lộ trên `ps`.
transfer() {
	local extra=()
	[ -n "${PG_TRANSFER_PARALLEL:-}" ] && extra+=(-e PG_TRANSFER_PARALLEL)
	[ -n "${PG_TARGET_DATABASE:-}" ] && extra+=(-e PG_TARGET_DATABASE)
	compose run --rm --no-deps -T \
		-e MSSQL_SOURCE_HOST="$CONTAINER" -e MSSQL_SOURCE_PASSWORD \
		-e PG_TARGET_HOST="${PG_TARGET_HOST:-host.docker.internal}" \
		-e PG_TARGET_USER="${PG_TARGET_USER:-rms_migrate}" -e PG_TARGET_PASSWORD \
		"${extra[@]}" \
		backend node scripts/pg-transfer/index.js "$@"
}

if [ "$STEP" = "all" ] || [ "$STEP" = "precheck" ]; then
	# ── SQL Server tạm ─────────────────────────────────────────────────────────
	size_kb=$(du -k "$BAK" | cut -f1)
	docker_root="$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"
	free_kb=$(df -Pk "$docker_root" 2>/dev/null | awk 'NR == 2 { print $4 }')
	if [ -n "$free_kb" ] && [ "$free_kb" -lt $((size_kb * 3)) ]; then
		echo "⚠️  Ổ chứa $docker_root còn $((free_kb / 1024)) MB, nên có ≥ $((size_kb * 3 / 1024)) MB (≈ 3 × file .bak)"
	fi

	log "Dựng SQL Server tạm ($MSSQL_IMAGE, $MSSQL_PID) trong mạng $NETWORK"
	MSSQL_SA_PASSWORD="$MSSQL_SOURCE_PASSWORD" \
		docker run -d --name "$CONTAINER" --hostname "$CONTAINER" --network "$NETWORK" \
		-e ACCEPT_EULA=Y -e MSSQL_PID="$MSSQL_PID" -e MSSQL_SA_PASSWORD \
		--label rms.purpose=pg-transfer \
		"$MSSQL_IMAGE" >/dev/null
	if [ "$KEEP" = 1 ]; then
		(umask 077 && printf '%s' "$MSSQL_SOURCE_PASSWORD" >"$PASS_FILE")
	fi

	log "Copy $(basename "$BAK") ($((size_kb / 1024)) MB) vào container"
	docker exec -u 0 "$CONTAINER" mkdir -p "$(dirname "$BAK_IN_CONTAINER")"
	docker cp "$BAK" "$CONTAINER:$BAK_IN_CONTAINER"
	# SQL Server chạy bằng user mssql (uid 10001) — phải đọc được file
	docker exec -u 0 "$CONTAINER" chown 10001 "$BAK_IN_CONTAINER"

	log "Restore"
	transfer restore "$BAK_IN_CONTAINER"

	log "Precheck (chỉ đọc)"
	transfer precheck
fi

if [ "$STEP" = "all" ] || [ "$STEP" = "load" ]; then
	log "Load → PostgreSQL"
	transfer load
fi

if [ "$STEP" = "all" ] || [ "$STEP" = "verify" ]; then
	log "Verify"
	transfer verify
fi

log "Xong bước '$STEP'"
