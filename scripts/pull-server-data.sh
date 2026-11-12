#!/usr/bin/env bash
# Lấy dữ liệu từ máy chủ Ubuntu về máy này (Windows: chạy bằng Git Bash):
#   - bản backup PostgreSQL + gói khoá bí mật trong /data/backup/{db,files}
#   - file người dùng đã upload (volume hospital_rms_server_uploads) → uploads.tar.gz
#   - khoá bí mật hiện tại (volume hospital_rms_server_secrets)        → secrets.tar.gz
#
#   bash scripts/pull-server-data.sh <user>@<IP> [thư-mục-đích]
#
# Thư mục đích mặc định: D:/rms-backup/<ngày-giờ> (nằm NGOÀI repo — dữ liệu bệnh viện
# + khoá 2FA, không được lọt vào git).
#
# Cách chạy: đóng gói vào /data/backup/export-<ngày-giờ> trên máy chủ (cần sudo),
# chép về bằng scp, kiểm tra SHA-256, rồi xoá thư mục tạm trên máy chủ.
# Hỏi mật khẩu 4 lần nếu chưa có khoá SSH: SSH, sudo, scp, SSH dọn dẹp.
#
# Biến môi trường:
#   INCLUDE_IMPORT=1  lấy cả /data/backup/import (file .bak / gói đã dùng khi cài, thường lớn)
#   KEEP_REMOTE=1     không xoá thư mục tạm trên máy chủ
#
# uploads.tar.gz / secrets.tar.gz cùng định dạng mục C.6 infra/chuyen-du-lieu-sang-postgresql.md:
# nạp vào máy dev bằng  npm run setup:dev -- --uploads=<file> --secrets=<file>
set -euo pipefail

HOST="${1:-}"
[ -n "$HOST" ] || {
	echo "Cách dùng: bash $0 <user>@<IP> [thư-mục-đích]" >&2
	exit 1
}
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${2:-/d/rms-backup/$STAMP}"
OUT="/data/backup/export-$STAMP"

# ─── Script chạy trên máy chủ ────────────────────────────────────────────────
read -r -d '' REMOTE <<'EOF' || true
set -euo pipefail
OUT="$1"
INCLUDE_IMPORT="$2"
echo "== Cần quyền sudo trên máy chủ (đọc /data/backup/db và volume Docker)"
sudo -v

parts=()
for p in db files; do
	if [ -d "/data/backup/$p" ]; then parts+=("$p"); fi
done
if [ "$INCLUDE_IMPORT" = 1 ] && [ -d /data/backup/import ]; then parts+=(import); fi
[ ${#parts[@]} -gt 0 ] || { echo "Không thấy /data/backup/db hay /data/backup/files" >&2; exit 1; }

vols=()
for v in uploads secrets; do
	if sudo docker volume inspect "hospital_rms_server_$v" >/dev/null 2>&1; then
		vols+=("$v")
	else
		echo "!! Không có volume hospital_rms_server_$v — bỏ qua" >&2
	fi
done

# Đủ chỗ trên /data cho bản sao tạm?
need=$(sudo du -sb "${parts[@]/#//data/backup/}" | awk '{s+=$1} END {print s}')
for v in "${vols[@]}"; do
	mp=$(sudo docker volume inspect -f '{{.Mountpoint}}' "hospital_rms_server_$v")
	need=$((need + $(sudo du -sb "$mp" | cut -f1)))
done
free=$(df -B1 --output=avail /data | tail -n 1 | tr -d ' ')
echo "== Dung lượng cần (chưa nén): $(numfmt --to=iec "$need") — /data còn trống: $(numfmt --to=iec "$free")"
sudo du -sh "${parts[@]/#//data/backup/}"
[ "$need" -lt "$free" ] || { echo "Không đủ chỗ trên /data để đóng gói" >&2; exit 1; }

sudo install -d -m 700 -o "$USER" -g "$(id -gn)" "$OUT"
echo "== Đóng gói /data/backup/{$(IFS=,; echo "${parts[*]}")} → backup.tar"
sudo tar cf "$OUT/backup.tar" -C /data/backup "${parts[@]}"
for v in "${vols[@]}"; do
	echo "== Đóng gói volume hospital_rms_server_$v → $v.tar.gz"
	sudo docker run --rm -v "hospital_rms_server_$v:/data:ro" -v "$OUT:/backup" alpine \
		tar czf "/backup/$v.tar.gz" -C /data .
done
sudo chown "$USER:$(id -gn)" "$OUT"/*
chmod 600 "$OUT"/*
cd "$OUT"
shopt -s nullglob
sha256sum -- *.tar *.tar.gz > SHA256SUMS
ls -lh
EOF

echo "== [1/4] Đóng gói trên $HOST (mật khẩu SSH, rồi mật khẩu sudo)"
B64="$(printf '%s' "$REMOTE" | base64 -w0)"
ssh -t "$HOST" "bash -c \"\$(echo $B64 | base64 -d)\" pull-server-data '$OUT' '${INCLUDE_IMPORT:-0}'"

echo "== [2/4] Chép về $DEST (mật khẩu SSH)"
mkdir -p "$DEST"
scp "$HOST:$OUT/*" "$DEST/"

echo "== [3/4] Kiểm tra SHA-256"
(cd "$DEST" && sha256sum -c SHA256SUMS)
mkdir -p "$DEST/backup"
tar xf "$DEST/backup.tar" -C "$DEST/backup" && rm "$DEST/backup.tar"

if [ "${KEEP_REMOTE:-0}" = 1 ]; then
	echo "== [4/4] Giữ $OUT trên máy chủ (KEEP_REMOTE=1)"
else
	echo "== [4/4] Xoá thư mục tạm $OUT trên máy chủ (mật khẩu SSH)"
	ssh "$HOST" "rm -rf -- '$OUT'"
fi

echo
echo "Xong: $DEST"
(cd "$DEST" && find . -type f -printf '%10s  %p\n' 2>/dev/null | sort -k2 || find . -type f)
