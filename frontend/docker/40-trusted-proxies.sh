#!/bin/sh
# Chạy tự động bởi entrypoint của image nginx (mọi file /docker-entrypoint.d/*.sh)
# TRƯỚC khi nginx khởi động. Sinh /etc/nginx/conf.d/00-trusted-proxies.conf từ
# biến TRUSTED_PROXIES — danh sách IP/CIDR của reverse proxy HTTPS đứng trước
# (IIS, nginx trên host, firewall...), phân cách bằng dấu cách hoặc dấu phẩy.
#
# Chỉ request đi tới TỪ các địa chỉ này mới được tin header X-Forwarded-For
# (IP thật của người dùng) và X-Forwarded-Proto (https). Request từ nơi khác
# (vd ai đó gọi thẳng cổng 8084 trong LAN) thì header tự khai bị bỏ qua — không
# giả được IP để vượt rate-limit đăng nhập, không giả được "đang dùng HTTPS".
#
# Mặc định (biến trống) = loopback + dải mạng Docker 172.16.0.0/12: đúng khi
# proxy HTTPS chạy CÙNG máy (kết nối tới container đi qua gateway Docker).
# Trước đây mặc định tin cả 10.0.0.0/8 và 192.168.0.0/16 — mọi máy trong LAN
# bệnh viện gọi thẳng cổng 8084 đều tự khai được X-Forwarded-For để lách
# rate-limit đăng nhập. Proxy đặt ở MÁY KHÁC thì BẮT BUỘC khai IP của nó, nếu
# không mọi người dùng sẽ bị coi là cùng 1 IP (IP của proxy).
set -eu

if [ -z "${TRUSTED_PROXIES:-}" ]; then
	echo "40-trusted-proxies: CẢNH BÁO — TRUSTED_PROXIES trống, chỉ tin 127.0.0.1 + mạng Docker." >&2
	echo "40-trusted-proxies: proxy HTTPS ở máy khác thì đặt TRUSTED_PROXIES=<IP proxy> trong .env cạnh compose." >&2
fi
TRUSTED_PROXIES="${TRUSTED_PROXIES:-127.0.0.1/32 172.16.0.0/12}"
OUT=/etc/nginx/conf.d/00-trusted-proxies.conf

list=$(echo "$TRUSTED_PROXIES" | tr ',' ' ')

# Chỉ nhận ký tự hợp lệ của IP/CIDR — biến môi trường được ghi thẳng vào
# cấu hình nginx, không để lọt ký tự như ; { } làm thay đổi cú pháp.
for cidr in $list; do
	case "$cidr" in
		*[!0-9a-fA-F.:/]*)
			echo "40-trusted-proxies: giá trị không hợp lệ trong TRUSTED_PROXIES: $cidr" >&2
			exit 1
			;;
	esac
done

{
	echo "# Sinh tự động bởi /docker-entrypoint.d/40-trusted-proxies.sh — không sửa tay."
	for cidr in $list; do echo "set_real_ip_from $cidr;"; done
	echo "real_ip_header X-Forwarded-For;"
	# off = chỉ lấy địa chỉ CUỐI trong X-Forwarded-For (do chính proxy tin cậy
	# thêm vào). on sẽ bỏ qua mọi địa chỉ nội bộ và lấy giá trị người dùng tự
	# khai phía trước — người dùng bệnh viện đều có IP nội bộ nên on là giả được IP.
	echo "real_ip_recursive off;"
	echo 'geo $realip_remote_addr $from_trusted_proxy {'
	echo "    default 0;"
	for cidr in $list; do echo "    $cidr 1;"; done
	echo "}"
} > "$OUT"

echo "40-trusted-proxies: tin proxy $TRUSTED_PROXIES"
