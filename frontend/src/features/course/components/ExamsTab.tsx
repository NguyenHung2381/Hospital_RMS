import { useEffect, useState } from 'react';
import { CheckSvg as IcCheck, PlusSvg as IcPlus, TrashSvg as IcTrash } from '@/assets/icons';
import { examApi } from '../../exam/api/examApi';
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
import { EXAM_PART_LABEL, PAPER_QUESTION_TYPE, type ExamPart } from '../../exam/types/exam.type';
import { getAssignments } from '../api/courseApi';
import { MultiSelect } from '../../../shared/components/Input/MultiSelect';
import { SearchableSelect } from '../../../shared/components/Input/SearchableSelect';
import { QuestionImageView, QuestionText } from '../../../shared/components';
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
										{ATTEMPT_STATUS_LABEL[a.status]}
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
									{EXAM_PART_LABEL[p.exam_part] ?? 'Lý thuyết'} ·{' '}
									{p.paper_type ? PAPER_TYPE_LABEL[p.paper_type] : 'Hỗn hợp'} · {STATUS_LABEL[p.status]} ·{' '}
									{p.question_count} câu · {p.duration_minutes} phút ·{' '}
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
	// null chỉ xảy ra với đề cũ (hỗn hợp) — đề mới luôn chọn 1 loại
	const [paperType, setPaperType] = useState<PaperType | null>(paper ? paper.paper_type : 'multiple_choice');
	const allowedType = paperType ? PAPER_QUESTION_TYPE[paperType] : null;
	const [examPart, setExamPart] = useState<ExamPart>(paper?.exam_part ?? 'theory');
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

	const bankOptions = bank
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

	const handleSave = async () => {
		if (!title.trim()) {
			setError('Vui lòng nhập tên đề thi');
			return;
		}
		setSaving(true);
		setError('');
		try {
			const question_ids = questions.map((q) => q.id).filter((id): id is string => !!id);
			const paper_type = paperType ?? undefined;
			if (paper) {
				await examApi.updatePaper(paper.id, {
					title: title.trim(),
					paper_type,
					duration_minutes: Number(duration) || 45,
					status,
					question_ids,
					exam_part: examPart,
					blind_grading: blind,
					grader_ids: [...graders],
				});
			} else {
				await examApi.createPaper({
					course_id: courseId,
					title: title.trim(),
					paper_type,
					duration_minutes: Number(duration) || 45,
					status,
					question_ids,
					exam_part: examPart,
					blind_grading: blind,
					grader_ids: [...graders],
				});
			}
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
					value={paperType ?? ''}
					onChange={(e) => changePaperType(e.target.value as PaperType)}
					title='Loại đề — chỉ nhận câu hỏi cùng loại'
				>
					{!paperType && (
						<option
							value=''
							disabled
						>
							Hỗn hợp (đề cũ)
						</option>
					)}
					<option value='multiple_choice'>Đề trắc nghiệm</option>
					<option value='essay'>Đề tự luận</option>
				</select>
				<input
					className={styles.subInput}
					type='number'
					min={1}
					placeholder='Thời gian (phút)'
					value={duration}
					onChange={(e) => setDuration(e.target.value)}
					style={{ maxWidth: 140 }}
				/>
				<select
					className={styles.subSelect}
					value={status}
					onChange={(e) => setStatus(e.target.value as PaperStatus)}
				>
					<option value='draft'>Nháp</option>
					<option value='published'>Đang mở</option>
					<option value='closed'>Đã đóng</option>
				</select>
			</div>
			<div className={styles.subToolbar}>
				<select
					className={styles.subSelect}
					value={examPart}
					onChange={(e) => setExamPart(e.target.value as ExamPart)}
					title='Điểm bài thi (quy về thang 10) đổ vào cột này của bảng điểm'
				>
					<option value='theory'>Phần lý thuyết</option>
					<option value='practice'>Phần thực hành</option>
				</select>
				<MultiSelect
					options={lecturers}
					selected={graders}
					onChange={setGraders}
					placeholder={graders.size ? `${graders.size} người chấm` : 'Người chấm: GV được phân công bài học'}
					searchable
				/>
				<label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
					<input
						type='checkbox'
						checked={blind}
						onChange={(e) => setBlind(e.target.checked)}
					/>
					Chấm ẩn danh (ẩn tên học viên)
				</label>
			</div>

			{error && <div className={styles.errorBanner}>{error}</div>}

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
					href='/admin/question-bank'
					target='_blank'
					rel='noreferrer'
					title='Soạn/nhập câu hỏi ở Ngân hàng câu hỏi, quay lại đây để chọn'
				>
					<IcPlus /> Soạn câu hỏi mới ở Ngân hàng
				</a>
			</div>

			<div style={{ marginTop: 16 }}>
				<button
					className={styles.btnConfirm}
					onClick={() => void handleSave()}
					disabled={saving}
				>
					{saving ? '...' : <IcCheck />} Lưu đề thi
				</button>
			</div>
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
