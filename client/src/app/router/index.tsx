import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { publicRoutes } from './publicRoutes';
import { adminRoutes, userRoutes } from './privateRoutes';
import { prefetchRoutes } from './routePrefetch';

const router = createBrowserRouter([
	...publicRoutes,
	...adminRoutes,
	...userRoutes,
]);

export default function AppRouter() {
	useEffect(prefetchRoutes, []);
	return <RouterProvider router={router} />;
}
