/* eslint-disable react-refresh/only-export-components */
import type { RouteObject } from 'react-router-dom';
import { LazyRoute } from './LazyRoute';
import { lazyRoute as lazy } from './routePrefetch';
import { RedirectIfLoggedIn, RequireAuth, RootRedirect } from './guards';

const Login = lazy(() => import('../../features/auth/pages/Login'));
const TopicRegister = lazy(
	() => import('../../features/topics/pages/TopicRegister'),
);
const CourseRegisterPublic = lazy(
	() => import('../../features/public/pages/CourseRegisterPublic'),
);
const TopicRegisterPublic = lazy(
	() => import('../../features/public/pages/TopicRegisterPublic'),
);
const PublicLookup = lazy(
	() => import('../../features/public/pages/PublicLookup'),
);
const TopicStatusLookup = lazy(
	() => import('../../features/public/pages/TopicStatusLookup'),
);
const TopicLibrary = lazy(
	() => import('../../features/public/pages/TopicLibrary'),
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
		path: '/dang-ky-khoa-hoc',
		element: (
			<LazyRoute title='Đăng ký khóa học'>
				<CourseRegisterPublic />
			</LazyRoute>
		),
	},
	{
		// Cổng công khai, form rút gọn — khác với /dang-ky-de-tai (yêu cầu đăng
		// nhập tài khoản khoa/phòng, có quản lý thành viên/file đầy đủ).
		path: '/de-xuat-de-tai',
		element: (
			<LazyRoute title='Đăng ký đề tài'>
				<TopicRegisterPublic />
			</LazyRoute>
		),
	},
	{
		path: '/tra-cuu-ket-qua',
		element: (
			<LazyRoute title='Tra cứu kết quả'>
				<PublicLookup />
			</LazyRoute>
		),
	},
	{
		path: '/tra-cuu-ho-so/:maTraCuu?',
		element: (
			<LazyRoute title='Tra cứu hồ sơ đề tài'>
				<TopicStatusLookup />
			</LazyRoute>
		),
	},
	{
		path: '/thu-vien-de-tai',
		element: (
			<LazyRoute title='Thư viện đề tài'>
				<TopicLibrary />
			</LazyRoute>
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
