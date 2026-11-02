#!/bin/sh
# Chạy tự động bởi entrypoint của image nginx (mọi file /docker-entrypoint.d/*.sh)
# TRƯỚC khi nginx khởi động. Sinh /etc/nginx/snippets/rms-csp.conf — header CSP
# gắn cho trang SPA (location / trong nginx.conf). Nội dung chính sách nằm ở
# map $csp_policy trong nginx.conf; script này chỉ chọn TÊN header:
#
#   CSP_REPORT_ONLY trống / false — Content-Security-Policy: trình duyệt CHẶN
#     script, frame, kết nối... ngoài danh sách cho phép (mặc định).
#   CSP_REPORT_ONLY=true — Content-Security-Policy-Report-Only: chỉ báo cáo về
#     /api/v1/csp-report, không chặn. Dùng để gỡ nhanh khi một chức năng bị chặn
#     nhầm (đặt trong .env cạnh docker-compose.prod.yml rồi khởi động lại
#     container frontend), không cần build lại image.
set -eu

OUT=/etc/nginx/snippets/rms-csp.conf
mkdir -p "$(dirname "$OUT")"

case "${CSP_REPORT_ONLY:-false}" in
	true | 1 | yes)
		header=Content-Security-Policy-Report-Only
		echo "41-csp: CẢNH BÁO — CSP_REPORT_ONLY=true, CSP chỉ báo cáo, KHÔNG chặn." >&2
		;;
	false | 0 | no | '')
		header=Content-Security-Policy
		;;
	*)
		echo "41-csp: CSP_REPORT_ONLY không hợp lệ: ${CSP_REPORT_ONLY} (dùng true/false)" >&2
		exit 1
		;;
esac

{
	echo "# Sinh tự động bởi /docker-entrypoint.d/41-csp.sh — không sửa tay."
	echo "add_header $header \$csp_policy always;"
} > "$OUT"

echo "41-csp: dùng header $header"
