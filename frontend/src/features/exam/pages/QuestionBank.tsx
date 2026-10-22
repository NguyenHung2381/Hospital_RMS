import { RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EditSvg, PlusSvg, SearchSvg, TrashSvg, UploadSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import {
	Badge,
	BulkBar,
	Button,
	DeleteAllButton,
	Modal,
	Pagination,
	QuestionImageField,
	QuestionImageView,
	QuestionText,
	SelectCheckbox,
	SkeletonTable,
} from '../../../shared/components';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { BulkButton } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { DEFAULT_PAGE_SIZE } from '../../../shared/utils/constants';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import { notify } from '../../../shared/utils/feedback';
import { examApi, type QuestionPayload } from '../api/examApi';
import { apiClient } from '../../../shared/api/axios';
import { SearchableSelect } from '../../../shared/components/Input/SearchableSelect';
import { ExcelActions, type ExcelColumn, type ExcelRecord } from '@/shared/components/Excel';
import { matchLabel, numText } from '@/shared/components/Excel/excelHelpers';
import { ImportQuestionsModal } from '../components/ImportQuestionsModal';
import { POOL_LABEL, type ExamQuestion, type QuestionPool, type QuestionType } from '../types/exam.type';
import styles from './QuestionBank.module.css';
import tbl from '@/shared/components/Table/Table.module.css';

const TYPE_LABEL: Record<QuestionType, string> = { single_choice: 'Trắc nghiệm', essay: 'Tự luận' };
// Câu cũ chưa thuộc chương trình nào (trước khi ngân hàng tách theo chương trình)
const NO_PROGRAM = '__none__';
const POOLS: QuestionPool[] = ['final', 'entrance'];

interface ProgramOption {
	id: string;
	code: string | null;
	name: string;
}
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const EXCEL_COLS: ExcelColumn<ExamQuestion>[] = [
	{ header: 'Loại', key: 'type', value: (x) => TYPE_LABEL[x.question_type] },
	{ header: 'Câu hỏi', key: 'text', required: true, value: (x) => x.question_text },
	...LETTERS.map((l, i) => ({ header: `Phương án ${l}`, key: `opt${i}`, value: (x: ExamQuestion) => x.options[i] })),
	{
		header: 'Đáp án đúng',
		key: 'correct',
		value: (x) => (x.correct_option ? LETTERS[x.options.indexOf(x.correct_option)] : ''),
	},
	{ header: 'Điểm', key: 'points', value: (x) => x.points },
	{ header: 'Chương trình', value: (x) => (x.program_code ? `${x.program_code} — ${x.program_name}` : x.program_name) },
	{ header: 'Kho', value: (x) => POOL_LABEL[x.pool] },
	{ header: 'Số đề đang dùng', value: (x) => x.used_count ?? 0 },
];

// Dòng Excel → câu hỏi: có phương án thì là trắc nghiệm (đáp án ghi chữ cái A–F hoặc nguyên văn phương án).
const questionFromExcel = (r: ExcelRecord): QuestionPayload => {
	const options = LETTERS.map((_, i) => r[`opt${i}`]).filter(Boolean);
	const type = matchLabel(TYPE_LABEL, r.type, 'Loại') ?? (options.length ? 'single_choice' : 'essay');
	const points = Number(numText(r.points) || 1);
	if (!(points > 0)) throw new Error(`Điểm "${r.points}" không hợp lệ`);
	if (type === 'essay') return { question_type: type, question_text: r.text, points };
	if (options.length < 2) throw new Error('Câu trắc nghiệm cần ít nhất 2 phương án');
	const letterIdx = LETTERS.indexOf(r.correct.trim().toUpperCase());
	const correct = letterIdx >= 0 ? r[`opt${letterIdx}`] : options.find((o) => o === r.correct.trim());
	if (!correct) throw new Error(`Đáp án đúng "${r.correct}" không khớp phương án nào`);
	return { question_type: type, question_text: r.text, options, correct_option: correct, points };
};

export default function QuestionBank() {
	const [items, setItems] = useState<ExamQuestion[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState('');
	const [type, setType] = useState<QuestionType | ''>('');
	// Ngân hàng đang làm việc: chương trình + kho (đầu vào / cuối khóa), giữ trên URL
	const [params, setParams] = useSearchParams();
	const pool: QuestionPool = params.get('pool') === 'entrance' ? 'entrance' : 'final';
	const [programs, setPrograms] = useState<ProgramOption[]>([]);
	const [moving, setMoving] = useState<{ program: string; pool: QuestionPool } | null>(null);
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
		apiClient
			.get<{ data: ProgramOption[] }>('/training-programs?limit=0')
			.then((r) => setPrograms(r.data))
			.catch(() => {});
	}, []);

	// Chưa chọn thì mở chương trình có nhiều câu nhất (hoặc chương trình đầu tiên)
	const countByProgram = useMemo(() => {
		const m = new Map<string, number>();
		items.forEach((x) => m.set(x.program_id ?? NO_PROGRAM, (m.get(x.program_id ?? NO_PROGRAM) ?? 0) + 1));
		return m;
	}, [items]);
	const programId =
		params.get('program') ??
		[...countByProgram].filter(([id]) => id !== NO_PROGRAM).sort((a, b) => b[1] - a[1])[0]?.[0] ??
		programs[0]?.id ??
		'';
	const unassigned = programId === NO_PROGRAM;
	const setWorkspace = (next: { program?: string; pool?: QuestionPool }) => {
		setParams({ program: next.program ?? programId, pool: next.pool ?? pool }, { replace: true });
		setPage(1);
		rowSel.clearSelection();
	};
	const programOptions = [
		...programs.map((p) => ({
			id: p.id,
			name: `${p.code ? `${p.code} — ` : ''}${p.name} (${countByProgram.get(p.id) ?? 0} câu)`,
		})),
		...(countByProgram.get(NO_PROGRAM)
			? [{ id: NO_PROGRAM, name: `Chưa thuộc chương trình nào (${countByProgram.get(NO_PROGRAM)} câu)` }]
			: []),
	];
	// Câu mới / nhập vào thuộc ngân hàng đang mở
	const withWorkspace = (q: QuestionPayload): QuestionPayload => ({ ...q, program_id: programId, pool });

	// ponytail: lọc/phân trang phía client — đủ cho vài nghìn câu; nhiều hơn thì chuyển sang API có paging
	const inWorkspace = useMemo(
		() => items.filter((x) => (unassigned ? !x.program_id : x.program_id === programId && x.pool === pool)),
		[items, unassigned, programId, pool],
	);
	const poolCount = (p: QuestionPool) => items.filter((x) => x.program_id === programId && x.pool === p).length;

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return inWorkspace.filter(
			(x) =>
				(!type || x.question_type === type) &&
				(!usage || (usage === 'used') === !!x.used_count) &&
				(!q || [x.question_text, ...x.options].some((s) => s.toLowerCase().includes(q))),
		);
	}, [inWorkspace, search, type, usage]);
	const hasFilter = !!(search || type || usage);
	const resetFilters = () => {
		setSearch('');
		setType('');
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

	// Chuyển câu đã chọn sang ngân hàng khác (câu cũ chưa thuộc chương trình, hoặc đổi kho)
	const handleMove = async () => {
		if (!moving?.program || moving.program === NO_PROGRAM) return notify.error('Vui lòng chọn chương trình');
		setBusy(true);
		try {
			const { okIds, failedCount } = await runBulk([...rowSel.selectedIds], (id) =>
				examApi.updateQuestion(id, { program_id: moving.program, pool: moving.pool }),
			);
			(failedCount ? notify.error : notify.success)(bulkToast('chuyển', okIds.size, failedCount, 'câu hỏi'));
			setMoving(null);
			rowSel.clearSelection();
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
			else await examApi.createQuestion(withWorkspace(payload));
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
			pageSubtitle='Mỗi chương trình đào tạo một ngân hàng riêng, chia kho kiểm tra đầu vào và thi cuối khóa — đề thi bốc câu từ đây'
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={
				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					<ExcelActions
						fileName='ngan-hang-cau-hoi'
						itemLabel='câu hỏi'
						columns={EXCEL_COLS}
						getRows={() => filtered}
						importHint='Có phương án → trắc nghiệm; Đáp án đúng ghi chữ cái (A–F). Điểm để trống = 1.'
						importRow={
							unassigned || !programId
								? undefined
								: (r) => examApi.createQuestion(withWorkspace(questionFromExcel(r)))
						}
						onImported={() => void load()}
					/>
					<Button
						variant='secondary'
						icon={<UploadSvg />}
						onClick={() => setImporting(true)}
						disabled={unassigned || !programId}
					>
						Nhập từ Word/PDF
					</Button>
					<Button
						icon={<PlusSvg />}
						onClick={() => setEditing('new')}
						disabled={unassigned || !programId}
					>
						Thêm câu hỏi
					</Button>
				</div>
			}
		>
			<div className={styles.workspace}>
				<div className={styles.workspaceProgram}>
					<span className={styles.workspaceLabel}>Chương trình</span>
					<SearchableSelect
						options={programOptions}
						value={programId}
						onChange={(id) => setWorkspace({ program: id })}
						placeholder='— Chọn chương trình đào tạo —'
					/>
				</div>
				{!unassigned && (
					<div
						className={styles.poolTabs}
						role='tablist'
					>
						{POOLS.map((p) => (
							<button
								key={p}
								type='button'
								role='tab'
								aria-selected={pool === p}
								className={`${styles.poolTab} ${pool === p ? styles.poolTabActive : ''}`}
								onClick={() => setWorkspace({ pool: p })}
							>
								{POOL_LABEL[p]} <span className={styles.poolCount}>{poolCount(p)}</span>
							</button>
						))}
					</div>
				)}
				{unassigned && (
					<span className={styles.hint}>
						Câu hỏi cũ chưa thuộc chương trình nào — chọn câu rồi bấm "Chuyển sang chương trình" để đưa vào ngân hàng.
					</span>
				)}
			</div>

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
						<DeleteAllButton
							count={filtered.length}
							itemLabel='câu hỏi'
							getIds={() => filtered.map((x) => x.id)}
							onDelete={handleBulkDelete}
							onDone={rowSel.clearSelection}
							disabled={busy}
							note='Câu hỏi đang nằm trong đề kiểm tra sẽ không xoá được và được báo lỗi riêng.'
						/>
					</div>
				</div>

				<div className={styles.tableWrap}>
					<BulkBar
						rowSel={rowSel}
						itemLabel='câu hỏi'
						loading={busy}
						onBulkDelete={handleBulkDelete}
						onBulkEdit={() => setBulkPoints('1')}
						extraActions={
							<BulkButton
								onClick={() =>
									setMoving({ program: unassigned ? '' : programId, pool: unassigned ? 'final' : pool })
								}
							>
								Chuyển sang chương trình…
							</BulkButton>
						}
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
								<th className={`${styles.th} ${tbl.thIdx}`}>STT</th>
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
											<div className={styles.questionText}>
												<QuestionText text={q.question_text} />
											</div>
											<QuestionImageView
												url={q.image_url}
												compact
											/>
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
					onImport={async (questions) => {
						const payload: QuestionPayload[] = [];
						for (const q of questions) {
							payload.push({
								question_type: q.question_type,
								question_text: q.question_text,
								options: q.options,
								correct_option: q.correctIndex != null ? q.options[q.correctIndex] : null,
								points: q.points,
								image_url: q.image ? (await examApi.uploadQuestionImage(q.image)).url : null,
								program_id: programId,
								pool,
							});
						}
						const res = await examApi.createQuestionsBulk(payload);
						notify.success(`Đã nhập ${res.created} câu hỏi`);
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
				open={!!moving}
				onClose={() => setMoving(null)}
				title={`Chuyển ${rowSel.selectedCount} câu hỏi sang ngân hàng`}
				size='sm'
				footer={
					<>
						<Button
							variant='secondary'
							onClick={() => setMoving(null)}
						>
							Huỷ
						</Button>
						<Button
							loading={busy}
							onClick={() => void handleMove()}
						>
							Chuyển
						</Button>
					</>
				}
			>
				<div className={styles.form}>
					<label className={styles.field}>
						Chương trình
						<SearchableSelect
							options={programOptions.filter((o) => o.id !== NO_PROGRAM)}
							value={moving?.program ?? ''}
							onChange={(id) => setMoving((m) => m && { ...m, program: id })}
							placeholder='— Chọn chương trình —'
						/>
					</label>
					<label className={styles.field}>
						Kho
						<select
							className={styles.input}
							value={moving?.pool ?? 'final'}
							onChange={(e) => setMoving((m) => m && { ...m, pool: e.target.value as QuestionPool })}
						>
							{POOLS.map((p) => (
								<option
									key={p}
									value={p}
								>
									{POOL_LABEL[p]}
								</option>
							))}
						</select>
					</label>
				</div>
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
	const [image, setImage] = useState<string | null>(question?.image_url ?? null);
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
			image_url: image,
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
				<div className={styles.field}>
					Hình minh hoạ <span className={styles.hint}>(không bắt buộc)</span>
					<QuestionImageField
						value={image}
						onChange={setImage}
						upload={examApi.uploadQuestionImage}
						disabled={busy}
					/>
				</div>
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
