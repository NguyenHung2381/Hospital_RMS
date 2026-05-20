import React, { lazy, Suspense } from 'react';
import {
	createBrowserRouter,
	RouterProvider,
	Navigate,
	useLocation,
} from 'react-router-dom';
import { getToken, getStoredUser as getAuthUser } from '../lib/authStorage';
import logo from '../assets/logo.png';

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

// ── Lazy pages — User portal ───────────────
const UserHome = lazy(() => import('../features/user/pages/UserHome'));
const UserMyTopics = lazy(() => import('../features/user/pages/MyTopics'));
const UserTopicDetail = lazy(
	() => import('../features/user/pages/TopicDetail'),
);
const UserProfile = lazy(() => import('../features/user/pages/Profile'));
const DepartmentAccounts = lazy(
	() => import('../features/user/pages/DepartmentAccounts'),
);
const TopicRegister = lazy(
	() => import('../features/topics/pages/TopicRegister'),
);

// ─── AUTH HELPERS ─────────────────────────
interface StoredUser {
	account_type?: string;
	role?: string;
}

function getStoredUser(): StoredUser | null {
	return getAuthUser<StoredUser>();
}

function hasToken(): boolean {
	return Boolean(getToken());
}

function isAdmin(user: StoredUser | null): boolean {
	if (!user) return false;
	if (user.account_type === 'admin') return true;
	const role = (user.role ?? '').toLowerCase();
	return (
		role.includes('giám đốc') ||
		role.includes('giam_doc') ||
		role.includes('giam doc') ||
		role.includes('director')
	);
}

function isMember(user: StoredUser | null): boolean {
	return user?.account_type === 'member';
}

function defaultPath(): string {
	return isAdmin(getStoredUser()) ? '/admin' : '/user';
}

// ─── ROUTE GUARDS ─────────────────────────

/** Chuyển đến /login nếu chưa đăng nhập, giữ lại URL để redirect sau login */
function RequireAuth({ children }: { children: React.ReactNode }) {
	const location = useLocation();
	if (!hasToken()) {
		const from = location.pathname + location.search;
		return (
			<Navigate
				to={`/login?from=${encodeURIComponent(from)}`}
				replace
			/>
		);
	}
	return <>{children}</>;
}

/** Chỉ cho admin/giám đốc; người dùng thường bị chuyển về /user */
function RequireAdmin({ children }: { children: React.ReactNode }) {
	if (!hasToken())
		return (
			<Navigate
				to='/login'
				replace
			/>
		);
	if (!isAdmin(getStoredUser()))
		return (
			<Navigate
				to='/user'
				replace
			/>
		);
	return <>{children}</>;
}

/** Member không được vào — redirect về /user */
function RequireNotMember({ children }: { children: React.ReactNode }) {
	if (!hasToken())
		return (
			<Navigate
				to='/login'
				replace
			/>
		);
	if (isMember(getStoredUser()))
		return (
			<Navigate
				to='/user'
				replace
			/>
		);
	return <>{children}</>;
}

/** Nếu đã đăng nhập thì không vào được trang login nữa */
function RedirectIfLoggedIn({ children }: { children: React.ReactNode }) {
	if (hasToken())
		return (
			<Navigate
				to={defaultPath()}
				replace
			/>
		);
	return <>{children}</>;
}

/** Redirect gốc: chưa đăng nhập → /login, đã đăng nhập → trang tương ứng */
function RootRedirect() {
	if (!hasToken())
		return (
			<Navigate
				to='/login'
				replace
			/>
		);
	return (
		<Navigate
			to={defaultPath()}
			replace
		/>
	);
}

// ─── LOADING FALLBACK ─────────────────────
function PageLoading() {
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				height: '100vh',
				color: 'var(--color-gray-500)',
				fontSize: 15,
				fontWeight: 500,
			}}
		>
			<img
				src={logo}
				alt='Loading...'
				style={{
					width: 80,
					height: 'auto',
					marginBottom: 16,
					animation: 'pulseLoading 1.5s infinite ease-in-out',
				}}
			/>
			<span>Đang tải dữ liệu...</span>
			<style>{`
				@keyframes pulseLoading {
					0% { transform: scale(0.95); opacity: 0.6; }
					50% { transform: scale(1.05); opacity: 1; }
					100% { transform: scale(0.95); opacity: 0.6; }
				}
			`}</style>
		</div>
	);
}

import { useEffect } from 'react';

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
	// ── Root ──
	{
		path: '/',
		element: <RootRedirect />,
	},

	// ── Login (không vào được nếu đã đăng nhập) ──
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

	// ── Admin routes (chỉ admin / giám đốc) ──
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

	// ── Link đăng ký đề tài (member được phép, nhưng /user/register-topic thì không) ──
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

// ─── EXPORT ───────────────────────────────
export default function AppRouter() {
	return <RouterProvider router={router} />;
}
