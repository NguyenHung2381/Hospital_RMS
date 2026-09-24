import { useEffect, useMemo, useState } from 'react';
import { CheckSvg, SearchSvg, UserCheckSvg, XSvg } from '@/assets/icons';
import { InlineLoading } from '@/shared/components';
import { getUsers } from '../../user/api/userApi';
import type { User } from '../../user/types/user.type';
import { getPermissionCatalog, getRolePermissions, getRoles } from '../api/roleApi';
import type { PermissionCatalog, Role, RoleGrant } from '../types/role.type';
import { grantMap, scopeLabel } from '../utils/permissionView';
import styles from '../pages/Roles.module.css';

interface UserPermissionsModalProps {
	onClose: () => void;
}

// Tra cứu "người này làm được gì": tìm tài khoản → vai trò → toàn bộ quyền
// hiệu lực kèm phạm vi dữ liệu. Quyền hiệu lực = quyền của vai trò (mỗi tài
// khoản đúng 1 vai trò); vai trò toàn quyền thì bỏ qua mọi kiểm tra.
export function UserPermissionsModal({ onClose }: UserPermissionsModalProps) {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<User[]>([]);
	const [searching, setSearching] = useState(false);
	const [user, setUser] = useState<User | null>(null);
	const [roles, setRoles] = useState<Role[]>([]);
	const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
	const [grants, setGrants] = useState<RoleGrant[] | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		Promise.all([getRoles({ page: 1, limit: 100 }), getPermissionCatalog()])
			.then(([list, cat]) => {
				setRoles(list.data);
				setCatalog(cat);
			})
			.catch(() => setError('Không thể tải dữ liệu'));
	}, []);

	// Tìm tài khoản (debounce 300ms)
	useEffect(() => {
		const q = query.trim();
		if (q.length < 2) return;
		const t = setTimeout(() => {
			setSearching(true);
			getUsers({ search: q, limit: 10, meta: 0 })
				.then((res) => setResults(res.data))
				.catch(() => setResults([]))
				.finally(() => setSearching(false));
		}, 300);
		return () => clearTimeout(t);
	}, [query]);

	const pick = (u: User) => {
		setUser(u);
		setResults([]);
		setQuery('');
		setGrants(null);
		if (u.role_id) {
			getRolePermissions(u.role_id)
				.then(setGrants)
				.catch(() => setError('Không thể tải quyền của vai trò'));
		} else {
			setGrants([]);
		}
	};

	const role = roles.find((r) => r.id === user?.role_id);
	// Từ khoá quá ngắn → không hiện kết quả cũ (không cần xoá state trong effect)
	const shownResults = query.trim().length >= 2 ? results : [];

	const sections = useMemo(() => {
		if (!catalog || !grants) return [];
		const map = grantMap(grants);
		return catalog.modules
			.map((mod) => ({
				mod,
				resources: mod.resources
					.map((res) => ({
						res,
						perms: res.permissions.filter((p) => map.has(p.id)),
						scope: scopeLabel(
							res,
							res.permissions.map((p) => map.get(p.id)).find((s) => s != null) ?? null,
						),
					}))
					.filter((x) => x.perms.length),
			}))
			.filter((s) => s.resources.length);
	}, [catalog, grants]);

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalLg}`}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<UserCheckSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>Tra cứu quyền người dùng</div>
						<div className={styles.modalSub}>Người này được làm gì, trong phạm vi nào</div>
					</div>
					<button className={styles.modalClose} onClick={onClose}>
						<XSvg />
					</button>
				</div>

				<div className={styles.viewToolbar}>
					<div className={styles.viewSearch}>
						<SearchSvg />
						<input
							autoFocus
							placeholder='Tìm theo họ tên, tài khoản, mã nhân viên…'
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
						{(shownResults.length > 0 || searching) && (
							<div className={styles.viewResults}>
								{searching && <div className={styles.viewSub}>Đang tìm…</div>}
								{shownResults.map((u) => (
									<button key={u.id} type='button' onClick={() => pick(u)}>
										<strong>{u.full_name}</strong>
										<span className={styles.viewSub}>
											{u.username}
											{u.role_name ? ` · ${u.role_name}` : ''}
										</span>
									</button>
								))}
							</div>
						)}
					</div>
				</div>

				<div className={styles.permModalBody}>
					{error ? (
						<div className={styles.viewEmpty}>{error}</div>
					) : !user ? (
						<div className={styles.viewEmpty}>Tìm và chọn một tài khoản để xem quyền.</div>
					) : (
						<>
							<div className={styles.viewUserCard}>
								<div>
									<div className={styles.permResourceName}>{user.full_name}</div>
									<div className={styles.viewSub}>
										{user.username}
										{!user.is_active && ' · đã ngừng hoạt động (không đăng nhập được)'}
									</div>
								</div>
								<div className={styles.viewSub}>
									Vai trò: <strong>{role?.name ?? user.role_name ?? '— chưa gán —'}</strong>
								</div>
							</div>
							{role?.is_superuser ? (
								<div className={styles.permSuperNotice}>
									Vai trò toàn quyền: được làm mọi thao tác trên toàn hệ thống.
								</div>
							) : !grants ? (
								<InlineLoading label='Đang tải quyền…' />
							) : sections.length === 0 ? (
								<div className={styles.viewEmpty}>Vai trò này chưa được cấp quyền nào.</div>
							) : (
								<table className={styles.permMatrix}>
									<thead>
										<tr>
											<th>Chức năng</th>
											<th>Phạm vi dữ liệu</th>
											<th>Được phép</th>
										</tr>
									</thead>
									{sections.map(({ mod, resources }) => (
										<tbody key={mod.key}>
											<tr className={styles.permModuleRow}>
												<td colSpan={3}>{mod.label}</td>
											</tr>
											{resources.map(({ res, perms, scope }) => (
												<tr key={res.key}>
													<td className={styles.permResourceCell}>
														<div className={styles.permResourceName}>{res.label}</div>
													</td>
													<td className={styles.viewCell}>{scope || '—'}</td>
													<td className={styles.viewCell}>
														<div className={styles.viewChips}>
															{perms.map((p) => (
																<span key={p.id} className={styles.viewGranted} title={p.description ?? ''}>
																	<CheckSvg /> {catalog?.actionLabels[p.action] ?? p.action}
																</span>
															))}
														</div>
													</td>
												</tr>
											))}
										</tbody>
									))}
								</table>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
