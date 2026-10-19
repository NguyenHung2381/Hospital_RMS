import { useMemo, useState } from 'react';
import { CheckSvg, EditSvg, PlusSvg, SearchSvg, TrashSvg, XSvg } from '@/assets/icons';
import { SearchableSelect } from '@/shared/components';
import sel from '@/shared/components/Table/RowSelect.module.css';
import { BulkButton, SelectCheckbox, SelectionBar } from '@/shared/components/Table/RowSelect';
import { useRowSelection } from '@/shared/hooks/useRowSelection';
import { formatDateOr } from '@/shared/utils';
import type { SimpleItem } from '../hooks/useCourseDetail';
import {
	ENROLLMENT_STATUS_CFG,
	PROGRESS_LABEL,
	type Course,
	type CourseProgramLink,
	type Enrollment,
	type EnrollmentStatus,
} from '../types/course.type';
import { EnrollmentDetailModal } from './EnrollmentDetailModal';
import { PracticeBookImportModal } from './PracticeBookImportModal';
import { savePracticeBook } from '../utils/practiceDocuments';
import styles from '../pages/Courses.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { Pagination } from '@/shared/components/Table/Pagination';

/** Bỏ dấu + chữ thường để tìm "nguyen van" khớp "Nguyễn Văn". */
const normalize = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/g, 'd')
		.replace(/Đ/g, 'D')
		.toLowerCase();

export function EnrollmentsTab({
	enrollments,
	trainees,
	course,
	programLinks,
	busy,
	onRegister,
	onDecide,
	onDecideBulk,
	onRemove,
	onSaved,
}: {
	enrollments: Enrollment[];
	trainees: SimpleItem[];
	course: Course | null;
	/** Chương trình của khóa — học viên chọn 1 khi ghi danh. */
	programLinks: CourseProgramLink[];
	busy: boolean;
	onRegister: (traineeId: string, programId?: string) => void;
	onDecide: (enrollmentId: string, status: EnrollmentStatus) => void;
	/** Trả về id các đăng ký xử lý thất bại (được giữ lại trong lựa chọn để thử lại). */
	onDecideBulk: (enrollmentIds: string[], status: EnrollmentStatus) => Promise<string[]>;
	onRemove: (enrollmentId: string) => void;
	/** Gọi sau khi sửa hồ sơ ghi danh — nạp lại danh sách. */
	onSaved: () => void;
}) {
	const [newTraineeId, setNewTraineeId] = useState('');
	const [newProgramId, setNewProgramId] = useState('');
	const [detailId, setDetailId] = useState<string | null>(null);
	const [bookOpen, setBookOpen] = useState(false);
	const [exporting, setExporting] = useState(false);
	const detail = enrollments.find((e) => e.id === detailId) ?? null;
	// Khóa chỉ có 1 chương trình thì chọn sẵn; nhiều chương trình thì bắt chọn.
	const programId = programLinks.length === 1 ? programLinks[0].program_id : newProgramId;
	const needProgram = programLinks.length > 1 && !programId;
	const [search, setSearch] = useState('');
	const [statusFilter, setStatusFilter] = useState<EnrollmentStatus | ''>('');

	const filtered = useMemo(() => {
		const q = normalize(search.trim());
		return enrollments.filter(
			(en) =>
				(!statusFilter || en.status === statusFilter) &&
				(!q ||
					normalize(`${en.trainee_name} ${en.trainee_phone ?? ''} ${en.trainee_email ?? ''}`).includes(q)),
		);
	}, [enrollments, search, statusFilter]);

	const pg = useClientPaging(filtered);
	// Chỉ đăng ký "chờ duyệt" mới chọn được; "chọn tất cả" áp dụng cho các dòng đang hiển thị.
	const visiblePendingIds = useMemo(
		() => pg.paged.filter((e) => e.status === 'pending').map((e) => e.id),
		[pg.paged],
	);
	const rowSel = useRowSelection(visiblePendingIds);
	// Loại id đã được xử lý/xoá (không còn "chờ duyệt") khỏi lựa chọn.
	const selectedPending = enrollments
		.filter((e) => e.status === 'pending' && rowSel.selectedIds.has(e.id))
		.map((e) => e.id);

	const bulkDecide = async (status: 'approved' | 'rejected') => {
		const verb = status === 'approved' ? 'Duyệt' : 'Từ chối';
		if (!window.confirm(`${verb} ${selectedPending.length} đăng ký đã chọn?`)) return;
		const failed = await onDecideBulk(selectedPending, status);
		rowSel.clearSelection();
		failed.forEach(rowSel.toggleSelect);
	};

	const counts = useMemo(() => {
		const c: Partial<Record<EnrollmentStatus, number>> = {};
		for (const en of enrollments) c[en.status] = (c[en.status] ?? 0) + 1;
		return c;
	}, [enrollments]);

	return (
		<>
			{course?.is_rolling && (
				<div className={styles.subToolbar}>
					<span className={styles.hint}>Sổ theo dõi thực hành (Excel)</span>
					<button
						type='button'
						className={styles.btnGhost}
						disabled={busy}
						onClick={() => setBookOpen(true)}
						title='Nhập sổ thực hành cũ (mẫu 3.xlsx): học viên, hồ sơ, vòng khoa, người hướng dẫn'
					>
						Nhập sổ thực hành
					</button>
					<button
						type='button'
						className={styles.btnGhost}
						disabled={busy || exporting || enrollments.length === 0}
						onClick={async () => {
							setExporting(true);
							await savePracticeBook(course.id, course.name);
							setExporting(false);
						}}
						title='Xuất đúng bố cục sổ cũ (gồm cột Ngày/Tháng/Năm, TH1–TH11) để trộn thư như trước'
					>
						{exporting ? 'Đang xuất…' : 'Xuất sổ thực hành'}
					</button>
				</div>
			)}
			<div className={styles.subToolbar}>
				<SearchableSelect
					className={styles.subSearch}
					// Có chương trình: 1 học viên ghi danh được nhiều chương trình — chỉ ẩn người đã có chương trình đang chọn.
					options={trainees.filter(
						(t) =>
							!enrollments.some(
								(e) => e.trainee_id === t.id && (!programLinks.length || (e.program_id ?? '') === programId),
							),
					)}
					value={newTraineeId}
					onChange={setNewTraineeId}
					placeholder='-- Chọn học viên / nhân viên nội viện (gõ tên để tìm) --'
				/>
				{programLinks.length > 1 && (
					<select
						className={styles.subSelect}
						style={{ flex: '0 1 280px' }}
						value={newProgramId}
						onChange={(e) => setNewProgramId(e.target.value)}
						title='Chương trình học — bài học của chương trình tự gắn cho học viên'
					>
						<option value=''>-- Chọn chương trình --</option>
						{programLinks.map((p) => (
							<option
								key={p.program_id}
								value={p.program_id}
							>
								{p.program_code ? `${p.program_code} — ${p.program_name}` : p.program_name}
							</option>
						))}
					</select>
				)}
				<button
					className={styles.btnGhost}
					disabled={!newTraineeId || needProgram || busy}
					title={needProgram ? 'Chọn chương trình học trước' : undefined}
					onClick={() => {
						onRegister(newTraineeId, programId || undefined);
						setNewTraineeId('');
					}}
				>
					<PlusSvg /> Thêm đăng ký
				</button>
			</div>

			<div className={styles.subToolbar}>
				<div className={`${styles.searchBox} ${styles.subSearch}`}>
					<SearchSvg className={styles.searchIcon} />
					<input
						className={styles.searchInput}
						placeholder='Tìm người đã đăng ký theo tên, SĐT, email...'
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
					{search && (
						<button
							className={styles.searchClear}
							onClick={() => setSearch('')}
						>
							<XSvg />
						</button>
					)}
				</div>
				<select
					className={styles.subSelect}
					style={{ flex: '0 0 auto' }}
					value={statusFilter}
					onChange={(e) => setStatusFilter(e.target.value as EnrollmentStatus | '')}
				>
					<option value=''>Tất cả trạng thái ({enrollments.length})</option>
					{(Object.keys(ENROLLMENT_STATUS_CFG) as EnrollmentStatus[]).map((s) => (
						<option
							key={s}
							value={s}
						>
							{ENROLLMENT_STATUS_CFG[s].label} ({counts[s] ?? 0})
						</option>
					))}
				</select>
			</div>

			<SelectionBar
				count={selectedPending.length}
				onClear={rowSel.clearSelection}
				itemLabel='đăng ký chờ duyệt'
				actions={
					<>
						<BulkButton
							disabled={busy}
							onClick={() => bulkDecide('approved')}
						>
							<CheckSvg /> Duyệt đã chọn
						</BulkButton>
						<BulkButton
							danger
							disabled={busy}
							onClick={() => bulkDecide('rejected')}
						>
							<XSvg /> Từ chối đã chọn
						</BulkButton>
					</>
				}
			/>

			<div className={styles.tableWrap}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th className={sel.checkCol}>
								<SelectCheckbox
									title='Chọn tất cả đăng ký chờ duyệt đang hiển thị'
									checked={rowSel.allPageSelected}
									indeterminate={rowSel.somePageSelected}
									onChange={rowSel.toggleSelectAll}
								/>
							</th>
							<th className={`${styles.th} ${tbl.thIdx}`}>STT</th>
							<th className={styles.th}>Học viên</th>
							<th className={styles.th}>Chương trình</th>
							<th className={styles.th}>Liên hệ</th>
							<th className={styles.th}>Ngày đăng ký</th>
							<th className={styles.th}>Trạng thái</th>
							<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{filtered.length === 0 ? (
							<tr>
								<td colSpan={8}>
									<div className={styles.subEmpty}>
										{enrollments.length === 0
											? 'Chưa có học viên nào đăng ký khóa học này.'
											: 'Không tìm thấy đăng ký phù hợp.'}
									</div>
								</td>
							</tr>
						) : (
							pg.paged.map((en, idx) => {
								const cfg = ENROLLMENT_STATUS_CFG[en.status];
								const isPending = en.status === 'pending';
								return (
									<tr
										key={en.id}
										className={styles.tr}
									>
										<td className={sel.checkCol}>
											{isPending && (
												<SelectCheckbox
													title={`Chọn ${en.trainee_name}`}
													checked={rowSel.isSelected(en.id)}
													onChange={() => rowSel.toggleSelect(en.id)}
												/>
											)}
										</td>
										<td className={`${styles.td} ${styles.tdIdx}`}>{pg.offset + idx + 1}</td>
										<td className={styles.td}>
											<div className={styles.subRowName}>{en.trainee_name}</div>
											{en.practice_code && <div className={styles.subRowMeta}>Mã thực hành {en.practice_code}</div>}
										</td>
										<td className={styles.td}>
											<div className={styles.subRowMeta}>
												{en.program_name
													? `${en.program_code ? `${en.program_code} — ` : ''}${en.program_name}`
													: '—'}
											</div>
											<div className={styles.subRowMeta}>
												{en.lesson_total > 0 ? `${en.lesson_done}/${en.lesson_total} bài · ` : ''}
												{PROGRESS_LABEL[en.progress_status] ?? ''}
											</div>
										</td>
										<td className={styles.td}>
											<div className={styles.subRowMeta}>{en.trainee_phone ?? '—'}</div>
											{en.trainee_email && <div className={styles.subRowMeta}>{en.trainee_email}</div>}
										</td>
										<td className={styles.td}>{formatDateOr(en.registered_at)}</td>
										<td className={styles.td}>
											<span
												className={styles.badge}
												style={{ background: cfg.bg, color: cfg.color }}
												title={en.decided_by_name ? `Xử lý bởi ${en.decided_by_name}` : undefined}
											>
												{cfg.label}
											</span>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<div className={styles.actionBtns}>
												{isPending && (
													<>
														<button
															className={`${styles.btnSmall} ${styles.btnSmallApprove}`}
															disabled={busy}
															onClick={() => onDecide(en.id, 'approved')}
														>
															Duyệt
														</button>
														<button
															className={`${styles.btnSmall} ${styles.btnSmallReject}`}
															disabled={busy}
															onClick={() => onDecide(en.id, 'rejected')}
														>
															Từ chối
														</button>
													</>
												)}
												<button
													className={styles.actionBtn}
													title='Hồ sơ ghi danh: chương trình, tiến độ, hồ sơ thực hành, bài học'
													disabled={busy}
													onClick={() => setDetailId(en.id)}
												>
													<EditSvg />
												</button>
												<button
													className={styles.actionBtn}
													title='Xoá đăng ký'
													disabled={busy}
													onClick={() => onRemove(en.id)}
												>
													<TrashSvg />
												</button>
											</div>
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>
			<Pagination
				{...pg.pagination}
				itemLabel='đăng ký'
			/>
			{bookOpen && course && (
				<PracticeBookImportModal
					courseId={course.id}
					onClose={() => setBookOpen(false)}
					onImported={onSaved}
				/>
			)}
			{detail && (
				<EnrollmentDetailModal
					enrollment={detail}
					course={course}
					programLinks={programLinks}
					onClose={() => setDetailId(null)}
					onSaved={onSaved}
				/>
			)}
		</>
	);
}
