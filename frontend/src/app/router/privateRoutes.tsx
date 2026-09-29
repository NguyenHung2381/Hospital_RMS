/* eslint-disable react-refresh/only-export-components */
// @refresh reset
import React from 'react';
import type { RouteObject } from 'react-router-dom';
import { LazyRoute } from './LazyRoute';
import { lazyRoute as lazy } from './routePrefetch';
import { RequireAdmin, RequireAuth, RequirePermission } from './guards';

// ── Admin pages ──────────────────────────────────────────
const OverviewDashboard = lazy(
	() => import('../../features/dashboard/pages/OverviewDashboard'),
);
const ResearchDashboard = lazy(
	() => import('../../features/dashboard/pages/ResearchDashboard'),
);
const TrainingDashboard = lazy(
	() => import('../../features/dashboard/pages/TrainingDashboard'),
);
const SeminarDashboard = lazy(
	() => import('../../features/dashboard/pages/SeminarDashboard'),
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
const Seminars = lazy(() => import('../../features/seminar/pages/Seminars'));
const CmeCreditCatalog = lazy(
	() => import('../../features/seminar/pages/CmeCreditCatalog'),
);
const SeminarDetail = lazy(
	() => import('../../features/seminar/pages/SeminarDetail'),
);
const CmeRegister = lazy(
	() => import('../../features/seminar/pages/CmeRegister'),
);
const CmeCompliance = lazy(
	() => import('../../features/seminar/pages/CmeCompliance'),
);
const CmeManualRecords = lazy(
	() => import('../../features/seminar/pages/CmeManualRecords'),
);const Approvals = lazy(() => import('../../features/approval/pages/Approval'));
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
const TrainingCatalog = lazy(
	() => import('../../features/training-catalog/pages/TrainingCatalog'),
);
const Venues = lazy(() => import('../../features/venue/pages/Venues'));
const Trainees = lazy(() => import('../../features/trainee/pages/Trainees'));
const TrainingPrograms = lazy(
	() => import('../../features/training-program/pages/TrainingPrograms'),
);
const Lessons = lazy(() => import('../../features/training-program/pages/Lessons'));
const TrainingPlan = lazy(
	() => import('../../features/training-plan/pages/TrainingPlan'),
);
const Survey = lazy(() => import('../../features/survey/pages/Survey'));
const Workflow = lazy(() => import('../../features/workflow/pages/Workflow'));
const UserSurveys = lazy(
	() => import('../../features/survey/pages/UserSurveys'),
);
const MyTasks = lazy(() => import('../../features/my-tasks/pages/MyTasks'));
const AttendanceCheckIn = lazy(
	() => import('../../features/attendance-checkin/pages/AttendanceCheckIn'),
);
const UserExams = lazy(() => import('../../features/exam/pages/UserExams'));
const QuestionBank = lazy(() => import('../../features/exam/pages/QuestionBank'));
const Lecturers = lazy(() => import('../../features/lecturer/pages/Lecturers'));
const Courses = lazy(() => import('../../features/course/pages/Courses'));
const ClassSchedule = lazy(
	() => import('../../features/class-schedule/pages/ClassSchedule'),
);
const PersonMerge = lazy(
	() => import('../../features/person-merge/pages/PersonMerge'),
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
	{ path: '/admin', element: admin('Tổng quan Hệ thống', <OverviewDashboard />) },
	{
		path: '/admin/dashboard/research',
		element: admin('Tổng quan NCKH', <ResearchDashboard />),
	},
	{
		path: '/admin/dashboard/training',
		element: admin('Tổng quan Đào tạo', <TrainingDashboard />),
	},
	{
		path: '/admin/dashboard/seminar',
		element: admin('Tổng quan Hội thảo - CME', <SeminarDashboard />),
	},
	{
		path: '/admin/viec-cua-toi',
		element: admin('Việc của tôi', <MyTasks />),
	},
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
		path: '/admin/seminars',
		element: admin('Hội thảo & Hội nghị', <Seminars />),
	},
	{
		path: '/admin/seminars/:id',
		element: admin('Chi tiết hội thảo', <SeminarDetail />),
	},
	{
		path: '/admin/cme-register',
		element: admin('Sổ cấp CME', <CmeRegister />),
	},
	{
		path: '/admin/cme-compliance',
		element: admin('Cảnh báo tín chỉ CME', <CmeCompliance />),
	},
	{
		path: '/admin/cme-records',
		element: admin('Ghi nhận CME độc lập', <CmeManualRecords />),
	},	{
		path: '/admin/departments',
		element: admin('Khoa / Phòng ban', <Departments />),
	},
	{
		path: '/admin/venues',
		element: (
			<RequirePermission perm='venues:read'>
				{admin('Địa điểm', <Venues />)}
			</RequirePermission>
		),
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
		path: '/admin/round-types',
		element: admin('Loại đợt nghiên cứu', <Catalog />),
	},
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
	{
		path: '/admin/person-merge',
		element: (
			<RequirePermission perm='persons:read'>
				{admin('Duyệt trùng danh tính', <PersonMerge />)}
			</RequirePermission>
		),
	},
	{
		path: '/admin/trainees',
		element: admin('Học viên', <Trainees />),
	},
	{
		path: '/admin/training-programs',
		element: admin('Chương trình Đào tạo', <TrainingPrograms />),
	},
	{
		path: '/admin/lessons',
		element: admin('Bài học', <Lessons />),
	},
	{
		path: '/admin/training-plans',
		element: (
			<RequirePermission perm='training_plans:manage'>
				{admin('Kế hoạch đào tạo', <TrainingPlan />)}
			</RequirePermission>
		),
	},
	{
		path: '/admin/lecturers',
		element: admin('Giảng viên', <Lecturers />),
	},
	{
		path: '/admin/courses',
		element: admin('Quản lý Khóa học', <Courses />),
	},
	{
		path: '/admin/question-bank',
		element: (
			<RequirePermission perm='exams:manage'>
				{admin('Ngân hàng câu hỏi', <QuestionBank />)}
			</RequirePermission>
		),
	},
	{
		path: '/admin/class-schedule',
		element: (
			<RequirePermission perm='courses:read'>
				{admin('Lịch học', <ClassSchedule />)}
			</RequirePermission>
		),
	},
	{
		path: '/admin/trainee-types',
		element: admin('Đối tượng học viên', <TrainingCatalog />),
	},
	{
		path: '/admin/training-forms',
		element: admin('Hình thức học', <TrainingCatalog />),
	},
	{
		path: '/admin/training-types',
		element: admin('Loại hình đào tạo', <TrainingCatalog />),
	},
	{
		path: '/admin/subjects',
		element: admin('Môn học', <TrainingCatalog />),
	},
	{
		path: '/admin/cme-credit-categories',
		element: (
			<RequirePermission perm='training_catalog:read'>
				{admin('Danh mục quy đổi CME', <CmeCreditCatalog />)}
			</RequirePermission>
		),
	},
	{
		path: '/admin/surveys',
		element: (
			<RequirePermission perm='surveys:manage'>
				{admin('Khảo sát', <Survey />)}
			</RequirePermission>
		),
	},
	{
		path: '/admin/workflows',
		element: (
			<RequirePermission perm='workflows:manage'>
				{admin('Workflow duyệt', <Workflow />)}
			</RequirePermission>
		),
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
		path: '/user/khao-sat',
		element: user('Khảo sát', <UserSurveys />),
	},
	{
		path: '/user/khao-sat/:id',
		element: user('Trả lời khảo sát', <UserSurveys />),
	},
	{
		path: '/user/viec-cua-toi',
		element: user('Việc của tôi', <MyTasks />),
	},
	{
		path: '/user/diem-danh',
		element: user('Điểm danh QR', <AttendanceCheckIn />),
	},
	{
		path: '/user/thi-online',
		element: user('Thi online', <UserExams />),
	},
	{
		path: '/user/register-topic',
		element: (
			<RequirePermission perm='topics:create'>
				<LazyRoute title='Đăng ký đề tài'>
					<TopicRegister />
				</LazyRoute>
			</RequirePermission>
		),
	},
];
