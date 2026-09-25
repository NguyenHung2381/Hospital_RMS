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
	QuestionType,
} from '../../exam/types/exam.type';
import { SearchableSelect } from '../../../shared/components/Input/SearchableSelect';
import styles from '../pages/Courses.module.css';

const STATUS_LABEL: Record<PaperStatus, string> = {
	draft: 'Nháp',
	published: 'Đang mở',
	closed: 'Đã đóng',
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

	const openBuilder = (paper: ExamPaper | null) => {
		setEditingPaper(paper);
		setView('builder');
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
					onClick={() => openBuilder(null)}
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
									{STATUS_LABEL[p.status]} · {p.question_count} câu · {p.duration_minutes} phút ·{' '}
									{p.attempt_count} lượt làm
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
									onClick={() => openBuilder(p)}
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
	const [questions, setQuestions] = useState<DraftQuestion[]>(
		(paper?.questions ?? []).map(toDraft),
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	const [bank, setBank] = useState<ExamQuestion[]>([]);
	const [pickId, setPickId] = useState('');
	const [showNewForm, setShowNewForm] = useState(false);
	const [newQ, setNewQ] = useState<DraftQuestion>({
		tempId: '',
		question_type: 'single_choice',
		question_text: '',
		options: [''],
		correct_option: '',
		points: '1',
	});

	useEffect(() => {
		examApi
			.listQuestions()
			.then(setBank)
			.catch(() => {});
	}, []);

	const bankOptions = bank
		.filter((b) => !questions.some((q) => q.id === b.id))
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
			},
		]);
		setPickId('');
	};

	const addNewQuestion = async () => {
		if (!newQ.question_text.trim()) return;
		try {
			const created = await examApi.createQuestion({
				question_type: newQ.question_type,
				question_text: newQ.question_text.trim(),
				options: newQ.question_type === 'single_choice' ? newQ.options.filter((o) => o.trim()) : [],
				correct_option: newQ.question_type === 'single_choice' ? newQ.correct_option || null : null,
				points: Number(newQ.points) || 1,
			});
			setQuestions((prev) => [...prev, toDraft({ ...created, link_id: created.id, sort_order: 0 })]);
			setBank((prev) => [created, ...prev]);
			setNewQ({ tempId: '', question_type: 'single_choice', question_text: '', options: [''], correct_option: '', points: '1' });
			setShowNewForm(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Tạo câu hỏi thất bại');
		}
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
			if (paper) {
				await examApi.updatePaper(paper.id, {
					title: title.trim(),
					duration_minutes: Number(duration) || 45,
					status,
					question_ids,
				});
			} else {
				await examApi.createPaper({
					course_id: courseId,
					title: title.trim(),
					duration_minutes: Number(duration) || 45,
					status,
					question_ids,
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
								{i + 1}. {q.question_text} ({q.points} điểm)
							</div>
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
				<button
					className={styles.btnGhost}
					onClick={() => setShowNewForm((v) => !v)}
				>
					<IcPlus /> Tạo câu hỏi mới
				</button>
			</div>

			{showNewForm && (
				<div
					className={styles.subRow}
					style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, marginTop: 8 }}
				>
					<div className={styles.subToolbar}>
						<select
							className={styles.subSelect}
							value={newQ.question_type}
							onChange={(e) =>
								setNewQ((f) => ({ ...f, question_type: e.target.value as QuestionType }))
							}
						>
							<option value='single_choice'>Chọn 1 đáp án</option>
							<option value='essay'>Tự luận</option>
						</select>
						<input
							className={styles.subInput}
							type='number'
							min={0.1}
							step={0.5}
							placeholder='Điểm'
							value={newQ.points}
							onChange={(e) => setNewQ((f) => ({ ...f, points: e.target.value }))}
							style={{ maxWidth: 100 }}
						/>
					</div>
					<textarea
						className={styles.subInput}
						placeholder='Nội dung câu hỏi'
						value={newQ.question_text}
						onChange={(e) => setNewQ((f) => ({ ...f, question_text: e.target.value }))}
						rows={2}
					/>
					{newQ.question_type === 'single_choice' && (
						<>
							{newQ.options.map((opt, oi) => (
								<div
									key={oi}
									style={{ display: 'flex', gap: 6, alignItems: 'center' }}
								>
									<input
										type='radio'
										name='new-correct'
										checked={newQ.correct_option === opt && opt !== ''}
										onChange={() => setNewQ((f) => ({ ...f, correct_option: opt }))}
									/>
									<input
										className={styles.subInput}
										placeholder={`Lựa chọn ${oi + 1}`}
										value={opt}
										onChange={(e) =>
											setNewQ((f) => {
												const options = [...f.options];
												const prevVal = options[oi];
												options[oi] = e.target.value;
												return {
													...f,
													options,
													correct_option: f.correct_option === prevVal ? e.target.value : f.correct_option,
												};
											})
										}
									/>
									<div
										className={styles.actionBtn}
										onClick={() => setNewQ((f) => ({ ...f, options: f.options.filter((_, i2) => i2 !== oi) }))}
									>
										<IcTrash />
									</div>
								</div>
							))}
							<button
								className={styles.btnGhost}
								onClick={() => setNewQ((f) => ({ ...f, options: [...f.options, ''] }))}
							>
								+ Thêm lựa chọn
							</button>
						</>
					)}
					<button
						className={styles.btnGhost}
						onClick={() => void addNewQuestion()}
						disabled={!newQ.question_text.trim()}
					>
						<IcCheck /> Tạo & thêm vào đề
					</button>
				</div>
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
		</div>
	);
}

// ─── Chấm bài ────────────────────────────────────────────────────────────────
function GradingPanel({
	attempt,
	onBack,
	onGraded,
}: {
	attempt: ExamAttemptDetail;
	onBack: () => void;
	onGraded: (updated: ExamAttemptDetail) => void;
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
			const updated = await examApi.gradeAnswer(attempt.id, questionId, val);
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
				← Quay lại danh sách bài làm
			</button>
			<div style={{ fontWeight: 700, marginBottom: 4 }}>{attempt.trainee_name}</div>
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
							{i + 1}. {a.question_text} ({a.points} điểm)
						</div>
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
