/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { LazyRoute } from './LazyRoute';
import { RedirectIfLoggedIn, RequireAuth, RootRedirect } from './guards';

const Login = lazy(() => import('../../features/auth/pages/Login'));
const TopicRegister = lazy(
	() => import('../../features/topics/pages/TopicRegister'),
);

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
];
