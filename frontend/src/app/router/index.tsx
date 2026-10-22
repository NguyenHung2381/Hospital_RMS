import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { publicRoutes } from './publicRoutes';
import { adminRoutes, traineeRoutes, userRoutes } from './privateRoutes';
import { prefetchRoutes } from './routePrefetch';

const router = createBrowserRouter([
	...publicRoutes,
	...adminRoutes,
	...userRoutes,
	...traineeRoutes,
]);

export default function AppRouter() {
	useEffect(prefetchRoutes, []);
	return <RouterProvider router={router} />;
}
