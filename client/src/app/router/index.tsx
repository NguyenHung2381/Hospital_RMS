import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { publicRoutes } from './publicRoutes';
import { adminRoutes, userRoutes } from './privateRoutes';

const router = createBrowserRouter([
	...publicRoutes,
	...adminRoutes,
	...userRoutes,
]);

export default function AppRouter() {
	return <RouterProvider router={router} />;
}
