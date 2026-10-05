// Gốc URL cho link/QR gửi ra ngoài (đăng ký hội nghị, vé, khảo sát...).
// Mặc định lấy origin trang hiện tại — nhưng khi quản trị mở app bằng
// http://localhost thì QR sẽ chứa "localhost", điện thoại quét vào trỏ về chính
// nó → không truy cập được. Đặt VITE_PUBLIC_APP_URL (vd http://192.168.1.3:5173
// khi dev trong LAN, hoặc domain thật) trong frontend/.env để cố định địa chỉ.
const configured = (import.meta.env.VITE_PUBLIC_APP_URL ?? '').trim().replace(/\/$/, '');

export const publicOrigin = (): string => configured || window.location.origin;

export const publicUrl = (path: string): string => `${publicOrigin()}${path.startsWith('/') ? path : `/${path}`}`;

/** true nếu link sinh ra chỉ mở được trên chính máy này (localhost / 127.x / ::1) */
export const isLoopbackOrigin = (): boolean => {
	try {
		const { hostname } = new URL(publicOrigin());
		return hostname === 'localhost' || hostname === '[::1]' || hostname.startsWith('127.');
	} catch {
		return false;
	}
};
