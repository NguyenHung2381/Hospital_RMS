import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from '../api/userApi';
import type { AccountType, User, UserForm } from '../types/user.type';
import { isPasswordOld } from '../utils/userHelpers';

export interface UserListState {
	users: User[];
	departments: SimpleItem[];
	roles: SimpleItem[];
	isLoadingData: boolean;
	loadError: string | null;
	search: string;
	typeFilters: AccountType[];
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
	filteredUsers: User[];
	usersForTypeCount: User[];
	usersForDeptCount: User[];
	totalPages: number;
	pagedUsers: User[];

	setSearch: (v: string) => void;
	setTypeFilters: React.Dispatch<React.SetStateAction<AccountType[]>>;
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
}

import type React from 'react';

export function useUserList(): UserListState {
	const [users, setUsers] = useState<User[]>([]);
	const [departments, setDepartments] = useState<SimpleItem[]>([]);
	const [roles, setRoles] = useState<SimpleItem[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [search, setSearchRaw] = useState('');
	const [typeFilters, setTypeFilters] = useState<AccountType[]>([]);
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
	const suppressRealtimeRef = useRef(false);

	const setSearch = useCallback((v: string) => {
		setSearchRaw(v);
		setCurrentPageRaw(1);
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

	const suppressRealtime = (ms = 3000) => {
		suppressRealtimeRef.current = true;
		setTimeout(() => {
			suppressRealtimeRef.current = false;
		}, ms);
	};

	const refreshData = useCallback(() => {
		if (!suppressRealtimeRef.current) setRefreshKey((k) => k + 1);
	}, []);
	useRealtimeUpdate('user', refreshData);

	useEffect(() => {
		const load = async () => {
			setIsLoadingData(true);
			setLoadError(null);
			try {
				const [usersRes, deptsRes, rolesRes] = await Promise.all([
					getUsers({ limit: 200 }),
					getDepts(),
					getRolesList(),
				]);
				setUsers(usersRes.data);
				setDepartments(deptsRes.data);
				setRoles(rolesRes.data);
			} catch (err) {
				setLoadError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
			} finally {
				setIsLoadingData(false);
			}
		};
		void load();
	}, [refreshKey]);

	const globalStats = useMemo(
		() => ({
			total: users.length,
			active: users.filter((u) => u.is_active).length,
			inactive: users.filter((u) => !u.is_active).length,
			pwdWarn: users.filter((u) => isPasswordOld(u.password_changed_at)).length,
		}),
		[users],
	);

	const matchesSearch = (u: User) => {
		if (!search) return true;
		const q = search.toLowerCase();
		return (
			u.full_name.toLowerCase().includes(q) ||
			u.username.toLowerCase().includes(q) ||
			(u.email ?? '').toLowerCase().includes(q) ||
			String(u.staff_number ?? '')
				.toLowerCase()
				.includes(q)
		);
	};

	const usersForTypeCount = useMemo(
		() =>
			users.filter(
				(u) =>
					(deptFilters.length === 0 ||
						(u.department_id && deptFilters.includes(u.department_id))) &&
					matchesSearch(u),
			),
		[users, deptFilters, search], // eslint-disable-line react-hooks/exhaustive-deps
	);

	const usersForDeptCount = useMemo(
		() =>
			users.filter(
				(u) =>
					(typeFilters.length === 0 || typeFilters.includes(u.account_type)) &&
					matchesSearch(u),
			),
		[users, typeFilters, search], // eslint-disable-line react-hooks/exhaustive-deps
	);

	const filteredUsers = useMemo(
		() =>
			users.filter(
				(u) =>
					(typeFilters.length === 0 || typeFilters.includes(u.account_type)) &&
					(deptFilters.length === 0 ||
						(u.department_id && deptFilters.includes(u.department_id))) &&
					matchesSearch(u),
			),
		[users, typeFilters, deptFilters, search], // eslint-disable-line react-hooks/exhaustive-deps
	);

	const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
	const pagedUsers = useMemo(() => {
		const start = (currentPage - 1) * pageSize;
		return filteredUsers.slice(start, start + pageSize);
	}, [filteredUsers, currentPage, pageSize]);

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
				account_type: form.account_type,
			});
			suppressRealtime();
			setUsers((prev) => [newUser, ...prev]);
			setShowCreate(false);
			showToast(`Đã cấp tài khoản cho ${newUser.full_name}`);
		},
		[showToast],
	);

	const handleEdit = useCallback(
		async (form: UserForm): Promise<void> => {
			if (!editUser) return;
			suppressRealtime();
			const updated = await updateUserApi(editUser.id, {
				staff_number: form.staff_number || undefined,
				full_name: form.full_name,
				email: form.email || undefined,
				department_id: form.department_id || undefined,
				role_id: form.role_id || undefined,
				account_type: form.account_type,
				is_active: form.is_active,
			});
			if (form.password) await resetUserPassword(editUser.id, form.password);
			setUsers((prev) => prev.map((u) => (u.id === editUser.id ? updated : u)));
			setEditUser(null);
			showToast('Đã cập nhật thông tin tài khoản');
		},
		[editUser, showToast],
	);

	const handleDelete = useCallback(async (): Promise<void> => {
		if (!deleteUser) return;
		await deleteUserApi(deleteUser.id);
		suppressRealtime();
		setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id));
		setDeleteUser(null);
		showToast(`Đã xoá tài khoản ${deleteUser.full_name}`, 'info');
	}, [deleteUser, showToast]);

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
				suppressRealtime();
				setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
				showToast(
					updated.is_active ? 'Đã kích hoạt tài khoản' : 'Đã khoá tài khoản',
					'info',
				);
			} catch {
				showToast('Không thể cập nhật trạng thái', 'error');
			}
		},
		[users, showToast],
	);

	return {
		users,
		departments,
		roles,
		isLoadingData,
		loadError,
		search,
		typeFilters,
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
		filteredUsers,
		usersForTypeCount,
		usersForDeptCount,
		totalPages,
		pagedUsers,
		setSearch,
		setTypeFilters,
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
	};
}
