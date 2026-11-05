import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import type { ReactNode } from 'react';

// Theme tokens map sang các biến đã có trong styles/variables.css —
// không định nghĩa màu mới, chỉ ánh xạ để component antd (Table, DatePicker,
// Upload...) khớp bộ nhận diện hiện có (xanh lá #0A9B4A / hồng #DF0984).
// Màu phải là hex thật (antd tự sinh dải sáng/tối từ đó, không đọc được var()),
// nên khi đổi giá trị trong variables.css nhớ sửa cả ở đây.
const theme = {
	token: {
		colorPrimary: '#0a9b4a', // --color-primary
		colorSuccess: '#0a9b4a', // --color-success
		colorWarning: '#f5a623', // --color-warning
		colorError: '#e84545', // --color-error
		colorInfo: '#34b8d8', // --color-info
		colorLink: '#0a9b4a',
		colorText: '#1a2a35', // --color-gray-800 (màu chữ của body)
		colorTextSecondary: '#6b8090', // --color-gray-500
		colorBorder: '#cbd5dc', // --color-gray-300
		colorBorderSecondary: '#e2e8ec', // --color-gray-200
		colorBgLayout: '#f8fafb', // --color-gray-50
		borderRadiusXS: 2, // --radius-xs
		borderRadiusSM: 4, // --radius-sm
		borderRadius: 8, // --radius-md
		borderRadiusLG: 12, // --radius-lg
		fontFamily: 'var(--font-body)',
		fontWeightStrong: 600, // --font-weight-semibold: giao diện không đậm hơn 600
	},
};

export function AntdProvider({ children }: { children: ReactNode }) {
	return (
		<ConfigProvider theme={theme} locale={viVN}>
			{children}
		</ConfigProvider>
	);
}
