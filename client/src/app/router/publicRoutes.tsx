/* eslint-disable react-refresh/only-export-components */
import type { RouteObject } from 'react-router-dom';
import { LazyRoute } from './LazyRoute';
import { lazyRoute as lazy } from './routePrefetch';
import { RedirectIfLoggedIn, RequireAuth, RootRedirect } from './guards';

const Login = lazy(() => import('../../features/auth/pages/Login'));
const TopicRegister = lazy(
	() => import('../../features/topics/pages/TopicRegister'),
);
const NotFound = lazy(() => import('../../shared/pages/NotFound'));

export const publicRoutes: RouteObject[] = [
	{
		path: '/',
		element: <RootRedirect />,
	},
	{
		path: '/login',
		element: (
			<RedirectIfLoggedIn>
				<LazyRoute title='Đăng nhập'>
					<Login />
				</LazyRoute>
			</RedirectIfLoggedIn>
		),
	},
	{
		path: '/dang-ky-de-tai',
		element: (
			<RequireAuth>
				<LazyRoute title='Đăng ký đề tài'>
					<TopicRegister />
				</LazyRoute>
			</RequireAuth>
		),
	},
	{
		path: '*',
		element: (
			<LazyRoute title='Không tìm thấy trang'>
				<NotFound />
			</LazyRoute>
		),
	},
];
