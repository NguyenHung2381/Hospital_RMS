import React, { useEffect, useMemo, useState } from 'react';
import {
	CheckSvg,
	SearchSvg,
	InfoSvg,
	KeySvg,
	LayersSvg,
	ShieldSvg,
	UsersSvg,
	XSvg,
} from '@/assets/icons';
import {
	getPermissionCatalog,
	getRolePermissions,
	setRolePermissions,
} from '../api/roleApi';
import type {
	CatalogPermission,
	CatalogResource,
	PermissionCatalog,
	Role,
	RoleGrant,
} from '../types/role.type';
import { InlineLoading } from '@/shared/components';
import styles from '../pages/Roles.module.css';

const RESOURCE_ICON: Record<string, React.ReactNode> = {
	topics: <LayersSvg />,
	users: <UsersSvg />,
	departments: <InfoSvg />,
	roles: <ShieldSvg />,
	rounds: <InfoSvg />,
	councils: <UsersSvg />,
	seminars: <LayersSvg />,
	files: <InfoSvg />,
	reports: <InfoSvg />,
	system: <ShieldSvg />,
	admin_panel: <ShieldSvg />,
	activity_logs: <InfoSvg />,
	catalog: <InfoSvg />,
	notifications: <InfoSvg />,
	security_events: <ShieldSvg />,
	trainees: <UsersSvg />,
	training_programs: <LayersSvg />,
	lecturers: <UsersSvg />,
	training_catalog: <InfoSvg />,
	venues: <InfoSvg />,
	courses: <LayersSvg />,
	exams: <LayersSvg />,
	cme_records: <InfoSvg />,
	staff_licenses: <InfoSvg />,
	persons: <UsersSvg />,
	surveys: <InfoSvg />,
	workflows: <LayersSvg />,
	system_settings: <ShieldSvg />,
};

// Thứ tự hiển thị quyền = các action thực sự xuất hiện trong catalog, theo thứ tự
// khai báo nhãn (backend ACTION_LABELS) — không còn danh sách cột viết tay
// (danh sách cũ thiếu 'merge' / 'read_assigned' nên 2 quyền đó không cấp được).
function columnsOf(catalog: PermissionCatalog): string[] {
	const used = new Set(
		catalog.modules.flatMap((m) =>
			m.resources.flatMap((r) => r.permissions.map((p) => p.action)),
		),
	);
	const ordered = Object.keys(catalog.actionLabels).filter((a) => used.has(a));
	const extra = [...used].filter((a) => !ordered.includes(a));
	return [...ordered, ...extra];
}

// Phạm vi đang áp cho một dòng (resource): ưu tiên phạm vi của quyền Xem,
// không có thì của quyền bất kỳ trong dòng, chưa cấp gì thì phạm vi hẹp nhất.
function initialScopeOf(res: CatalogResource, grants: RoleGrant[]): string {
	const scopes = res.scopes ?? [];
	const scopeOfPerm = (p?: CatalogPermission) =>
		p ? grants.find((g) => g.permission_id === p.id)?.scope : undefined;
	const read = res.permissions.find((p) => p.action === 'read');
	const found =
		scopeOfPerm(read) ?? res.permissions.map(scopeOfPerm).find((s) => s != null) ?? null;
	return found && scopes.some((s) => s.key === found) ? found : (scopes[0]?.key ?? '');
}

function tooltipOf(perm: CatalogPermission): string {
	const lines = [perm.description ? `${perm.name} — ${perm.description}` : perm.name];
	if (perm.critical) {
		lines.push('⚠ Quyền nhạy cảm: cho phép quản lý tài khoản / phân quyền');
	}
	return lines.join('\n');
}

// Mức quyền nhanh cho một dòng. Mỗi mức = tập action; quyền đi kèm (implies)
// trong cùng dòng được gộp vào. Mức trùng tập quyền với mức thấp hơn bị bỏ
// (vd dòng chỉ có quyền Xem thì chỉ còn "Không" / "Chỉ xem").
const LEVELS: { key: string; label: string; actions: string[] | null }[] = [
	{ key: 'none', label: 'Không', actions: [] },
	{ key: 'view', label: 'Chỉ xem', actions: ['read', 'access'] },
	{
		key: 'edit',
		label: 'Xem & sửa',
		actions: ['read', 'access', 'create', 'update', 'import', 'export', 'roster'],
	},
	{ key: 'full', label: 'Toàn quyền', actions: null },
];

function levelsOf(res: CatalogResource) {
	const rowIds = new Set(res.permissions.map((p) => p.id));
	const out: { key: string; label: string; ids: string[] }[] = [];
	for (const lv of LEVELS) {
		const picked = res.permissions.filter(
			(p) => !lv.actions || lv.actions.includes(p.action),
		);
		const ids = new Set(
			picked.flatMap((p) => [p.id, ...p.implies.filter((i) => rowIds.has(i))]),
		);
		if (lv.key !== 'none' && !ids.size) continue;
		if (out.some((o) => sameIds(o.ids, [...ids]))) continue;
		out.push({ key: lv.key, label: lv.label, ids: [...ids] });
	}
	return out;
}

function sameIds(a: string[], b: string[]) {
	return a.length === b.length && a.every((id) => b.includes(id));
}

interface RolePermissionModalProps {
	role: Role;
	onClose: () => void;
	onSaved: (roleId: string, ids: string[]) => void;
}

export function RolePermissionModal({
	role,
	onClose,
	onSaved,
}: RolePermissionModalProps) {
	const [granted, setGranted] = useState<Set<string>>(new Set());
	const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
	// resource → phạm vi dữ liệu (chỉ resource có phạm vi). Mọi quyền được tick
	// trong dòng dùng chung phạm vi này.
	const [rowScope, setRowScope] = useState<Record<string, string>>({});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	// Trạng thái lúc mở — để tóm tắt thay đổi trước khi lưu
	const [initial, setInitial] = useState<{
		ids: Set<string>;
		scopes: Record<string, string>;
	}>({
		ids: new Set(),
		scopes: {},
	});
	const [filter, setFilter] = useState('');
	const [onlyGranted, setOnlyGranted] = useState(false);
	const [confirming, setConfirming] = useState(false);
	// Dòng đang mở phần "Tuỳ chỉnh" (tick từng quyền)
	const [openCustom, setOpenCustom] = useState<Set<string>>(new Set());

	useEffect(() => {
		Promise.all([getPermissionCatalog(), getRolePermissions(role.id)])
			.then(([cat, grants]) => {
				setCatalog(cat);
				setGranted(new Set(grants.map((g) => g.permission_id)));
				const scopes: Record<string, string> = {};
				for (const res of cat.modules.flatMap((m) => m.resources)) {
					if (res.scopes?.length) scopes[res.key] = initialScopeOf(res, grants);
				}
				setRowScope(scopes);
				setInitial({
					ids: new Set(grants.map((g) => g.permission_id)),
					scopes,
				});
			})
			.catch(() => setError('Không thể tải quyền hiện tại'))
			.finally(() => setLoading(false));
	}, [role.id]);

	// Tick một quyền → tick luôn các quyền đi kèm (vd Sửa kéo theo Xem).
	// Bỏ tick thì chỉ bỏ đúng quyền đó.
	const toggle = (perm: CatalogPermission) => {
		setGranted((prev) => {
			const next = new Set(prev);
			if (next.has(perm.id)) {
				next.delete(perm.id);
			} else {
				next.add(perm.id);
				perm.implies.forEach((id) => next.add(id));
			}
			return next;
		});
	};

	// Chọn một mức cho cả dòng: thay toàn bộ quyền của dòng bằng các quyền của mức
	const setRow = (res: CatalogResource, ids: string[]) => {
		setGranted((prev) => {
			const next = new Set(prev);
			res.permissions.forEach((p) => next.delete(p.id));
			ids.forEach((id) => next.add(id));
			return next;
		});
	};

	const toggleCustom = (key: string) =>
		setOpenCustom((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});

	const handleSave = async () => {
		setSaving(true);
		setError('');
		try {
			const ids = [...granted];
			const resourceOf = new Map(
				(catalog?.modules ?? []).flatMap((m) =>
					m.resources.flatMap((r) => r.permissions.map((p) => [p.id, r] as const)),
				),
			);
			const grants: RoleGrant[] = ids.map((id) => {
				const res = resourceOf.get(id);
				return {
					permission_id: id,
					scope: res?.scopes?.length ? (rowScope[res.key] ?? res.scopes[0].key) : null,
				};
			});
			await setRolePermissions(role.id, grants);
			onSaved(role.id, ids);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Lưu thất bại');
		} finally {
			setSaving(false);
		}
	};

	const columns = useMemo(() => (catalog ? columnsOf(catalog) : []), [catalog]);

	// Tóm tắt thay đổi so với lúc mở: quyền thêm / gỡ, dòng đổi phạm vi, quyền
	// nhạy cảm mới cấp (cần xác nhận rõ ràng).
	const changes = useMemo(() => {
		const empty = { added: [], removed: [], scoped: [], critical: [] } as {
			added: string[];
			removed: string[];
			scoped: string[];
			critical: string[];
		};
		if (!catalog) return { ...empty, count: 0 };
		const out = { ...empty };
		for (const res of catalog.modules.flatMap((m) => m.resources)) {
			for (const perm of res.permissions) {
				const label = `${res.label}: ${perm.name}`;
				const now = granted.has(perm.id);
				const before = initial.ids.has(perm.id);
				if (now && !before) {
					out.added.push(label);
					if (perm.critical) out.critical.push(label);
				}
				if (!now && before) out.removed.push(label);
			}
			const hasGrant = res.permissions.some((p) => granted.has(p.id));
			if (
				res.scopes?.length &&
				hasGrant &&
				initial.scopes[res.key] !== rowScope[res.key]
			) {
				const to =
					res.scopes.find((sc) => sc.key === rowScope[res.key])?.label ??
					rowScope[res.key];
				out.scoped.push(`${res.label} → ${to}`);
			}
		}
		return {
			...out,
			count: out.added.length + out.removed.length + out.scoped.length,
		};
	}, [catalog, granted, initial, rowScope]);

	// Lọc hiển thị theo ô tìm kiếm / "chỉ quyền đã cấp" — không đổi dữ liệu
	const needle = filter.trim().toLowerCase();
	const visibleResources = (mod: PermissionCatalog['modules'][number]) =>
		mod.resources.filter(
			(res) =>
				(!needle ||
					res.label.toLowerCase().includes(needle) ||
					res.permissions.some((p) => p.name.toLowerCase().includes(needle))) &&
				(!onlyGranted || res.permissions.some((p) => granted.has(p.id))),
		);

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.permModal}`}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<KeySvg />
					</div>
					<div>
						<div className={styles.modalTitle}>Phân quyền — {role.name}</div>
						<div className={styles.modalSub}>Chọn các quyền được phép thực hiện</div>
					</div>
					{!loading && <span className={styles.permCount}>{granted.size} quyền</span>}
					<button className={styles.modalClose} onClick={onClose}>
						<XSvg />
					</button>
				</div>

				{!loading && catalog && (
					<div className={styles.viewToolbar}>
						<div className={styles.viewSearch}>
							<SearchSvg />
							<input
								placeholder='Tìm chức năng hoặc quyền…'
								value={filter}
								onChange={(e) => setFilter(e.target.value)}
							/>
						</div>
						<label className={styles.viewToggle}>
							<input
								type='checkbox'
								checked={onlyGranted}
								onChange={(e) => setOnlyGranted(e.target.checked)}
							/>
							Chỉ hiện chức năng đã cấp quyền
						</label>
					</div>
				)}

				<div className={styles.permModalBody}>
					{role.is_superuser && (
						<div className={styles.permSuperNotice}>
							<ShieldSvg /> Vai trò toàn quyền: bỏ qua mọi kiểm tra phân quyền, các ô bên
							dưới không có tác dụng. Cờ toàn quyền chỉ đặt được trong CSDL
							(roles.is_superuser), không cấp qua giao diện.
						</div>
					)}
					{loading ? (
						<InlineLoading label='Đang tải quyền…' />
					) : (
						catalog &&
						catalog.modules.map((mod) => {
							const resources = visibleResources(mod);
							if (!resources.length) return null;
							const modIds = mod.resources.flatMap((r) => r.permissions.map((p) => p.id));
							const modOn = modIds.filter((id) => granted.has(id)).length;
							return (
								<section key={mod.key} className={styles.permGroup}>
									<div className={styles.permGroupHead}>
										<span>{mod.label}</span>
										<span className={styles.permGroupCount}>
											{modOn}/{modIds.length}
										</span>
									</div>
									{resources.map((res) => {
										const rowIds = res.permissions.map((p) => p.id);
										const levels = levelsOf(res);
										const current = levels.find((lv) =>
											sameIds(
												lv.ids,
												rowIds.filter((id) => granted.has(id)),
											),
										);
										const grantedCount = rowIds.filter((id) => granted.has(id)).length;
										const custom = !current;
										const open = openCustom.has(res.key);
										const perms = [...res.permissions].sort(
											(a, b) => columns.indexOf(a.action) - columns.indexOf(b.action),
										);
										return (
											<div key={res.key} className={styles.permRow}>
												<div className={styles.permRowMain}>
													<div className={styles.permRowName}>
														<div className={styles.permResourceName}>
															{RESOURCE_ICON[res.key]}
															{res.label}
														</div>
														{res.scopes?.length && grantedCount > 0 ? (
															<select
																className={styles.permScopeSelect}
																title='Phạm vi dữ liệu — áp cho mọi quyền được chọn'
																value={rowScope[res.key] ?? res.scopes[0].key}
																onChange={(e) =>
																	setRowScope((prev) => ({
																		...prev,
																		[res.key]: e.target.value,
																	}))
																}
															>
																{res.scopes.map((sc) => (
																	<option key={sc.key} value={sc.key}>
																		Phạm vi: {sc.label}
																	</option>
																))}
															</select>
														) : null}
													</div>
													<div
														className={styles.permLevels}
														role='radiogroup'
														aria-label={res.label}
													>
														{levels.map((lv) => (
															<button
																key={lv.key}
																type='button'
																role='radio'
																aria-checked={current?.key === lv.key}
																className={`${styles.permLevel} ${current?.key === lv.key ? styles.permLevelOn : ''}`}
																onClick={() => setRow(res, lv.ids)}
															>
																{lv.label}
															</button>
														))}
													</div>
													<button
														type='button'
														className={`${styles.permCustomBtn} ${custom ? styles.permCustomOn : ''}`}
														onClick={() => toggleCustom(res.key)}
													>
														{custom ? `Tuỳ chỉnh · ${grantedCount}` : 'Tuỳ chỉnh'}
														<svg
															className={open ? styles.permCaretOpen : styles.permCaret}
															viewBox='0 0 24 24'
															aria-hidden='true'
														>
															<path d='M6 9l6 6 6-6' />
														</svg>
													</button>
												</div>
												{open && (
													<div className={styles.permCustom}>
														{perms.map((perm) => {
															const on = granted.has(perm.id);
															return (
																<label
																	key={perm.id}
																	title={tooltipOf(perm)}
																	className={`${styles.permOpt} ${on ? styles.permOptOn : ''}`}
																>
																	<input
																		type='checkbox'
																		checked={on}
																		onChange={() => toggle(perm)}
																	/>
																	<span className={styles.permOptBox}>
																		<CheckSvg />
																	</span>
																	<span className={styles.permOptText}>
																		<span className={styles.permOptName}>
																			{catalog.actionLabels[perm.action] ?? perm.name}
																			{perm.critical && (
																				<span className={styles.permOptTag}>
																					Nhạy cảm
																				</span>
																			)}
																		</span>
																		{perm.description && (
																			<span className={styles.permOptDesc}>
																				{perm.description}
																			</span>
																		)}
																	</span>
																</label>
															);
														})}
													</div>
												)}
											</div>
										);
									})}
								</section>
							);
						})
					)}
				</div>

				{confirming && (
					<div className={styles.permConfirm}>
						<div className={styles.permConfirmTitle}>
							Xác nhận thay đổi cho vai trò "{role.name}" ({role.user_count ?? 0} người
							dùng)
						</div>
						{changes.critical.length > 0 && (
							<div className={styles.permConfirmWarn}>
								⚠ Cấp quyền nhạy cảm (quản lý tài khoản / phân quyền):{' '}
								{changes.critical.join('; ')}
							</div>
						)}
						{changes.added.length > 0 && (
							<div>
								<strong>+ {changes.added.length} quyền:</strong>{' '}
								{changes.added.join('; ')}
							</div>
						)}
						{changes.removed.length > 0 && (
							<div>
								<strong>− {changes.removed.length} quyền:</strong>{' '}
								{changes.removed.join('; ')}
							</div>
						)}
						{changes.scoped.length > 0 && (
							<div>
								<strong>Đổi phạm vi:</strong> {changes.scoped.join('; ')}
							</div>
						)}
					</div>
				)}

				<div className={styles.modalFooter}>
					{error && (
						<span style={{ fontSize: 12, color: '#e24b4a', flex: 1 }}>{error}</span>
					)}
					{!error && !loading && (
						<span className={styles.viewSub} style={{ flex: 1 }}>
							{changes.count ? `${changes.count} thay đổi chưa lưu` : 'Chưa có thay đổi'}
						</span>
					)}
					<button
						className={styles.btnCancel}
						onClick={confirming ? () => setConfirming(false) : onClose}
						disabled={saving}
					>
						{confirming ? 'Quay lại' : 'Huỷ'}
					</button>
					<button
						className={styles.btnSave}
						onClick={confirming ? handleSave : () => setConfirming(true)}
						disabled={saving || loading || changes.count === 0}
					>
						{saving ? <span className={styles.spinner} /> : <CheckSvg />}
						{confirming ? 'Xác nhận lưu' : 'Xem lại & lưu'}
					</button>
				</div>
			</div>
		</div>
	);
}
