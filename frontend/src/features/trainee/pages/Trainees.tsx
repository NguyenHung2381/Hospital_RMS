import { avatarColor, getInitials } from '@/shared/utils';
import { SearchInput, RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpenSvg, FileTextSvg, KeySvg, PlusSvg, TrashSvg, UploadSvg, UserPlusSvg } from '@/assets/icons';
import { Badge, TableEmpty } from '@/shared/components';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { BulkButton, BulkDeleteModal, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { GrantedAccountsModal } from '../components/GrantedAccountsModal';
import { TraineeDeleteModal } from '../components/TraineeDeleteModal';
import { TraineeFormModal } from '../components/TraineeFormModal';
import { TraineeImportModal } from '../components/TraineeImportModal';
import { QuickAddExternalTraineeModal } from '../components/QuickAddExternalTraineeModal';
import { TraineeDocStateBadge, TraineeDocStateLegend } from '../components/TraineeDocState';
import { DOC_STATE_META, DOC_STATE_ORDER, docStateRowClass } from '../utils/docState';
import type { TraineeDocState } from '../api/traineeRecordApi';
import { useTrainees } from '../hooks/useTrainees';
import { formatDate } from '../../../shared/utils/formatDate';
import styles from './Trainees.module.css';
import { ExcelActions, type ExcelColumn } from '@/shared/components/Excel';
import { formatDateVN } from '@/shared/utils/formatDate';
import { genderLabel } from '@/shared/utils/gender';
import type { Trainee } from '../types/trainee.type';
import { TRAINING_TYPE } from '../../course/types/course.type';
import tbl from '@/shared/components/Table/Table.module.css';
import { CustomValuesInline, useFormConfig } from '@/shared/formConfig';

// Tiêu đề trùng cột nhận diện của "Nhập từ Excel" để file xuất ra nhập lại được.
const EXCEL_COLS: ExcelColumn<Trainee>[] = [
	{ header: 'Họ và tên', value: (x) => x.full_name },
	{ header: 'Ngày sinh', value: (x) => formatDateVN(x.dob) },
	{ header: 'Giới tính', value: (x) => genderLabel(x.gender) },
	{ header: 'CCCD', value: (x) => x.national_id },
	{ header: 'SĐT', value: (x) => x.phone },
	{ header: 'Email', value: (x) => x.email },
	{ header: 'Địa chỉ', value: (x) => x.address },
	{ header: 'Đối tượng học viên', value: (x) => x.trainee_type_name },
	{ header: 'Khoa/phòng', value: (x) => x.department_name },
	{ header: 'Trình độ', value: (x) => x.qualification },
	{ header: 'Trường đào tạo', value: (x) => x.graduated_school },
	{ header: 'Năm tốt nghiệp', value: (x) => x.graduated_year },
	{ header: 'Nơi công tác', value: (x) => x.workplace },
	{ header: 'Chức vụ', value: (x) => x.position },
	{ header: 'Ghi chú', value: (x) => x.notes },
	{ header: 'Tài khoản', value: (x) => (x.account_granted ? 'Đã cấp' : '') },
	{ header: 'Hồ sơ PDF', value: (x) => DOC_STATE_META[x.doc_state ?? 'missing'].label },
];

const TYPE_NAME: Record<string, string> = {
	[TRAINING_TYPE.DTLT]: 'khóa đào tạo liên tục',
	[TRAINING_TYPE.GPHN]: 'đợt thực hành GPHN',
	[TRAINING_TYPE.CTCV]: 'khóa cầm tay chỉ việc',
};

/**
 * typeId bỏ trống = "Tất cả học viên" (danh bạ chung, thêm / nhập học viên ở đây);
 * có typeId = tab Học viên của 1 loại đào tạo: chỉ người đã ghi danh loại đó.
 */
export default function Trainees({ typeId = '' }: { typeId?: string }) {
	const customCfg = useFormConfig('trainee', 'admin');
	const d = useTrainees(typeId);
	const navigate = useNavigate();
	const openDetail = (t: Trainee, tab = 'info') => navigate(`/admin/trainees/${t.id}?tab=${tab}`);
	const isGphn = typeId === TRAINING_TYPE.GPHN;
	// Tab theo loại: thay cột Liên hệ / Đối tượng / Khoa bằng thông tin lượt ghi danh của loại đó.
	const colCount = typeId ? 8 : 9;
	const rowSel = useRowSelection(d.paged.map((x) => x.id));
	const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
	const [showImport, setShowImport] = useState(false);
	const [showQuickAdd, setShowQuickAdd] = useState(false);

	const headerActions = (
		<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
			<ExcelActions
				fileName='hoc-vien'
				itemLabel='học viên'
				columns={EXCEL_COLS}
				getRows={() => d.filtered}
			/>
			{/* Thêm mới ở danh bạ chung — tab theo loại chỉ hiện người đã ghi danh nên thêm ở đó sẽ không thấy */}
			{!typeId && (
				<>
					<button
						className={styles.btnAddHeader}
						onClick={() => setShowImport(true)}
					>
						<UploadSvg /> Nhập từ Excel
					</button>
					<button
						className={styles.btnAddHeader}
						onClick={() => d.setModal('add')}
					>
						<PlusSvg /> Thêm học viên
					</button>
					<button
						className={styles.btnAddHeader}
						onClick={() => setShowQuickAdd(true)}
						title='Nhập nhanh thông tin cơ bản của học viên ngoài bệnh viện'
					>
						<UserPlusSvg /> Thêm nhanh ngoại viện
					</button>
				</>
			)}
		</div>
	);

	return (
		<AdminLayout
			pageTitle={typeId ? 'Học viên' : 'Tất cả học viên'}
			pageSubtitle={
				typeId
					? `Học viên đã ghi danh ${TYPE_NAME[typeId] ?? 'loại đào tạo này'} — ghi danh thêm trong trang của từng khóa`
					: 'Danh bạ học viên chung của mọi loại đào tạo — thêm, nhập Excel và cấp tài khoản tại đây'
			}
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={headerActions}
		>
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách học viên</span>
						{rowSel.selectedCount > 0 ? (
							<span className={styles.tableCount}>
								Đã chọn {rowSel.selectedCount}
								<BulkButton
									disabled={d.granting}
									onClick={() => d.handleGrantAccounts([...rowSel.selectedIds])}
								>
									<KeySvg /> Cấp tài khoản
								</BulkButton>
								<BulkButton
									danger
									onClick={() => setConfirmBulkDelete(true)}
								>
									<TrashSvg /> Xóa đã chọn
								</BulkButton>
								<button
									type='button'
									className={styles.clearSelectionBtn}
									onClick={rowSel.clearSelection}
								>
									Bỏ chọn
								</button>
							</span>
						) : (
							<span className={styles.tableCount}>
								{d.filtered.length} học viên
							</span>
						)}
					</div>
					<div className={styles.tableControls}>
						<TraineeDocStateLegend />
						<select
							className={styles.filterSelect}
							value={d.docFilter}
							onChange={(e) => {
								d.setDocFilter(e.target.value as TraineeDocState | '');
								d.setPage(1);
							}}
							aria-label='Lọc theo hồ sơ PDF'
							title='Lọc theo trạng thái file hồ sơ PDF'
						>
							<option value=''>Hồ sơ: tất cả ({d.trainees.length})</option>
							{DOC_STATE_ORDER.map((st) => (
								<option
									key={st}
									value={st}
								>
									{DOC_STATE_META[st].label} ({d.docCounts[st]})
								</option>
							))}
						</select>
						<SearchInput
							value={d.search}
							onChange={d.handleSearch}
							placeholder='Tìm theo tên, CCCD, điện thoại, email...'
						/>
					</div>
				</div>

				<div className={styles.tableWrap}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th className={sel.checkCol}>
								<SelectCheckbox
									title='Chọn tất cả'
									checked={rowSel.allPageSelected}
									indeterminate={rowSel.somePageSelected}
									onChange={rowSel.toggleSelectAll}
								/>
							</th>
							<th className={`${styles.th} ${tbl.thIdx}`}>STT</th>
							<th className={styles.th}>Học viên</th>
							<th className={styles.th}>CCCD/CMND</th>
							{isGphn ? (
								<>
									<th className={styles.th}>Mã thực hành</th>
									<th className={styles.th}>Chương trình · Thời gian</th>
									<th className={styles.th}>Khoa đang học</th>
								</>
							) : typeId ? (
								<>
									<th className={styles.th}>Khóa gần nhất</th>
									<th className={styles.th}>Số khóa đã học</th>
								</>
							) : (
								<>
									<th className={styles.th}>Liên hệ</th>
									<th className={styles.th}>Đối tượng</th>
									<th className={styles.th}>Khoa / Phòng</th>
								</>
							)}
							<th className={styles.th}>Hồ sơ PDF</th>
							<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{d.isLoadingData ? (
							<SkeletonTable
								rows={d.pageSize || 8}
								cols={colCount}
							/>
						) : d.filtered.length === 0 ? (
							<TableEmpty
								colSpan={colCount}
								title='Không tìm thấy học viên'
								desc={d.search ? 'Thử thay đổi từ khóa tìm kiếm' : 'Chưa có học viên nào'}
							/>
						) : (
							d.paged.map((t, i) => {
								const c = avatarColor(t.id);
								const rowNum = (d.safePage - 1) * (d.pageSize || d.filtered.length) + i + 1;
								return (
									<tr
										key={t.id}
										className={`${styles.tr} ${docStateRowClass(t.doc_state)} ${rowSel.isSelected(t.id) ? sel.rowSelected : ''}`}
									>
										<td className={sel.checkCol}>
											<SelectCheckbox
												title='Chọn học viên'
												checked={rowSel.isSelected(t.id)}
												onChange={() => rowSel.toggleSelect(t.id)}
											/>
										</td>
										<td className={`${styles.td} ${styles.tdIdx}`}>{rowNum}</td>
										<td className={styles.td}>
											<div
												className={styles.personCell}
												style={{ cursor: 'pointer' }}
												title='Xem chi tiết học viên'
												onClick={() => openDetail(t)}
											>
												<div
													className={styles.personAvatar}
													style={{ background: c.bg, color: c.color }}
												>
													{getInitials(t.full_name)}
												</div>
												<div>
													<div
														className={styles.personName}
														style={{ display: 'flex', alignItems: 'center', gap: 6 }}
													>
														{t.full_name}
														{t.account_granted && (
															<Badge
																tone='green'
																dot
															>
																TK
															</Badge>
														)}
													</div>
													{t.dob && (
														<div className={styles.personSub}>
															{formatDate(t.dob)}
														</div>
													)}
													<CustomValuesInline
														cfg={customCfg}
														data={t.custom}
														className={styles.personSub}
													/>
												</div>
											</div>
										</td>
										<td className={styles.td}>
											<span className={`${styles.descText} ${styles.mono}`}>
												{t.national_id ?? '—'}
											</span>
										</td>
										{isGphn ? (
											<>
												<td className={styles.td}>
													<span className={`${styles.descText} ${styles.mono}`}>{t.practice_code ?? '—'}</span>
												</td>
												<td className={styles.td}>
													<div className={styles.descText}>{t.program_name ?? t.course_name ?? '—'}</div>
													{(t.enrollment_start_date || t.enrollment_end_date) && (
														<div className={styles.personSub}>
															{formatDate(t.enrollment_start_date) ?? '—'} — {formatDate(t.enrollment_end_date) ?? '—'}
														</div>
													)}
												</td>
												<td className={styles.td}>
													<span className={styles.descText}>{t.current_department ?? '—'}</span>
												</td>
											</>
										) : typeId ? (
											<>
												<td className={styles.td}>
													<div className={styles.descText}>{t.course_name ?? '—'}</div>
													{t.program_name && <div className={styles.personSub}>{t.program_name}</div>}
												</td>
												<td className={styles.td}>
													<span className={styles.descText}>{t.type_enrollment_count ?? 0}</span>
												</td>
											</>
										) : (
											<>
												<td className={styles.td}>
													<span className={styles.descText}>{t.phone ?? t.email ?? '—'}</span>
												</td>
												<td className={styles.td}>
													{t.trainee_type_name ? (
														<span className={styles.badge}>{t.trainee_type_name}</span>
													) : (
														'—'
													)}
												</td>
												<td className={styles.td}>
													<span className={styles.descText}>{t.department_name ?? '—'}</span>
												</td>
											</>
										)}
										<td className={styles.td}>
											<TraineeDocStateBadge
												state={t.doc_state}
												onClick={() => openDetail(t, 'documents')}
											/>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<RowActions
												onEdit={() => {
													d.setEditingTrainee(t);
													d.setModal('edit');
												}}
												onDelete={() => {
													d.setDeletingTrainee(t);
													d.setModal('delete');
												}}
											>
												<RowAction
													title='Hồ sơ đính kèm'
													onClick={() => openDetail(t, 'documents')}
												>
													<FileTextSvg />
												</RowAction>
												<RowAction
													title='Chương trình đào tạo đã đăng ký'
													onClick={() => openDetail(t, 'courses')}
												>
													<BookOpenSvg />
												</RowAction>
											</RowActions>
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
				</div>

								<Pagination
					page={d.safePage}
					totalPages={d.totalPages}
					total={d.filtered.length}
					rowsPerPage={d.pageSize}
					onPageChange={d.setPage}
					itemLabel='học viên'
					onRowsPerPageChange={d.handlePageSize}
				/>
			</div>

			<BulkDeleteModal
				open={confirmBulkDelete}
				count={rowSel.selectedCount}
				itemLabel='học viên'
				loading={d.loading}
				onClose={() => setConfirmBulkDelete(false)}
				onConfirm={async () => {
					await d.handleBulkDelete([...rowSel.selectedIds]);
					rowSel.clearSelection();
					setConfirmBulkDelete(false);
				}}
			/>

			{showImport && (
				<TraineeImportModal
					onClose={() => setShowImport(false)}
					onDone={d.refreshData}
				/>
			)}

			{showQuickAdd && (
				<QuickAddExternalTraineeModal
					onClose={() => setShowQuickAdd(false)}
					onCreated={d.prependTrainee}
				/>
			)}

			{d.grantedAccounts.length > 0 && (
				<GrantedAccountsModal
					accounts={d.grantedAccounts}
					onClose={() => {
						d.setGrantedAccounts([]);
						rowSel.clearSelection();
					}}
				/>
			)}

			{d.modal === 'add' && (
				<TraineeFormModal
					mode='add'
					traineeTypes={d.traineeTypes}
					departments={d.departments}
					onClose={() => d.setModal(null)}
					onSave={d.handleAdd}
					loading={d.loading}
				/>
			)}
			{d.modal === 'edit' && d.editingTrainee && (
				<TraineeFormModal
					mode='edit'
					trainee={d.editingTrainee}
					traineeTypes={d.traineeTypes}
					departments={d.departments}
					onClose={() => {
						d.setModal(null);
						d.setEditingTrainee(null);
					}}
					onSave={d.handleEdit}
					loading={d.loading}
				/>
			)}
			{d.modal === 'delete' && d.deletingTrainee && (
				<TraineeDeleteModal
					trainee={d.deletingTrainee}
					onClose={() => {
						d.setModal(null);
						d.setDeletingTrainee(null);
					}}
					onConfirm={d.handleDelete}
					loading={d.loading}
				/>
			)}


		</AdminLayout>
	);
}
