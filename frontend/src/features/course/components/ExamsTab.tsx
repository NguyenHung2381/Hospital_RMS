import { useEffect, useState } from 'react';
import {
	CheckSvg as IcCheck,
	PlusSvg as IcPlus,
	SettingsSvg as IcSettings,
	TrashSvg as IcTrash,
	UploadSvg as IcUpload,
} from '@/assets/icons';
import { examApi, type QuestionPayload } from '../../exam/api/examApi';
import { ImportQuestionsModal, type ImportedQuestion } from '../../exam/components/ImportQuestionsModal';
import { notify } from '../../../shared/utils/feedback';
import type {
	AttemptStatus,
	ExamAttemptDetail,
	ExamAttemptSummary,
	ExamPaper,
	ExamPaperQuestion,
	ExamQuestion,
	PaperStatus,
	PaperType,
	QuestionType,
} from '../../exam/types/exam.type';
import {
	CODE_MODE_LABEL,
	EXAM_PART_LABEL,
	PAPER_QUESTION_TYPE,
	POOL_LABEL,
	type CodeMode,
	type ExamPart,
	type QuestionPool,
} from '../../exam/types/exam.type';
import { getAssignments, getProgramLinks } from '../api/courseApi';
import type { CourseProgramLink } from '../types/course.type';
import { MultiSelect } from '../../../shared/components/Input/MultiSelect';
import { SearchableSelect } from '../../../shared/components/Input/SearchableSelect';
import { Button, Modal, QuestionImageView, QuestionText } from '../../../shared/components';
import styles from '../pages/Courses.module.css';

const STATUS_LABEL: Record<PaperStatus, string> = {
	draft: 'Nháp',
	published: 'Đang mở',
	closed: 'Đã đóng',
};
const PAPER_TYPE_LABEL: Record<PaperType, string> = {
	multiple_choice: 'Trắc nghiệm',
	essay: 'Tự luận',
};
const ATTEMPT_STATUS_LABEL: Record<AttemptStatus, string> = {
	in_progress: 'Đang làm',
	submitted: 'Chờ chấm tự luận',
	graded: 'Đã có điểm',
};

let tempSeq = 0;
const nextTempId = () => `new-${Date.now()}-${tempSeq++}`;

interface DraftQuestion {
	tempId: string;
	id?: string; // đã có trong ngân hàng câu hỏi (đang sửa) — undefined = câu mới chưa tạo
	question_type: QuestionType;
	question_text: string;
	options: string[];
	correct_option: string;
	points: string;
	image_url: string | null;
}

function toDraft(q: ExamPaperQuestion): DraftQuestion {
	return {
		tempId: q.id,
		id: q.id,
		question_type: q.question_type,
		question_text: q.question_text,
		options: q.options.length ? q.options : [''],
		correct_option: q.correct_option ?? '',
		points: String(q.points),
		image_url: q.image_url ?? null,
	};
}

type View = 'list' | 'builder' | 'attempts' | 'grading';

export function ExamsTab({ courseId }: { courseId: string }) {
	const [view, setView] = useState<View>('list');
	const [papers, setPapers] = useState<ExamPaper[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	const [editingPaper, setEditingPaper] = useState<ExamPaper | null>(null);
	const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
	const [attempts, setAttempts] = useState<ExamAttemptSummary[]>([]);
	const [gradingAttempt, setGradingAttempt] = useState<ExamAttemptDetail | null>(null);

	const loadPapers = () => {
		setLoading(true);
		examApi
			.listPapers(courseId)
			.then(setPapers)
			.catch(() => setError('Không thể tải danh sách đề thi'))
			.finally(() => setLoading(false));
	};

	useEffect(() => {
		async function run() {
			loadPapers();
		}
		void run();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [courseId]);

	const openBuilder = async (paper: ExamPaper | null) => {
		try {
			// Dòng danh sách không kèm câu hỏi — lưu với questions rỗng sẽ xoá sạch đề
			setEditingPaper(paper ? await examApi.getPaper(paper.id) : null);
			setView('builder');
		} catch {
			setError('Không thể tải đề thi');
		}
	};

	const openAttempts = async (paper: ExamPaper) => {
		setSelectedPaperId(paper.id);
		setView('attempts');
		try {
			setAttempts(await examApi.listAttempts(paper.id));
		} catch {
			setError('Không thể tải danh sách bài làm');
		}
	};

	const openGrading = async (attemptId: string) => {
		setView('grading');
		try {
			setGradingAttempt(await examApi.getAttempt(attemptId));
		} catch {
			setError('Không thể tải bài làm');
		}
	};

	if (view === 'builder') {
		return (
			<ExamBuilder
				courseId={courseId}
				paper={editingPaper}
				onCancel={() => setView('list')}
				onSaved={() => {
					setView('list');
					loadPapers();
				}}
			/>
		);
	}

	if (view === 'attempts' && selectedPaperId) {
		return (
			<div>
				<button
					className={styles.btnGhost}
					onClick={() => setView('list')}
					style={{ marginBottom: 12 }}
				>
					← Quay lại danh sách đề thi
				</button>
				{attempts.length === 0 ? (
					<div className={styles.subEmpty}>Chưa có học viên nào làm bài thi này.</div>
				) : (
					<div className={styles.subList}>
						{attempts.map((a) => (
							<div
								key={a.id}
								className={styles.subRow}
							>
								<div className={styles.subRowMain}>
									<div className={styles.subRowName}>{a.trainee_name}</div>
									<div style={{ fontSize: 12, color: 'var(--color-gray-500)' }}>
										{(a.attempt_no ?? 1) > 1 && `Thi lại lần ${(a.attempt_no ?? 1) - 1} · `}
										{a.code_no != null && `Mã đề ${a.code_no} · `}
										{ATTEMPT_STATUS_LABEL[a.status]}
										{a.score10 != null && ` · ${String(a.score10).replace('.', ',')}/10`}
										{a.auto_score != null && ` · Tự động: ${a.auto_score} điểm`}
										{a.manual_score != null && ` · Tổng: ${a.manual_score} điểm`}
										{a.pending_count > 0 && ` · ${a.pending_count} câu chờ chấm`}
									</div>
								</div>
								{a.status !== 'in_progress' && (
									<button
										className={styles.btnGhost}
										onClick={() => openGrading(a.id)}
									>
										{a.status === 'graded' ? 'Xem bài' : 'Chấm bài'}
									</button>
								)}
							</div>
						))}
					</div>
				)}
			</div>
		);
	}

	if (view === 'grading' && gradingAttempt) {
		return (
			<GradingPanel
				attempt={gradingAttempt}
				onBack={() => setView('attempts')}
				onGraded={(updated) => setGradingAttempt(updated)}
			/>
		);
	}

	return (
		<div>
			<div className={styles.subToolbar}>
				<button
					className={styles.btnGhost}
					onClick={() => void openBuilder(null)}
				>
					<IcPlus /> Tạo đề thi mới
				</button>
			</div>
			{error && <div className={styles.errorBanner}>{error}</div>}
			{loading ? (
				<div className={styles.subEmpty}>Đang tải...</div>
			) : papers.length === 0 ? (
				<div className={styles.subEmpty}>Chưa có đề thi nào cho khóa học này.</div>
			) : (
				<div className={styles.subList}>
					{papers.map((p) => (
						<div
							key={p.id}
							className={styles.subRow}
						>
							<div className={styles.subRowMain}>
								<div className={styles.subRowName}>{p.title}</div>
								<div style={{ fontSize: 12, color: 'var(--color-gray-500)' }}>
									{POOL_LABEL[p.purpose ?? 'final']}
									{p.program_code ? ` · Lớp ${p.program_code}` : ''} ·{' '}
									{p.purpose === 'entrance' ? '' : `${EXAM_PART_LABEL[p.exam_part] ?? 'Lý thuyết'} · `}
									{p.paper_type ? PAPER_TYPE_LABEL[p.paper_type] : 'TN + TL'}
									{p.weight != null && p.purpose !== 'entrance' && p.exam_part === 'theory' ? ` (${p.weight}% điểm LT)` : ''} ·{' '}
									{STATUS_LABEL[p.status]} ·{' '}
									{p.code_mode
										? `Ngẫu nhiên ${[p.gen_mc_count ? `${p.gen_mc_count} TN` : '', p.gen_essay_count ? `${p.gen_essay_count} TL` : '']
												.filter(Boolean)
												.join(' + ')} · ${CODE_MODE_LABEL[p.code_mode]}${p.code_mode === 'codes' ? ` (${p.code_count})` : ''}`
										: `${p.question_count} câu`}{' '}
									· {p.duration_minutes} phút ·{' '}
									{p.attempt_count} lượt làm · Người chấm: {p.grader_names || 'GV được phân công bài học'}
								</div>
							</div>
							<div style={{ display: 'flex', gap: 6 }}>
								<button
									className={styles.btnGhost}
									onClick={() => openAttempts(p)}
								>
									Bài làm
								</button>
								<button
									className={styles.btnGhost}
									onClick={() => void openBuilder(p)}
								>
									Sửa
								</button>
								<div
									className={styles.actionBtn}
									title='Xoá đề thi'
									onClick={async () => {
										if (!confirm(`Xoá đề thi "${p.title}"?`)) return;
										await examApi.removePaper(p.id);
										loadPapers();
									}}
								>
									<IcTrash />
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// ─── Tạo / sửa đề thi ────────────────────────────────────────────────────────
function ExamBuilder({
	courseId,
	paper,
	onCancel,
	onSaved,
}: {
	courseId: string;
	paper: ExamPaper | null;
	onCancel: () => void;
	onSaved: () => void;
}) {
	const [title, setTitle] = useState(paper?.title ?? '');
	const [duration, setDuration] = useState(String(paper?.duration_minutes ?? 45));
	const [status, setStatus] = useState<PaperStatus>(paper?.status ?? 'draft');
	// null = đề hỗn hợp trắc nghiệm + tự luận (nhận cả 2 loại câu)
	const [paperType, setPaperType] = useState<PaperType | null>(paper ? paper.paper_type : 'multiple_choice');
	const allowedType = paperType ? PAPER_QUESTION_TYPE[paperType] : null;
	const [examPart, setExamPart] = useState<ExamPart>(paper?.exam_part ?? 'theory');
	// Đề đầu vào (chỉ tham khảo) / cuối khóa; lớp = chương trình trong khóa (lấy ngân hàng của chương trình đó)
	const [purpose, setPurpose] = useState<QuestionPool>(paper?.purpose ?? 'final');
	const [programId, setProgramId] = useState(paper?.program_id ?? '');
	const [links, setLinks] = useState<CourseProgramLink[]>([]);
	useEffect(() => {
		getProgramLinks(courseId)
			.then((l) => {
				setLinks(l);
				if (!paper && l.length === 1) setProgramId(l[0].program_id);
			})
			.catch(() => {});
	}, [courseId, paper]);
	// Bốc ngẫu nhiên N câu từ ngân hàng (mặc định) hay chọn câu tay
	const wasRandom = !!paper && !!((paper.gen_mc_count ?? 0) + (paper.gen_essay_count ?? 0));
	const [mode, setMode] = useState<'random' | 'manual'>(!paper || wasRandom ? 'random' : 'manual');
	const [mcCount, setMcCount] = useState(String(paper?.gen_mc_count ?? 20));
	const [essayCount, setEssayCount] = useState(String(paper?.gen_essay_count ?? 2));
	const [codeMode, setCodeMode] = useState<CodeMode>(paper?.code_mode ?? 'per_trainee');
	const [codeCount, setCodeCount] = useState(String(paper?.code_count ?? 2));
	const [weight, setWeight] = useState(paper?.weight != null ? String(paper.weight) : '50');
	const [generated, setGenerated] = useState(paper?.questions ?? []);
	const random = mode === 'random';
	const useMc = paperType !== 'essay';
	const useEssay = paperType !== 'multiple_choice';
	const theoryFinal = purpose === 'final' && examPart === 'theory';
	const [blind, setBlind] = useState(!!paper?.blind_grading);
	const [graders, setGraders] = useState<Set<string>>(new Set(paper?.grader_ids ?? []));
	// Người chấm chọn trong số GV được phân công của khóa
	const [lecturers, setLecturers] = useState<{ id: string; label: string }[]>([]);
	useEffect(() => {
		getAssignments(courseId)
			.then((list) => {
				const seen = new Map<string, string>();
				for (const a of list) if (!seen.has(a.lecturer_id)) seen.set(a.lecturer_id, a.lecturer_name);
				setLecturers([...seen].map(([id, label]) => ({ id, label })));
			})
			.catch(() => {});
	}, [courseId]);
	const [questions, setQuestions] = useState<DraftQuestion[]>(
		(paper?.questions ?? []).map(toDraft),
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	// Khóa chỉ có 1 lớp (đã tự chọn) → ẩn ô chọn lớp
	const soleClass = links.length === 1 && programId === links[0].program_id;
	// Các tuỳ chọn ít đổi nằm trong modal "Cài đặt nâng cao" — tóm tắt hiện ngay dưới form
	const [showSettings, setShowSettings] = useState(false);
	const settingsSummary = [
		STATUS_LABEL[status],
		purpose === 'final' &&
			(examPart === 'theory' ? `Lý thuyết${theoryFinal && weight !== '' ? ` (${weight}% điểm LT)` : ''}` : 'Thực hành'),
		random && `${CODE_MODE_LABEL[codeMode]}${codeMode === 'codes' ? ` (${codeCount})` : ''}`,
		graders.size ? `${graders.size} người chấm` : 'GV được phân công chấm',
		blind && 'Chấm ẩn danh',
	]
		.filter(Boolean)
		.join(' · ');

	const [bank, setBank] = useState<ExamQuestion[]>([]);
	const [pickId, setPickId] = useState('');

	// Câu hỏi soạn ở Ngân hàng câu hỏi (mở tab mới) — quay lại tab này thì tải lại để thấy câu mới
	useEffect(() => {
		const reload = () =>
			examApi
				.listQuestions()
				.then(setBank)
				.catch(() => {});
		void reload();
		window.addEventListener('focus', reload);
		return () => window.removeEventListener('focus', reload);
	}, []);

	const changePaperType = (t: PaperType) => {
		setPaperType(t);
		setQuestions((prev) => prev.filter((q) => q.question_type === PAPER_QUESTION_TYPE[t]));
		setPickId('');
	};

	// Ngân hàng của lớp + kho tương ứng mục đích đề
	const ownBank = bank.filter((b) => (programId ? b.program_id === programId : true) && (b.pool ?? 'final') === purpose);
	const available = {
		mc: ownBank.filter((b) => b.question_type === 'single_choice').length,
		essay: ownBank.filter((b) => b.question_type === 'essay').length,
	};
	const bankOptions = ownBank
		.filter((b) => (!allowedType || b.question_type === allowedType) && !questions.some((q) => q.id === b.id))
		.map((b) => ({ id: b.id, name: `${b.question_text.slice(0, 60)}${b.question_text.length > 60 ? '…' : ''}` }));

	const addFromBank = () => {
		const q = bank.find((b) => b.id === pickId);
		if (!q) return;
		setQuestions((prev) => [
			...prev,
			{
				tempId: nextTempId(),
				id: q.id,
				question_type: q.question_type,
				question_text: q.question_text,
				options: q.options,
				correct_option: q.correct_option ?? '',
				points: String(q.points),
				image_url: q.image_url ?? null,
			},
		]);
		setPickId('');
	};

	const removeQuestion = (tempId: string) => setQuestions((prev) => prev.filter((q) => q.tempId !== tempId));

	// Nhập đề từ file Word/PDF: câu được lưu vào ngân hàng của lớp (đúng kho đầu vào/cuối khóa);
	// đề chọn tay thì thêm ngay các câu đó vào đề
	const [importing, setImporting] = useState(false);
	const importFromFile = async (imported: ImportedQuestion[]) => {
		const payload: QuestionPayload[] = [];
		for (const q of imported) {
			payload.push({
				question_type: q.question_type,
				question_text: q.question_text,
				options: q.options,
				correct_option: q.correctIndex != null ? q.options[q.correctIndex] : null,
				points: q.points,
				image_url: q.image ? (await examApi.uploadQuestionImage(q.image)).url : null,
				program_id: programId,
				pool: purpose,
			});
		}
		const { ids } = await examApi.createQuestionsBulk(payload);
		const fresh = await examApi.listQuestions();
		setBank(fresh);
		setImporting(false);
		// Đề ngẫu nhiên: chỉ cần câu có trong ngân hàng — lúc lưu / lúc học viên làm bài sẽ bốc từ đó
		if (random) {
			notify.success(`Đã nhập ${ids.length} câu vào ngân hàng của lớp — đề sẽ bốc ngẫu nhiên từ đây`);
			return;
		}
		const byId = new Map(fresh.map((b) => [b.id, b]));
		setQuestions((prev) => [
			...prev,
			...ids.flatMap((id) => {
				const b = byId.get(id);
				return b
					? [
							{
								tempId: nextTempId(),
								id: b.id,
								question_type: b.question_type,
								question_text: b.question_text,
								options: b.options,
								correct_option: b.correct_option ?? '',
								points: String(b.points),
								image_url: b.image_url ?? null,
							},
						]
					: [];
			}),
		]);
		notify.success(`Đã thêm ${ids.length} câu vào đề (đồng thời lưu vào ngân hàng câu hỏi của lớp)`);
	};

	const changePurpose = (p: QuestionPool) => {
		setPurpose(p);
		// Đầu vào: mặc định 1 đề gồm cả trắc nghiệm + tự luận, chỉ phần lý thuyết
		if (p === 'entrance') {
			setPaperType(null);
			setExamPart('theory');
		}
		setQuestions([]);
		setPickId('');
	};

	const handleSave = async () => {
		if (!title.trim()) {
			setError('Vui lòng nhập tên đề thi');
			return;
		}
		if (random && !programId) {
			setError('Đề ngẫu nhiên cần chọn lớp (chương trình) để lấy câu từ ngân hàng');
			return;
		}
		if (random && !((useMc ? Number(mcCount) : 0) + (useEssay ? Number(essayCount) : 0) > 0)) {
			setError('Nhập số câu cần bốc');
			return;
		}
		setSaving(true);
		setError('');
		try {
			const question_ids = questions.map((q) => q.id).filter((id): id is string => !!id);
			const payload = {
				title: title.trim(),
				paper_type: paperType,
				duration_minutes: Number(duration) || 45,
				status,
				exam_part: purpose === 'entrance' ? ('theory' as const) : examPart,
				blind_grading: blind,
				grader_ids: [...graders],
				purpose,
				program_id: programId || null,
				weight: theoryFinal && weight !== '' ? Number(weight) : null,
				gen_mc_count: random && useMc ? Number(mcCount) || 0 : null,
				gen_essay_count: random && useEssay ? Number(essayCount) || 0 : null,
				code_mode: random ? codeMode : null,
				code_count: random && codeMode === 'codes' ? Number(codeCount) || 2 : null,
				...(random ? {} : { question_ids }),
			};
			if (paper) await examApi.updatePaper(paper.id, payload);
			else await examApi.createPaper({ course_id: courseId, ...payload });
			onSaved();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Lưu đề thi thất bại');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div>
			<button
				className={styles.btnGhost}
				onClick={onCancel}
				style={{ marginBottom: 12 }}
			>
				← Huỷ, quay lại danh sách
			</button>

			<div className={styles.subToolbar}>
				<input
					className={styles.subInput}
					placeholder='Tên đề thi'
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					style={{ flex: 2 }}
				/>
				<select
					className={styles.subSelect}
					value={purpose}
					onChange={(e) => changePurpose(e.target.value as QuestionPool)}
					title='Đề đầu vào chỉ để tham khảo (so sánh với cuối khóa), không tính vào kết quả'
				>
					<option value='final'>Thi cuối khóa</option>
					<option value='entrance'>Kiểm tra đầu vào</option>
				</select>
				{!soleClass && (
					<select
						className={styles.subSelect}
						value={programId}
						onChange={(e) => {
							setProgramId(e.target.value);
							setQuestions([]);
							setPickId('');
						}}
						title='Lớp (chương trình trong khóa) — học viên lớp này làm đề, câu hỏi lấy từ ngân hàng của chương trình'
					>
						<option value=''>— Chọn lớp —</option>
						{links.map((l) => (
							<option
								key={l.program_id}
								value={l.program_id}
							>
								{l.program_code ? `${l.program_code} — ${l.program_name}` : l.program_name}
							</option>
						))}
					</select>
				)}
				<select
					className={styles.subSelect}
					value={paperType ?? ''}
					onChange={(e) => (e.target.value ? changePaperType(e.target.value as PaperType) : setPaperType(null))}
					title='Loại đề — đề trắc nghiệm / tự luận chỉ nhận câu cùng loại, đề TN + TL nhận cả hai'
				>
					<option value='multiple_choice'>Đề trắc nghiệm</option>
					<option value='essay'>Đề tự luận</option>
					<option value=''>Đề trắc nghiệm + tự luận</option>
				</select>
				<label className={styles.inlineField}>
					<input
						className={styles.subInput}
						type='number'
						min={1}
						value={duration}
						onChange={(e) => setDuration(e.target.value)}
						style={{ maxWidth: 70 }}
						aria-label='Thời gian làm bài'
					/>
					phút
				</label>
				<button
					className={styles.btnGhost}
					onClick={() => setShowSettings(true)}
					title={`Cài đặt nâng cao: ${settingsSummary}`}
				>
					<IcSettings /> Cài đặt
				</button>
			</div>

			<div className={styles.subToolbar}>
				<select
					className={styles.subSelect}
					value={mode}
					onChange={(e) => setMode(e.target.value as 'random' | 'manual')}
				>
					<option value='random'>Bốc ngẫu nhiên từ ngân hàng</option>
					<option value='manual'>Chọn câu thủ công</option>
				</select>
				{random && (
					<>
						{useMc && (
							<label className={styles.inlineField}>
								<input
									className={styles.subInput}
									type='number'
									min={0}
									value={mcCount}
									onChange={(e) => setMcCount(e.target.value)}
									style={{ maxWidth: 80 }}
								/>
								câu TN
							</label>
						)}
						{useEssay && (
							<label className={styles.inlineField}>
								<input
									className={styles.subInput}
									type='number'
									min={0}
									value={essayCount}
									onChange={(e) => setEssayCount(e.target.value)}
									style={{ maxWidth: 80 }}
								/>
								câu TL
							</label>
						)}
					</>
				)}
				<button
					className={styles.btnGhost}
					onClick={() => setImporting(true)}
					disabled={!programId}
					title={
						!programId
							? 'Chọn lớp trước — câu nhập từ file được lưu vào ngân hàng của lớp'
							: random
								? 'Đọc câu hỏi từ file .docx / .pdf vào ngân hàng của lớp — đề bốc ngẫu nhiên từ đó'
								: 'Đọc câu hỏi từ file .docx / .pdf, lưu vào ngân hàng của lớp và thêm vào đề'
					}
				>
					<IcUpload /> Nhập đề từ Word/PDF
				</button>
			</div>
			<div className={styles.hint}>Cài đặt: {settingsSummary}</div>
			{random && (
				<div className={styles.hint}>
					{programId
						? `Ngân hàng ${POOL_LABEL[purpose].toLowerCase()} của lớp: ${available.mc} câu trắc nghiệm, ${available.essay} câu tự luận. `
						: 'Chọn lớp để xem số câu trong ngân hàng. '}
					Thi lại: học viên nhận đề mới, ưu tiên câu chưa gặp.
				</div>
			)}

			{error && <div className={styles.errorBanner}>{error}</div>}

			{random ? (
				paper && wasRandom && generated.length > 0 ? (
					<div style={{ margin: '14px 0 8px' }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13 }}>
							Câu đã bốc ({generated.filter((q) => (q.code_no ?? 1) === 1).length} câu
							{paper.code_mode === 'codes' ? ` × ${paper.code_count} mã đề` : ''})
							{paper.attempt_count === 0 && (
								<button
									type='button'
									className={styles.btnGhost}
									onClick={async () => {
										try {
											const p = await examApi.updatePaper(paper.id, { title: title.trim() || paper.title, regenerate: true });
											setGenerated(p.questions ?? []);
										} catch (err) {
											setError(err instanceof Error ? err.message : 'Bốc lại thất bại');
										}
									}}
								>
									Bốc lại câu
								</button>
							)}
						</div>
						<div className={styles.subList}>
							{generated.map((q, i) => (
								<div
									key={q.link_id}
									className={styles.subRow}
								>
									<div className={styles.subRowMain}>
										<div className={styles.subRowName}>
											{q.code_no != null && `Mã ${q.code_no} · `}
											{i + 1}. <QuestionText text={q.question_text} /> ({q.points} điểm)
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				) : (
					<div className={styles.subEmpty}>
						{codeMode === 'per_trainee'
							? 'Mỗi học viên được bốc bộ câu riêng khi bắt đầu làm bài.'
							: 'Câu hỏi được bốc khi lưu đề.'}
					</div>
				)
			) : (
			<>
			<div style={{ fontWeight: 600, fontSize: 13, margin: '14px 0 8px' }}>
				Câu hỏi trong đề ({questions.length})
			</div>

			{questions.length === 0 && <div className={styles.subEmpty}>Chưa có câu hỏi nào</div>}

			<div className={styles.subList}>
				{questions.map((q, i) => (
					<div
						key={q.tempId}
						className={styles.subRow}
					>
						<div className={styles.subRowMain}>
							<div className={styles.subRowName}>
								{i + 1}. <QuestionText text={q.question_text} /> ({q.points} điểm)
							</div>
							<QuestionImageView
								url={q.image_url}
								compact
							/>
							<div style={{ fontSize: 12, color: 'var(--color-gray-500)' }}>
								{q.question_type === 'essay' ? 'Tự luận' : `Trắc nghiệm — đáp án: ${q.correct_option}`}
							</div>
						</div>
						<div
							className={styles.actionBtn}
							title='Bỏ khỏi đề'
							onClick={() => removeQuestion(q.tempId)}
						>
							<IcTrash />
						</div>
					</div>
				))}
			</div>

			<div className={styles.subToolbar}
				style={{ marginTop: 12 }}
			>
				<SearchableSelect
					options={bankOptions}
					value={pickId}
					onChange={setPickId}
					placeholder='— Chọn câu hỏi có sẵn trong ngân hàng —'
					className={styles.subInput}
				/>
				<button
					className={styles.btnGhost}
					onClick={addFromBank}
					disabled={!pickId}
				>
					<IcPlus /> Thêm vào đề
				</button>
				<a
					className={styles.btnGhost}
					href={`/admin/question-bank${programId ? `?program=${programId}&pool=${purpose}` : ''}`}
					target='_blank'
					rel='noreferrer'
					title='Soạn/nhập câu hỏi ở Ngân hàng câu hỏi, quay lại đây để chọn'
				>
					<IcPlus /> Soạn câu hỏi mới ở Ngân hàng
				</a>
			</div>
			</>
			)}

			<div style={{ marginTop: 16 }}>
				<button
					className={styles.btnConfirm}
					onClick={() => void handleSave()}
					disabled={saving}
				>
					{saving ? '...' : <IcCheck />} Lưu đề thi
				</button>
			</div>

			<Modal
				open={showSettings}
				onClose={() => setShowSettings(false)}
				title='Cài đặt nâng cao'
				icon={<IcSettings />}
				footer={<Button onClick={() => setShowSettings(false)}>Xong</Button>}
			>
				<div className={styles.formGrid2}>
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Trạng thái</label>
						<select
							className={styles.formInput}
							value={status}
							onChange={(e) => setStatus(e.target.value as PaperStatus)}
						>
							<option value='draft'>Nháp</option>
							<option value='published'>Đang mở</option>
							<option value='closed'>Đã đóng</option>
						</select>
						<span className={styles.fieldHint}>Học viên chỉ thấy đề khi "Đang mở"</span>
					</div>
					{purpose === 'final' && (
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Tính điểm vào</label>
							<select
								className={styles.formInput}
								value={examPart}
								onChange={(e) => setExamPart(e.target.value as ExamPart)}
							>
								<option value='theory'>Phần lý thuyết</option>
								<option value='practice'>Phần thực hành</option>
							</select>
							<span className={styles.fieldHint}>Điểm bài thi (quy về thang 10) đổ vào cột này của bảng điểm</span>
						</div>
					)}
					{theoryFinal && (
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Trọng số (% điểm lý thuyết)</label>
							<input
								className={styles.formInput}
								type='number'
								min={0}
								max={100}
								value={weight}
								onChange={(e) => setWeight(e.target.value)}
							/>
							<span className={styles.fieldHint}>
								Điểm LT = trung bình có trọng số các đề lý thuyết cuối khóa của lớp (vd TN 50% + TL 50%)
							</span>
						</div>
					)}
					{random && (
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Cách chia đề</label>
							<div style={{ display: 'flex', gap: 8 }}>
								<select
									className={styles.formInput}
									value={codeMode}
									onChange={(e) => setCodeMode(e.target.value as CodeMode)}
								>
									{(Object.keys(CODE_MODE_LABEL) as CodeMode[]).map((m) => (
										<option
											key={m}
											value={m}
										>
											{CODE_MODE_LABEL[m]}
										</option>
									))}
								</select>
								{codeMode === 'codes' && (
									<input
										className={styles.formInput}
										type='number'
										min={2}
										max={10}
										value={codeCount}
										onChange={(e) => setCodeCount(e.target.value)}
										style={{ maxWidth: 80 }}
										aria-label='Số mã đề'
										title='Số mã đề'
									/>
								)}
							</div>
							<span className={styles.fieldHint}>
								Mỗi học viên một đề: bốc riêng lúc bắt đầu làm. Chung đề: cả lớp cùng bộ câu, trộn thứ tự câu và
								đáp án. Nhiều mã đề: chia đều các mã cho học viên.
							</span>
						</div>
					)}
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Người chấm</label>
						<MultiSelect
							options={lecturers}
							selected={graders}
							onChange={setGraders}
							placeholder={graders.size ? `${graders.size} người chấm` : 'GV được phân công bài học'}
							searchable
						/>
						<label
							className={styles.toggleBox}
							style={{ fontSize: 13, marginTop: 6 }}
						>
							<input
								type='checkbox'
								checked={blind}
								onChange={(e) => setBlind(e.target.checked)}
							/>
							Chấm ẩn danh (ẩn tên học viên)
						</label>
					</div>
				</div>
			</Modal>

			{importing && (
				<ImportQuestionsModal
					onlyType={allowedType ?? undefined}
					onClose={() => setImporting(false)}
					onImport={importFromFile}
				/>
			)}
		</div>
	);
}

// ─── Chấm bài ────────────────────────────────────────────────────────────────
// Dùng chung: cán bộ (exams:manage) và GV ở cổng cá nhân (gradeAnswer = API /me/teaching).
export function GradingPanel({
	attempt,
	onBack,
	onGraded,
	gradeAnswer = examApi.gradeAnswer,
	backLabel = '← Quay lại danh sách bài làm',
}: {
	attempt: ExamAttemptDetail;
	onBack: () => void;
	onGraded: (updated: ExamAttemptDetail) => void;
	gradeAnswer?: (attemptId: string, questionId: string, score: number) => Promise<ExamAttemptDetail>;
	backLabel?: string;
}) {
	const [scores, setScores] = useState<Record<string, string>>(
		Object.fromEntries(attempt.answers.map((a) => [a.question_id, a.score_awarded != null ? String(a.score_awarded) : ''])),
	);
	const [saving, setSaving] = useState<string | null>(null);

	const handleGrade = async (questionId: string) => {
		const val = Number(scores[questionId]);
		if (Number.isNaN(val)) return;
		setSaving(questionId);
		try {
			const updated = await gradeAnswer(attempt.id, questionId, val);
			onGraded(updated);
		} finally {
			setSaving(null);
		}
	};

	return (
		<div>
			<button
				className={styles.btnGhost}
				onClick={onBack}
				style={{ marginBottom: 12 }}
			>
				{backLabel}
			</button>
			<div style={{ fontWeight: 700, marginBottom: 4 }}>{attempt.trainee_name ?? `Bài ${attempt.id}`}</div>
			<div style={{ fontSize: 12, color: 'var(--color-gray-500)', marginBottom: 12 }}>
				{attempt.paper_title} · {ATTEMPT_STATUS_LABEL[attempt.status]}
				{attempt.manual_score != null && ` · Tổng điểm: ${attempt.manual_score}`}
			</div>

			<div className={styles.subList}>
				{attempt.answers.map((a, i) => (
					<div
						key={a.id}
						className={styles.subRow}
						style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}
					>
						<div className={styles.subRowName}>
							{i + 1}. <QuestionText text={a.question_text} /> ({a.points} điểm)
						</div>
						<QuestionImageView url={a.image_url} />
						{a.question_type === 'single_choice' ? (
							<div style={{ fontSize: 13 }}>
								Học viên chọn: <strong>{a.selected_option ?? '—'}</strong> · Đáp án đúng:{' '}
								<strong>{a.correct_option}</strong> ·{' '}
								<span style={{ color: a.score_awarded ? '#0a9b4a' : '#e24b4a' }}>
									{a.score_awarded ?? 0} điểm (tự động)
								</span>
							</div>
						) : (
							<>
								<div className={styles.descBox}>{a.essay_text || '(Không trả lời)'}</div>
								<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
									<input
										className={styles.subInput}
										type='number'
										min={0}
										max={a.points}
										step={0.5}
										placeholder='Điểm'
										value={scores[a.question_id] ?? ''}
										onChange={(e) => setScores((s) => ({ ...s, [a.question_id]: e.target.value }))}
										style={{ maxWidth: 100 }}
									/>
									<button
										className={styles.btnGhost}
										disabled={saving === a.question_id || scores[a.question_id] === ''}
										onClick={() => void handleGrade(a.question_id)}
									>
										{a.score_awarded != null ? 'Sửa điểm' : 'Chấm điểm'}
									</button>
									{a.score_awarded != null && (
										<span style={{ fontSize: 12, color: '#0a9b4a' }}>Đã chấm: {a.score_awarded}</span>
									)}
								</div>
							</>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
