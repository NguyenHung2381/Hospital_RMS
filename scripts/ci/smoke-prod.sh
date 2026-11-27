#!/usr/bin/env bash
# Chạy thử BẢN PRODUCTION thật trước khi image lên GHCR: image prod của backend +
# frontend, docker-compose.prod.yml, scripts/deploy.sh, PostgreSQL có SSL — giống
# server, chỉ khác là mọi thứ nằm trên 1 máy và dùng 1 lần.
#
#   BACKEND_SRC_IMAGE=... FRONTEND_SRC_IMAGE=... SHA=<40 hex> scripts/ci/smoke-prod.sh
#
# Image nguồn phải là target prod, build với --build-arg GIT_SHA=$SHA. Bắt các lỗi chỉ
# lộ ra lúc deploy / lúc chạy:
#   - image build được nhưng không khởi động (thiếu file vì .dockerignore, thiếu
#     thư viện hệ thống, sai biến môi trường production, sai quyền thư mục...);
#   - docker-compose.prod.yml hỏng (healthcheck, mem_limit quá thấp, volume, nginx
#     không resolve được upstream backend);
#   - migration không chạy được bằng image prod + role rms_migrate qua SSL;
#   - scripts/deploy.sh hỏng ở đường chính VÀ đường tự rollback (deploy 1 bản cố
#     tình hỏng, phải quay lại bản trước và vẫn phục vụ được);
#   - nginx: trang SPA, file JS/CSS thật (không trả index.html thay cho JS thiếu →
#     trang trắng), link sâu, proxy /api, header bảo mật (CSP, nosniff, X-Frame-Options);
#   - trình duyệt thật: các trang công khai render được, không lỗi JS / CSP / thiếu chunk;
#   - API: route cần đăng nhập trả 401, không lộ X-Powered-By / Swagger, tiến trình
#     chạy bằng user node (không phải root).
#
# Cổng (đổi khi máy đã dùng cổng mặc định): PG_PORT=55432 REG_PORT=5055
# BACKEND_PORT=13001 FRONTEND_PORT=18081 CDP_PORT=19222. Cần: docker (+ compose), curl.
set -euo pipefail

: "${BACKEND_SRC_IMAGE:?thiếu BACKEND_SRC_IMAGE}" "${FRONTEND_SRC_IMAGE:?thiếu FRONTEND_SRC_IMAGE}"
[[ "${SHA:-}" =~ ^[0-9a-f]{40}$ ]] || { echo "SHA phải là commit SHA 40 ký tự" >&2; exit 2; }

PG_PORT="${PG_PORT:-55432}"
REG_PORT="${REG_PORT:-5055}"
BACKEND_PORT="${BACKEND_PORT:-13001}"
FRONTEND_PORT="${FRONTEND_PORT:-18081}"
PROJECT="rms_smoke"
PG="rms-smoke-pg"
REG_CT="rms-smoke-registry"
REGISTRY="localhost:$REG_PORT/rms-smoke"
BAD_SHA="deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
BACKEND_URL="http://127.0.0.1:$BACKEND_PORT"
FRONTEND_URL="http://127.0.0.1:$FRONTEND_PORT"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
DEPLOY_DIR="$WORK/deploy"
REGISTRY_IMAGE="${REGISTRY_IMAGE:-registry:3.0.0@sha256:6c5666b861f3505b116bb9aa9b25175e71210414bd010d92035ff64018f9457e}"
PG_IMAGE="${PG_IMAGE:-postgres:18}"
CHROME="rms-smoke-chrome"
CHROME_IMAGE="${CHROME_IMAGE:-chromedp/headless-shell:159.0.8154.13@sha256:381353d3530ab9d579d2fe8b9c0f4519c995617f5a71daf6bb649e2d12005bd9}"
CDP_PORT="${CDP_PORT:-19222}"
# Trang công khai (không cần đăng nhập) + /admin (phải chuyển về trang đăng nhập, không lỗi)
BROWSER_PATHS=(/ /login /dang-ky-de-tai /de-xuat-de-tai /dang-ky-khoa-hoc /tra-cuu-ket-qua /thu-vien-de-tai /admin)

errors=()
step() { printf '\n── %s\n' "$*"; }
fail() { errors+=("$*"); echo "LỖI: $*" >&2; }
summary() { [ -n "${GITHUB_STEP_SUMMARY:-}" ] && printf '%s\n' "$*" >>"$GITHUB_STEP_SUMMARY" || true; }
compose() { docker compose -p "$PROJECT" --project-directory "$DEPLOY_DIR" -f "$REPO_DIR/docker-compose.prod.yml" "$@"; }

cleanup() {
	local code=$?
	if [ "$code" -ne 0 ] || [ "${#errors[@]}" -gt 0 ]; then
		echo "── Log backend (100 dòng cuối)"
		compose logs --tail 100 backend 2>/dev/null || true
		echo "── Log frontend (30 dòng cuối)"
		compose logs --tail 30 frontend 2>/dev/null || true
	fi
	compose down -v --remove-orphans >/dev/null 2>&1 || true
	docker rm -f "$PG" "$REG_CT" "$CHROME" >/dev/null 2>&1 || true
	rm -rf "$WORK"
}
trap cleanup EXIT

rand() { head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
SU_PW="$(rand)" MIG_PW="$(rand)" APP_PW="$(rand)"

step "Registry tạm + đẩy image (deploy.sh kéo image từ registry như trên server)"
docker rm -f "$PG" "$REG_CT" >/dev/null 2>&1 || true
docker run -d --name "$REG_CT" -p "127.0.0.1:$REG_PORT:5000" "$REGISTRY_IMAGE" >/dev/null
for i in $(seq 1 30); do curl -fsS "http://127.0.0.1:$REG_PORT/v2/" >/dev/null 2>&1 && break; sleep 1; done
docker tag "$BACKEND_SRC_IMAGE" "$REGISTRY/hospital_rms-backend:$SHA"
docker tag "$FRONTEND_SRC_IMAGE" "$REGISTRY/hospital_rms-frontend:$SHA"
# Bản cố tình hỏng: migrate vẫn chạy được (lệnh riêng), nhưng server thoát ngay khi khởi động
printf 'FROM %s\nCMD ["node", "-e", "console.error(\\"smoke: ban hong co chu dich\\"); process.exit(1)"]\n' \
	"$BACKEND_SRC_IMAGE" | docker build -q -t "$REGISTRY/hospital_rms-backend:$BAD_SHA" - >/dev/null
docker tag "$FRONTEND_SRC_IMAGE" "$REGISTRY/hospital_rms-frontend:$BAD_SHA"
for tag in "$SHA" "$BAD_SHA"; do
	for app in backend frontend; do docker push -q "$REGISTRY/hospital_rms-$app:$tag" >/dev/null; done
done

step "PostgreSQL có SSL (chứng chỉ tự ký, như DB_ENCRYPT=true trên production)"
# Cổng mở 0.0.0.0: container backend tới DB qua host.docker.internal (host-gateway) như trên server
docker run -d --name "$PG" -p "$PG_PORT:5432" -e POSTGRES_PASSWORD="$SU_PW" "$PG_IMAGE" bash -c '
	set -e
	mkdir -p /certs
	openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=rms-smoke \
		-keyout /certs/server.key -out /certs/server.crt 2>/dev/null
	chown postgres:postgres /certs/server.key /certs/server.crt
	chmod 600 /certs/server.key
	exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/certs/server.crt -c ssl_key_file=/certs/server.key
' >/dev/null
# Lúc khởi tạo, server tạm chỉ nghe socket — chờ tới khi nghe TCP
for i in $(seq 1 60); do
	docker exec -e PGPASSWORD="$SU_PW" "$PG" psql -h 127.0.0.1 -U postgres -tAc 'select 1' >/dev/null 2>&1 && break
	[ "$i" -lt 60 ] || { echo "PostgreSQL không khởi động" >&2; docker logs "$PG" | tail -20; exit 1; }
	sleep 1
done
docker exec -i -e PGPASSWORD="$SU_PW" "$PG" psql -h 127.0.0.1 -U postgres -d postgres -q -v ON_ERROR_STOP=1 \
	-v migrate_password="$MIG_PW" -v app_password="$APP_PW" -f - <"$REPO_DIR/infra/postgresql/01_tao_db_va_role.sql"

step "Thư mục deploy giống server (backend/.env.production, .env của compose)"
mkdir -p "$DEPLOY_DIR/backend"
cat >"$DEPLOY_DIR/backend/.env.production" <<EOF
NODE_ENV=production
DB_SERVER=host.docker.internal
DB_PORT=$PG_PORT
DB_DATABASE=rms_hospital
DB_USER=rms_app
DB_PASSWORD=$APP_PW
EOF
cat >"$DEPLOY_DIR/.env" <<EOF
BACKEND_BIND=127.0.0.1:$BACKEND_PORT
FRONTEND_BIND=127.0.0.1:$FRONTEND_PORT
WEB_CONCURRENCY=2
EOF

step "Tạo mạng compose, chờ container trong mạng đó tới được DB qua host.docker.internal"
# Như server: DB nằm ngoài compose, backend tới qua host-gateway. Thử trên CHÍNH mạng
# compose (Docker Desktop có lúc chưa thông ngay ở mạng mới tạo)
BACKEND_IMAGE=x FRONTEND_IMAGE=x compose create --quiet-pull redis >/dev/null 2>&1
NET="${PROJECT}_default"
probe='require("net").connect(+process.argv[1], "host.docker.internal").on("connect", () => process.exit(0)).on("error", () => process.exit(1))'
for i in $(seq 1 30); do
	docker run --rm --network "$NET" --add-host host.docker.internal:host-gateway --entrypoint node \
		"$BACKEND_SRC_IMAGE" -e "$probe" "$PG_PORT" && break
	[ "$i" -lt 30 ] || { echo "Container không tới được host.docker.internal:$PG_PORT" >&2; exit 1; }
	sleep 2
done

step "Dựng schema bằng image prod (migrate init, role rms_migrate, SSL)"
docker run --rm --network "$NET" --add-host host.docker.internal:host-gateway \
	-e DB_SERVER=host.docker.internal -e DB_PORT="$PG_PORT" -e DB_USER=rms_migrate -e DB_PASSWORD="$MIG_PW" \
	-e DB_ENCRYPT=true "$REGISTRY/hospital_rms-backend:$SHA" node scripts/migrate.js init

export DEPLOY_DIR BACKEND_URL FRONTEND_URL COMPOSE_PROJECT="$PROJECT" SOAK_SECONDS="${SOAK_SECONDS:-20}" \
	MIGRATION_DB_USER=rms_migrate MIGRATION_DB_PASSWORD="$MIG_PW" MIGRATION_DB_PORT="$PG_PORT"
unset MIGRATION_BACKUP_DIR

step "scripts/deploy.sh $SHA (đường chính)"
if ! "$REPO_DIR/scripts/deploy.sh" "$SHA" "$REGISTRY"; then
	echo "::error::scripts/deploy.sh hỏng với bản production của commit này — xem log ở trên"
	exit 1
fi
summary "- ✅ deploy.sh: kéo image, migration, khởi động, smoke test (/health đúng version, /health/db, trang chủ, không restart)"

# ---------- kiểm tra thêm ----------
hdr() { curl -sS -o /dev/null -D - --max-time 10 "$1" | tr -d '\r'; }
has_header() { grep -qi "^$2:" <<<"$1"; }
status() { curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$1"; }

step "Backend"
h="$(hdr "$BACKEND_URL/health")"
has_header "$h" 'x-powered-by' && fail "backend lộ header X-Powered-By"
has_header "$h" 'x-content-type-options' || fail "backend thiếu X-Content-Type-Options"
code="$(status "$BACKEND_URL/api/v1/activity-logs/")"
[ "$code" = 401 ] || fail "route cần đăng nhập /api/v1/activity-logs/ trả $code, cần 401"
code="$(status "$BACKEND_URL/api-docs/")"
[ "$code" != 200 ] || fail "Swagger /api-docs mở ở production"
bid="$(compose ps -q backend)"
user="$(docker exec "$bid" stat -c %U /proc/1 2>/dev/null || echo '?')"
[ "$user" = node ] || fail "tiến trình backend chạy bằng user '$user', cần 'node'"
if errs="$(compose logs --no-log-prefix backend 2>/dev/null | grep -E '"level":(50|60)|Unhandled|uncaught' | head -5)" && [ -n "$errs" ]; then
	echo "::warning::Backend ghi log lỗi lúc khởi động:"
	printf '%s\n' "$errs"
fi

step "Frontend (nginx)"
h="$(hdr "$FRONTEND_URL/")"
has_header "$h" 'content-security-policy' || fail "trang chủ thiếu Content-Security-Policy"
has_header "$h" 'x-frame-options' || fail "trang chủ thiếu X-Frame-Options"
has_header "$h" 'x-content-type-options' || fail "trang chủ thiếu X-Content-Type-Options"
grep -qi '^server: nginx/[0-9]' <<<"$h" && fail "nginx lộ phiên bản (server_tokens off)"
index="$(curl -fsS --max-time 10 "$FRONTEND_URL/")"
mapfile -t assets < <(grep -oE '(src|href)="/assets/[^"]+\.(js|css)"' <<<"$index" | sed -E 's/^(src|href)="//; s/"$//' | sort -u)
[ "${#assets[@]}" -gt 0 ] || fail "index.html không tham chiếu file /assets/*.js|css nào"
for a in "${assets[@]}"; do
	ct="$(curl -fsS -o /dev/null -w '%{content_type}' --max-time 10 "$FRONTEND_URL$a" || echo LỖI)"
	case "$a:$ct" in
		*.js:*javascript* | *.css:text/css*) ;;
		*) fail "$a trả content-type '$ct'" ;;
	esac
done
code="$(status "$FRONTEND_URL/assets/khong-ton-tai-$RANDOM.js")"
[ "$code" = 404 ] || fail "file JS không tồn tại trả $code, cần 404 (trả index.html thay JS → trang trắng)"
deep="$(curl -fsS --max-time 10 "$FRONTEND_URL/admin/smoke/link-sau")" || deep=""
grep -q '<div id="root"' <<<"$deep" || fail "link sâu /admin/... không trả trang SPA (thiếu try_files /index.html)"
code="$(status "$FRONTEND_URL/api/v1/activity-logs/")"
[ "$code" = 401 ] || fail "nginx proxy /api tới backend trả $code, cần 401"
for a in "${assets[@]}"; do
	[ "$(status "$FRONTEND_URL$a.map")" != 200 ] || fail "lộ source map $a.map"
done

step "Trình duyệt thật (Chrome headless): trang trắng, lỗi JS, CSP chặn, thiếu chunk"
# Chrome + script dùng mạng host để tới 127.0.0.1:$FRONTEND_PORT; script chạy bằng
# node của image backend (đọc từ stdin — không cần bind mount, không cài gói npm)
docker rm -f "$CHROME" >/dev/null 2>&1 || true
docker run -d --name "$CHROME" --network host --shm-size 256m "$CHROME_IMAGE" \
	--remote-debugging-address=127.0.0.1 --remote-debugging-port="$CDP_PORT" >/dev/null
if ! docker run --rm -i --network host --entrypoint node "$BACKEND_SRC_IMAGE" --input-type=module - \
	"http://127.0.0.1:$CDP_PORT" "$FRONTEND_URL" "${BROWSER_PATHS[@]}" <"$REPO_DIR/scripts/ci/browser-smoke.mjs"; then
	fail "trình duyệt gặp lỗi khi mở trang (chi tiết ở trên)"
fi
docker rm -f "$CHROME" >/dev/null 2>&1 || true

step "Tự rollback: deploy bản cố tình hỏng $BAD_SHA"
# Lỗi ở bước này là CHỦ ĐÍCH → đổi ::error:: của deploy.sh thành chữ thường để GitHub không gắn cờ đỏ
set +e
SMOKE_TIMEOUT=45 "$REPO_DIR/scripts/deploy.sh" "$BAD_SHA" "$REGISTRY" 2>&1 | sed 's/::error::/(lỗi mong đợi) /'
bad_exit="${PIPESTATUS[0]}"
set -e
if [ "$bad_exit" -eq 0 ]; then
	fail "deploy.sh báo thành công với bản hỏng — smoke test của deploy không bắt được lỗi"
else
	version="$(curl -fsS --max-time 5 "$BACKEND_URL/health" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || true)"
	if [ "$version" = "$SHA" ]; then
		summary "- ✅ Tự rollback: bản hỏng bị phát hiện, đã quay lại \`${SHA::7}\` và vẫn phục vụ"
	else
		fail "sau khi deploy bản hỏng, /health trả version '$version' — rollback không về được $SHA"
	fi
	tail -n 2 "$DEPLOY_DIR/logs/deploy-history.log" || true
fi

if [ "${#errors[@]}" -gt 0 ]; then
	summary "- ❌ ${#errors[@]} lỗi:" "$(printf '  - %s\n' "${errors[@]}")"
	for e in "${errors[@]}"; do echo "::error::$e"; done
	exit 1
fi
summary "- ✅ Header bảo mật, file tĩnh, link sâu, proxy /api, 401, user node, không Swagger"
echo "OK — bản production chạy được, deploy + rollback đúng"
