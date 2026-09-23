import type { ReactNode } from 'react';
import { GlobalFeedback } from '../../shared/components/GlobalFeedback';
import { AntdProvider } from './AntdProvider';
import { QueryProvider } from './QueryProvider';

export function AppProviders({ children }: { children: ReactNode }) {
	return (
		<QueryProvider>
			<AntdProvider>
				{children}
				<GlobalFeedback />
			</AntdProvider>
		</QueryProvider>
	);
}
