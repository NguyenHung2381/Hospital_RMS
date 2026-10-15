import { useState } from 'react';
import { PlusSvg, UploadSvg } from '@/assets/icons';
import AdminLayout from '@/layouts/AdminLayout';
import { Can, ConfirmDeleteModal, Pagination, SearchableSelect } from '@/shared/components';
import { SkeletonTable } from '@/shared/components/Loading';
import tbl from '@/shared/components/Table/Table.module.css';
import { RowActions, SearchInput } from '@/shared/components/Table/TableToolbar';
import { usePermission } from '@/shared/hooks/usePermission';
import { formatDateOr } from '@/shared/utils';
import { StaffLicenseFormModal } from '../components/StaffLicenseFormModal';
import { StaffLicenseImportModal } from '../components/StaffLicenseImportModal';
import { useStaffLicenses } from '../hooks/useStaffLicenses';
import type { StaffLicense } from '../types/staffLicense.type';
import styles from './StaffLicenses.module.css';

export default function StaffLicenses() {
	const d = useStaffLicenses();
	const { has } = usePermission();
	// undefined = đóng, null = thêm mới
	const [editing, setEditing] = useState<StaffLicense | null | undefined>(undefined);
	const [deleting, setDeleting] = useState<StaffLicense | null>(null);
	const [showImport, setShowImport] = useState(false);

	const headerActions = (
		<div style={{ display: 'flex', gap: 8 }}>
			<Can permission='staff_licenses:update'>
				<button className={styles.btnAddHeader} onClick={() => setShowImport(true)}>
					<UploadSvg /> Cập nhật từ Excel
				</button>
			</Can>
			<Can permission='staff_licenses:create'>
				<button className={styles.btnAddHeader} onClick={() => setEditing(null)}>
					<PlusSvg /> Thêm CCHN
				</button>
			</Can>
		</div>
	);

	return (
		<AdminLayout
			pageTitle='Chứng chỉ hành nghề'
			pageSubtitle='Hồ sơ CCHN & phạm vi hoạt động chuyên môn của nhân sự'
			breadcrumbs={[{ label: 'Hội nghị & CME' }]}
			headerActions={headerActions}
		>
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách người hành nghề</span>
						<span className={styles.tableCount}>{d.total} hồ sơ</span>
					</div>
					<div className={styles.tableControls}>
						<SearchInput value={d.search} onChange={d.setSearch} placeholder='Tìm theo tên, MNV, số CCHN, phạm vi...' />
						<div className={styles.deptFilter}>
							<SearchableSelect
								options={[{ id: '', name: 'Tất cả khoa/phòng' }, ...d.departments]}
								value={d.departmentId}
								onChange={d.setDepartmentId}
								placeholder='Tất cả khoa/phòng'
								size='sm'
							/>
						</div>
						<select
							className={styles.filterSelect}
							value={d.hasLicense}
							onChange={(e) => d.setHasLicense(e.target.value)}
						>
							<option value=''>Mọi tình trạng CCHN</option>
							<option value='1'>Đã có số CCHN</option>
							<option value='0'>Chưa có số CCHN</option>
						</select>
					</div>
				</div>

				<div className={styles.tableWrap}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th className={`${styles.th} ${tbl.thIdx}`}>STT</th>
								<th className={styles.th}>Nhân sự</th>
								<th className={styles.th}>Số CCHN</th>
								<th className={styles.th}>Phạm vi hành nghề</th>
								<th className={styles.th}>Văn bằng chuyên môn</th>
								<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
							</tr>
						</thead>
						<tbody>
							{d.isLoadingData ? (
								<SkeletonTable rows={d.pageSize} cols={6} />
							) : d.total === 0 ? (
								<tr>
									<td colSpan={6}>
										<div className={styles.emptyState}>
											<div className={styles.emptyTitle}>Không tìm thấy hồ sơ CCHN</div>
											<div className={styles.emptyDesc}>Thử thay đổi từ khoá hoặc bộ lọc</div>
										</div>
									</td>
								</tr>
							) : (
								d.items.map((l, i) => (
									<tr key={l.id} className={styles.tr}>
										<td className={`${styles.td} ${tbl.tdIdx}`}>{(d.page - 1) * d.pageSize + i + 1}</td>
										<td className={styles.td}>
											<div className={tbl.cellTitle}>{l.user_full_name}</div>
											<div className={tbl.cellSub}>
												{l.staff_number ? `MNV ${l.staff_number}` : 'Chưa có MNV'}
												{l.department_name ? ` · ${l.department_name}` : ''}
											</div>
										</td>
										<td className={styles.td}>
											{l.license_no ? (
												<>
													<div className={styles.licenseNo}>{l.license_no}</div>
													<div className={`${tbl.cellSub} ${styles.nowrap}`}>Cấp ngày {formatDateOr(l.issued_date)}</div>
												</>
											) : (
												<span className={tbl.cellSub}>Chưa có</span>
											)}
										</td>
										<td className={`${styles.td} ${styles.scopeCell}`}>
											<div>{l.practice_scope ?? '—'}</div>
											{l.adjusted_scope && (
												<div className={tbl.cellSub}>
													Điều chỉnh: {l.adjusted_scope}
													{l.scope_adjusted_date ? ` (${formatDateOr(l.scope_adjusted_date)})` : ''}
												</div>
											)}
										</td>
										<td className={styles.td}>
											<span className={tbl.cellSub}>{l.qualification ?? '—'}</span>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<RowActions
												onEdit={has('staff_licenses:update') ? () => setEditing(l) : undefined}
												onDelete={has('staff_licenses:delete') ? () => setDeleting(l) : undefined}
											/>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>

				<Pagination
					page={d.page}
					totalPages={d.totalPages}
					total={d.total}
					rowsPerPage={d.pageSize}
					onPageChange={d.setPage}
					onRowsPerPageChange={d.setPageSize}
					itemLabel='hồ sơ'
				/>
			</div>

			{editing !== undefined && (
				<StaffLicenseFormModal
					license={editing}
					loading={d.loading}
					onClose={() => setEditing(undefined)}
					onSave={async (form) => {
						if (await d.save(form, editing)) setEditing(undefined);
					}}
				/>
			)}
			{deleting && (
				<ConfirmDeleteModal
					title='Xoá hồ sơ CCHN'
					subtitle={deleting.user_full_name}
					onClose={() => setDeleting(null)}
					onConfirm={async () => {
						await d.remove(deleting);
						setDeleting(null);
					}}
				>
					Xoá toàn bộ thông tin chứng chỉ hành nghề của <strong>{deleting.user_full_name}</strong>? Tài khoản nhân sự
					không bị ảnh hưởng.
				</ConfirmDeleteModal>
			)}
			{showImport && <StaffLicenseImportModal onClose={() => setShowImport(false)} onDone={d.refreshData} />}
		</AdminLayout>
	);
}
