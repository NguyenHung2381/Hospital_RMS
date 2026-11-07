#!/usr/bin/env bash
# Kiểm soát cổng mở trên máy chủ production (Ubuntu + UFW + Docker).
#
# Vấn đề: Docker mở cổng publish (8081 của frontend) bằng iptables riêng, gói tin
# đi qua chain FORWARD → BỎ QUA UFW. `ufw deny 8081` không có tác dụng, máy nào
# trong LAN cũng gọi thẳng được 8081. Script này chèn chain RMS-PORTS vào
# DOCKER-USER (Docker xét chain này TRƯỚC rule của nó): chỉ cặp cổng@nguồn được
# khai mới vào được container, mọi cổng publish khác bị chặn từ máy khác —
# kể cả cổng lỡ publish thêm sau này (vd ai đó thêm "6379:6379").
# Truy cập từ chính máy chủ (127.0.0.1:8081, reverse proxy cùng máy) không đi qua
# FORWARD nên không bị ảnh hưởng. SSH, 80/443, 5432 vẫn do UFW quản.
#
#   sudo bash scripts/firewall-ports.sh                    # = status: chỉ xem, không đổi gì
#   sudo bash scripts/firewall-ports.sh apply --allow "8081@10.0.0.5"
#   sudo bash scripts/firewall-ports.sh apply              # áp lại theo file cấu hình đã có
#   sudo bash scripts/firewall-ports.sh remove             # gỡ, trả về như Docker mặc định
#
# --allow: danh sách "cổng@nguồn" cách nhau dấu cách. cổng = cổng trên máy chủ
# (8081, không phải cổng trong container). nguồn = IPv4, CIDR hoặc any.
#   "8081@10.0.0.5"     chỉ reverse proxy HTTPS 10.0.0.5 (ACCESS_MODE=proxy)
#   "8081@any"          ai cũng vào (ACCESS_MODE=ip, đang thử bằng http://IP:8081)
#   ""                  không máy nào khác (proxy HTTPS ngay trên máy này)
# Lưu ở /etc/rms/docker-ports.conf. Service systemd rms-firewall-ports nạp lại
# rule mỗi lần Docker khởi động (rule iptables mất khi reboot).
#
# Mã thoát của status: 0 = không có cảnh báo, 2 = có cảnh báo (dùng cho cron/giám sát).
set -Eeuo pipefail

CONF=/etc/rms/docker-ports.conf
INSTALLED=/usr/local/sbin/rms-firewall-ports
UNIT=/etc/systemd/system/rms-firewall-ports.service
CHAIN=RMS-PORTS
SELF="$(readlink -f "${BASH_SOURCE[0]}")"

WARNINGS=0
ok() { printf '   \033[32m✓\033[0m %s\n' "$*"; }
warn() {
	printf '   \033[33m⚠ %s\033[0m\n' "$*"
	WARNINGS=$((WARNINGS + 1))
}
info() { printf '     %s\n' "$*"; }
head1() { printf '\n\033[1;36m── %s\033[0m\n' "$*"; }
die() {
	printf '\033[31m❌ %s\033[0m\n' "$*" >&2
	exit 1
}
need_root() {
	[ "$(id -u)" -eq 0 ] || die "Chạy bằng sudo: sudo bash $SELF ${CMD:-}"
}

# ─── Cấu hình ────────────────────────────────────────────────────────────────
ALLOW=""
load_conf() {
	ALLOW=""
	# Không source file: chỉ đọc đúng 1 biến.
	[ -f "$CONF" ] && ALLOW="$(sed -n 's/^ALLOW="\(.*\)"$/\1/p' "$CONF" | tail -n1)"
	return 0
}

validate_allow() {
	local item port src
	for item in $1; do
		[[ "$item" == *@* ]] || die "Sai dạng '$item' — cần cổng@nguồn, vd 8081@10.0.0.5"
		port="${item%%@*}" src="${item#*@}"
		{ [[ "$port" =~ ^[0-9]{1,5}$ ]] && [ "$port" -ge 1 ] && [ "$port" -le 65535 ]; } ||
			die "Cổng không hợp lệ trong '$item'"
		[ "$src" = any ] && continue
		[[ "$src" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}(/[0-9]{1,2})?$ ]] ||
			die "Nguồn không hợp lệ trong '$item' (IPv4, CIDR hoặc any)"
	done
}

write_conf() {
	install -d -m 755 /etc/rms
	cat >"$CONF" <<EOF
# Tạo bởi scripts/firewall-ports.sh — cổng Docker publish được phép truy cập
# từ MÁY KHÁC, dạng "cổng@nguồn" (nguồn = IPv4, CIDR hoặc any). Cổng publish
# không có ở đây thì chỉ chính máy chủ gọi được. Sửa xong:
#   sudo systemctl reload rms-firewall-ports
ALLOW="$1"
EOF
	chmod 644 "$CONF"
}

# ─── Rule iptables ───────────────────────────────────────────────────────────
# $1 = iptables | ip6tables. IPv6 chỉ áp các mục "any" (nguồn khai là IPv4).
fill_chain() {
	local ipt="$1" item port src
	"$ipt" -N "$CHAIN" 2>/dev/null || true
	"$ipt" -F "$CHAIN"
	# Lưu lượng từ chính container (ra Internet, gọi nhau, gói trả lời) không xét.
	"$ipt" -A "$CHAIN" -i docker0 -j RETURN
	"$ipt" -A "$CHAIN" -i br-+ -j RETURN
	"$ipt" -A "$CHAIN" -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
	for item in $ALLOW; do
		port="${item%%@*}" src="${item#*@}"
		if [ "$src" = any ]; then
			"$ipt" -A "$CHAIN" -p tcp -m conntrack --ctstate DNAT --ctorigdstport "$port" --ctdir ORIGINAL -j RETURN
		elif [ "$ipt" = iptables ]; then
			"$ipt" -A "$CHAIN" -p tcp -s "$src" -m conntrack --ctstate DNAT --ctorigdstport "$port" --ctdir ORIGINAL -j RETURN
		fi
	done
	# Mọi kết nối mới từ máy khác vào cổng Docker publish còn lại: chặn.
	"$ipt" -A "$CHAIN" -m conntrack --ctstate DNAT --ctdir ORIGINAL -j DROP
	"$ipt" -C DOCKER-USER -j "$CHAIN" 2>/dev/null || "$ipt" -I DOCKER-USER 1 -j "$CHAIN"
}

load_rules() {
	need_root
	command -v iptables >/dev/null || die "Không có iptables"
	iptables -n -L DOCKER-USER >/dev/null 2>&1 ||
		die "Chưa có chain DOCKER-USER — Docker chưa chạy? (systemctl status docker)"
	load_conf
	validate_allow "$ALLOW"
	fill_chain iptables
	# Docker 27+ bật ip6tables mặc định; mạng Docker có IPv6 thì cũng bỏ qua UFW.
	if command -v ip6tables >/dev/null && ip6tables -n -L DOCKER-USER >/dev/null 2>&1; then
		fill_chain ip6tables
	fi
	echo "rms-firewall-ports: đã nạp rule (ALLOW=\"$ALLOW\")"
}

cmd_apply() {
	need_root
	local new_allow="" have_allow=0
	while [ $# -gt 0 ]; do
		case "$1" in
		--allow)
			[ $# -ge 2 ] || die "--allow cần giá trị (có thể là \"\")"
			new_allow="$2" have_allow=1
			shift 2
			;;
		--allow=*)
			new_allow="${1#--allow=}" have_allow=1
			shift
			;;
		*) die "Tham số lạ: $1" ;;
		esac
	done

	if [ "$have_allow" -eq 1 ]; then
		validate_allow "$new_allow"
		write_conf "$new_allow"
	elif [ ! -f "$CONF" ]; then
		die "Chưa có $CONF — chạy với --allow \"8081@<IP proxy>\" (hoặc \"8081@any\", hoặc \"\")"
	fi

	[ "$SELF" = "$INSTALLED" ] || install -m 755 "$SELF" "$INSTALLED"
	cat >"$UNIT" <<EOF
[Unit]
Description=Hospital RMS: chỉ cho nguồn được khai vào cổng Docker publish
After=docker.service
PartOf=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=$INSTALLED rules
ExecReload=$INSTALLED rules

[Install]
WantedBy=docker.service
EOF
	systemctl daemon-reload
	systemctl enable rms-firewall-ports.service >/dev/null 2>&1
	systemctl restart rms-firewall-ports.service
	ok "Đã áp dụng, tự nạp lại mỗi lần Docker khởi động"
	cmd_status || true
}

cmd_remove() {
	need_root
	systemctl disable --now rms-firewall-ports.service >/dev/null 2>&1 || true
	rm -f "$UNIT" "$INSTALLED"
	systemctl daemon-reload
	local ipt
	for ipt in iptables ip6tables; do
		command -v "$ipt" >/dev/null || continue
		while "$ipt" -D DOCKER-USER -j "$CHAIN" 2>/dev/null; do :; done
		"$ipt" -F "$CHAIN" 2>/dev/null || true
		"$ipt" -X "$CHAIN" 2>/dev/null || true
	done
	ok "Đã gỡ — cổng Docker publish lại mở cho mọi máy. Giữ lại $CONF"
}

# ─── Kiểm tra ────────────────────────────────────────────────────────────────
chain_active() {
	iptables -C DOCKER-USER -j "$CHAIN" 2>/dev/null
}

# Cổng Docker publish $1 (bind ra mạng) đang được giới hạn thế nào
docker_port_policy() {
	local port="$1" item srcs=""
	for item in $ALLOW; do
		[ "${item%%@*}" = "$port" ] && srcs="$srcs ${item#*@}"
	done
	srcs="${srcs# }"
	if ! chain_active; then
		warn "$port: MỞ cho mọi máy — Docker bỏ qua UFW (sudo bash $SELF apply --allow ...)"
	elif [ -z "$srcs" ]; then
		ok "$port: chỉ chính máy chủ gọi được, máy khác bị chặn"
	elif [[ " $srcs " == *" any "* ]]; then
		warn "$port: mở cho MỌI máy theo cấu hình (@any) — chỉ nên dùng khi đang thử bằng http://IP:$port"
	else
		ok "$port: chỉ $srcs"
	fi
}

cmd_status() {
	need_root
	load_conf
	WARNINGS=0

	head1 "UFW"
	if ! command -v ufw >/dev/null; then
		warn "Chưa cài ufw"
	elif ! ufw status | grep '^Status: active' >/dev/null; then
		warn "UFW đang TẮT — mọi dịch vụ lắng nghe trên 0.0.0.0 đều lộ ra mạng"
	else
		if ufw status verbose | grep 'deny (incoming)' >/dev/null; then
			ok "Đang bật, mặc định chặn kết nối vào"
		else
			warn "UFW không mặc định chặn kết nối vào: sudo ufw default deny incoming"
		fi
		ufw status numbered | sed -n 's/^\[/     [/p'
	fi

	head1 "Dịch vụ lắng nghe từ mạng (bỏ qua 127.0.0.1 / ::1)"
	local proto addr port proc seen=" "
	while read -r proto addr port proc; do
		case "$addr" in 127.* | ::1 | \[::1\]) continue ;; esac
		[[ "$seen" == *" $proto/$port "* ]] && continue # gộp dòng IPv4/IPv6
		seen="$seen$proto/$port "
		printf '   %-4s %-6s %-16s %s\n' "$proto" "$port" "${proc:-?}" "$addr"
		case "$proc:$proto/$port" in
		sshd:tcp/* | ssh:tcp/*) ok "SSH — chặt hơn: chỉ cho dải mạng quản trị (mục 13.1 tài liệu)" ;;
		nginx:tcp/80 | nginx:tcp/443) ok "nginx reverse proxy HTTPS" ;;
		postgres:tcp/5432)
			if ufw status 2>/dev/null | grep -E '^5432/tcp +DENY' >/dev/null; then
				ok "PostgreSQL — UFW chỉ cho mạng Docker 172.16.0.0/12"
			else
				warn "PostgreSQL 5432 thiếu rule 'ufw deny 5432/tcp' — có thể lộ ra LAN"
			fi
			;;
		docker-proxy:tcp/*) info "→ cổng Docker, xem mục bên dưới" ;;
		systemd-network:udp/68 | dhclient:udp/68 | systemd-network:udp/546) ok "DHCP client" ;;
		*) warn "Chưa rõ dịch vụ — UFW chặn nếu không có rule allow, nhưng nên tắt nếu không dùng" ;;
		esac
	done < <(
		ss -H -ltnup 2>/dev/null | awk '{
			l = $5; proc = $0
			sub(/.*users:\(\("/, "", proc); sub(/".*/, "", proc)
			if (proc == $0) proc = ""
			n = split(l, a, ":"); port = a[n]
			addr = substr(l, 1, length(l) - length(port) - 1)
			sub(/%.*/, "", addr)
			print $1, addr, port, proc
		}' | sort -k1,1 -k3,3n
	)

	head1 "Cổng Docker publish (đi qua FORWARD, bỏ qua UFW)"
	if chain_active; then
		ok "Chain $CHAIN đang chặn ở DOCKER-USER — ALLOW=\"$ALLOW\""
		systemctl is-enabled rms-firewall-ports.service >/dev/null 2>&1 ||
			warn "Service rms-firewall-ports chưa bật — rule mất sau reboot/restart Docker"
	else
		warn "Chưa có chain $CHAIN trong DOCKER-USER"
	fi
	if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
		docker ps --format '{{.Names}}\t{{.Ports}}' |
			awk -F'\t' '$2 ~ /->/ { printf "     %-28s %s\n", $1, $2 }'
		local p
		for p in $(docker ps --format '{{.Ports}}' |
			grep -oE '(0\.0\.0\.0|\[::\]|::|[0-9]+(\.[0-9]+){3}):[0-9]+->' |
			grep -vE '^127\.' | sed -E 's/.*:([0-9]+)->$/\1/' | sort -nu); do
			docker_port_policy "$p"
		done
	else
		info "Docker chưa chạy — bỏ qua"
	fi

	head1 "Trùng dải mạng"
	# 5432 mở cho cả 172.16.0.0/12 (pg_hba + UFW). Nếu LAN bệnh viện nằm trong dải
	# này thì máy trong LAN cũng tới được PostgreSQL (vẫn cần mật khẩu).
	local lan
	lan="$(ip -4 -o addr show 2>/dev/null |
		awk '$2 !~ /^(lo|docker0|br-|veth)/ {
			split($4, ip, ".")
			if (ip[1] == 172 && ip[2] >= 16 && ip[2] <= 31) printf "%s %s; ", $2, $4
		}' || true)"
	if [ -n "$lan" ]; then
		warn "Card mạng thật nằm trong 172.16.0.0/12: $lan"
		info "→ máy trong LAN đó vào được 5432. Thu hẹp rule UFW + pg_hba về dải Docker thực tế:"
		info "  docker network inspect hospital_rms_default -f '{{(index .IPAM.Config 0).Subnet}}'"
	else
		ok "LAN không trùng dải Docker 172.16.0.0/12"
	fi

	head1 "Kết quả"
	if [ "$WARNINGS" -eq 0 ]; then
		ok "Không có cảnh báo"
	else
		printf '   \033[33m⚠ %d cảnh báo ở trên\033[0m\n' "$WARNINGS"
	fi
	info "Kiểm tra lại từ MÁY KHÁC trong LAN: nmap -Pn -p 1-65535 <IP máy chủ>"
	[ "$WARNINGS" -eq 0 ] && return 0
	return 2
}

CMD="${1:-status}"
[ $# -gt 0 ] && shift
case "$CMD" in
status) cmd_status ;;
apply) cmd_apply "$@" ;;
rules) load_rules ;;
remove) cmd_remove ;;
-h | --help) sed -n '2,26p' "$SELF" | sed 's/^# \{0,1\}//' ;;
*) die "Lệnh lạ: $CMD (status | apply | remove)" ;;
esac
