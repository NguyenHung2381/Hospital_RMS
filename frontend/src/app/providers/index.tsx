import type { ReactNode } from 'react';
import { DialogHost } from '../../shared/components/Dialog/DialogHost';
import { GlobalFeedback } from '../../shared/components/GlobalFeedback';
import { AntdProvider } from './AntdProvider';
import { PermissionSync } from './PermissionSync';
import { QueryProvider } from './QueryProvider';

export function AppProviders({ children }: { children: ReactNode }) {
	return (
		<QueryProvider>
			<AntdProvider>
				<PermissionSync>{children}</PermissionSync>
				<GlobalFeedback />
				{/* Hộp thoại gọi bằng confirmDialog() / alertDialog() / promptDialog() */}
				<DialogHost />
			</AntdProvider>
		</QueryProvider>
	);
}
