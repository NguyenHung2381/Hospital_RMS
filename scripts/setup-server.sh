#!/usr/bin/env bash
# Dựng Hospital RMS bản production trên 1 máy Ubuntu 24.04 / 26.04 MỚI CÀI, bằng 1 lệnh.
# Gộp các bước 4 → 15 của infra/cai-dat-may-ao-ubuntu.md:
#   DNS → hệ thống (gói, múi giờ, swap, tự vá) → firewall → ổ dữ liệu /data → Docker
#   → source code → file cấu hình → PostgreSQL 18 → build image → dựng DB
#   → khởi động → HTTPS (tuỳ chọn) → chặn cổng Docker → sao lưu hằng đêm → lịch đổi JWT secret
#   → khoá SSH bằng mật khẩu (tuỳ chọn).
#
# Chạy bằng user thường có sudo (KHÔNG chạy bằng root), qua SSH:
#   scp scripts/setup-server.sh rms:~          # trên máy của bạn
#   ssh rms
#   tmux new -s rms                            # mất SSH giữa chừng không bị huỷ
#   bash ~/setup-server.sh
#
# Script hỏi vài câu ở đầu (ổ dữ liệu, domain, ...) rồi tự chạy hết. Câu trả lời
# lưu ở ~/.config/rms-setup.env. Chạy lại = làm tiếp phần còn thiếu: không hỏi lại,
# không ghi đè file cấu hình, không format lại ổ, không đổi mật khẩu đã có.
#
#   bash setup-server.sh                 # chạy mọi bước
#   bash setup-server.sh postgres start  # chỉ chạy các bước được nêu tên
#   DNS_SERVERS="1.1.1.1 8.8.8.8" bash setup-server.sh dns   # thêm DNS cho máy
#   bash setup-server.sh --list          # xem tên các bước
#   REBUILD=1 bash setup-server.sh build start   # build lại image dù đã có
#
# Cài từ đầu bằng dữ liệu cũ (DB_MODE=restore / transfer): chép bản backup PostgreSQL,
# uploads.tar.gz, secrets.tar.gz vào IMPORT_DIR (mặc định /data/backup/import, bước disk
# tạo) — trước hoặc trong lúc chạy. Bước database / files tự tìm ở đó, chọn theo số
# (ASSUME_YES=1: mới nhất); chưa có bản backup thì script chờ. Không cần bước import.
#
# Cập nhật dữ liệu sau này (hệ thống đã chạy) — bước import, chỉ chạy khi gọi tên:
#   scp rms_hospital_<ngày>.dump uploads.tar.gz secrets.tar.gz rms:/data/backup/import/
#   bash setup-server.sh import
# Liệt kê file trong IMPORT_DIR (mặc định /data/backup/import) để chọn theo số; bản
# backup PostgreSQL THAY toàn bộ DB (DB đang dùng sao lưu vào /data/backup/db/truoc-import/,
# lỗi thì tự trả lại), uploads.tar.gz ghép vào file đang có, secrets.tar.gz thay khoá.
# Chọn sẵn, không hỏi: IMPORT_DUMP=... IMPORT_UPLOADS=... IMPORT_SECRETS=... (none = bỏ qua),
# ASSUME_YES=1 lấy file mới nhất mỗi loại.
#
# File dump / .tar.gz nạp xong (bước database, files, import) bị XOÁ khỏi đĩa — chứa toàn
# bộ dữ liệu và khoá 2FA. Giữ lại: KEEP_IMPORT_FILES=1
#
# Chạy không hỏi: đặt sẵn biến môi trường (cùng tên trong rms-setup.env), vd
#   DATA_DISK=sdb ACCESS_MODE=ip DB_MODE=new HARDEN_SSH=no ASSUME_YES=1 bash setup-server.sh
#
# Biến (đều tuỳ chọn, thiếu thì hỏi):
#   DATA_DISK       tên ổ thứ 2 (sdb, vdb, nvme1n1) — sẽ bị XOÁ SẠCH. Script chỉ
#                   format ổ không có phân vùng và không có dữ liệu.
#                   none = để /data trên ổ hệ điều hành (máy 1 ổ)
#   ACCESS_MODE     ip          thử bằng http://<IP>:8081, chưa có HTTPS
#                   proxy       reverse proxy HTTPS của bệnh viện (máy khác) trỏ về máy này
#                   letsencrypt nginx + chứng chỉ Let's Encrypt ngay trên máy này
#   DOMAIN          tên miền (proxy / letsencrypt), vd nckh.bvnghean.vn
#   LE_EMAIL        email nhận thông báo hết hạn chứng chỉ (letsencrypt)
#   TRUSTED_PROXIES IP reverse proxy (proxy) — nginx chặn máy khác gọi thẳng 8081
#   WEB_CONCURRENCY số worker backend (mặc định số vCPU − 2, tối thiểu 1)
#   ENABLE_CLAMAV   yes | no — quét virus file upload (mặc định no khi RAM < 8 GB)
#   DB_MODE         new (DB trống) | transfer (chuyển dữ liệu từ file .bak SQL Server)
#                   | restore (khôi phục từ bản backup PostgreSQL — file dump).
#                   Không đặt thì hỏi "Có dữ liệu của hệ thống cũ không", có thì hỏi loại
#   BAK_FILE        đường dẫn file .bak trên máy này (DB_MODE=transfer)
#   DUMP_FILE       đường dẫn file backup PostgreSQL (DB_MODE=restore) — không đặt thì chọn
#                   trong IMPORT_DIR:
#                   .dump (pg_dump -Fc, như backup hằng đêm rms_hospital_<ngày>.dump),
#                   .sql (pg_dump thường), có thể nén .gz — nhận dạng theo nội dung.
#                   Khôi phục bằng superuser postgres, giữ nguyên chủ sở hữu + quyền
#   UPLOADS_FILE    uploads.tar.gz — file người dùng đã upload lên hệ thống cũ (volume
#                   server_uploads cũ, cách đóng gói: mục C.6 infra/chuyen-du-lieu-sang-postgresql.md).
#                   Bước files giải nén vào volume server_uploads mới. none = bỏ qua
#   SECRETS_FILE    secrets.tar.gz — khoá giải mã 2FA + JWT secret của hệ thống cũ (volume
#                   server_secrets cũ). Thiếu thì người đã bật 2FA phải thiết lập lại. none = bỏ qua
#                   Không đặt 2 biến này thì (DB_MODE=transfer | restore) chọn trong IMPORT_DIR,
#                   không có thì bỏ qua. Mỗi loại chỉ giải nén 1 lần — nạp lại / gói khác: bước import
#   HARDEN_SSH      yes | no — tắt đăng nhập SSH bằng mật khẩu, chặn root
#   DNS_SERVERS     IP máy chủ DNS thêm cho máy này, cách nhau bằng dấu cách (vd "1.1.1.1 8.8.8.8",
#                   mạng viện chặn DNS ngoài thì dùng IP DNS nội bộ). Bỏ trống = giữ DNS đang
#                   có; chỉ hỏi khi máy không phân giải được tên miền (apt báo
#                   "Temporary failure resolving")
#   ADMIN_USERNAME  tên đăng nhập tài khoản Super Admin — toàn quyền (mặc định superadmin)
#   LIMITED_ADMIN_USERNAME
#                   tài khoản Admin — chỉ NCKH, đào tạo / CME, người dùng (mặc định admin).
#                   Tạo khi DB_MODE=new, hoặc ngay sau khi chuyển từ .bak (thay tài khoản
#                   "admin" toàn quyền của hệ thống cũ). Mật khẩu tạm của cả 2 in ra 1 lần ở bước
#                   database, bắt đổi khi đăng nhập lần đầu
#   REPO_URL        mặc định git@github.com:NguyenHung2381/Hospital_RMS.git
#   APP_DIR         mặc định /data/code/Hospital_RMS
#   WEB_PORT        cổng web publish trên máy này (mặc định 8081; bận thì đặt vd 8082)
#   ASSUME_YES=1    không hỏi xác nhận "Tiếp tục?"
#
# Mật khẩu DB tự sinh, KHÔNG in ra màn hình:
#   rms_migrate → ~/.pgpass          rms_app → $APP_DIR/backend/.env.production
# Log mỗi lần chạy: ~/rms-setup.log
set -Eeuo pipefail

SELF="$(readlink -f "${BASH_SOURCE[0]}")"
SELF_DIR="$(dirname "$SELF")"
CONF_FILE="$HOME/.config/rms-setup.env"
LOG_FILE="$HOME/rms-setup.log"
STATE_DIR="$HOME/.config/rms-setup.state"
PROJECT="hospital_rms"
PG_VER=18
PG_CONF_DIR="/etc/postgresql/$PG_VER/main"
PG_DATA="/data/pgsql/$PG_VER/main"
DEFAULT_REPO_URL="git@github.com:NguyenHung2381/Hospital_RMS.git"
HBA_MARK_BEGIN="# >>> Hospital RMS (scripts/setup-server.sh)"
HBA_MARK_END="# <<< Hospital RMS"

RESOLVED_DROPIN="/etc/systemd/resolved.conf.d/rms-dns.conf"
DNS_TEST_HOST="archive.ubuntu.com"

STEPS=(dns system firewall disk docker repo config postgres build database files start https ports backup jwt ssh)
# Bước chỉ chạy khi gọi tên (bash setup-server.sh import)
EXTRA_STEPS=(import)
IMPORT_DIR="${IMPORT_DIR:-/data/backup/import}"

# ─── Tiện ích ────────────────────────────────────────────────────────────────
log() { printf '\n\033[1;36m══ %s\033[0m\n' "$*"; }
info() { printf '   %s\n' "$*"; }
ok() { printf '   \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '   \033[33m⚠ %s\033[0m\n' "$*" >&2; }
die() {
	printf '\n\033[31m❌ %s\033[0m\n' "$*" >&2
	exit 1
}
trap 'die "Lỗi ở dòng $LINENO: $BASH_COMMAND (xem $LOG_FILE). Sửa xong chạy lại script, các bước đã xong sẽ được bỏ qua."' ERR

usage() {
	sed -n '2,/^set -Eeuo/p' "$SELF" | sed '$d; s/^# \{0,1\}//'
	exit "${1:-1}"
}

apt_get() {
	# Acquire::Retries: mạng / DNS chập chờn giữa lúc tải thì tự thử lại, không hỏng cả bước
	sudo DEBIAN_FRONTEND=noninteractive apt-get -y -q -o Acquire::Retries=3 \
		-o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold "$@"
}
pkg_installed() { dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q 'install ok installed'; }
pgsu() { (cd / && sudo -u postgres "$@"); }
compose() { docker compose -p "$PROJECT" --project-directory "$APP_DIR" -f "$APP_DIR/docker-compose.prod.yml" "$@"; }
done_mark() { mkdir -p "$STATE_DIR" && touch "$STATE_DIR/$1"; }
is_done() { [ -f "$STATE_DIR/$1" ]; }
# Chỉ chữ số hex: không vướng ký tự đặc biệt trong file .env / psql
gen_secret() { openssl rand -hex "$((${1:-32} / 2))"; }
in_group() { [[ " $(id -nG "$USER") " == *" $1 "* ]]; }

# Giá trị cuối của KEY trong file dạng .env (bỏ nháy)
env_value() {
	[ -f "$1" ] || return 0
	sed -n "s/^[[:space:]]*$2[[:space:]]*=[[:space:]]*//p" "$1" | tail -n 1 |
		sed "s/[[:space:]]*\$//; s/^[\"']//; s/[\"']\$//"
}

# Chép src → dst (sudo) khi nội dung khác; trả 0 nếu có thay đổi
install_if_changed() {
	local src="$1" dst="$2" mode="${3:-644}"
	if sudo test -f "$dst" && sudo cmp -s "$src" "$dst"; then return 1; fi
	sudo install -m "$mode" "$src" "$dst"
}

# ask VAR "câu hỏi" [mặc định] — bỏ qua nếu VAR đã có giá trị (env / rms-setup.env)
ask() {
	local var="$1" q="$2" def="${3:-}" ans
	[ -n "${!var:-}" ] && return 0
	read -rp "   $q${def:+ [$def]}: " ans </dev/tty
	printf -v "$var" '%s' "${ans:-$def}"
}

# ask_choice VAR "câu hỏi" mặc định lựa_chọn...
ask_choice() {
	local var="$1" q="$2" def="$3"
	shift 3
	while :; do
		ask "$var" "$q ($(
			IFS=/
			echo "$*"
		))" "$def"
		local v="${!var}" c
		for c in "$@"; do [ "$v" = "$c" ] && return 0; done
		warn "Chọn một trong: $*"
		printf -v "$var" '%s' ''
	done
}

confirm() { # confirm "câu hỏi" [Y|N]
	local def="${2:-Y}" ans
	[ "${ASSUME_YES:-}" = 1 ] && return 0
	read -rp "   $1 [$([ "$def" = Y ] && echo Y/n || echo y/N)]: " ans </dev/tty
	ans="${ans:-$def}"
	[[ "$ans" =~ ^[YyCc] ]]
}

save_conf() {
	mkdir -p "$(dirname "$CONF_FILE")"
	local k
	{
		echo "# Câu trả lời của scripts/setup-server.sh — sửa tay được, xoá dòng để được hỏi lại"
		for k in DATA_DISK ACCESS_MODE DOMAIN LE_EMAIL TRUSTED_PROXIES WEB_CONCURRENCY \
			ENABLE_CLAMAV DB_MODE BAK_FILE DUMP_FILE UPLOADS_FILE SECRETS_FILE HARDEN_SSH DNS_SERVERS \
			REPO_URL APP_DIR WEB_PORT ADMIN_USERNAME LIMITED_ADMIN_USERNAME; do
			[ -n "${!k:-}" ] && printf '%s=%q\n' "$k" "${!k}"
		done
	} >"$CONF_FILE"
	chmod 600 "$CONF_FILE"
}

# Ổ còn trống hoàn toàn: không phân vùng, không filesystem/chữ ký, không mount
free_disks() {
	local d
	for d in $(lsblk -dnro NAME,TYPE | awk '$2 == "disk" { print $1 }'); do
		[ "$(lsblk -nro NAME "/dev/$d" | wc -l)" -eq 1 ] || continue
		[ -z "$(lsblk -dnro MOUNTPOINTS "/dev/$d" 2>/dev/null || lsblk -dnro MOUNTPOINT "/dev/$d")" ] || continue
		sudo blkid -p "/dev/$d" >/dev/null 2>&1 && continue
		echo "$d"
	done
}

server_ip() { { ip -4 route get 1.1.1.1 2>/dev/null || true; } | sed -n 's/.* src \([0-9.]*\).*/\1/p'; }

# ssh -T git@github.com luôn thoát mã 1, nên xét nội dung trả về
github_ok() {
	local out
	out="$(ssh -T -o BatchMode=yes git@github.com 2>&1 || true)"
	[[ "$out" == *"successfully authenticated"* ]]
}

# ─── 0. Kiểm tra & câu hỏi ───────────────────────────────────────────────────
preflight() {
	[ "$(id -u)" -ne 0 ] || die "Đừng chạy bằng root. Chạy bằng user thường có sudo: bash $SELF"
	[ -r /etc/os-release ] && . /etc/os-release
	if [ "${ID:-}" != ubuntu ]; then
		die "Script chỉ dành cho Ubuntu (máy này: ${PRETTY_NAME:-không rõ})"
	fi
	case "${VERSION_ID:-}" in
	24.04 | 26.04) ;;
	*) warn "Đã thử trên Ubuntu 24.04 / 26.04, máy này là $VERSION_ID" ;;
	esac
	command -v sudo >/dev/null || die "Thiếu sudo"
	info "Nhập mật khẩu sudo (1 lần cho cả quá trình):"
	sudo -v || die "User $(id -un) không có quyền sudo"
	# Giữ sudo sống trong lúc build lâu
	(while kill -0 "$$" 2>/dev/null; do
		sudo -n true 2>/dev/null
		sleep 50
	done) &

	RAM_MB=$(($(awk '/^MemTotal:/ { print $2 }' /proc/meminfo) / 1024))
	CPUS=$(nproc)
	info "Máy: $CPUS vCPU, $((RAM_MB / 1024)) GB RAM, ${PRETTY_NAME:-Ubuntu}"
	[ "$RAM_MB" -ge 7000 ] || warn "RAM < 8 GB: nên tắt ClamAV, có thể build chậm"
}

collect_answers() {
	# shellcheck disable=SC1090
	if [ -f "$CONF_FILE" ]; then . "$CONF_FILE"; fi
	local k
	for k in DATA_DISK ACCESS_MODE DOMAIN LE_EMAIL TRUSTED_PROXIES WEB_CONCURRENCY \
		ENABLE_CLAMAV DB_MODE BAK_FILE DUMP_FILE UPLOADS_FILE SECRETS_FILE HARDEN_SSH DNS_SERVERS REPO_URL; do
		printf -v "$k" '%s' "${!k:-}"
	done
	APP_DIR="${APP_DIR:-/data/code/Hospital_RMS}"
	WEB_PORT="${WEB_PORT:-8081}"
	ADMIN_USERNAME="${ADMIN_USERNAME:-superadmin}"
	LIMITED_ADMIN_USERNAME="${LIMITED_ADMIN_USERNAME:-admin}"

	# Đã có đủ câu trả lời (chạy lại / đặt sẵn bằng biến môi trường) thì không hỏi
	if [ -n "$ACCESS_MODE" ] && [ -n "$DB_MODE" ] && [ -n "$DATA_DISK" ] &&
		[ -n "$HARDEN_SSH" ] && [ -n "$ENABLE_CLAMAV" ] && [ -n "$WEB_CONCURRENCY" ]; then
		derive_settings
		save_conf
		return 0
	fi

	log "Vài câu hỏi trước khi chạy"

	# Ổ dữ liệu
	if mountpoint -q /data; then
		DATA_DISK="${DATA_DISK:-mounted}"
		ok "/data đã mount ($(df -h --output=size /data | tail -n 1 | tr -d ' ')), giữ nguyên"
	elif [ -z "${DATA_DISK:-}" ]; then
		local disks
		disks="$(free_disks)"
		if [ -n "$disks" ]; then
			info "Ổ trống (chưa phân vùng) tìm thấy:"
			# shellcheck disable=SC2046 # mỗi ổ là 1 tham số
			lsblk -dno NAME,SIZE,MODEL $(printf '/dev/%s ' $disks) | sed 's/^/     /'
			info "Ổ hiện có:"
			lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS 2>/dev/null | sed 's/^/     /' ||
				lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT | sed 's/^/     /'
			ask DATA_DISK "Ổ dùng làm /data (sẽ XOÁ SẠCH), hoặc none" "$(echo "$disks" | head -n 1)"
			if [ "$DATA_DISK" != none ]; then
				local again
				read -rp "   Gõ lại '$DATA_DISK' để xác nhận XOÁ SẠCH ổ /dev/$DATA_DISK: " again </dev/tty
				[ "$again" = "$DATA_DISK" ] || die "Không khớp, dừng lại. Không có gì bị thay đổi."
			fi
		else
			warn "Không thấy ổ trống nào (ổ thứ 2 chưa gắn, hoặc đã có phân vùng)."
			confirm "Để /data trên ổ hệ điều hành?" N || die "Gắn ổ thứ 2 vào máy ảo rồi chạy lại."
			DATA_DISK=none
		fi
	fi

	# Truy cập web
	info "Cách truy cập web:"
	info "  ip          — thử bằng http://$(server_ip):${WEB_PORT}, chưa có HTTPS"
	info "  proxy       — reverse proxy HTTPS của bệnh viện (máy khác) trỏ về máy này"
	info "  letsencrypt — dựng HTTPS ngay trên máy này (domain đã trỏ về, mở 80/443 từ Internet)"
	ask_choice ACCESS_MODE "Chọn" ip ip proxy letsencrypt
	if [ "$ACCESS_MODE" != ip ]; then
		ask DOMAIN "Tên miền" "nckh.bvnghean.vn"
	fi
	if [ "$ACCESS_MODE" = letsencrypt ]; then
		while [ -z "${LE_EMAIL:-}" ]; do ask LE_EMAIL "Email nhận thông báo chứng chỉ Let's Encrypt"; done
	fi
	if [ "$ACCESS_MODE" = proxy ]; then
		ask TRUSTED_PROXIES "IP của reverse proxy (bỏ trống nếu chưa biết)" ""
		TRUSTED_PROXIES="${TRUSTED_PROXIES:-}"
	fi

	# Tài nguyên
	local def_wc=$((CPUS - 2))
	[ "$def_wc" -ge 1 ] || def_wc=1
	ask WEB_CONCURRENCY "Số worker backend" "$def_wc"
	ask_choice ENABLE_CLAMAV "Bật quét virus file upload (ClamAV, ~1,5 GB RAM)" \
		"$([ "$RAM_MB" -ge 7500 ] && echo yes || echo no)" yes no

	# Dữ liệu cũ → DB_MODE (đặt sẵn DB_MODE thì không hỏi)
	if [ -z "${DB_MODE:-}" ]; then
		local has_old="" old_kind=""
		while :; do
			ask has_old "Có dữ liệu của hệ thống cũ cần chuyển sang không (y/N)" n
			case "${has_old,,}" in
			y | yes | c | co | có | Có) has_old=yes && break ;;
			n | no | k | khong | không | Không) has_old=no && break ;;
			esac
			warn "Trả lời y (có) hoặc n (không)"
			has_old=""
		done
		if [ "$has_old" = no ]; then
			DB_MODE=new
			ok "Hệ thống mới, DB trống"
		else
			info "Dữ liệu cũ là:"
			info "  1 — bản backup PostgreSQL của hệ thống mới (file .dump / .sql, có thể nén .gz)"
			info "  2 — file .bak của SQL Server (hệ thống cũ trước khi chuyển sang PostgreSQL)"
			ask_choice old_kind "Chọn" 1 1 2
			if [ "$old_kind" = 1 ]; then DB_MODE=restore; else DB_MODE=transfer; fi
		fi
	fi
	if [ "$DB_MODE" = transfer ]; then
		ask BAK_FILE "Đường dẫn file .bak trên máy này" "/data/backup/db/RMS_HOSPITAL_chuyen_pg.bak"
	fi
	if [ "$DB_MODE" != new ]; then
		# Không hỏi đường dẫn: tới bước database / files script tự tìm trong IMPORT_DIR, chọn theo số
		info "Chép $([ "$DB_MODE" = restore ] && echo 'bản backup PostgreSQL, ')uploads.tar.gz, secrets.tar.gz (mục C.6 tài liệu"
		info "chuyển dữ liệu) vào $IMPORT_DIR — lúc nào cũng được, tới bước cần file mà chưa có thì script chờ:"
		info "  scp <các file> $USER@$(server_ip):$IMPORT_DIR/"
	fi

	# SSH
	if [ -s "$HOME/.ssh/authorized_keys" ]; then
		ask_choice HARDEN_SSH "Tắt đăng nhập SSH bằng mật khẩu + chặn root (đã có khoá trong authorized_keys)" yes yes no
	else
		HARDEN_SSH="${HARDEN_SSH:-no}"
		warn "Chưa có khoá SSH trong ~/.ssh/authorized_keys: KHÔNG tắt đăng nhập bằng mật khẩu (xem mục 3 tài liệu)"
	fi

	derive_settings
	log "Tóm tắt"
	info "Ổ dữ liệu      : $DATA_DISK"
	info "Truy cập       : $ACCESS_MODE → $PUBLIC_URL"
	info "Worker backend : $WEB_CONCURRENCY    ClamAV: $ENABLE_CLAMAV"
	case "$DB_MODE" in
	new) info "Dữ liệu cũ     : không — DB trống" ;;
	restore) info "Dữ liệu cũ     : bản backup PostgreSQL${DUMP_FILE:+ ($DUMP_FILE)}" ;;
	transfer) info "Dữ liệu cũ     : file .bak SQL Server ($BAK_FILE)" ;;
	esac
	[ "$DB_MODE" = new ] || info "File cần nạp   : chọn trong $IMPORT_DIR"
	info "Khoá SSH m.khẩu: $HARDEN_SSH"
	info "Cổng web       : $WEB_PORT"
	info "Source code    : $APP_DIR"
	confirm "Tiếp tục?" Y || die "Đã huỷ. Không có gì bị thay đổi."
	save_conf
}

derive_settings() {
	WEB_PORT="${WEB_PORT:-8081}"
	case "$ACCESS_MODE" in
	ip) PUBLIC_URL="http://$(server_ip):${WEB_PORT}" ;;
	proxy | letsencrypt)
		[ -n "$DOMAIN" ] || die "ACCESS_MODE=$ACCESS_MODE cần DOMAIN"
		PUBLIC_URL="https://$DOMAIN"
		;;
	*) die "ACCESS_MODE không hợp lệ: $ACCESS_MODE (ip | proxy | letsencrypt)" ;;
	esac
	[ "$ACCESS_MODE" != letsencrypt ] || [ -n "$LE_EMAIL" ] || die "ACCESS_MODE=letsencrypt cần LE_EMAIL"
	case "$DB_MODE" in new | transfer | restore) ;; *) die "DB_MODE không hợp lệ: $DB_MODE (new | transfer | restore)" ;; esac
	[ "$DB_MODE" != transfer ] || [ -n "$BAK_FILE" ] || die "DB_MODE=transfer cần BAK_FILE"
	[[ "$WEB_CONCURRENCY" =~ ^[1-9][0-9]?$ ]] || die "WEB_CONCURRENCY phải là số ≥ 1"
	if ! [[ "$WEB_PORT" =~ ^[1-9][0-9]{0,4}$ ]] || [ "$WEB_PORT" -gt 65535 ]; then die "WEB_PORT không hợp lệ: $WEB_PORT"; fi
	FRONTEND_BIND=${WEB_PORT}
	[ "$ACCESS_MODE" = letsencrypt ] && FRONTEND_BIND=127.0.0.1:${WEB_PORT}
	return 0
}

# ─── 0b. DNS ─────────────────────────────────────────────────────────────────
# Thử 3 lần: DNS chập chờn (hay gặp với NAT của VMware) vẫn có lúc trả lời được
dns_ok() {
	local i
	for i in 1 2 3; do
		timeout 10 getent ahosts "$DNS_TEST_HOST" >/dev/null 2>&1 && return 0
		sleep 2
	done
	return 1
}

# Mọi bước sau đều tải từ Internet (apt, Docker, GitHub, npm). DNS của mạng hỏng thì
# apt chết giữa chừng với "Temporary failure resolving". Thêm DNS vào phần [Resolve]
# chung của systemd-resolved: dùng SONG SONG với DNS nhận từ DHCP / netplan (không
# thay thế), nên không đụng tới cấu hình mạng đang có và Docker cũng thấy DNS này.
step_dns() {
	log "DNS"
	local servers s tmp
	read -ra servers <<<"${DNS_SERVERS//,/ }"
	if [ "${#servers[@]}" -eq 0 ]; then
		if dns_ok; then
			ok "Phân giải được $DNS_TEST_HOST bằng DNS đang có"
			return 0
		fi
		s="$(awk '/^nameserver/ { printf "%s ", $2 }' /run/systemd/resolve/resolv.conf 2>/dev/null || true)"
		warn "Không phân giải được $DNS_TEST_HOST (DNS đang có: ${s:-không có})"
		[ -n "$(server_ip)" ] ||
			die "Máy chưa ra được mạng (không có default route), không phải lỗi DNS. Kiểm tra card mạng của máy ảo: ip -br addr; ip route"
		info "Thêm DNS cho máy này. Mạng viện chặn DNS ngoài thì nhập IP DNS nội bộ."
		if [ "${ASSUME_YES:-}" = 1 ]; then
			DNS_SERVERS="1.1.1.1 8.8.8.8"
		else
			ask DNS_SERVERS "DNS thêm vào (cách nhau bằng dấu cách)" "1.1.1.1 8.8.8.8"
		fi
		read -ra servers <<<"${DNS_SERVERS//,/ }"
		[ "${#servers[@]}" -gt 0 ] || die "Chưa nhập DNS nào"
		save_conf
	fi

	for s in "${servers[@]}"; do
		[[ "$s" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ || "$s" =~ ^[0-9A-Fa-f:]*:[0-9A-Fa-f:]*$ ]] ||
			die "DNS_SERVERS phải là địa chỉ IP, cách nhau bằng dấu cách (sai: '$s'). Sửa trong $CONF_FILE"
	done
	systemctl is-active -q systemd-resolved ||
		die "Máy không dùng systemd-resolved: tự thêm DNS (${servers[*]}) vào netplan (mục 4.2 tài liệu) rồi chạy lại"

	tmp="$(mktemp)"
	printf '# Tạo bởi scripts/setup-server.sh (bước dns). Gỡ: xoá file này rồi\n# sudo systemctl restart systemd-resolved\n[Resolve]\nDNS=%s\n' \
		"${servers[*]}" >"$tmp"
	sudo mkdir -p "$(dirname "$RESOLVED_DROPIN")"
	if install_if_changed "$tmp" "$RESOLVED_DROPIN"; then
		sudo systemctl restart systemd-resolved
	fi
	rm -f "$tmp"

	dns_ok ||
		die "Đã thêm DNS (${servers[*]}) nhưng vẫn không phân giải được $DNS_TEST_HOST. Mạng chặn DNS ngoài? Đặt IP DNS nội bộ: DNS_SERVERS=\"<IP>\" bash $SELF dns (xem: resolvectl status)"
	ok "DNS: ${servers[*]} ($RESOLVED_DROPIN)"
}

# ─── 1. Hệ thống ─────────────────────────────────────────────────────────────
step_system() {
	log "Cập nhật hệ thống, cài công cụ, múi giờ, swap, tự vá bảo mật"
	apt_get update
	if ! is_done full-upgrade; then
		apt_get full-upgrade
		done_mark full-upgrade
	fi
	apt_get install curl wget gnupg ca-certificates git ufw tmux htop unzip parted nano \
		openssl ssl-cert cron unattended-upgrades lvm2
	ok "Đã cài gói cơ bản"

	sudo timedatectl set-timezone Asia/Ho_Chi_Minh
	ok "Múi giờ: $(timedatectl show -p Timezone --value)"

	# Ổ hệ điều hành: trình cài Ubuntu hay chỉ cấp 1 nửa cho / → cấp nốt phần trống
	if [ "$(findmnt -no SOURCE /)" = /dev/mapper/ubuntu--vg-ubuntu--lv ]; then
		local free_g
		free_g="$(sudo vgs --noheadings --units g --nosuffix -o vg_free ubuntu-vg 2>/dev/null | tr -d ' ' || echo 0)"
		if awk -v f="${free_g:-0}" 'BEGIN { exit !(f > 1) }'; then
			sudo lvextend -r -l +100%FREE /dev/ubuntu-vg/ubuntu-lv
			ok "Mở rộng / thêm ${free_g} GB"
		fi
	fi
	ok "Ổ hệ điều hành: $(df -h --output=size,avail / | tail -n 1 | awk '{ print $1 " (trống " $2 ")" }')"

	if [ -z "$(swapon --noheadings --show)" ]; then
		sudo fallocate -l 4G /swapfile
		sudo chmod 600 /swapfile
		sudo mkswap /swapfile >/dev/null
		sudo swapon /swapfile
		grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
		ok "Tạo swap 4 GB"
	else
		ok "Đã có swap ($(free -h | awk '/^Swap:/ { print $2 }'))"
	fi

	printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' |
		sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null
	ok "Bật tự cài bản vá bảo mật (unattended-upgrades)"
}

# ─── 2. Firewall ─────────────────────────────────────────────────────────────
step_firewall() {
	log "Firewall (UFW)"
	sudo ufw default deny incoming >/dev/null
	sudo ufw default allow outgoing >/dev/null
	sudo ufw allow OpenSSH >/dev/null
	# Container Docker (172.16.0.0/12) gọi PostgreSQL trên host; máy khác thì không.
	# Thứ tự quan trọng: allow trước deny.
	sudo ufw allow from 172.16.0.0/12 to any port 5432 proto tcp >/dev/null
	sudo ufw deny 5432/tcp >/dev/null
	sudo ufw --force enable >/dev/null
	ok "Mở SSH, chỉ cho mạng Docker vào 5432"
	info "Cổng web ${WEB_PORT} do Docker mở, không qua UFW — bước 'ports' giới hạn riêng"
}

# ─── 3. Ổ dữ liệu /data ──────────────────────────────────────────────────────
step_disk() {
	log "Ổ dữ liệu /data"
	if mountpoint -q /data; then
		ok "/data đã mount"
	elif [ "$DATA_DISK" = none ] || [ "$DATA_DISK" = mounted ]; then
		sudo mkdir -p /data
		warn "/data nằm trên ổ hệ điều hành"
	else
		local disk="/dev/$DATA_DISK" part
		[ -b "$disk" ] || die "Không thấy ổ $disk"
		[ "$(lsblk -dnro TYPE "$disk")" = disk ] || die "$disk không phải ổ đĩa"
		[ "$(lsblk -nro NAME "$disk" | wc -l)" -eq 1 ] || die "$disk đã có phân vùng — không tự format. Kiểm tra: lsblk $disk"
		if sudo blkid -p "$disk" >/dev/null 2>&1; then
			die "$disk đã có dữ liệu/filesystem — không tự format. Kiểm tra: sudo blkid -p $disk"
		fi
		info "Phân vùng + format $disk"
		sudo parted -s "$disk" mklabel gpt
		sudo parted -s -a optimal "$disk" mkpart data ext4 0% 100%
		sudo partprobe "$disk"
		sudo udevadm settle
		case "$DATA_DISK" in *[0-9]) part="${disk}p1" ;; *) part="${disk}1" ;; esac
		[ -b "$part" ] || die "Không thấy phân vùng $part sau khi tạo"
		sudo mkfs.ext4 -q -L data "$part"
		local uuid
		uuid="$(sudo blkid -s UUID -o value "$part")"
		[ -n "$uuid" ] || die "Không lấy được UUID của $part"
		sudo mkdir -p /data
		if ! grep -qE '[[:space:]]/data[[:space:]]' /etc/fstab; then
			echo "UUID=$uuid /data ext4 defaults,noatime,nofail 0 2" | sudo tee -a /etc/fstab >/dev/null
		fi
		sudo systemctl daemon-reload
		sudo mount /data
		mountpoint -q /data || die "Mount /data không thành công"
		ok "Đã mount $part tại /data (UUID trong /etc/fstab, nofail)"
	fi

	sudo mkdir -p /data/code /data/docker /data/backup/db /data/backup/files "$IMPORT_DIR"
	sudo chown "$USER:$USER" /data/code /data/backup /data/backup/db /data/backup/files "$IMPORT_DIR"
	sudo chmod 700 "$IMPORT_DIR" # file backup chứa toàn bộ dữ liệu + khoá 2FA
	ok "Thư mục: /data/code /data/docker /data/backup/{db,files,import} — trống $(df -h --output=avail /data | tail -n 1 | tr -d ' ')"
}

# ─── 4. Docker ───────────────────────────────────────────────────────────────
step_docker() {
	log "Docker Engine (dữ liệu ở /data/docker)"
	if ! pkg_installed docker-ce; then
		local p
		for p in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
			pkg_installed "$p" && apt_get remove "$p"
		done
		if command -v snap >/dev/null && snap list docker >/dev/null 2>&1; then
			sudo snap remove --purge docker
		fi
		# data-root phải có TRƯỚC khi cài, để Docker không bắt đầu ở /var/lib/docker
		sudo mkdir -p /etc/docker
		if [ ! -f /etc/docker/daemon.json ]; then
			sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "data-root": "/data/docker",
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" }
}
EOF
		fi
		sudo install -m 0755 -d /etc/apt/keyrings
		sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
		sudo chmod a+r /etc/apt/keyrings/docker.asc
		sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
		apt_get update
		apt_get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
	fi
	sudo mkdir -p /etc/systemd/system/docker.service.d
	printf '[Unit]\nRequiresMountsFor=/data/docker\n' |
		sudo tee /etc/systemd/system/docker.service.d/data-mount.conf >/dev/null
	sudo systemctl daemon-reload
	sudo systemctl enable --now docker >/dev/null 2>&1

	local root
	root="$(sudo docker info --format '{{.DockerRootDir}}')"
	[ "$root" = /data/docker ] || warn "Docker đang lưu dữ liệu ở $root, không phải /data/docker (xem mục 8 tài liệu)"
	ok "$(sudo docker --version), compose $(sudo docker compose version --short)"

	if ! in_group docker; then
		sudo usermod -aG docker "$USER"
		ok "Thêm $USER vào nhóm docker"
	fi
	# Nhóm docker chưa có hiệu lực trong phiên SSH này → chạy tiếp các bước còn
	# lại bằng `sg docker` (không cần đăng xuất).
	if ! docker info >/dev/null 2>&1; then
		[ -z "${RMS_SETUP_SG:-}" ] || die "Vẫn không gọi được docker bằng user $USER"
		[ "${#REMAINING[@]}" -gt 0 ] || return 0
		info "Chạy tiếp với quyền nhóm docker..."
		exec sg docker -c "$(printf '%q ' env RMS_SETUP_SG=1 bash "$SELF" "${REMAINING[@]}")"
	fi
}

# ─── 5. Source code ──────────────────────────────────────────────────────────
step_repo() {
	log "Source code → $APP_DIR"
	if [ -f "$APP_DIR/docker-compose.prod.yml" ]; then
		ok "Đã có ($(git -C "$APP_DIR" log --oneline -1 2>/dev/null || echo 'không phải git repo'))"
		return 0
	fi
	if [ -z "$REPO_URL" ]; then
		REPO_URL="$(git -C "$SELF_DIR" remote get-url origin 2>/dev/null || echo "$DEFAULT_REPO_URL")"
	fi
	sudo mkdir -p "$(dirname "$APP_DIR")"
	sudo chown "$USER:$USER" "$(dirname "$APP_DIR")"

	if [[ "$REPO_URL" == git@github.com:* ]]; then
		# Repo private: deploy key chỉ đọc, chỉ dùng cho repo này
		mkdir -p ~/.ssh && chmod 700 ~/.ssh
		[ -f ~/.ssh/rms_deploy ] || ssh-keygen -q -t ed25519 -f ~/.ssh/rms_deploy -N "" -C "rms-vm-deploy"
		if ! grep -q 'IdentityFile ~/.ssh/rms_deploy' ~/.ssh/config 2>/dev/null; then
			printf 'Host github.com\n  IdentityFile ~/.ssh/rms_deploy\n  IdentitiesOnly yes\n' >>~/.ssh/config
			chmod 600 ~/.ssh/config
		fi
		ssh-keygen -F github.com >/dev/null 2>&1 || ssh-keyscan -t ed25519 github.com >>~/.ssh/known_hosts 2>/dev/null
		until github_ok; do
			info "GitHub chưa nhận khoá của máy này. Thêm deploy key:"
			info "  repo → Settings → Deploy keys → Add deploy key, KHÔNG tick 'Allow write access', dán dòng:"
			printf '\n%s\n\n' "$(cat ~/.ssh/rms_deploy.pub)"
			local a
			read -rp "   Thêm xong nhấn Enter (q để dừng): " a </dev/tty
			[ "$a" != q ] || die "Dừng. Chạy lại script sau khi thêm deploy key."
		done
		ok "GitHub đã nhận deploy key"
	fi
	git clone "$REPO_URL" "$APP_DIR"
	ok "Đã clone ($(git -C "$APP_DIR" log --oneline -1))"
}

# ─── 6. File cấu hình ────────────────────────────────────────────────────────
step_config() {
	log "File cấu hình (.env, backend/.env, backend/.env.production)"
	cd "$APP_DIR"
	umask 077

	if [ -f backend/.env ]; then
		ok "backend/.env đã có, giữ nguyên"
	else
		cp backend/.env.example backend/.env
		sed -i "s|^#[[:space:]]*APP_URL=.*|APP_URL=$PUBLIC_URL|" backend/.env
		grep -q "^APP_URL=" backend/.env || echo "APP_URL=$PUBLIC_URL" >>backend/.env
		ok "Tạo backend/.env (APP_URL=$PUBLIC_URL). Gửi email thật: sửa MAIL_ENABLED + SMTP_* trong file này"
	fi

	if [ -f backend/.env.production ]; then
		ok "backend/.env.production đã có, giữ nguyên"
	else
		{
			echo "DB_USER=rms_app"
			echo "DB_PASSWORD=$(gen_secret 32)"
			echo "SWAGGER_PASS=$(openssl rand -hex 16)"
			echo "UPLOAD_URL_SECRET=$(openssl rand -hex 32)"
			if [ "$ACCESS_MODE" = ip ]; then
				echo "# Đang vào bằng HTTP: cookie không có cờ Secure. Có HTTPS rồi thì XOÁ dòng này."
				echo "COOKIE_SECURE=false"
			fi
		} >backend/.env.production
		ok "Tạo backend/.env.production (mật khẩu rms_app tự sinh)"
	fi

	if [ -f .env ]; then
		ok ".env (compose) đã có, giữ nguyên"
	else
		{
			echo "# Tạo bởi scripts/setup-server.sh — xem mục 11.3 infra/cai-dat-may-ao-ubuntu.md"
			echo "CORS_ORIGIN=$PUBLIC_URL"
			echo "WEB_CONCURRENCY=$WEB_CONCURRENCY"
			echo "FRONTEND_BIND=$FRONTEND_BIND"
			[ -n "${TRUSTED_PROXIES:-}" ] && echo "TRUSTED_PROXIES=$TRUSTED_PROXIES"
			if [ "$ENABLE_CLAMAV" = no ]; then
				echo "# Tắt quét virus (RAM thấp). Bật lại: xoá dòng này, up -d không kèm --scale clamav=0"
				echo "CLAMAV_HOST="
			fi
		} >.env
		ok "Tạo .env (CORS_ORIGIN=$PUBLIC_URL, FRONTEND_BIND=$FRONTEND_BIND)"
	fi
	chmod 600 backend/.env backend/.env.production .env
	umask 022
}

# ─── 7. PostgreSQL 18 ────────────────────────────────────────────────────────
step_postgres() {
	log "PostgreSQL $PG_VER (cài thẳng trên Ubuntu, dữ liệu ở /data/pgsql)"
	local changed=0 tmp
	if ! pkg_installed "postgresql-$PG_VER"; then
		apt_get install postgresql-common
		sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
		# Không tạo cluster mặc định trên ổ hệ điều hành
		sudo mkdir -p /etc/postgresql-common/createcluster.d
		echo 'create_main_cluster = false' | sudo tee /etc/postgresql-common/createcluster.d/no-main.conf >/dev/null
		apt_get install "postgresql-$PG_VER"
	fi

	if ! pg_lsclusters -h 2>/dev/null | awk -v v="$PG_VER" '$1 == v && $2 == "main"' | grep -q .; then
		sudo mkdir -p /data/pgsql
		sudo chown postgres:postgres /data/pgsql
		sudo chmod 700 /data/pgsql
		sudo pg_createcluster "$PG_VER" main -d "$PG_DATA" \
			--locale-provider=builtin --locale=C.UTF-8 -e UTF8 -- --data-checksums >/dev/null
		changed=1
		ok "Tạo cluster $PG_VER/main tại $PG_DATA (data checksums)"
	else
		local dir
		dir="$(pg_lsclusters -h | awk -v v="$PG_VER" '$1 == v && $2 == "main" { print $6 }')"
		ok "Cluster $PG_VER/main đã có ($dir)"
		[[ "$dir" == /data/* ]] || warn "Dữ liệu PostgreSQL KHÔNG nằm trên /data — ổ hệ điều hành sẽ đầy dần"
	fi

	install_if_changed "$APP_DIR/infra/postgresql/rms.conf" "$PG_CONF_DIR/conf.d/rms.conf" && changed=1

	# rms.conf tính cho máy 12–16 GB. Máy ít RAM hơn: ghi đè bằng file đọc sau (zz-)
	tmp="$(mktemp)"
	if [ "$RAM_MB" -lt 7000 ]; then
		printf '# Máy < 8 GB RAM (setup-server.sh)\nshared_buffers = 1GB\neffective_cache_size = 3GB\nmaintenance_work_mem = 256MB\n' >"$tmp"
	elif [ "$RAM_MB" -lt 11000 ]; then
		cp "$APP_DIR/infra/postgresql/rms-ram-8gb.conf" "$tmp"
	fi
	if [ -s "$tmp" ]; then
		install_if_changed "$tmp" "$PG_CONF_DIR/conf.d/zz-rms-ram.conf" && changed=1
	elif sudo test -f "$PG_CONF_DIR/conf.d/zz-rms-ram.conf"; then
		sudo rm -f "$PG_CONF_DIR/conf.d/zz-rms-ram.conf"
		changed=1
	fi
	rm -f "$tmp"

	# pg_hba.rms.conf lên ĐẦU phần quy tắc (dòng khớp đầu tiên được dùng)
	local hba="$PG_CONF_DIR/pg_hba.conf"
	if ! sudo grep -qF "$HBA_MARK_BEGIN" "$hba"; then
		tmp="$(mktemp)"
		sudo cat "$hba" | awk -v f="$APP_DIR/infra/postgresql/pg_hba.rms.conf" \
			-v b="$HBA_MARK_BEGIN" -v e="$HBA_MARK_END" '
			function block(  l) { print b; while ((getline l < f) > 0) print l; print e; done = 1 }
			!done && /^[[:space:]]*(local|host)/ { block() }
			{ print }
			END { if (!done) block() }' >"$tmp"
		sudo cp -p "$hba" "$hba.bak.$(date +%Y%m%d%H%M%S)"
		sudo install -m 640 -o postgres -g postgres "$tmp" "$hba"
		rm -f "$tmp"
		changed=1
		ok "Thêm quy tắc Hospital RMS vào đầu pg_hba.conf (bản cũ: $hba.bak.*)"
	fi

	# Khởi động SAU khi /data đã mount
	sudo mkdir -p "/etc/systemd/system/postgresql@$PG_VER-main.service.d"
	printf '[Unit]\nRequiresMountsFor=/data/pgsql\n' |
		sudo tee "/etc/systemd/system/postgresql@$PG_VER-main.service.d/data-mount.conf" >/dev/null
	sudo systemctl daemon-reload
	sudo systemctl enable "postgresql@$PG_VER-main" >/dev/null 2>&1
	if [ "$changed" = 1 ] || ! systemctl is-active -q "postgresql@$PG_VER-main"; then
		sudo systemctl restart "postgresql@$PG_VER-main"
	fi
	wait_pg

	# Backend production luôn kết nối bằng SSL
	if [ "$(pgsu psql -tAc 'SHOW ssl')" != on ]; then
		printf "ssl = on\nssl_cert_file = '/etc/ssl/certs/ssl-cert-snakeoil.pem'\nssl_key_file = '/etc/ssl/private/ssl-cert-snakeoil.key'\n" |
			sudo tee "$PG_CONF_DIR/conf.d/zz-rms-ssl.conf" >/dev/null
		sudo systemctl restart "postgresql@$PG_VER-main"
		wait_pg
		[ "$(pgsu psql -tAc 'SHOW ssl')" = on ] || die "Không bật được SSL cho PostgreSQL (mục 6.3 infra/cai-dat-may-ao-ubuntu.md)"
	fi
	ok "$(pgsu psql -tAc "SELECT 'shared_buffers=' || current_setting('shared_buffers') || ', timezone=' || current_setting('timezone') || ', ssl=' || current_setting('ssl')")"
	ensure_db_and_roles
}

# Role + DB rms_hospital (infra/postgresql/01_tao_db_va_role.sql). Chạy lại an toàn: đã có
# thì bỏ qua, không đổi mật khẩu. Bước import gọi lại sau khi xoá DB để có DB trống.
# Mật khẩu: rms_migrate ở ~/.pgpass, rms_app ở backend/.env.production
ensure_db_and_roles() {
	local migrate_pw app_pw
	migrate_pw="$(migrate_password)"
	if [ -z "$migrate_pw" ]; then
		migrate_pw="$(gen_secret 32)"
		(
			umask 077
			touch ~/.pgpass
			echo "127.0.0.1:5432:*:rms_migrate:$migrate_pw" >>~/.pgpass
		)
	fi
	chmod 600 ~/.pgpass
	app_pw="$(env_value "$APP_DIR/backend/.env.production" DB_PASSWORD)"
	[ -n "$app_pw" ] || die "Thiếu DB_PASSWORD trong backend/.env.production"
	[[ "$migrate_pw$app_pw" =~ ^[A-Za-z0-9._~-]+$ ]] ||
		die "Mật khẩu DB có ký tự đặc biệt (chỉ nhận chữ, số, . _ ~ -). Tạo role tay theo mục 6.5 infra/cai-dat-may-ao-ubuntu.md"

	# Truyền mật khẩu qua stdin (\set), không lộ trên dòng lệnh. File SQL chạy lại an
	# toàn, KHÔNG đổi mật khẩu role đã có.
	{
		printf "\\\\set migrate_password '%s'\n\\\\set app_password '%s'\n" "$migrate_pw" "$app_pw"
		cat "$APP_DIR/infra/postgresql/01_tao_db_va_role.sql"
	} | pgsu psql -q -v ON_ERROR_STOP=1 >/dev/null

	PGPASSWORD="$migrate_pw" psql -h 127.0.0.1 -U rms_migrate -d rms_hospital -tAc 'SELECT 1' >/dev/null 2>&1 ||
		die "rms_migrate không đăng nhập được bằng mật khẩu trong ~/.pgpass (role có từ trước?). Đặt lại: sudo -u postgres psql -c '\\password rms_migrate' rồi sửa ~/.pgpass"
	PGPASSWORD="$app_pw" psql -h 127.0.0.1 -U rms_app -d rms_hospital -tAc 'SELECT 1' >/dev/null 2>&1 ||
		die "rms_app không đăng nhập được bằng DB_PASSWORD trong backend/.env.production. Đặt lại: sudo -u postgres psql -c '\\password rms_app'"
	ok "Role rms_migrate, rms_app và DB rms_hospital sẵn sàng"
}

wait_pg() {
	local i
	for i in $(seq 1 30); do
		pgsu pg_isready -q && return 0
		sleep 1
	done
	sudo journalctl -u "postgresql@$PG_VER-main" -n 30 --no-pager >&2 || true
	die "PostgreSQL không khởi động"
}

migrate_password() { [ -f ~/.pgpass ] && awk -F: '$1 == "127.0.0.1" && $4 == "rms_migrate" { print $5; exit }' ~/.pgpass || true; }

# ─── 8. Build image ──────────────────────────────────────────────────────────
step_build() {
	log "Build image backend + frontend (lần đầu 5–15 phút)"
	cd "$APP_DIR"
	if [ "${REBUILD:-}" != 1 ] && docker image inspect hospital_rms-backend hospital_rms-frontend >/dev/null 2>&1; then
		ok "Image đã có, bỏ qua (build lại: REBUILD=1 bash $SELF build start)"
		return 0
	fi
	compose build
	ok "Build xong"
}

# ─── 9. Dựng database ────────────────────────────────────────────────────────
run_backend_script() {
	(
		export DB_PASSWORD
		DB_PASSWORD="$(migrate_password)"
		compose run --rm --no-deps -T -e DB_USER=rms_migrate -e DB_PASSWORD backend node "$@"
	)
}
run_migrate() { run_backend_script scripts/migrate.js "$@"; }

# BYTES byte đầu của FILE (GZ=1: sau khi giải nén). gunzip bị head cắt ngang
# (SIGPIPE) không được làm hỏng pipefail.
dump_head() { # dump_head FILE GZ BYTES
	if [ "$2" = 1 ]; then { gunzip -c "$1" 2>/dev/null || true; } | head -c "$3"; else head -c "$3" "$1"; fi
}

is_gzip() { [ "$(head -c 2 "$1" | od -An -tx1 | tr -d ' \n')" = 1f8b ]; }

# In loại bản backup PostgreSQL của FILE: custom (pg_dump -Fc, "PGDMP"), tar (-Ft:
# tar có mục đầu "toc.dat" — khác gói uploads.tar.gz), sql (pg_dump thường); không
# phải dump thì in rỗng. .gz được giải nén phần đầu để xem.
dump_kind() {
	local gz=0 text
	is_gzip "$1" && gz=1
	text="$(dump_head "$1" "$gz" 4096 | tr -d '\000')"
	if [ "${text:0:5}" = PGDMP ]; then
		echo custom
	elif [ "$(dump_head "$1" "$gz" 262 | tail -c 5)" = ustar ] && [ "${text:0:7}" = toc.dat ]; then
		echo tar
	elif [[ "$text" == *"PostgreSQL database dump"* ]]; then
		echo sql
	fi
}

# Khôi phục file dump PostgreSQL vào DB (mặc định rms_hospital, đang trống) bằng superuser
# postgres: rms_migrate không khôi phục được (COMMENT ON EXTENSION pg_stat_statements cần
# chủ extension). Giữ nguyên chủ sở hữu + quyền như DB gốc (rms_migrate / rms_app).
# Nhận dạng theo nội dung (dump_kind), .gz đều được. --single-transaction: lỗi giữa chừng
# thì trả 1 (log ở trên) và DB đích không bị thay đổi.
restore_dump() { # restore_dump FILE [DB]
	local f="$1" db="${2:-rms_hospital}" gz=0 kind tmpd="" src note="" rc=0
	if is_gzip "$f"; then
		gz=1
		note=", nén gzip"
	fi
	kind="$(dump_kind "$f")"
	if [ -z "$kind" ]; then
		warn "$f không phải bản backup PostgreSQL (pg_dump -Fc / -Ft / .sql, có thể nén .gz)"
		return 1
	fi
	info "Định dạng: $kind$note"

	if [ "$kind" = sql ]; then
		if [ "$gz" = 1 ]; then
			gunzip -c "$f" | pgsu psql -X -q -o /dev/null -v ON_ERROR_STOP=1 --single-transaction -d "$db" || rc=1
		else
			pgsu psql -X -q -o /dev/null -v ON_ERROR_STOP=1 --single-transaction -d "$db" <"$f" || rc=1
		fi
	else
		# pg_restore cần đọc file có thể seek: postgres đọc thẳng được thì dùng luôn,
		# không thì (file trong thư mục riêng của user, hoặc .gz) chép / giải nén vào
		# /data/pgsql (của postgres, cùng ổ /data) rồi xoá
		src="$f"
		if [ "$gz" = 1 ] || ! pgsu test -r "$(readlink -f "$f")"; then
			tmpd="$(pgsu mktemp -d /data/pgsql/.rms-restore.XXXXXX)" || return 1
			src="$tmpd/rms_hospital.$kind"
			if [ "$gz" = 1 ]; then
				info "Giải nén tạm vào $tmpd"
				gunzip -c "$f" | pgsu tee "$src" >/dev/null || rc=1
			else
				sudo install -o postgres -g postgres -m 600 "$f" "$src" || rc=1
			fi
		fi
		if [ "$rc" = 0 ]; then
			pgsu pg_restore --single-transaction --exit-on-error -d "$db" "$(readlink -f "$src")" || rc=1
		fi
		[ -z "$tmpd" ] || sudo rm -rf "$tmpd"
	fi
	[ "$rc" = 0 ] || return 1
	pgsu psql -X -q -d "$db" -c ANALYZE # pg_restore không cập nhật thống kê cho planner
}

step_database() {
	log "Dựng database ($DB_MODE)"
	cd "$APP_DIR"
	local tables transferred=0 restored=0
	tables="$(psql -h 127.0.0.1 -U rms_migrate -d rms_hospital -tAc \
		"SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")"
	if [ "$tables" -gt 0 ]; then
		ok "DB đã có $tables bảng, không dựng lại"
	elif [ "$DB_MODE" = transfer ]; then
		local a
		until [ -r "$BAK_FILE" ]; do
			info "Chưa thấy $BAK_FILE. Trên máy của bạn chép file lên (mục 7 tài liệu):"
			info "  scp <file>.bak $USER@$(server_ip):$BAK_FILE"
			read -rp "   Chép xong nhấn Enter (q để dừng): " a </dev/tty
			[ "$a" != q ] || die "Dừng. Chép file .bak lên rồi chạy lại: bash $SELF database files start https ports backup jwt ssh"
		done
		chmod 600 "$BAK_FILE" 2>/dev/null || true
		info "Chuyển dữ liệu từ $BAK_FILE (dựng SQL Server tạm trong Docker, lâu tuỳ dung lượng)"
		compose up -d redis # tạo mạng Docker của stack
		PG_TARGET_PASSWORD="$(migrate_password)" \
			bash "$APP_DIR/backend/scripts/pg-transfer/transfer-from-bak.sh" "$BAK_FILE"
		ok "Chuyển dữ liệu xong"
		transferred=1
	elif [ "$DB_MODE" = restore ]; then
		local a
		# DUMP_FILE đặt sẵn (biến môi trường / rms-setup.env) thì dùng, không thì chọn trong IMPORT_DIR
		while :; do
			if [ -n "${DUMP_FILE:-}" ]; then
				[ -r "$DUMP_FILE" ] && break
				info "Chưa thấy $DUMP_FILE. Chép bản backup PostgreSQL lên (vd rms_hospital_<ngày>.dump của máy cũ):"
				info "  scp rms_hospital_<ngày>.dump $USER@$(server_ip):$DUMP_FILE"
			else
				scan_import
				if [ "${#FOUND_DUMP[@]}" -gt 0 ]; then
					choose_import DUMP_FILE "Bản backup PostgreSQL để khôi phục" "${FOUND_DUMP[@]}"
					[ -n "$DUMP_FILE" ] && break
					die "Chưa chọn bản backup. Muốn dựng DB trống: sửa DB_MODE=new trong $CONF_FILE rồi chạy lại"
				fi
				info "Chưa có bản backup PostgreSQL trong $IMPORT_DIR. Từ máy của bạn chép lên"
				info "(vd rms_hospital_<ngày>.dump của máy cũ, kèm uploads.tar.gz / secrets.tar.gz nếu có):"
				info "  scp <các file> $USER@$(server_ip):$IMPORT_DIR/"
			fi
			read -rp "   Chép xong nhấn Enter (q để dừng): " a </dev/tty
			[ "$a" != q ] || die "Dừng. Chép file dump lên rồi chạy lại: bash $SELF database files start https ports backup jwt ssh"
		done
		info "Khôi phục từ $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1)) bằng superuser postgres"
		restore_dump "$DUMP_FILE" ||
			die "Khôi phục $DUMP_FILE lỗi (log ở trên). DB vẫn trống (chạy trong 1 transaction) — sửa rồi chạy lại: bash $SELF database files start"
		restored=1
		ok "Khôi phục xong: $(psql -h 127.0.0.1 -U rms_migrate -d rms_hospital -tAc \
			"SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'") bảng"
	else
		run_migrate init
		ok "Tạo schema (baseline + migration)"
	fi
	run_migrate up
	run_migrate status

	# Vai trò hệ thống + tài khoản Super Admin + Admin. Chạy lại an toàn: đã có thì bỏ qua.
	#  - DB mới: tạo cả 2 tài khoản, nạp danh mục.
	#  - Vừa chuyển từ .bak (lần chạy này): tài khoản toàn quyền duy nhất là "admin" của hệ
	#    thống cũ thì bỏ nó (xoá / vô hiệu hoá + đổi tên admin_cu), tạo superadmin + admin mới.
	#  - DB chuyển từ trước (chạy lại), hoặc khôi phục từ file dump (DB_MODE=restore — tài khoản
	#    của hệ thống mới sẵn trong bản backup): chỉ bảo đảm có Super Admin, không đụng tài khoản cũ.
	log "Vai trò hệ thống và tài khoản quản trị"
	if [ "$transferred" = 1 ]; then
		run_backend_script scripts/init-system.js --username="$ADMIN_USERNAME" \
			--admin-username="$LIMITED_ADMIN_USERNAME" --replace-legacy-admin
	elif [ "$DB_MODE" = new ]; then
		run_backend_script scripts/init-system.js --username="$ADMIN_USERNAME" \
			--admin-username="$LIMITED_ADMIN_USERNAME"
		# Danh mục NCKH, đào tạo / CME, nhân sự — chỉ nạp bảng còn trống
		log "Danh mục cơ bản"
		run_backend_script scripts/seed-catalogs.js
	else
		run_backend_script scripts/init-system.js --username="$ADMIN_USERNAME" --no-admin-account
	fi
	[ "$restored" = 0 ] || remove_imported "$DUMP_FILE"
}

# Giải nén 1 gói .tar.gz (uploads | secrets) vào volume server_<kind>, bằng
# backend/scripts/import-old-files.sh trong container backend (compose tự tạo volume).
# Gói ghép vào file đang có: trùng tên thì ghi đè, không xoá file nào.
import_old_file() { # import_old_file uploads|secrets FILE
	local kind="$1" file="$2"
	[ "$kind" = secrets ] && chmod 600 "$file" 2>/dev/null || true
	info "Giải nén $file ($(du -h "$file" | cut -f1)) vào volume server_$kind"
	cd "$APP_DIR"
	compose run --rm --no-deps -T -u 0 --entrypoint sh \
		-v "$(dirname "$(readlink -f "$file")"):/import:ro" backend \
		scripts/import-old-files.sh "$kind" "/import/$(basename "$file")" | sed 's/^/   /'
}

# Nhập xong thì xoá file nguồn (dump / .tar.gz) — secrets.tar.gz chứa khoá 2FA, dump
# chứa toàn bộ dữ liệu: không để nằm lại trên đĩa. Giữ lại: KEEP_IMPORT_FILES=1.
remove_imported() {
	local f
	for f in "$@"; do
		[ -n "$f" ] && [ -e "$f" ] || continue
		if [ "${KEEP_IMPORT_FILES:-}" = 1 ]; then
			info "Giữ lại $f (KEEP_IMPORT_FILES=1)"
			continue
		fi
		rm -f -- "$f" 2>/dev/null || sudo rm -f -- "$f"
		ok "Đã xoá file đã nhập: $f"
	done
}

# ─── 9b. File upload + khoá bí mật của hệ thống cũ ──────────────────────────
# Giải nén uploads.tar.gz / secrets.tar.gz (mục C.6 tài liệu chuyển dữ liệu) vào volume
# server_uploads / server_secrets bằng backend/scripts/import-old-files.sh, chạy trong
# container backend (compose tự tạo volume nếu chưa có). Mỗi loại chỉ 1 lần.
# File lấy từ UPLOADS_FILE / SECRETS_FILE nếu đặt sẵn, không thì (DB_MODE transfer |
# restore) chọn trong IMPORT_DIR; không có thì bỏ qua — nạp sau bằng bước import.
step_files() {
	local kind var file a imported=0 changed=0 scanned=0 found=()
	for kind in uploads secrets; do
		var="${kind^^}_FILE"
		file="${!var:-}"
		[ "$file" != none ] || continue
		[ -n "$file" ] || [ "$DB_MODE" != new ] || continue
		[ "$imported" = 1 ] || log "File của hệ thống cũ"
		imported=1
		if is_done "files-$kind"; then
			ok "$kind: đã giải nén ở lần chạy trước, bỏ qua (nạp gói khác: bash $SELF import)"
			continue
		fi
		if [ -z "$file" ]; then
			[ "$scanned" = 1 ] || scan_import
			scanned=1
			if [ "$kind" = uploads ]; then found=("${FOUND_UPLOADS[@]}"); else found=("${FOUND_SECRETS[@]}"); fi
			if [ "${#found[@]}" -eq 0 ]; then
				info "$kind: không có $kind.tar.gz trong $IMPORT_DIR — bỏ qua (nạp sau: bash $SELF import)"
				continue
			fi
			choose_import "$var" "$([ "$kind" = uploads ] && echo 'File upload cũ (.tar.gz)' || echo 'Khoá 2FA + JWT cũ (.tar.gz)')" "${found[@]}"
			file="${!var:-}"
			[ -n "$file" ] || continue
		fi
		until [ -r "$file" ]; do
			info "Chưa thấy $file. Trên máy chủ cũ đóng gói rồi chép lên (mục C.6 tài liệu chuyển dữ liệu):"
			info "  scp $kind.tar.gz $USER@$(server_ip):$file"
			read -rp "   Chép xong nhấn Enter (s = bỏ qua file này, q = dừng): " a </dev/tty
			[ "$a" != q ] || die "Dừng. Chép file lên rồi chạy lại: bash $SELF files start"
			if [ "$a" = s ]; then
				warn "Bỏ qua $kind. Làm sau: đặt $var rồi chạy bash $SELF files"
				continue 2
			fi
		done
		import_old_file "$kind" "$file"
		changed=1
		done_mark "files-$kind"
		ok "$kind: xong"
		remove_imported "$file"
	done
	[ "$changed" = 1 ] || return 0
	# Backend đang chạy (chạy lại bước này sau start) thì khởi động lại để đọc khoá mới
	if [ -n "$(compose ps -q --status running backend 2>/dev/null)" ]; then
		compose restart backend
		ok "Đã khởi động lại backend"
	fi
	return 0
}

# ─── 9c. Cập nhật từ file sao lưu (bước import — chỉ chạy khi gọi tên) ──────
# Hệ thống đã chạy, muốn nạp dữ liệu mới từ máy khác / bản backup:
#   scp rms_hospital_<ngày>.dump uploads.tar.gz secrets.tar.gz rms:/data/backup/import/
#   bash setup-server.sh import
# Chọn file theo số, sao lưu DB đang dùng, thay DB, ghép file upload, khởi động lại,
# xong thì xoá file nguồn. Lỗi giữa chừng thì tự trả lại DB cũ.

# File ở cấp cao nhất của IMPORT_DIR, phân loại theo nội dung, mới nhất trước:
# FOUND_DUMP (bản backup PostgreSQL), FOUND_SECRETS (.tar.gz có "secret" trong tên),
# FOUND_UPLOADS (.tar.gz còn lại). File khác: cảnh báo, bỏ qua.
scan_import() {
	local f others=()
	FOUND_DUMP=() FOUND_UPLOADS=() FOUND_SECRETS=()
	[ -d "$IMPORT_DIR" ] || return 0
	while IFS= read -r f; do
		[ -r "$f" ] || {
			warn "Không đọc được $f, bỏ qua"
			continue
		}
		if [ -n "$(dump_kind "$f")" ]; then
			FOUND_DUMP+=("$f")
		elif is_gzip "$f"; then
			case "$(basename "$f" | tr '[:upper:]' '[:lower:]')" in
			*secret*) FOUND_SECRETS+=("$f") ;;
			*) FOUND_UPLOADS+=("$f") ;;
			esac
		else
			others+=("$(basename "$f")")
		fi
	done < <(find "$IMPORT_DIR" -maxdepth 1 -type f ! -name '.*' -printf '%T@\t%p\n' | sort -rn | cut -f2-)
	[ "${#others[@]}" -eq 0 ] || warn "Trong $IMPORT_DIR có file không nhận ra, bỏ qua: ${others[*]}"
}

# choose_import VAR "mô tả" FILE... — VAR đã đặt (biến môi trường) thì dùng luôn
# (none = bỏ qua); ASSUME_YES=1 lấy file đầu (mới nhất); không thì hỏi theo số.
choose_import() {
	local var="$1" label="$2" ans f n=0
	shift 2
	if [ -n "${!var:-}" ]; then
		if [ "${!var}" = none ]; then
			printf -v "$var" '%s' ''
		else
			[ -r "${!var}" ] || die "$var=${!var}: không đọc được file"
			info "$label: ${!var}"
		fi
		return 0
	fi
	[ $# -gt 0 ] || return 0
	if [ "${ASSUME_YES:-}" = 1 ]; then
		printf -v "$var" '%s' "$1"
		info "$label: $1"
		return 0
	fi
	info "$label:"
	for f in "$@"; do
		n=$((n + 1))
		info "  $n) $(basename "$f")   $(du -h "$f" | cut -f1), $(date -r "$f" '+%d/%m/%Y %H:%M')"
	done
	info "  0) không dùng"
	while :; do
		read -rp "   Chọn [1]: " ans </dev/tty
		ans="${ans:-1}"
		[[ "$ans" =~ ^[0-9]+$ ]] && [ "$ans" -le $# ] && break
		warn "Nhập số từ 0 đến $#"
	done
	[ "$ans" = 0 ] || printf -v "$var" '%s' "${!ans}"
}

# Khôi phục lỗi / backend không lên: bỏ DB vừa nạp, đổi DB cũ về tên rms_hospital
import_rollback() {
	local old="$1"
	warn "Trả lại DB cũ ($old → rms_hospital)"
	pgsu psql -X -q -d postgres -c 'DROP DATABASE IF EXISTS rms_hospital WITH (FORCE)' \
		-c "ALTER DATABASE $old RENAME TO rms_hospital" ||
		warn "Không trả lại được — làm tay: sudo -u postgres psql -c 'ALTER DATABASE $old RENAME TO rms_hospital'"
	(cd "$APP_DIR" && compose up -d backend) || true
	warn "File nguồn vẫn giữ trong $IMPORT_DIR"
}

step_import() {
	log "Cập nhật dữ liệu từ file sao lưu ($IMPORT_DIR)"
	cd "$APP_DIR"
	IMPORT_DUMP="${IMPORT_DUMP:-}" IMPORT_UPLOADS="${IMPORT_UPLOADS:-}" IMPORT_SECRETS="${IMPORT_SECRETS:-}"
	[ -d "$IMPORT_DIR" ] || sudo install -d -o "$USER" -g "$(id -gn)" -m 700 "$IMPORT_DIR"

	scan_import
	choose_import IMPORT_DUMP "Bản backup PostgreSQL — THAY toàn bộ dữ liệu đang có" "${FOUND_DUMP[@]}"
	choose_import IMPORT_UPLOADS "File upload (.tar.gz) — ghép vào file đang có" "${FOUND_UPLOADS[@]}"
	choose_import IMPORT_SECRETS "Khoá 2FA + JWT (.tar.gz) — thay khoá đang có" "${FOUND_SECRETS[@]}"
	if [ -z "$IMPORT_DUMP$IMPORT_UPLOADS$IMPORT_SECRETS" ]; then
		info "Không có file nào để nạp. Từ máy của bạn chép lên rồi chạy lại:"
		info "  scp rms_hospital_<ngày>.dump uploads.tar.gz secrets.tar.gz $USER@$(server_ip):$IMPORT_DIR/"
		info "  bash $SELF import"
		return 0
	fi

	local stamp old bk
	stamp="$(date +%Y%m%d_%H%M%S)"
	old="rms_hospital_truoc_import_$stamp"
	bk="/data/backup/db/truoc-import/rms_hospital_$stamp.dump"
	log "Sẽ cập nhật"
	[ -z "$IMPORT_DUMP" ] || info "Database   : THAY bằng $IMPORT_DUMP (bản đang dùng sao lưu vào $bk)"
	[ -z "$IMPORT_UPLOADS" ] || info "File upload: ghép $IMPORT_UPLOADS (trùng tên thì ghi đè)"
	[ -z "$IMPORT_SECRETS" ] || info "Khoá bí mật: thay bằng $IMPORT_SECRETS (khoá đang có chép sang .truoc-import-*)"
	if [ "${KEEP_IMPORT_FILES:-}" = 1 ]; then
		info "Giữ lại file nguồn (KEEP_IMPORT_FILES=1)"
	else
		info "Xong thì XOÁ các file trên khỏi $IMPORT_DIR (giữ lại: KEEP_IMPORT_FILES=1)"
	fi
	[ -z "$IMPORT_DUMP" ] || warn "Hệ thống ngừng phục vụ trong lúc khôi phục"
	confirm "Tiếp tục?" N || die "Đã huỷ. Không có gì bị thay đổi."

	if [ -n "$IMPORT_DUMP" ]; then
		compose stop backend
		sudo install -d -o postgres -g postgres -m 750 /data/backup/db/truoc-import
		info "Sao lưu DB đang dùng → $bk"
		pgsu pg_dump -Fc -d rms_hospital -f "$bk"
		ok "Đã sao lưu ($(sudo du -h "$bk" | cut -f1))"

		# Đổi tên DB đang dùng sang bên (không xoá): lỗi thì đổi lại ngay
		local i
		for i in 1 2 3 4 5; do
			pgsu psql -X -q -o /dev/null -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
				WHERE datname = 'rms_hospital' AND pid <> pg_backend_pid()"
			pgsu psql -X -q -d postgres -c "ALTER DATABASE rms_hospital RENAME TO $old" 2>/dev/null && break
			if [ "$i" = 5 ]; then
				compose up -d backend
				die "Không đổi tên được DB rms_hospital (còn kết nối khác). Không có gì bị thay đổi."
			fi
			sleep 2
		done
		# shellcheck disable=SC2064 # cố ý: lấy tên DB cũ ngay lúc này
		trap "import_rollback $old" EXIT
		ensure_db_and_roles
		info "Khôi phục $IMPORT_DUMP ($(du -h "$IMPORT_DUMP" | cut -f1))"
		restore_dump "$IMPORT_DUMP" || die "Khôi phục $IMPORT_DUMP lỗi (log ở trên)"
		ok "Khôi phục xong: $(pgsu psql -X -tAc "SELECT count(*) FROM information_schema.tables
			WHERE table_schema = 'public' AND table_type = 'BASE TABLE'" -d rms_hospital) bảng"
		run_migrate up
		run_backend_script scripts/init-system.js --username="$ADMIN_USERNAME" --no-admin-account
	fi
	[ -z "$IMPORT_UPLOADS" ] || import_old_file uploads "$IMPORT_UPLOADS"
	[ -z "$IMPORT_SECRETS" ] || import_old_file secrets "$IMPORT_SECRETS"

	if [ -n "$IMPORT_DUMP$IMPORT_SECRETS" ]; then
		# Backend đọc khoá lúc khởi động; thay DB thì backend đang dừng, up -d bật lại
		[ -n "$IMPORT_DUMP" ] || compose restart backend
		step_start # không khoẻ thì (có thay DB) trả lại DB cũ
	fi
	if [ -n "$IMPORT_DUMP" ]; then
		trap - EXIT
		pgsu psql -X -q -d postgres -c "DROP DATABASE $old"
		ok "Đã bỏ DB cũ (còn bản sao lưu $bk)"
	fi
	remove_imported "$IMPORT_DUMP" "$IMPORT_UPLOADS" "$IMPORT_SECRETS"
	ok "Cập nhật xong"
}

# ─── 10. Khởi động ───────────────────────────────────────────────────────────
step_start() {
	log "Khởi động"
	cd "$APP_DIR"
	if [ "$ENABLE_CLAMAV" = no ]; then
		compose up -d --scale clamav=0
	else
		compose up -d
	fi
	info "Chờ backend sẵn sàng (tối đa 5 phút)..."
	local i
	for i in $(seq 1 60); do
		if curl -fsS --max-time 5 -o /dev/null http://127.0.0.1:3001/health/db 2>/dev/null &&
			curl -fsS --max-time 5 -o /dev/null http://127.0.0.1:${WEB_PORT} 2>/dev/null; then
			compose ps
			ok "Backend nối được PostgreSQL, frontend trả 200"
			return 0
		fi
		sleep 5
	done
	compose ps || true
	compose logs --tail 80 backend || true
	die "Backend chưa khoẻ sau 5 phút (log ở trên, bảng Xử lý sự cố mục 16 tài liệu)"
}

# ─── 11. HTTPS trên máy này ──────────────────────────────────────────────────
step_https() {
	[ "$ACCESS_MODE" = letsencrypt ] || return 0
	log "HTTPS: nginx + Let's Encrypt cho $DOMAIN"
	apt_get install nginx certbot python3-certbot-nginx
	if [ ! -f /etc/nginx/sites-available/rms ]; then
		sudo tee /etc/nginx/sites-available/rms >/dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size 300m;

    location / {
        proxy_pass http://127.0.0.1:${WEB_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Forwarded-For   \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Connection        "";
        # SSE (thông báo realtime)
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
EOF
	fi
	sudo ln -sf /etc/nginx/sites-available/rms /etc/nginx/sites-enabled/rms
	sudo rm -f /etc/nginx/sites-enabled/default
	sudo nginx -t -q
	sudo systemctl reload nginx
	sudo ufw allow 'Nginx Full' >/dev/null
	if sudo test -d "/etc/letsencrypt/live/$DOMAIN"; then
		ok "Đã có chứng chỉ cho $DOMAIN"
	elif sudo certbot --nginx -d "$DOMAIN" -m "$LE_EMAIL" --agree-tos --no-eff-email --redirect -n; then
		ok "Đã cấp chứng chỉ, tự gia hạn bằng certbot.timer"
	else
		warn "Chưa lấy được chứng chỉ (domain chưa trỏ về máy này, hoặc 80/443 chưa mở từ Internet)."
		warn "Sửa xong chạy lại: bash $SELF https"
	fi
}

# ─── 11b. Cổng Docker publish ────────────────────────────────────────────────
# Docker mở cổng web (WEB_PORT) bằng iptables riêng, bỏ qua UFW → chặn ở DOCKER-USER, chỉ cho
# nguồn cần thiết (scripts/firewall-ports.sh, mục 13.2 tài liệu).
step_ports() {
	log "Giới hạn nguồn vào cổng Docker publish (${WEB_PORT})"
	local allow="" p
	case "$ACCESS_MODE" in
	ip) allow="${WEB_PORT}@any" ;;
	proxy)
		for p in ${TRUSTED_PROXIES//,/ }; do allow+=" ${WEB_PORT}@$p"; done
		allow="${allow# }"
		[ -n "$allow" ] || allow="${WEB_PORT}@any"
		;;
	letsencrypt) allow="" ;; # FRONTEND_BIND=127.0.0.1:${WEB_PORT}, nginx trên máy gọi qua loopback
	esac
	sudo bash "$APP_DIR/scripts/firewall-ports.sh" apply --allow "$allow" | sed 's/^/   /' || true
	case "$ACCESS_MODE" in
	ip) warn "${WEB_PORT} đang mở cho mọi máy (đang thử bằng http://IP:${WEB_PORT}). Có reverse proxy rồi: sudo bash $APP_DIR/scripts/firewall-ports.sh apply --allow \"${WEB_PORT}@<IP proxy>\"" ;;
	proxy) [ -n "${TRUSTED_PROXIES:-}" ] || warn "Chưa khai TRUSTED_PROXIES → ${WEB_PORT} mở cho mọi máy. Biết IP proxy rồi: sudo bash $APP_DIR/scripts/firewall-ports.sh apply --allow \"${WEB_PORT}@<IP proxy>\"" ;;
	esac
	return 0
}

# ─── 12. Sao lưu hằng đêm ────────────────────────────────────────────────────
step_backup() {
	log "Sao lưu hằng đêm 23:30 (DB + khoá bí mật), giữ 14 ngày"
	sudo install -d -o postgres -g postgres -m 750 /data/backup/db/daily
	sudo tee /usr/local/bin/rms-backup-db.sh >/dev/null <<'EOF'
#!/bin/sh
# Tạo bởi scripts/setup-server.sh — mục 14.2–14.3 infra/cai-dat-may-ao-ubuntu.md
set -e
umask 077
DIR=/data/backup/db/daily
FILE="$DIR/rms_hospital_$(date +%F).dump"
cd /
sudo -u postgres pg_dump -Fc -d rms_hospital -f "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
sudo -u postgres pg_restore -l "$FILE" > /dev/null    # file đọc được
find "$DIR" -name 'rms_hospital_20*.dump' -mtime +14 -delete
# Khoá giải mã 2FA + JWT secret: phải sao lưu cùng lịch với DB
if docker volume inspect hospital_rms_server_secrets > /dev/null 2>&1; then
	docker run --rm -v hospital_rms_server_secrets:/data:ro -v /data/backup/files:/backup alpine \
		tar czf "/backup/secrets-$(date +%F).tar.gz" -C /data .
	find /data/backup/files -name 'secrets-20*.tar.gz' -mtime +14 -delete
fi
echo "$(date '+%F %T') backup OK $(du -h "$FILE" | cut -f1)"
EOF
	sudo chmod 700 /usr/local/bin/rms-backup-db.sh
	echo '30 23 * * * root /usr/local/bin/rms-backup-db.sh >> /var/log/rms-backup.log 2>&1' |
		sudo tee /etc/cron.d/rms-backup-db >/dev/null
	sudo /usr/local/bin/rms-backup-db.sh
	ok "Chạy thử OK. Bản sao lưu vẫn nằm trên ổ /data: chép định kỳ ra NAS (mục 14.4)"
}

# ─── 13. Lịch đổi JWT secret ─────────────────────────────────────────────────
step_jwt() {
	log "Lịch đổi JWT secret (4 tuần/lần, 02:30 Chủ nhật)"
	bash "$APP_DIR/scripts/rotate-jwt-secrets.sh" --register | sed 's/^/   /'
}

# ─── 14. Khoá SSH bằng mật khẩu ──────────────────────────────────────────────
step_ssh() {
	[ "$HARDEN_SSH" = yes ] || return 0
	log "SSH: tắt đăng nhập bằng mật khẩu, chặn root"
	[ -s "$HOME/.ssh/authorized_keys" ] || {
		warn "Không có ~/.ssh/authorized_keys — bỏ qua để tránh khoá mất đường vào"
		return 0
	}
	# 00- vì sshd lấy giá trị gặp ĐẦU TIÊN (50-cloud-init.conf có thể bật lại mật khẩu)
	sudo tee /etc/ssh/sshd_config.d/00-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
MaxAuthTries 4
EOF
	sudo sshd -t || {
		sudo rm -f /etc/ssh/sshd_config.d/00-hardening.conf
		die "Cấu hình sshd không hợp lệ, đã gỡ lại"
	}
	sudo systemctl restart ssh
	ok "Đã áp dụng. Phiên SSH đang mở không bị ngắt"
	warn "Mở cửa sổ MỚI thử 'ssh rms' trước khi đóng cửa sổ này. Không vào được: sudo rm /etc/ssh/sshd_config.d/00-hardening.conf && sudo systemctl reload ssh"
}

# ─── Tổng kết ────────────────────────────────────────────────────────────────
summary() {
	log "XONG"
	info "Web          : $PUBLIC_URL"
	local admins="$ADMIN_USERNAME (Super Admin)"
	admins+=", $LIMITED_ADMIN_USERNAME (Admin, nếu đã tạo)"
	info "Quản trị     : $admins"
	info "               mật khẩu tạm in ở bước 'Vai trò hệ thống' phía trên (lần tạo đầu)."
	info "               Quên/hết hạn: cd $APP_DIR && DB_PASSWORD=\$(awk -F: '\$4==\"rms_migrate\"{print \$5}' ~/.pgpass) \\"
	info "               docker compose -f docker-compose.prod.yml run --rm --no-deps -T -e DB_USER=rms_migrate -e DB_PASSWORD \\"
	info "               backend node scripts/init-system.js --reset-admin --username=$ADMIN_USERNAME"
	info "Source + .env: $APP_DIR"
	info "Mật khẩu DB  : rms_migrate → ~/.pgpass ; rms_app → $APP_DIR/backend/.env.production"
	info "               Chép 2 mật khẩu này vào nơi quản lý mật khẩu của viện."
	info "Sao lưu      : /data/backup/db/daily, /data/backup/files (log /var/log/rms-backup.log)"
	info "Log cài đặt  : $LOG_FILE"
	echo
	info "Còn làm tay:"
	[ "$ACCESS_MODE" = proxy ] &&
		info "• Trỏ reverse proxy HTTPS về http://$(server_ip):${WEB_PORT} (kèm X-Forwarded-For, X-Forwarded-Proto: https)"
	[ "$ACCESS_MODE" = ip ] &&
		info "• Có HTTPS rồi: xoá COOKIE_SECURE=false trong backend/.env.production, sửa CORS_ORIGIN trong .env, up -d"
	info "• IP tĩnh (nếu DHCP chưa giữ cố định IP): mục 4.2"
	info "• Tự triển khai bằng CI/CD (GitHub runner + biến môi trường production): mục 15"
	info "• SSH lại 1 lần để dùng lệnh docker không cần sudo"
	[ -f /var/run/reboot-required ] &&
		warn "Có bản cập nhật cần khởi động lại: sudo reboot (mọi dịch vụ tự chạy lại)"
	return 0
}

# ─── Chạy ────────────────────────────────────────────────────────────────────
ORIG_ARGS=("$@")
SELECTED=()
for a in "$@"; do
	case "$a" in
	-h | --help) usage 0 ;;
	--list)
		printf '%s\n' "${STEPS[@]}"
		printf '%s   (chỉ chạy khi gọi tên)\n' "${EXTRA_STEPS[@]}"
		exit 0
		;;
	*)
		printf '%s\n' "${STEPS[@]}" "${EXTRA_STEPS[@]}" | grep -qx "$a" ||
			die "Không có bước '$a'. Các bước: ${STEPS[*]} — chỉ chạy khi gọi tên: ${EXTRA_STEPS[*]}"
		SELECTED+=("$a")
		;;
	esac
done
[ "${#SELECTED[@]}" -gt 0 ] || SELECTED=("${STEPS[@]}")

# Bản chạy lại bằng `sg docker` đã có tee của bản trước, không ghi log 2 lần
if [ -z "${RMS_SETUP_SG:-}" ]; then
	touch "$LOG_FILE" && chmod 600 "$LOG_FILE"
	exec > >(tee -a "$LOG_FILE") 2>&1
fi
echo "──── $(date '+%F %T') setup-server.sh ${ORIG_ARGS[*]:-}"

if [ -z "${TMUX:-}" ] && [ -n "${SSH_CONNECTION:-}" ] && [ -z "${RMS_SETUP_SG:-}" ]; then
	warn "Không chạy trong tmux: mất SSH giữa chừng là huỷ lệnh. Nên: tmux new -s rms rồi chạy lại."
fi

preflight
collect_answers
for i in "${!SELECTED[@]}"; do
	REMAINING=("${SELECTED[@]:i+1}")
	"step_${SELECTED[$i]}"
done
[ "${SELECTED[*]}" = import ] || summary
