/* eslint-disable react-refresh/only-export-components */
// @refresh reset
import React, { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { LazyRoute } from './LazyRoute';
import { RequireAdmin, RequireAuth, RequireNotMember } from './guards';

// ── Admin pages ──────────────────────────────────────────
const Dashboard = lazy(
	() => import('../../features/dashboard/pages/Dashboard'),
);
const Departments = lazy(
	() => import('../../features/department/pages/Departments'),
);
const Topics = lazy(() => import('../../features/topics/pages/Topic'));
const Rounds = lazy(() => import('../../features/round/pages/Round'));
const Councils = lazy(() => import('../../features/council/pages/Council'));
const ExternalReviewers = lazy(
	() => import('../../features/council/pages/ExternalReviewers'),
);
const Approvals = lazy(() => import('../../features/approval/pages/Approval'));
const Catalog = lazy(() => import('../../features/catalog/pages/Catalog'));
const Users = lazy(() => import('../../features/user/pages/UserList'));
const Roles = lazy(() => import('../../features/roles/pages/Roles'));
const Reports = lazy(() => import('../../features/reports/pages/Reports'));
const Schedule = lazy(() => import('../../features/schedule/pages/Schedule'));
const AdminNotifications = lazy(
	() => import('../../features/notifications/pages/AdminNotifications'),
);
const ActivityLogs = lazy(
	() => import('../../features/activity-log/pages/ActivityLogs'),
);

// ── User portal pages ─────────────────────────────────────
const UserHome = lazy(() => import('../../features/portal/pages/UserHome'));
const UserMyTopics = lazy(() => import('../../features/portal/pages/MyTopics'));
const UserTopicDetail = lazy(
	() => import('../../features/portal/pages/TopicDetail'),
);
const UserProfile = lazy(() => import('../../features/portal/pages/Profile'));
const UserCouncilProgress = lazy(
	() => import('../../features/portal/pages/CouncilProgress'),
);
const DepartmentAccounts = lazy(
	() => import('../../features/portal/pages/DepartmentAccounts'),
);
const TopicRegister = lazy(
	() => import('../../features/topics/pages/TopicRegister'),
);
const UserNotifications = lazy(
	() => import('../../features/notifications/pages/UserNotifications'),
);

const admin = (
	title: string,
	element: React.ReactNode,
): RouteObject['element'] => (
	<RequireAdmin>
		<LazyRoute title={title}>{element}</LazyRoute>
	</RequireAdmin>
);

const user = (
	title: string,
	element: React.ReactNode,
): RouteObject['element'] => (
	<RequireAuth>
		<LazyRoute title={title}>{element}</LazyRoute>
	</RequireAuth>
);

export const adminRoutes: RouteObject[] = [
	{ path: '/admin', element: admin('Bảng điều khiển', <Dashboard />) },
	{ path: '/admin/topics', element: admin('Quản lý Đề tài', <Topics />) },
	{ path: '/admin/rounds', element: admin('Đợt nghiên cứu', <Rounds />) },
	{
		path: '/admin/councils',
		element: admin('Hội đồng chấm đề cương', <Councils />),
	},
	{
		path: '/admin/approvals',
		element: admin('Phê duyệt Đề tài', <Approvals />),
	},
	{
		path: '/admin/external-reviewers',
		element: admin('Người ngoài viện', <ExternalReviewers />),
	},
	{
		path: '/admin/departments',
		element: admin('Khoa / Phòng ban', <Departments />),
	},
	{ path: '/admin/users', element: admin('Người dùng', <Users />) },
	{ path: '/admin/roles', element: admin('Phân quyền', <Roles />) },
	{
		path: '/admin/reports',
		element: admin('Báo cáo & Xuất dữ liệu', <Reports />),
	},
	{
		path: '/admin/categories',
		element: admin('Phân loại đề tài', <Catalog />),
	},
	{ path: '/admin/levels', element: admin('Cấp độ đề tài', <Catalog />) },
	{
		path: '/admin/schedule',
		element: admin('Lịch trình nghiên cứu', <Schedule />),
	},
	{
		path: '/admin/notifications',
		element: admin('Quản lý thông báo', <AdminNotifications />),
	},
	{
		path: '/admin/activity-logs',
		element: admin('Nhật ký hoạt động', <ActivityLogs />),
	},
];

export const userRoutes: RouteObject[] = [
	{ path: '/user', element: user('Trang chủ', <UserHome />) },
	{
		path: '/user/my-topics',
		element: user('Đề tài của tôi', <UserMyTopics />),
	},
	{
		path: '/user/my-topics/:id',
		element: user('Chi tiết đề tài', <UserTopicDetail />),
	},
	{
		path: '/user/council-progress',
		element: user('Đánh giá tiến độ đề tài', <UserCouncilProgress />),
	},
	{ path: '/user/profile', element: user('Hồ sơ cá nhân', <UserProfile />) },
	{
		path: '/user/department-accounts',
		element: user('Tài khoản trong khoa', <DepartmentAccounts />),
	},
	{
		path: '/user/notifications',
		element: user('Thông báo của tôi', <UserNotifications />),
	},
	{
		path: '/user/register-topic',
		element: (
			<RequireNotMember>
				<LazyRoute title='Đăng ký đề tài'>
					<TopicRegister />
				</LazyRoute>
			</RequireNotMember>
		),
	},
];
