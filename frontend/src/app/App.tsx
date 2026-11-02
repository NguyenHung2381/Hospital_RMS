import { useEffect, useState } from 'react';
import { needsSessionRestore, restoreSession } from '../shared/api/session';
import PageLoading from '../shared/components/Loading';
import { AppProviders } from './providers';
import AppRouter from './router';

export default function App() {
	// Access token chỉ nằm trong bộ nhớ: tải lại trang thì lấy lại từ cookie
	// refresh trước khi dựng router + PermissionSync (cả hai đọc token ngay lúc mount).
	const [ready, setReady] = useState(() => !needsSessionRestore());
	useEffect(() => {
		if (!ready) void restoreSession().finally(() => setReady(true));
	}, [ready]);

	if (!ready) return <PageLoading />;
	return (
		<AppProviders>
			<AppRouter />
		</AppProviders>
	);
}
