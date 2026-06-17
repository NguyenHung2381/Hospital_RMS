import { AppProviders } from './providers/AppProviders';
import AppRouter from './router';

export default function App() {
	return (
		<AppProviders>
			<AppRouter />
		</AppProviders>
	);
}
