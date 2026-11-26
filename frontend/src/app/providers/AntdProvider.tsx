import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import { useMemo, type ReactNode } from 'react';

// Theme tokens của antd đọc TRỰC TIẾP từ biến CSS trong styles/variables.css lúc
// chạy — variables.css là nguồn duy nhất, đổi giá trị ở đó thì antd tự theo.
// antd cần hex/số thật (nó tự sinh dải sáng/tối từ màu, không đọc được var())
// nên phải lấy giá trị đã tính qua getComputedStyle. Mỗi lần đọc có giá trị dự
// phòng (đúng giá trị hiện tại) cho trường hợp biến chưa sẵn sàng: chạy ngoài
// trình duyệt (test/SSR), stylesheet chưa nạp, hoặc biến bị đổi thành var()
// khác (không còn là hex/số).

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function cssVar(name: string): string {
	if (typeof document === 'undefined') return '';
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function readColor(name: string, fallback: string): string {
	const value = cssVar(name);
	return HEX.test(value) ? value : fallback;
}

/** Đọc biến độ dài dạng "8px" → 8. */
function readPx(name: string, fallback: number): number {
	const value = cssVar(name);
	const m = /^(\d+(?:\.\d+)?)px$/.exec(value);
	return m ? Number(m[1]) : fallback;
}

/** Đọc biến số thuần (font-weight) → số. */
function readNumber(name: string, fallback: number): number {
	const value = cssVar(name);
	return /^\d+$/.test(value) ? Number(value) : fallback;
}

// Ánh xạ sang các biến đã có — không định nghĩa màu mới, chỉ để component antd
// (Table, DatePicker, Upload...) khớp bộ nhận diện (xanh lá #0A9B4A / hồng #DF0984).
function buildTheme() {
	return {
		token: {
			colorPrimary: readColor('--color-primary', '#0a9b4a'),
			colorSuccess: readColor('--color-success', '#0a9b4a'),
			colorWarning: readColor('--color-warning', '#f5a623'),
			colorError: readColor('--color-error', '#e84545'),
			colorInfo: readColor('--color-info', '#34b8d8'),
			// primary-dark: chữ xanh trên nền trắng cần ≥4.5:1
			colorLink: readColor('--color-primary-dark', '#087c3b'),
			// màu chữ của body
			colorText: readColor('--color-gray-800', '#1a2a35'),
			colorTextSecondary: readColor('--color-gray-500', '#526574'),
			colorBorder: readColor('--color-gray-300', '#cbd5dc'),
			colorBorderSecondary: readColor('--color-gray-200', '#e2e8ec'),
			colorBgLayout: readColor('--color-gray-50', '#f8fafb'),
			borderRadiusXS: readPx('--radius-xs', 2),
			borderRadiusSM: readPx('--radius-sm', 4),
			borderRadius: readPx('--radius-md', 8),
			borderRadiusLG: readPx('--radius-lg', 12),
			fontFamily: 'var(--font-body)',
			// semibold: giao diện không đậm hơn 600
			fontWeightStrong: readNumber('--font-weight-semibold', 600),
		},
		// Nút có chữ trắng: nền primary-dark (5.3:1) thay vì primary (3.6:1, không
		// đạt WCAG AA) — giống kit Button. Hover/active đậm dần thay vì sáng lên.
		components: {
			Button: {
				colorPrimary: readColor('--color-primary-dark', '#087c3b'),
				colorPrimaryHover: readColor('--color-primary-darker', '#066a32'),
				// chưa có biến cho nấc đậm hơn primary-darker → giữ giá trị cố định
				colorPrimaryActive: '#055a2a',
			},
		},
	};
}

export function AntdProvider({ children }: { children: ReactNode }) {
	// Tính một lần khi mount: lúc này variables.css đã được nạp (import ở điểm vào).
	const theme = useMemo(() => buildTheme(), []);
	return (
		<ConfigProvider theme={theme} locale={viVN}>
			{children}
		</ConfigProvider>
	);
}
