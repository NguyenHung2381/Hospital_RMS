import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EditSvg as IcEdit, PlusSvg as IcPlus, TrashSvg as IcTrash } from '@/assets/icons';
import { examApi } from '../../exam/api/examApi';
import type {
	AttemptStatus,
	ExamAttemptDetail,
	ExamAttemptSummary,
	ExamPaper,
	PaperStatus,
	PaperType,
} from '../../exam/types/exam.type';
import { CODE_MODE_LABEL, EXAM_PART_LABEL, POOL_LABEL } from '../../exam/types/exam.type';
import { Button, QuestionImageView, QuestionText } from '../../../shared/components';
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

type View = 'list' | 'attempts' | 'grading';

/** `programId`: đang làm việc trong 1 chương trình — chỉ hiện đề của lớp đó + đề chung cả khóa; đề mới chọn sẵn lớp. */
export function ExamsTab({ courseId, programId }: { courseId: string; programId?: string }) {
	const [view, setView] = useState<View>('list');
	const [papers, setPapers] = useState<ExamPaper[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	const navigate = useNavigate();
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

	// Tạo / sửa đề ở trang riêng; ?program= giữ lớp đang làm việc để quay lại đúng chỗ
	const programQs = programId ? `?program=${programId}` : '';
	const openBuilder = (paper: ExamPaper | null) =>
		navigate(`/admin/courses/${courseId}/exams/${paper ? `${paper.id}/edit` : 'new'}${programQs}`);

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

	const shownPapers = programId ? papers.filter((p) => !p.program_id || p.program_id === programId) : papers;

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
				<Button
					icon={<IcPlus />}
					onClick={() => openBuilder(null)}
				>
					Tạo đề thi mới
				</Button>
			</div>
			{error && <div className={styles.errorBanner}>{error}</div>}
			{loading ? (
				<div className={styles.subEmpty}>Đang tải...</div>
			) : shownPapers.length === 0 ? (
				<div className={styles.subEmpty}>Chưa có đề thi nào cho {programId ? 'chương trình' : 'khóa học'} này.</div>
			) : (
				<div className={styles.subList}>
					{shownPapers.map((p) => (
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
									onClick={() => openBuilder(p)}
								>
									<IcEdit /> Sửa
								</button>
								<div
									className={styles.actionBtn}
									title='Xóa đề thi'
									onClick={async () => {
										if (!confirm(`Xóa đề thi "${p.title}"?`)) return;
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
