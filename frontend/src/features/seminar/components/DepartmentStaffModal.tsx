import { useEffect, useMemo, useState } from 'react';
import { CheckSvg, UsersSvg } from '@/assets/icons';
import { apiClient } from '@/shared/api/axios';
import { Modal, SearchableSelect } from '@/shared/components';
import { InlineLoading } from '@/shared/components/Loading';
import { SelectCheckbox } from '@/shared/components/Table/RowSelect';
import sel from '@/shared/components/Table/RowSelect.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { Pagination } from '@/shared/components/Table/Pagination';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { useRowSelection } from '@/shared/hooks/useRowSelection';
import { showToast } from '@/shared/utils/feedback';
import { addSeminarUsers, getDepartmentStaff } from '../api/seminarApi';
import type { DepartmentStaff } from '../types/seminar.type';
import styles from '../pages/Seminar.module.css';

/** Tập huấn bệnh viện: chọn người tham dự từ nhân sự theo khoa, hoặc thêm cả khoa. */
export function DepartmentStaffModal({
	seminarId,
	onClose,
	onDone,
}: {
	seminarId: string;
	onClose: () => void;
	onDone: () => void;
}) {
	const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
	const [deptId, setDeptId] = useState('');
	const [staff, setStaff] = useState<DepartmentStaff[]>([]);
	const [loadingStaff, setLoadingStaff] = useState(false);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		apiClient
			.get<{ data: { id: string; name: string }[] }>('/departments?limit=0')
			.then((r) => setDepartments(r.data))
			.catch(() => showToast('error', 'Không tải được danh sách khoa/phòng'));
	}, []);

	useEffect(() => {
		if (!deptId) return;
		let alive = true;
		getDepartmentStaff(seminarId, deptId)
			.then((r) => alive && setStaff(r))
			.catch(() => alive && showToast('error', 'Không tải được nhân sự của khoa'))
			.finally(() => alive && setLoadingStaff(false));
		return () => {
			alive = false;
		};
	}, [seminarId, deptId]);

	const pg = useClientPaging(staff);
	const rowSel = useRowSelection(pg.paged.filter((u) => !u.in_list).map((u) => u.id));
	const notInList = useMemo(() => staff.filter((u) => !u.in_list).map((u) => u.id), [staff]);

	const add = async (ids: string[]) => {
		setSaving(true);
		try {
			const out = await addSeminarUsers(seminarId, ids);
			showToast('success', `Đã thêm ${out.inserted} người`);
			onDone();
			onClose();
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Thêm thất bại');
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			icon={<UsersSvg />}
			title='Thêm người tham dự theo khoa'
			subtitle='Chọn khoa/phòng rồi tick từng người, hoặc thêm cả khoa'
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<>
					<button className={styles.btnCancel} onClick={onClose} disabled={saving}>
						Huỷ
					</button>
					<button
						className={styles.btnGhost}
						onClick={() => void add(notInList)}
						disabled={saving || !notInList.length}
					>
						<UsersSvg /> Thêm cả khoa ({notInList.length})
					</button>
					<button
						className={styles.btnPrimary}
						onClick={() => void add([...rowSel.selectedIds])}
						disabled={saving || !rowSel.selectedCount}
					>
						{saving ? <span className={styles.spinner} /> : <CheckSvg />} Thêm đã chọn ({rowSel.selectedCount})
					</button>
				</>
			}
		>
			<div className={styles.formGroup}>
				<label className={styles.formLabel}>Khoa/phòng</label>
				<SearchableSelect
					options={departments}
					value={deptId}
					onChange={(id) => {
						setDeptId(id);
						setStaff([]);
						setLoadingStaff(!!id);
						rowSel.clearSelection();
					}}
					placeholder='— Chọn khoa/phòng —'
				/>
			</div>

			{deptId &&
				(loadingStaff ? (
					<InlineLoading />
				) : (
					<>
						<div className={styles.tableWrap}>
							<table className={styles.table}>
								<thead>
									<tr>
										<th className={sel.checkCol}>
											<SelectCheckbox
												title='Chọn tất cả'
												checked={rowSel.allPageSelected}
												indeterminate={rowSel.somePageSelected && !rowSel.allPageSelected}
												onChange={rowSel.toggleSelectAll}
											/>
										</th>
										<th className={tbl.thIdx}>STT</th>
										<th>Mã NV</th>
										<th>Họ tên</th>
										<th>Trạng thái</th>
									</tr>
								</thead>
								<tbody>
									{staff.length === 0 ? (
										<tr>
											<td colSpan={5}>
												<div className={styles.emptyState}>
													<div className={styles.emptyDesc}>Khoa chưa có nhân sự</div>
												</div>
											</td>
										</tr>
									) : (
										pg.paged.map((u, i) => (
											<tr key={u.id} className={rowSel.isSelected(u.id) ? sel.rowSelected : undefined}>
												<td className={sel.checkCol}>
													{!u.in_list && (
														<SelectCheckbox
															title='Chọn'
															checked={rowSel.isSelected(u.id)}
															onChange={() => rowSel.toggleSelect(u.id)}
														/>
													)}
												</td>
												<td className={tbl.tdIdx}>{pg.offset + i + 1}</td>
												<td className={tbl.cellCode}>{u.staff_number ?? '—'}</td>
												<td className={tbl.cellTitle}>{u.full_name}</td>
												<td>
													{u.in_list ? (
														<span className={styles.okText}>Đã có trong danh sách</span>
													) : (
														<span className={styles.muted}>—</span>
													)}
												</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
						<Pagination {...pg.pagination} itemLabel='người' />
					</>
				))}
		</Modal>
	);
}
