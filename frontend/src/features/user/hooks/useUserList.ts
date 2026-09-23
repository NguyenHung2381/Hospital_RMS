import { useCallback, useEffect, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import {
	createUser,
	deleteUser as deleteUserApi,
	getDepts,
	getRolesList,
	getUsers,
	resetUserPassword,
	updateUser as updateUserApi,
	type SimpleItem,
	type UpdateUserPayload,
} from '../api/userApi';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import type { User, UserForm } from '../types/user.type';

export interface UserListState {
	users: User[];
	departments: SimpleItem[];
	roles: SimpleItem[];
	isLoadingData: boolean;
	loadError: string | null;
	search: string;
	roleFilters: string[];
	deptFilters: string[];
	isDeptDropdownOpen: boolean;
	pageSize: number;
	currentPage: number;
	showCreate: boolean;
	editUser: User | null;
	deleteUser: User | null;
	resetUser: User | null;
	toast: { msg: string; type: 'success' | 'error' | 'info' } | null;
	globalStats: {
		total: number;
		active: number;
		inactive: number;
		pwdWarn: number;
	};
	totalCount: number;
	roleCounts: Record<string, number>;
	deptCounts: Record<string, number>;
	totalPages: number;

	setSearch: (v: string) => void;
	setRoleFilters: React.Dispatch<React.SetStateAction<string[]>>;
	setDeptFilters: React.Dispatch<React.SetStateAction<string[]>>;
	setIsDeptDropdownOpen: (v: boolean) => void;
	setPageSize: (v: number) => void;
	setCurrentPage: (v: number) => void;
	setShowCreate: (v: boolean) => void;
	setEditUser: (u: User | null) => void;
	setDeleteUser: (u: User | null) => void;
	setResetUser: (u: User | null) => void;
	getRoleName: (id: string) => string;
	getDeptName: (id?: string) => string;
	handleCreate: (form: UserForm) => Promise<void>;
	handleEdit: (form: UserForm) => Promise<void>;
	handleDelete: () => Promise<void>;
	handleResetPassword: () => Promise<void>;
	handleToggleActive: (id: string) => Promise<void>;
	handleBulkDelete: (ids: string[]) => Promise<void>;
	handleBulkEdit: (ids: string[], payload: UpdateUserPayload) => Promise<void>;
}

import type React from 'react';

export function useUserList(): UserListState {
	const [users, setUsers] = useState<User[]>([]);
	const [departments, setDepartments] = useState<SimpleItem[]>([]);
	const [roles, setRoles] = useState<SimpleItem[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [search, setSearchRaw] = useState('');
	// Debounce chuỗi tìm kiếm gửi lên server — tránh gọi API mỗi phím gõ
	const [debouncedSearch, setDebouncedSearch] = useState('');
	const [roleFilters, setRoleFilters] = useState<string[]>([]);
	const [deptFilters, setDeptFilters] = useState<string[]>([]);
	const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);
	const [pageSize, setPageSizeRaw] = useState(20);
	const [currentPage, setCurrentPageRaw] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);
	const [showCreate, setShowCreate] = useState(false);
	const [editUser, setEditUser] = useState<User | null>(null);
	const [deleteUser, setDeleteUser] = useState<User | null>(null);
	const [resetUser, setResetUser] = useState<User | null>(null);
	const [toast, setToast] = useState<{
		msg: string;
		type: 'success' | 'error' | 'info';
	} | null>(null);
	const [globalStats, setGlobalStats] = useState({
		total: 0,
		active: 0,
		inactive: 0,
		pwdWarn: 0,
	});
	const [totalCount, setTotalCount] = useState(0);
	const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});
	const [deptCounts, setDeptCounts] = useState<Record<string, number>>({});

	const setSearch = useCallback((v: string) => {
		setSearchRaw(v);
	}, []);
	const setPageSize = useCallback((v: number) => {
		setPageSizeRaw(v);
		setCurrentPageRaw(1);
	}, []);
	const setCurrentPage = setCurrentPageRaw;

	const showToast = useCallback(
		(msg: string, type: 'success' | 'error' | 'info' = 'success') =>
			setToast({ msg, type }),
		[],
	);

	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 3000);
		return () => clearTimeout(t);
	}, [toast]);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('user', refreshData);

	// Debounce tìm kiếm 300ms rồi mới gọi API, đồng thời quay về trang 1
	useEffect(() => {
		const t = setTimeout(() => {
			setDebouncedSearch(search);
			setCurrentPageRaw(1);
		}, 300);
		return () => clearTimeout(t);
	}, [search]);

	// Danh mục khoa/phòng + vai trò — tải một lần
	useEffect(() => {
		void (async () => {
			try {
				const [deptsRes, rolesRes] = await Promise.all([
					getDepts(),
					getRolesList(),
				]);
				setDepartments(deptsRes.data);
				setRoles(rolesRes.data);
			} catch {
				// Không chặn danh sách người dùng nếu tải danh mục lỗi
			}
		})();
	}, []);

	// Bảng danh sách — phụ thuộc trang/kích thước trang/lọc. meta=0: server bỏ
	// qua thống kê + facet (đã tách sang effect riêng bên dưới) nên chuyển trang
	// chỉ chạy đúng 1 câu SELECT.
	useEffect(() => {
		const controller = new AbortController();
		void (async () => {
			setIsLoadingData(true);
			setLoadError(null);
			try {
				const res = await getUsers({
					page: currentPage,
					limit: pageSize,
					search: debouncedSearch || undefined,
					department_id: deptFilters.join(',') || undefined,
					role_id: roleFilters.join(',') || undefined,
					meta: 0,
				});
				if (controller.signal.aborted) return;
				setUsers(res.data);
				setTotalCount(res.pagination.total);
				// Trang hiện tại vượt quá số trang thực tế (vd. đổi bộ lọc) — quay về trang 1
				const lastPage = Math.max(1, Math.ceil(res.pagination.total / pageSize));
				if (currentPage > lastPage) setCurrentPageRaw(1);
			} catch (err) {
				if (controller.signal.aborted) return;
				setLoadError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
			} finally {
				if (!controller.signal.aborted) setIsLoadingData(false);
			}
		})();
		return () => controller.abort();
	}, [currentPage, pageSize, debouncedSearch, roleFilters, deptFilters, refreshKey]);

	// Thống kê tổng + facet counts — KHÔNG phụ thuộc trang. Chỉ tải lại khi đổi
	// tìm kiếm/bộ lọc hoặc có realtime update; chuyển trang không kích hoạt lại.
	useEffect(() => {
		const controller = new AbortController();
		void (async () => {
			try {
				const res = await getUsers({
					page: 1,
					limit: 1,
					search: debouncedSearch || undefined,
					department_id: deptFilters.join(',') || undefined,
					role_id: roleFilters.join(',') || undefined,
					meta: 1,
				});
				if (controller.signal.aborted) return;
				if (res.global_stats) {
					setGlobalStats({
						total: res.global_stats.total,
						active: res.global_stats.active,
						inactive: res.global_stats.inactive,
						pwdWarn: res.global_stats.pwd_warn,
					});
				}
				if (res.role_counts) setRoleCounts(res.role_counts);
				if (res.dept_counts) setDeptCounts(res.dept_counts);
			} catch {
				// Không chặn bảng nếu tải thống kê lỗi
			}
		})();
		return () => controller.abort();
	}, [debouncedSearch, roleFilters, deptFilters, refreshKey]);

	const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

	const getRoleName = useCallback(
		(id: string) => roles.find((r) => r.id === id)?.name ?? '—',
		[roles],
	);
	const getDeptName = useCallback(
		(id?: string) =>
			!id ? '—' : (departments.find((d) => d.id === id)?.name ?? '—'),
		[departments],
	);

	const handleCreate = useCallback(
		async (form: UserForm): Promise<void> => {
			const newUser = await createUser({
				username: form.username,
				password: form.password,
				staff_number: form.staff_number || undefined,
				full_name: form.full_name,
				email: form.email || undefined,
				department_id: form.department_id || undefined,
				role_id: form.role_id || undefined,

			});
			setShowCreate(false);
			refreshData();
			showToast(`Đã cấp tài khoản cho ${newUser.full_name}`);
		},
		[showToast, refreshData],
	);

	const handleEdit = useCallback(
		async (form: UserForm): Promise<void> => {
			if (!editUser) return;
			await updateUserApi(editUser.id, {
				staff_number: form.staff_number || undefined,
				full_name: form.full_name,
				email: form.email || undefined,
				department_id: form.department_id || undefined,
				role_id: form.role_id || undefined,

				is_active: form.is_active,
			});
			if (form.password) await resetUserPassword(editUser.id, form.password);
			setEditUser(null);
			refreshData();
			showToast('Đã cập nhật thông tin tài khoản');
		},
		[editUser, showToast, refreshData],
	);

	const handleDelete = useCallback(async (): Promise<void> => {
		if (!deleteUser) return;
		await deleteUserApi(deleteUser.id);
		setDeleteUser(null);
		refreshData();
		showToast(`Đã xoá tài khoản ${deleteUser.full_name}`, 'info');
	}, [deleteUser, showToast, refreshData]);

	const handleResetPassword = useCallback(async (): Promise<void> => {
		if (!resetUser) return;
		await resetUserPassword(resetUser.id, '123456');
		setResetUser(null);
		showToast(
			`Đã đặt lại mật khẩu của ${resetUser.full_name} về mặc định`,
			'info',
		);
	}, [resetUser, showToast]);

	const handleToggleActive = useCallback(
		async (id: string) => {
			const target = users.find((u) => u.id === id);
			if (!target) return;
			try {
				const updated = await updateUserApi(id, {
					is_active: !target.is_active,
				});
				setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
				refreshData();
				showToast(
					updated.is_active ? 'Đã kích hoạt tài khoản' : 'Đã khoá tài khoản',
					'info',
				);
			} catch {
				showToast('Không thể cập nhật trạng thái', 'error');
			}
		},
		[users, showToast, refreshData],
	);

	const handleBulkDelete = useCallback(
		async (ids: string[]): Promise<void> => {
			if (!ids.length) return;
			const { okIds, failedCount } = await runBulk(ids, deleteUserApi);
			refreshData();
			showToast(
				bulkToast('xoá', okIds.size, failedCount, 'tài khoản'),
				failedCount ? 'error' : 'info',
			);
		},
		[showToast, refreshData],
	);

	const handleBulkEdit = useCallback(
		async (ids: string[], payload: UpdateUserPayload): Promise<void> => {
			if (!ids.length || !Object.keys(payload).length) return;
			const { okIds, failedCount } = await runBulk(ids, (id) =>
				updateUserApi(id, payload),
			);
			refreshData();
			showToast(
				bulkToast('cập nhật', okIds.size, failedCount, 'tài khoản'),
				failedCount ? 'error' : 'success',
			);
		},
		[showToast, refreshData],
	);

	return {
		users,
		departments,
		roles,
		isLoadingData,
		loadError,
		search,
		roleFilters,
		deptFilters,
		isDeptDropdownOpen,
		pageSize,
		currentPage,
		showCreate,
		editUser,
		deleteUser,
		resetUser,
		toast,
		globalStats,
		totalCount,
		roleCounts,
		deptCounts,
		totalPages,
		setSearch,
		setRoleFilters,
		setDeptFilters,
		setIsDeptDropdownOpen,
		setPageSize,
		setCurrentPage,
		setShowCreate,
		setEditUser,
		setDeleteUser,
		setResetUser,
		getRoleName,
		getDeptName,
		handleCreate,
		handleEdit,
		handleDelete,
		handleResetPassword,
		handleToggleActive,
		handleBulkDelete,
		handleBulkEdit,
	};
}
