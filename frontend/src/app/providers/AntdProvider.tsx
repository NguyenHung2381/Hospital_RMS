import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import type { ReactNode } from 'react';

// Theme tokens map sang các biến đã có trong shared/styles/variables.css —
// không định nghĩa màu mới, chỉ ánh xạ để component antd (Table, DatePicker,
// Upload...) khớp bộ nhận diện hiện có (xanh lá #0A9B4A / hồng #DF0984).
const theme = {
	token: {
		colorPrimary: '#0a9b4a',
		colorSuccess: '#0a9b4a',
		colorWarning: '#f5a623',
		colorError: '#e84545',
		colorInfo: '#34b8d8',
		colorLink: '#0a9b4a',
		borderRadius: 8,
		fontFamily: 'var(--font-body)',
	},
};

export function AntdProvider({ children }: { children: ReactNode }) {
	return (
		<ConfigProvider theme={theme} locale={viVN}>
			{children}
		</ConfigProvider>
	);
}
