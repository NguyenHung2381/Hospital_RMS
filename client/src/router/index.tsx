import React, { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import PageLoading from '../components/PageLoading';
import {
	RedirectIfLoggedIn,
	RequireAdmin,
	RequireAuth,
	RequireNotMember,
	RootRedirect,
} from './guards';

// ── Lazy pages — Admin ─────────────────────
const Login = lazy(() => import('../features/auth/pages/Login'));
const Dashboard = lazy(() => import('../features/dashboard/pages/Dashboard'));
const Departments = lazy(
	() => import('../features/department/pages/Departments'),
);
const Topics = lazy(() => import('../features/topics/pages/Topic'));
const Members = lazy(() => import('../features/topics/pages/TopicMembers'));
const Rounds = lazy(() => import('../features/round/pages/Round'));
const Approvals = lazy(() => import('../features/approval/pages/Approval'));
const Catalog = lazy(() => import('../features/catalog/pages/Catalog'));
const Users = lazy(() => import('../features/user/pages/UserList'));
const Roles = lazy(() => import('../features/roles/pages/Roles'));
const Reports = lazy(() => import('../features/reports/pages/Reports'));

// ── Lazy pages — User portal ───────────────
const UserHome = lazy(() => import('../features/portal/pages/UserHome'));
const UserMyTopics = lazy(() => import('../features/portal/pages/MyTopics'));
const UserTopicDetail = lazy(
	() => import('../features/portal/pages/TopicDetail'),
);
const UserProfile = lazy(() => import('../features/portal/pages/Profile'));
const DepartmentAccounts = lazy(
	() => import('../features/portal/pages/DepartmentAccounts'),
);
const TopicRegister = lazy(
	() => import('../features/topics/pages/TopicRegister'),
);

// ─── LAZY WRAPPER ─────────────────────────
function Lazy({
	children,
	title,
}: {
	children: React.ReactNode;
	title?: string;
}) {
	useEffect(() => {
		document.title = title ? `${title} | Quản lý NCKH` : 'Quản lý NCKH';
	}, [title]);
	return <Suspense fallback={<PageLoading />}>{children}</Suspense>;
}

// ─── ROUTER ───────────────────────────────
const router = createBrowserRouter([
	{ path: '/', element: <RootRedirect /> },

	{
		path: '/login',
		element: (
			<RedirectIfLoggedIn>
				<Lazy title='Đăng nhập'>
					<Login />
				</Lazy>
			</RedirectIfLoggedIn>
		),
	},

	// ── Admin routes ──
	{
		path: '/admin',
		element: (
			<RequireAdmin>
				<Lazy title='Bảng điều khiển'>
					<Dashboard />
				</Lazy>
			</RequireAdmin>
		),
	},
	{
		path: '/admin/topics',
		element: (
			<RequireAdmin>
				<Lazy title='Quản lý Đề tài'>
					<Topics />
				</Lazy>
			</RequireAdmin>
		),
	},
	{
		path: '/admin/members',
		element: (
			<RequireAdmin>
				<Lazy title='Quản lý Thành viên'>
					<Members />
				</Lazy>
			</RequireAdmin>
		),
	},
	{
		path: '/admin/rounds',
		element: (
			<RequireAdmin>
				<Lazy title='Đợt nghiên cứu'>
					<Rounds />
				</Lazy>
			</RequireAdmin>
		),
	},
	{
		path: '/admin/approvals',
		element: (
			<RequireAdmin>
				<Lazy title='Phê duyệt Đề tài'>
					<Approvals />
				</Lazy>
			</RequireAdmin>
		),
	},
	{
		path: '/admin/departments',
		element: (
			<RequireAdmin>
				<Lazy title='Khoa / Phòng ban'>
					<Departments />
				</Lazy>
			</RequireAdmin>
		),
	},
	{
		path: '/admin/users',
		element: (
			<RequireAdmin>
				<Lazy title='Người dùng'>
					<Users />
				</Lazy>
			</RequireAdmin>
		),
	},
	{
		path: '/admin/roles',
		element: (
			<RequireAdmin>
				<Lazy title='Phân quyền'>
					<Roles />
				</Lazy>
			</RequireAdmin>
		),
	},
	{
		path: '/admin/reports',
		element: (
			<RequireAdmin>
				<Lazy title='Báo cáo & Xuất dữ liệu'>
					<Reports />
				</Lazy>
			</RequireAdmin>
		),
	},
	{
		path: '/admin/categories',
		element: (
			<RequireAdmin>
				<Lazy title='Phân loại đề tài'>
					<Catalog />
				</Lazy>
			</RequireAdmin>
		),
	},
	{
		path: '/admin/levels',
		element: (
			<RequireAdmin>
				<Lazy title='Cấp độ đề tài'>
					<Catalog />
				</Lazy>
			</RequireAdmin>
		),
	},

	// ── User portal routes ──
	{
		path: '/user',
		element: (
			<RequireAuth>
				<Lazy title='Trang chủ'>
					<UserHome />
				</Lazy>
			</RequireAuth>
		),
	},
	{
		path: '/user/my-topics',
		element: (
			<RequireAuth>
				<Lazy title='Đề tài của tôi'>
					<UserMyTopics />
				</Lazy>
			</RequireAuth>
		),
	},
	{
		path: '/user/my-topics/:id',
		element: (
			<RequireAuth>
				<Lazy title='Chi tiết đề tài'>
					<UserTopicDetail />
				</Lazy>
			</RequireAuth>
		),
	},
	{
		path: '/user/register-topic',
		element: (
			<RequireNotMember>
				<Lazy title='Đăng ký đề tài'>
					<TopicRegister />
				</Lazy>
			</RequireNotMember>
		),
	},
	{
		path: '/user/profile',
		element: (
			<RequireAuth>
				<Lazy title='Hồ sơ cá nhân'>
					<UserProfile />
				</Lazy>
			</RequireAuth>
		),
	},
	{
		path: '/user/department-accounts',
		element: (
			<RequireAuth>
				<Lazy title='Tài khoản trong khoa'>
					<DepartmentAccounts />
				</Lazy>
			</RequireAuth>
		),
	},

	// ── Public link đăng ký đề tài ──
	{
		path: '/dang-ky-de-tai',
		element: (
			<RequireAuth>
				<Lazy title='Đăng ký đề tài'>
					<TopicRegister />
				</Lazy>
			</RequireAuth>
		),
	},
]);

export default function AppRouter() {
	return <RouterProvider router={router} />;
}
