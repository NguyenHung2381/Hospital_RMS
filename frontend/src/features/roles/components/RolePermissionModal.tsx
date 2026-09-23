import React, { useEffect, useState } from 'react';
import {
	CheckSvg,
	InfoSvg,
	KeySvg,
	LayersSvg,
	ShieldSvg,
	UsersSvg,
	XSvg,
} from '@/assets/icons';
import {
	getAllPermissions,
	getRolePermissions,
	setRolePermissions,
} from '../api/roleApi';
import {
	MATRIX_ACTIONS,
	MATRIX_ACTION_LABELS,
	type Permission,
	type PermissionMatrixRow,
	type Role,
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
	courses: <LayersSvg />,
};

// API không trả label tiếng Việt cho resource — map hiển thị riêng ở đây.
const RESOURCE_LABELS: Record<string, string> = {
	topics: 'Đề tài nghiên cứu',
	users: 'Người dùng',
	departments: 'Khoa phòng',
	roles: 'Vai trò & Quyền',
	rounds: 'Đợt nghiên cứu',
	councils: 'Hội đồng chấm',
	seminars: 'Hội thảo, Hội nghị & CME',
	files: 'Tài liệu',
	reports: 'Báo cáo & Thống kê',
	system: 'Hệ thống (toàn quyền)',
	admin_panel: 'Khu vực quản trị',
	activity_logs: 'Nhật ký hoạt động',
	catalog: 'Danh mục (phân loại, cấp độ...)',
	notifications: 'Thông báo hệ thống',
	security_events: 'Nhật ký bảo mật',
	trainees: 'Học viên (Đào tạo)',
	training_programs: 'Chương trình đào tạo',
	lecturers: 'Giảng viên',
	training_catalog: 'Danh mục Đào tạo',
	courses: 'Khóa học (đăng ký, giảng viên, lịch học, điểm danh)',
};

function buildMatrix(perms: Permission[]): PermissionMatrixRow[] {
	const byResource = new Map<string, Permission[]>();
	for (const p of perms) {
		const arr = byResource.get(p.resource) ?? [];
		arr.push(p);
		byResource.set(p.resource, arr);
	}
	return [...byResource.entries()].map(([resource, list]) => ({
		resource,
		resourceLabel: RESOURCE_LABELS[resource] ?? resource,
		actions: list
			.slice()
			.sort(
				(a, b) =>
					MATRIX_ACTIONS.indexOf(a.action as (typeof MATRIX_ACTIONS)[number]) -
					MATRIX_ACTIONS.indexOf(b.action as (typeof MATRIX_ACTIONS)[number]),
			)
			.map((p) => ({
				id: p.id,
				action: p.action,
				label: MATRIX_ACTION_LABELS[p.action] ?? p.action,
			})),
	}));
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
	const [matrix, setMatrix] = useState<PermissionMatrixRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		Promise.all([getAllPermissions(), getRolePermissions(role.id)])
			.then(([perms, ids]) => {
				setMatrix(buildMatrix(perms));
				setGranted(new Set(ids));
			})
			.catch(() => setError('Không thể tải quyền hiện tại'))
			.finally(() => setLoading(false));
	}, [role.id]);

	const toggle = (permId: string) => {
		setGranted((prev) => {
			const next = new Set(prev);
			if (next.has(permId)) {
				next.delete(permId);
			} else {
				next.add(permId);
			}
			return next;
		});
	};

	const toggleRow = (rowActionIds: string[]) => {
		const allOn = rowActionIds.every((id) => granted.has(id));
		setGranted((prev) => {
			const next = new Set(prev);
			rowActionIds.forEach((id) => {
				if (allOn) {
					next.delete(id);
				} else {
					next.add(id);
				}
			});
			return next;
		});
	};

	const handleSave = async () => {
		setSaving(true);
		setError('');
		try {
			const ids = [...granted];
			await setRolePermissions(role.id, ids);
			onSaved(role.id, ids);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Lưu thất bại');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalLg}`}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<KeySvg />
					</div>
					<div>
						<div className={styles.modalTitle}>Phân quyền — {role.name}</div>
						<div className={styles.modalSub}>
							Chọn các quyền được phép thực hiện
						</div>
					</div>
					{!loading && (
						<span className={styles.permCount}>{granted.size} quyền</span>
					)}
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>

				<div className={styles.permModalBody}>
					{loading ? (
						<InlineLoading label='Đang tải quyền…' />
					) : (
						<table className={styles.permMatrix}>
							<thead>
								<tr>
									<th>Nhóm chức năng</th>
									{MATRIX_ACTIONS.map((a) => (
										<th key={a}>{MATRIX_ACTION_LABELS[a]}</th>
									))}
									<th>Chọn tất cả</th>
								</tr>
							</thead>
							<tbody>
								{matrix.map((row) => {
									const rowIds = row.actions.map((a) => a.id);
									const allSelected = rowIds.every((id) => granted.has(id));

									return (
										<tr key={row.resource}>
											<td className={styles.permResourceCell}>
												<div className={styles.permResourceName}>
													{RESOURCE_ICON[row.resource]}
													{row.resourceLabel}
												</div>
											</td>

											{MATRIX_ACTIONS.map((action) => {
												const perm = row.actions.find(
													(a) => a.action === action,
												);
												if (!perm) {
													return (
														<td
															key={action}
															className={styles.permCellEmpty}
														>
															<div className={styles.permCellDash} />
														</td>
													);
												}
												return (
													<td
														key={action}
														className={styles.permCell}
													>
														<label className={styles.permCheck}>
															<input
																type='checkbox'
																checked={granted.has(perm.id)}
																onChange={() => toggle(perm.id)}
															/>
															<div className={styles.permCheckBox}>
																<CheckSvg />
															</div>
														</label>
													</td>
												);
											})}

											<td className={styles.permCell}>
												<button
													className={`${styles.permSelectAll} ${allSelected ? styles.allSelected : ''}`}
													onClick={() => toggleRow(rowIds)}
												>
													{allSelected ? 'Bỏ tất cả' : 'Chọn tất cả'}
												</button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					)}
				</div>

				<div className={styles.modalFooter}>
					{error && (
						<span style={{ fontSize: 12, color: '#e24b4a', flex: 1 }}>
							{error}
						</span>
					)}
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={saving}
					>
						Huỷ
					</button>
					<button
						className={styles.btnSave}
						onClick={handleSave}
						disabled={saving || loading}
					>
						{saving ? <span className={styles.spinner} /> : <CheckSvg />}
						Lưu phân quyền
					</button>
				</div>
			</div>
		</div>
	);
}
