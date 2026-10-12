import { RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { useEffect, useMemo, useState } from 'react';
import { EditSvg, PlusSvg, SearchSvg, TrashSvg, UploadSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { Badge, BulkBar, Button, Modal, Pagination, SelectCheckbox, SkeletonTable } from '../../../shared/components';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../../shared/utils/constants';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import { notify } from '../../../shared/utils/feedback';
import { examApi, type QuestionPayload } from '../api/examApi';
import { ImportQuestionsModal } from '../components/ImportQuestionsModal';
import type { ExamQuestion, QuestionType } from '../types/exam.type';
import styles from './QuestionBank.module.css';

const TYPE_LABEL: Record<QuestionType, string> = { single_choice: 'Trắc nghiệm', essay: 'Tự luận' };
const NO_SUBJECT = '__none__';

export default function QuestionBank() {
	const [items, setItems] = useState<ExamQuestion[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState('');
	const [type, setType] = useState<QuestionType | ''>('');
	const [subject, setSubject] = useState('');
	const [usage, setUsage] = useState<'' | 'used' | 'unused'>('');
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
	const [editing, setEditing] = useState<ExamQuestion | 'new' | null>(null);
	const [deleting, setDeleting] = useState<ExamQuestion | null>(null);
	const [busy, setBusy] = useState(false);
	const [importing, setImporting] = useState(false);

	const load = () =>
		examApi
			.listQuestions()
			.then(setItems)
			.catch((e: Error) => notify.error(e.message))
			.finally(() => setLoading(false));

	useEffect(() => {
		void load();
	}, []);

	// ponytail: lọc/phân trang phía client — đủ cho vài nghìn câu; nhiều hơn thì chuyển sang API có paging
	const subjects = useMemo(() => {
		const m = new Map<string, string>();
		items.forEach((x) => x.subject_id && m.set(x.subject_id, x.subject_name ?? x.subject_id));
		return [...m].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
	}, [items]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return items.filter(
			(x) =>
				(!type || x.question_type === type) &&
				(!subject || (subject === NO_SUBJECT ? !x.subject_id : x.subject_id === subject)) &&
				(!usage || (usage === 'used') === !!x.used_count) &&
				(!q || [x.question_text, ...x.options].some((s) => s.toLowerCase().includes(q))),
		);
	}, [items, search, type, subject, usage]);
	const hasFilter = !!(search || type || subject || usage);
	const resetFilters = () => {
		setSearch('');
		setType('');
		setSubject('');
		setUsage('');
		setPage(1);
	};
	const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
	const safePage = Math.min(page, totalPages);
	const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
	const rowSel = useRowSelection(paged.map((x) => x.id));
	const [bulkPoints, setBulkPoints] = useState<string | null>(null);

	const handleBulkDelete = async (ids: string[]) => {
		setBusy(true);
		try {
			const { okIds, failedCount } = await runBulk(ids, (id) => examApi.removeQuestion(id));
			(failedCount ? notify.error : notify.success)(bulkToast('xoá', okIds.size, failedCount, 'câu hỏi'));
			await load();
		} finally {
			setBusy(false);
		}
	};

	const handleBulkPoints = async () => {
		const points = Number(bulkPoints);
		if (!(points > 0)) return notify.error('Điểm phải lớn hơn 0');
		setBusy(true);
		try {
			const { okIds, failedCount } = await runBulk([...rowSel.selectedIds], (id) =>
				examApi.updateQuestion(id, { points }),
			);
			(failedCount ? notify.error : notify.success)(bulkToast('cập nhật điểm', okIds.size, failedCount, 'câu hỏi'));
			setBulkPoints(null);
			rowSel.clearSelection();
			await load();
		} finally {
			setBusy(false);
		}
	};

	const handleSave = async (payload: QuestionPayload) => {
		setBusy(true);
		try {
			if (editing && editing !== 'new') await examApi.updateQuestion(editing.id, payload);
			else await examApi.createQuestion(payload);
			notify.success(editing === 'new' ? 'Đã thêm câu hỏi' : 'Đã cập nhật câu hỏi');
			setEditing(null);
			await load();
		} catch (e) {
			notify.error((e as Error).message);
		} finally {
			setBusy(false);
		}
	};

	const handleDelete = async () => {
		if (!deleting) return;
		setBusy(true);
		try {
			await examApi.removeQuestion(deleting.id);
			notify.success('Đã xoá câu hỏi');
			setDeleting(null);
			await load();
		} catch (e) {
			notify.error((e as Error).message);
		} finally {
			setBusy(false);
		}
	};

	return (
		<AdminLayout
			pageTitle='Ngân hàng câu hỏi'
			pageSubtitle='Câu hỏi trắc nghiệm & tự luận dùng chung cho các đề kiểm tra của khóa học'
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={
				<div style={{ display: 'flex', gap: 8 }}>
					<Button
						variant='secondary'
						icon={<UploadSvg />}
						onClick={() => setImporting(true)}
					>
						Nhập từ Word/PDF
					</Button>
					<Button
						icon={<PlusSvg />}
						onClick={() => setEditing('new')}
					>
						Thêm câu hỏi
					</Button>
				</div>
			}
		>
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách câu hỏi</span>
						<span className={styles.tableCount}>{filtered.length} câu hỏi</span>
					</div>
					<div className={styles.tableControls}>
						<div className={styles.searchBox}>
							<SearchSvg className={styles.searchIcon} />
							<input
								className={styles.searchInput}
								placeholder='Tìm theo câu hỏi, phương án...'
								value={search}
								onChange={(e) => {
									setSearch(e.target.value);
									setPage(1);
								}}
							/>
						</div>
						<select
							className={styles.select}
							value={type}
							onChange={(e) => {
								setType(e.target.value as QuestionType | '');
								setPage(1);
							}}
						>
							<option value=''>Tất cả loại</option>
							<option value='single_choice'>Trắc nghiệm</option>
							<option value='essay'>Tự luận</option>
						</select>
						{subjects.length > 0 && (
							<select
								className={styles.select}
								value={subject}
								onChange={(e) => {
									setSubject(e.target.value);
									setPage(1);
								}}
							>
								<option value=''>Tất cả môn học</option>
								{subjects.map(([id, name]) => (
									<option
										key={id}
										value={id}
									>
										{name}
									</option>
								))}
								<option value={NO_SUBJECT}>Chưa gán môn</option>
							</select>
						)}
						<select
							className={styles.select}
							value={usage}
							onChange={(e) => {
								setUsage(e.target.value as typeof usage);
								setPage(1);
							}}
						>
							<option value=''>Tất cả trạng thái</option>
							<option value='used'>Đã dùng trong đề</option>
							<option value='unused'>Chưa dùng</option>
						</select>
						{hasFilter && (
							<Button
								variant='secondary'
								size='sm'
								onClick={resetFilters}
							>
								Xoá lọc
							</Button>
						)}
					</div>
				</div>

				<div className={styles.tableWrap}>
					<BulkBar
						rowSel={rowSel}
						itemLabel='câu hỏi'
						loading={busy}
						onBulkDelete={handleBulkDelete}
						onBulkEdit={() => setBulkPoints('1')}
						deleteNote='Câu hỏi đang nằm trong đề kiểm tra sẽ không xoá được và được báo lỗi riêng.'
					/>
					<table className={styles.table}>
						<thead>
							<tr>
								<th className={sel.checkCol}>
									<SelectCheckbox
										title='Chọn tất cả trang này'
										checked={rowSel.allPageSelected}
										indeterminate={rowSel.somePageSelected}
										onChange={rowSel.toggleSelectAll}
									/>
								</th>
								<th className={styles.th}>#</th>
								<th className={styles.th}>Câu hỏi</th>
								<th className={styles.th}>Loại</th>
								<th className={styles.th}>Điểm</th>
								<th className={styles.th}>Sử dụng</th>
								<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
							</tr>
						</thead>
						<tbody>
							{loading ? (
								<SkeletonTable
									rows={8}
									cols={7}
								/>
							) : paged.length === 0 ? (
								<tr>
									<td colSpan={7}>
										<div className={styles.emptyState}>
											<div className={styles.emptyTitle}>Không có câu hỏi</div>
											<div className={styles.emptyDesc}>
												{hasFilter ? 'Thử đổi bộ lọc' : 'Bấm "Thêm câu hỏi" để bắt đầu'}
											</div>
										</div>
									</td>
								</tr>
							) : (
								paged.map((q, i) => (
									<tr
										key={q.id}
										className={`${styles.tr} ${rowSel.isSelected(q.id) ? sel.rowSelected : ''}`}
									>
										<td className={sel.checkCol}>
											<SelectCheckbox
												title='Chọn dòng'
												checked={rowSel.isSelected(q.id)}
												onChange={() => rowSel.toggleSelect(q.id)}
											/>
										</td>
										<td className={`${styles.td} ${styles.tdIdx}`}>{(safePage - 1) * pageSize + i + 1}</td>
										<td className={styles.td}>
											<div className={styles.questionText}>{q.question_text}</div>
											{q.question_type === 'single_choice' && (
												<ol
													type='A'
													className={styles.optionList}
												>
													{q.options.map((o) => (
														<li
															key={o}
															className={o === q.correct_option ? styles.optionCorrect : undefined}
														>
															{o}
														</li>
													))}
												</ol>
											)}
										</td>
										<td className={styles.td}>
											<Badge tone={q.question_type === 'essay' ? 'purple' : 'blue'}>
												{TYPE_LABEL[q.question_type]}
											</Badge>
										</td>
										<td className={styles.td}>{q.points}</td>
										<td className={styles.td}>
											<span className={styles.muted}>{q.used_count ? `${q.used_count} đề` : 'Chưa dùng'}</span>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<RowActions>
												<RowAction
													title='Chỉnh sửa'
													onClick={() => setEditing(q)}
												>
													<EditSvg />
												</RowAction>
												<RowAction
													title='Xoá'
													onClick={() => setDeleting(q)}
												>
													<TrashSvg />
												</RowAction>
											</RowActions>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>

				{!loading && (
					<Pagination
						page={safePage}
						totalPages={totalPages}
						total={filtered.length}
						rowsPerPage={pageSize}
						pageSizeOptions={PAGE_SIZE_OPTIONS}
						onPageChange={setPage}
						onRowsPerPageChange={(n) => {
							setPageSize(n);
							setPage(1);
						}}
						itemLabel='câu hỏi'
					/>
				)}
			</div>

			{importing && (
				<ImportQuestionsModal
					onClose={() => setImporting(false)}
					onImported={() => {
						setImporting(false);
						void load();
					}}
				/>
			)}

			{editing && (
				<QuestionFormModal
					question={editing === 'new' ? null : editing}
					busy={busy}
					onClose={() => setEditing(null)}
					onSave={handleSave}
				/>
			)}

			<Modal
				open={bulkPoints !== null}
				onClose={() => setBulkPoints(null)}
				title={`Sửa điểm ${rowSel.selectedCount} câu hỏi`}
				size='sm'
				footer={
					<>
						<Button
							variant='secondary'
							onClick={() => setBulkPoints(null)}
						>
							Huỷ
						</Button>
						<Button
							loading={busy}
							onClick={() => void handleBulkPoints()}
						>
							Lưu
						</Button>
					</>
				}
			>
				<label className={styles.field}>
					Điểm mới cho các câu đã chọn
					<input
						className={styles.input}
						type='number'
						min={0.5}
						step={0.5}
						value={bulkPoints ?? ''}
						onChange={(e) => setBulkPoints(e.target.value)}
					/>
				</label>
			</Modal>

			<Modal
				open={!!deleting}
				onClose={() => setDeleting(null)}
				title='Xoá câu hỏi'
				size='sm'
				footer={
					<>
						<Button
							variant='secondary'
							onClick={() => setDeleting(null)}
						>
							Huỷ
						</Button>
						<Button
							variant='danger'
							loading={busy}
							onClick={() => void handleDelete()}
						>
							Xoá
						</Button>
					</>
				}
			>
				Xoá câu hỏi "{deleting?.question_text.slice(0, 80)}"? Câu hỏi đang nằm trong đề kiểm tra sẽ không xoá được.
			</Modal>
		</AdminLayout>
	);
}

function QuestionFormModal({
	question,
	busy,
	onClose,
	onSave,
}: {
	question: ExamQuestion | null;
	busy: boolean;
	onClose: () => void;
	onSave: (p: QuestionPayload) => void;
}) {
	const [type, setType] = useState<QuestionType>(question?.question_type ?? 'single_choice');
	const [text, setText] = useState(question?.question_text ?? '');
	const [points, setPoints] = useState(String(question?.points ?? 1));
	const [options, setOptions] = useState<string[]>(question?.options.length ? question.options : ['', '', '', '']);
	const [correct, setCorrect] = useState(
		question ? Math.max(0, question.options.indexOf(question.correct_option ?? '')) : 0,
	);
	const [error, setError] = useState('');

	const submit = () => {
		if (!text.trim()) return setError('Vui lòng nhập nội dung câu hỏi');
		if (!(Number(points) > 0)) return setError('Điểm phải lớn hơn 0');
		if (type === 'single_choice') {
			const filled = options.map((o) => o.trim());
			if (filled.filter(Boolean).length < 2) return setError('Cần ít nhất 2 phương án');
			if (!filled[correct]) return setError('Phương án đúng không được để trống');
			if (new Set(filled.filter(Boolean)).size !== filled.filter(Boolean).length)
				return setError('Các phương án không được trùng nhau');
		}
		setError('');
		const opts = options.map((o) => o.trim());
		onSave({
			question_type: type,
			question_text: text.trim(),
			points: Number(points),
			options: type === 'single_choice' ? opts.filter(Boolean) : [],
			correct_option: type === 'single_choice' ? opts[correct] : null,
		});
	};

	return (
		<Modal
			open
			onClose={onClose}
			title={question ? 'Sửa câu hỏi' : 'Thêm câu hỏi'}
			size='lg'
			closeOnBackdrop={false}
			footer={
				<>
					<Button
						variant='secondary'
						onClick={onClose}
					>
						Huỷ
					</Button>
					<Button
						loading={busy}
						onClick={submit}
					>
						Lưu
					</Button>
				</>
			}
		>
			<div className={styles.form}>
				<div className={styles.row2}>
					<label className={styles.field}>
						Loại câu hỏi
						<select
							className={styles.input}
							value={type}
							onChange={(e) => setType(e.target.value as QuestionType)}
						>
							<option value='single_choice'>Trắc nghiệm (1 đáp án đúng)</option>
							<option value='essay'>Tự luận</option>
						</select>
					</label>
					<label className={styles.field}>
						Điểm
						<input
							className={styles.input}
							type='number'
							min={0.5}
							step={0.5}
							value={points}
							onChange={(e) => setPoints(e.target.value)}
						/>
					</label>
				</div>
				<label className={styles.field}>
					Nội dung câu hỏi
					<textarea
						className={styles.input}
						rows={4}
						value={text}
						onChange={(e) => setText(e.target.value)}
					/>
				</label>
				{type === 'single_choice' ? (
					<div className={styles.field}>
						Phương án <span className={styles.hint}>(chọn ô tròn ở phương án đúng)</span>
						{options.map((o, i) => (
							<div
								key={i}
								className={styles.optionRow}
							>
								<input
									type='radio'
									name='correct'
									checked={correct === i}
									onChange={() => setCorrect(i)}
									aria-label={`Phương án ${String.fromCharCode(65 + i)} đúng`}
								/>
								<input
									className={styles.input}
									placeholder={`Phương án ${String.fromCharCode(65 + i)}`}
									value={o}
									onChange={(e) => setOptions((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
								/>
								{options.length > 2 && (
									<div
										className={styles.actionBtn}
										title='Bỏ phương án'
										onClick={() => {
											setOptions((prev) => prev.filter((_, j) => j !== i));
											setCorrect((c) => (c === i ? 0 : c > i ? c - 1 : c));
										}}
									>
										<TrashSvg />
									</div>
								)}
							</div>
						))}
						<button
							type='button'
							className={styles.linkBtn}
							onClick={() => setOptions((prev) => [...prev, ''])}
						>
							+ Thêm phương án
						</button>
					</div>
				) : (
					<div className={styles.hint}>Câu tự luận được giảng viên chấm tay sau khi học viên nộp bài.</div>
				)}
				{error && <div className={styles.error}>{error}</div>}
			</div>
		</Modal>
	);
}
