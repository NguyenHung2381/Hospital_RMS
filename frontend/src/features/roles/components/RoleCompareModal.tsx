import { useEffect, useMemo, useState } from 'react';
import { CheckSvg, LayersSvg, XSvg } from '@/assets/icons';
import { InlineLoading } from '@/shared/components';
import { getPermissionCatalog, getRolePermissions, getRoles } from '../api/roleApi';
import type { PermissionCatalog, Role, RoleGrant } from '../types/role.type';
import { grantMap, scopeLabel } from '../utils/permissionView';
import styles from '../pages/Roles.module.css';

interface RoleCompareModalProps {
	/** Vai trò chọn sẵn ở cột A (mở từ một dòng cụ thể) */
	initialRoleId?: string;
	onClose: () => void;
}

// So sánh quyền của 2 vai trò — mặc định chỉ hiện dòng KHÁC nhau (có/không có
// quyền, hoặc cùng có nhưng khác phạm vi dữ liệu).
export function RoleCompareModal({ initialRoleId, onClose }: RoleCompareModalProps) {
	const [roles, setRoles] = useState<Role[]>([]);
	const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
	const [aId, setAId] = useState(initialRoleId ?? '');
	const [bId, setBId] = useState('');
	const [grants, setGrants] = useState<Record<string, RoleGrant[]>>({});
	const [showAll, setShowAll] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		Promise.all([getRoles({ page: 1, limit: 100 }), getPermissionCatalog()])
			.then(([list, cat]) => {
				setRoles(list.data);
				setCatalog(cat);
			})
			.catch(() => setError('Không thể tải dữ liệu'))
			.finally(() => setLoading(false));
	}, []);

	useEffect(() => {
		for (const id of [aId, bId]) {
			if (!id || grants[id]) continue;
			getRolePermissions(id)
				.then((g) => setGrants((prev) => ({ ...prev, [id]: g })))
				.catch(() => setError('Không thể tải quyền của vai trò'));
		}
	}, [aId, bId, grants]);

	const roleA = roles.find((r) => r.id === aId);
	const roleB = roles.find((r) => r.id === bId);
	const ready = !!(catalog && roleA && roleB && grants[aId] && grants[bId]);

	const sections = useMemo(() => {
		if (!ready || !catalog) return [];
		const a = grantMap(grants[aId]);
		const b = grantMap(grants[bId]);
		return catalog.modules
			.map((mod) => ({
				mod,
				rows: mod.resources.flatMap((res) =>
					res.permissions
						.map((perm) => {
							// Vai trò toàn quyền: có mọi quyền, phạm vi rộng nhất
							const cell = (role: Role, map: Map<string, string | null>) =>
								role.is_superuser
									? { has: true, label: 'Toàn quyền' }
									: map.has(perm.id)
										? { has: true, label: scopeLabel(res, map.get(perm.id) ?? null) || 'Có' }
										: { has: false, label: '' };
							const ca = cell(roleA!, a);
							const cb = cell(roleB!, b);
							const differs = ca.has !== cb.has || ca.label !== cb.label;
							return { res, perm, ca, cb, differs };
						})
						.filter((row) => showAll || row.differs),
				),
			}))
			.filter((s) => s.rows.length);
	}, [ready, catalog, grants, aId, bId, roleA, roleB, showAll]);

	const diffCount = sections.reduce((n, s) => n + s.rows.filter((r) => r.differs).length, 0);

	const renderCell = (c: { has: boolean; label: string }) =>
		c.has ? (
			<span className={styles.viewGranted}>
				<CheckSvg /> {c.label}
			</span>
		) : (
			<div className={styles.permCellDash} />
		);

	const picker = (value: string, onChange: (v: string) => void, other: string) => (
		<select className={styles.viewSelect} value={value} onChange={(e) => onChange(e.target.value)}>
			<option value=''>— Chọn vai trò —</option>
			{roles
				.filter((r) => r.id !== other)
				.map((r) => (
					<option key={r.id} value={r.id}>
						{r.name} ({r.id})
					</option>
				))}
		</select>
	);

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalLg}`}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<LayersSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>So sánh vai trò</div>
						<div className={styles.modalSub}>Quyền và phạm vi dữ liệu khác nhau giữa 2 vai trò</div>
					</div>
					{ready && !showAll && <span className={styles.permCount}>{diffCount} khác biệt</span>}
					<button className={styles.modalClose} onClick={onClose}>
						<XSvg />
					</button>
				</div>

				<div className={styles.viewToolbar}>
					{picker(aId, setAId, bId)}
					<span className={styles.viewVs}>so với</span>
					{picker(bId, setBId, aId)}
					<label className={styles.viewToggle}>
						<input type='checkbox' checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
						Hiện cả quyền giống nhau
					</label>
				</div>

				<div className={styles.permModalBody}>
					{loading ? (
						<InlineLoading label='Đang tải…' />
					) : error ? (
						<div className={styles.viewEmpty}>{error}</div>
					) : !roleA || !roleB ? (
						<div className={styles.viewEmpty}>Chọn 2 vai trò để so sánh.</div>
					) : !ready ? (
						<InlineLoading label='Đang tải quyền…' />
					) : sections.length === 0 ? (
						<div className={styles.viewEmpty}>Hai vai trò có quyền giống hệt nhau.</div>
					) : (
						<table className={styles.permMatrix}>
							<thead>
								<tr>
									<th>Quyền</th>
									<th>{roleA.name}</th>
									<th>{roleB.name}</th>
								</tr>
							</thead>
							{sections.map(({ mod, rows }) => (
								<tbody key={mod.key}>
									<tr className={styles.permModuleRow}>
										<td colSpan={3}>{mod.label}</td>
									</tr>
									{rows.map(({ res, perm, ca, cb }) => (
										<tr key={perm.id}>
											<td className={styles.permResourceCell} title={perm.description ?? ''}>
												<div className={styles.permResourceName}>{perm.name}</div>
												<div className={styles.viewSub}>{res.label}</div>
											</td>
											<td className={styles.viewCell}>{renderCell(ca)}</td>
											<td className={styles.viewCell}>{renderCell(cb)}</td>
										</tr>
									))}
								</tbody>
							))}
						</table>
					)}
				</div>
			</div>
		</div>
	);
}
