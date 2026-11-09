#!/bin/sh
# Giải nén file upload / khoá bí mật của HỆ THỐNG CŨ (file .tar.gz đóng gói từ
# volume server_uploads / server_secrets, mục C.6 infra/chuyen-du-lieu-sang-postgresql.md)
# vào thư mục tương ứng của hệ thống mới. Chạy TRONG container backend (BusyBox sh),
# bằng root, với file nguồn mount chỉ đọc — scripts/setup-server.sh và
# scripts/setup-dev.js gọi script này:
#
#   docker compose run --rm --no-deps -T -u 0 --entrypoint sh \
#     -v /thu-muc-chua-file:/import:ro backend \
#     scripts/import-old-files.sh uploads /import/uploads.tar.gz
#
#   import-old-files.sh uploads <file.tar.gz>   → $UPLOADS_DIR  (mặc định /app/uploads)
#   import-old-files.sh secrets <file.tar.gz>   → $SECRETS_DIR  (mặc định /app/secrets)
#
# - Nhận gói tạo bằng `tar czf x.tar.gz -C /data .` (như C.6) hoặc gói có thư mục
#   bọc ngoài cùng tên (uploads/…, secrets/…) — thư mục bọc được bỏ đi.
# - Từ chối gói có đường dẫn tuyệt đối, "..", symlink/hardlink/thiết bị: dev mount
#   cả mã nguồn backend vào /app, không để gói giải nén ra ngoài thư mục đích.
# - File trùng tên thì ghi đè. secrets: bản đang có được chép sang
#   .truoc-import-<thời điểm>/ trước khi ghi đè (khoá 2FA đổi là mất 2FA).
# - Production: chuyển quyền cho user node (docker-entrypoint.sh chỉ chown -R khi
#   thư mục gốc chưa thuộc node, nên không tự sửa file vừa giải nén).
set -eu

die() {
	echo "import-old-files: $*" >&2
	exit 1
}

KIND="${1:-}"
FILE="${2:-}"
case "$KIND" in
uploads) DEST="${UPLOADS_DIR:-/app/uploads}" ;;
secrets) DEST="${SECRETS_DIR:-/app/secrets}" ;;
*) die "cách dùng: $0 uploads|secrets <file.tar.gz>" ;;
esac
[ -r "$FILE" ] || die "không đọc được $FILE"

# Gói hỏng / không phải .tar.gz thì dừng trước khi đụng vào thư mục đích
NAMES="$(mktemp)"
TAR_ERR="$(mktemp)"
trap 'rm -f "$NAMES" "$TAR_ERR"' EXIT
tar tzf "$FILE" >"$NAMES" 2>"$TAR_ERR" ||
	die "$(basename "$FILE") không phải file .tar.gz hợp lệ (tạo bằng: tar czf $KIND.tar.gz -C /data .)"
# Gói rỗng / chỉ có thư mục (volume cũ trống, vd chưa ai bật 2FA): không có gì để chép
if ! grep -qv '/$' "$NAMES"; then
	echo "import-old-files: $KIND — $(basename "$FILE") không có file nào, bỏ qua"
	exit 0
fi

# BusyBox tự cắt "/", "../", "a/../../" khỏi tên khi liệt kê (chỉ báo ở stderr) —
# gói tạo đúng cách không bao giờ có, nên gặp là từ chối thay vì giải nén lệch chỗ
if grep -q 'removing leading' "$TAR_ERR" || grep -qE '^/|(^|/)\.\.(/|$)' "$NAMES"; then
	die "gói có đường dẫn tuyệt đối hoặc '..' — không giải nén: $(sed -n "s/.*removing leading \('[^']*'\).*/\1/p" "$TAR_ERR" | sort -u | head -n 3 | tr '\n' ' ')$(grep -E '^/|(^|/)\.\.(/|$)' "$NAMES" | head -n 3 | tr '\n' ' ')"
fi
# Ký tự đầu của `tar tv`: - file, d thư mục; còn lại (l, h, c, b, p) không nhận
BAD_TYPES="$(tar tvzf "$FILE" | cut -c1 | grep -v '^[-d]$' | sort -u | tr -d '\n' || true)"
[ -z "$BAD_TYPES" ] || die "gói có symlink / hardlink / file thiết bị (loại: $BAD_TYPES) — không giải nén"

# Thư mục bọc ngoài: mọi mục đều nằm dưới "<KIND>/" (có thể kèm "./" ở đầu)
STRIP=0
REST="$(sed 's#^\./##' "$NAMES" | grep -v '^$' | grep -vE "^$KIND(/|\$)" || true)"
if [ -z "$REST" ]; then
	STRIP=1
	grep -q '^\./' "$NAMES" && STRIP=2
	echo "import-old-files: bỏ thư mục bọc ngoài $KIND/"
fi

mkdir -p "$DEST"
# Khoá đang có (bỏ qua các bản .truoc-import-* của lần trước)
HAS_KEYS=0
if [ "$KIND" = secrets ]; then
	for f in "$DEST"/* "$DEST"/.[!.]*; do
		[ -e "$f" ] || continue
		case "$(basename "$f")" in .truoc-import-*) continue ;; esac
		HAS_KEYS=1
		break
	done
fi
if [ "$HAS_KEYS" = 1 ]; then
	BACKUP="$DEST/.truoc-import-$(date +%Y%m%d-%H%M%S)"
	mkdir -p "$BACKUP"
	for f in "$DEST"/* "$DEST"/.[!.]*; do
		[ -e "$f" ] || continue
		case "$(basename "$f")" in .truoc-import-*) continue ;; esac
		cp -a "$f" "$BACKUP/"
	done
	echo "import-old-files: đã chép khoá đang có sang $BACKUP"
fi

tar xzf "$FILE" -o --strip-components "$STRIP" -C "$DEST"

if [ "$KIND" = secrets ]; then
	find "$DEST" -type f -exec chmod 600 {} +
fi
if [ "${NODE_ENV:-}" = production ] && id node >/dev/null 2>&1; then
	chown -R node:node "$DEST"
fi

COUNT="$(grep -cv '/$' "$NAMES" || true)"
echo "import-old-files: $KIND — $COUNT mục từ $(basename "$FILE") → $DEST ($(du -sh "$DEST" | cut -f1))"
