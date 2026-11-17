import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
	AlertSvg,
	CheckCircleSvg,
	ChevDSvg,
	ChevLSvg,
	DocPlusSvg,
	EyeSvg,
	LayersSvg,
	LinkSvg,
	RefreshSvg,
	TrashSvg,
	UploadSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { Button, InlineLoading, Modal, QuestionImageView, QuestionText } from '../../../shared/components';
import { MultiSelect } from '../../../shared/components/Input/MultiSelect';
import { notify } from '../../../shared/utils/feedback';
import { getAssignments, getCourse, getProgramLinks } from '../../course/api/courseApi';
import { TRAINING_TYPE, type Course, type CourseProgramLink } from '../../course/types/course.type';
import { examApi, type PaperPayload, type QuestionPayload } from '../api/examApi';
import { BankPickerModal } from '../components/BankPickerModal';
import { ExamPreviewModal } from '../components/ExamPreviewModal';
import { ImportQuestionsModal, type ImportedQuestion } from '../components/ImportQuestionsModal';
import { QuestionFormModal } from '../components/QuestionFormModal';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import {
	CODE_MODE_LABEL,
	PAPER_QUESTION_TYPE,
	POOL_LABEL,
	type CodeMode,
	type ExamPart,
	type ExamPaper,
	type ExamQuestion,
	type PaperStatus,
	type PaperType,
	type QuestionPool,
} from '../types/exam.type';
import { QUESTION_TYPE_SHORT, fmtPoints, sample, tally } from '../utils/examBuilder';
import styles from './ExamBuilder.module.css';

// ─── Trạng thái form ─────────────────────────────────────────────────────────
type Mode = 'manual' | 'random';
/** Dạng đề: trắc nghiệm / tự luận / hỗn hợp (paper_type null) */
type PaperKind = PaperType | 'mixed';

interface Form {
	title: string;
	purpose: QuestionPool;
	programId: string;
	kind: PaperKind;
	duration: string;
	examPart: ExamPart;
	weight: string;
	status: PaperStatus;
	mode: Mode;
	mcCount: string;
	essayCount: string;
	codeMode: CodeMode;
	codeCount: string;
	graders: string[];
	blind: boolean;
	/** Đề chọn câu cụ thể: câu theo đúng thứ tự trong đề */
	questions: ExamQuestion[];
}

const STATUS_LABEL: Record<PaperStatus, string> = { draft: 'Nháp', published: 'Đang mở', closed: 'Đã đóng' };
const isRandomPaper = (p: ExamPaper) => (p.gen_mc_count ?? 0) + (p.gen_essay_count ?? 0) > 0;

function formFromPaper(p: ExamPaper | null, defaultProgramId: string): Form {
	const random = !p || isRandomPaper(p);
	return {
		title: p?.title ?? '',
		purpose: p?.purpose ?? 'final',
		programId: p ? (p.program_id ?? '') : defaultProgramId,
		kind: p ? (p.paper_type ?? 'mixed') : 'multiple_choice',
		duration: String(p?.duration_minutes ?? 45),
		examPart: p?.exam_part ?? 'theory',
		weight: p ? (p.weight != null ? String(p.weight) : '') : '50',
		status: p?.status ?? 'draft',
		mode: random ? 'random' : 'manual',
		mcCount: String(p?.gen_mc_count ?? 20),
		essayCount: String(p?.gen_essay_count ?? 2),
		codeMode: p?.code_mode ?? 'per_trainee',
		codeCount: String(p?.code_count ?? 2),
		graders: p?.grader_ids ?? [],
		blind: !!p?.blind_grading,
		questions: random ? [] : (p?.questions ?? []),
	};
}

/** Chuỗi so sánh để biết còn thay đổi chưa lưu */
const snapshot = (f: Form) =>
	JSON.stringify({
		...f,
		title: f.title.trim(),
		graders: [...f.graders].sort(),
		questions: f.mode === 'manual' ? f.questions.map((q) => q.id) : [],
		mcCount: f.mode === 'random' ? f.mcCount : '',
		essayCount: f.mode === 'random' ? f.essayCount : '',
	});

interface Issue {
	level: 'error' | 'warn';
	text: string;
}

/** Trang tạo / sửa đề thi của khóa học:
 *  /admin/courses/:id/exams/new  và  /admin/courses/:id/exams/:examId/edit  (?program= lớp đang làm việc). */
export default function ExamBuilder() {
	const { id: courseId = '', examId } = useParams();
	const [params] = useSearchParams();
	const programParam = params.get('program') ?? '';
	const navigate = useNavigate();
	const backUrl = `/admin/courses/${courseId}?tab=exams${programParam ? `&program=${programParam}` : ''}`;

	const [course, setCourse] = useState<Course | null>(null);
	const [links, setLinks] = useState<CourseProgramLink[]>([]);
	const [lecturers, setLecturers] = useState<{ id: string; label: string }[]>([]);
	const [paper, setPaper] = useState<ExamPaper | null>(null);
	const [form, setForm] = useState<Form | null>(null);
	const [savedSnap, setSavedSnap] = useState('');
	const [loadError, setLoadError] = useState('');
	const [error, setError] = useState('');
	const [saving, setSaving] = useState<'draft' | 'save' | null>(null);

	// ── Tải khóa học, lớp, đề ──
	useEffect(() => {
		let alive = true;
		void (async () => {
			try {
				const [c, l, p] = await Promise.all([
					getCourse(courseId),
					getProgramLinks(courseId).catch(() => [] as CourseProgramLink[]),
					examId ? examApi.getPaper(examId) : Promise.resolve(null),
				]);
				if (!alive) return;
				const def = l.some((x) => x.program_id === programParam)
					? programParam
					: l.length === 1
						? l[0].program_id
						: '';
				const f = formFromPaper(p, def);
				setCourse(c);
				setLinks(l);
				setPaper(p);
				setForm(f);
				setSavedSnap(snapshot(f));
			} catch {
				if (alive) setLoadError(examId ? 'Không tải được đề thi' : 'Không tải được khóa học');
			}
		})();
		return () => {
			alive = false;
		};
	}, [courseId, examId, programParam]);

	// Người chấm chọn trong số GV được phân công của khóa
	useEffect(() => {
		getAssignments(courseId)
			.then((list) => {
				const seen = new Map<string, string>();
				for (const a of list) if (!seen.has(a.lecturer_id)) seen.set(a.lecturer_id, a.lecturer_name);
				setLecturers([...seen].map(([id, label]) => ({ id, label })));
			})
			.catch(() => {});
	}, [courseId]);

	// ── Ngân hàng câu hỏi của lớp + kho (đầu vào / cuối khóa) ──
	const purpose = form?.purpose;
	const programId = form?.programId ?? '';
	const [bank, setBank] = useState<ExamQuestion[]>([]);
	const reloadBank = useCallback(async () => {
		if (!purpose) return [];
		try {
			const list = await examApi.listQuestions({ program_id: programId || undefined, pool: purpose });
			setBank(list);
			return list;
		} catch {
			return [];
		}
	}, [purpose, programId]);
	useEffect(() => {
		if (!purpose) return;
		const load = () =>
			examApi
				.listQuestions({ program_id: programId || undefined, pool: purpose })
				.then(setBank)
				.catch(() => {});
		void load();
		// Soạn câu ở Ngân hàng câu hỏi (tab khác) — quay lại tab này thì tải lại
		window.addEventListener('focus', load);
		return () => window.removeEventListener('focus', load);
	}, [purpose, programId]);

	const dirty = !!form && snapshot(form) !== savedSnap;
	const { blocker, allowNextNavigation } = useUnsavedChangesGuard(dirty);

	// ── Hộp thoại ──
	const [picking, setPicking] = useState(false);
	const [importing, setImporting] = useState(false);
	const [composing, setComposing] = useState(false);
	const [composeBusy, setComposeBusy] = useState(false);
	const [preview, setPreview] = useState<{ questions: ExamQuestion[]; note?: string; resample: boolean } | null>(
		null,
	);
	const [dragIdx, setDragIdx] = useState<number | null>(null);
	// Thanh nổi (tổng câu / điểm + Lưu) hiện khi đầu trang đã cuộn khuất — layout chung không cho
	// position: sticky hoạt động (khung nội dung overflow-x: hidden) nên dùng position: fixed.
	const headerRef = useRef<HTMLElement>(null);
	const [headerVisible, setHeaderVisible] = useState(true);
	const loaded = !!form;
	useEffect(() => {
		const el = headerRef.current;
		if (!loaded || !el) return;
		const io = new IntersectionObserver(([e]) => setHeaderVisible(e.isIntersecting));
		io.observe(el);
		return () => io.disconnect();
	}, [loaded]);
	const [overIdx, setOverIdx] = useState<number | null>(null);

	if (loadError) {
		return (
			<AdminLayout pageTitle='Không tải được'>
				<Link
					className={styles.crumbLink}
					to={backUrl}
				>
					<ChevLSvg /> Quay lại khóa học
				</Link>
				<div className={styles.errorBanner}>{loadError}</div>
			</AdminLayout>
		);
	}
	if (!form) {
		return (
			<AdminLayout breadcrumbs={[{ label: 'Đào tạo' }]}>
				<InlineLoading />
			</AdminLayout>
		);
	}

	// ── Suy ra từ form ──
	const update = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));
	const paperType: PaperType | null = form.kind === 'mixed' ? null : form.kind;
	const allowedType = paperType ? PAPER_QUESTION_TYPE[paperType] : null;
	const random = form.mode === 'random';
	const useMc = form.kind !== 'essay';
	const useEssay = form.kind !== 'multiple_choice';
	const theoryFinal = form.purpose === 'final' && form.examPart === 'theory';
	const needsClass = links.length > 0 && !form.programId;
	const soleClass = links.length === 1 && form.programId === links[0].program_id;
	const selectedLink = links.find((l) => l.program_id === form.programId);
	const classLabel = (l: CourseProgramLink) => (l.program_code ? `${l.program_code} — ${l.program_name}` : l.program_name);
	const bankLabel = `Ngân hàng ${POOL_LABEL[form.purpose].toLowerCase()}${selectedLink ? ` · ${classLabel(selectedLink)}` : ''}`;
	const bankMc = bank.filter((b) => b.question_type === 'single_choice');
	const bankEssay = bank.filter((b) => b.question_type === 'essay');
	const mcNeed = random && useMc ? Number(form.mcCount) || 0 : 0;
	const essayNeed = random && useEssay ? Number(form.essayCount) || 0 : 0;
	const attempts = paper?.attempt_count ?? 0;
	// Đề chung / nhiều mã đã bốc sẵn câu khi lưu
	const generated = paper && isRandomPaper(paper) ? (paper.questions ?? []) : [];

	// Tổng câu / điểm (đề ngẫu nhiên: ước theo điểm trung bình của ngân hàng)
	const avg = (list: ExamQuestion[]) => (list.length ? list.reduce((s, q) => s + Number(q.points), 0) / list.length : 1);
	const uniform = (list: ExamQuestion[]) => new Set(list.map((q) => Number(q.points))).size <= 1;
	const summary = random
		? {
				count: mcNeed + essayNeed,
				mc: mcNeed,
				essay: essayNeed,
				mcPoints: mcNeed * avg(bankMc),
				essayPoints: essayNeed * avg(bankEssay),
				points: mcNeed * avg(bankMc) + essayNeed * avg(bankEssay),
				approx: !(uniform(bankMc) && uniform(bankEssay)),
			}
		: { ...tally(form.questions), approx: false };

	const issues: Issue[] = [];
	if (!form.title.trim()) issues.push({ level: 'error', text: 'Chưa nhập tên đề' });
	if (!(Number(form.duration) > 0)) issues.push({ level: 'error', text: 'Thời gian làm bài phải lớn hơn 0' });
	if (random) {
		if (!form.programId) issues.push({ level: 'error', text: 'Đề bốc ngẫu nhiên cần chọn lớp (lấy ngân hàng của lớp)' });
		if (mcNeed + essayNeed <= 0) issues.push({ level: 'error', text: 'Nhập số câu cần bốc' });
		if (form.programId && mcNeed > bankMc.length)
			issues.push({ level: 'error', text: `Ngân hàng mới có ${bankMc.length}/${mcNeed} câu trắc nghiệm` });
		if (form.programId && essayNeed > bankEssay.length)
			issues.push({ level: 'error', text: `Ngân hàng mới có ${bankEssay.length}/${essayNeed} câu tự luận` });
	} else if (!form.questions.length) issues.push({ level: 'warn', text: 'Đề chưa có câu hỏi nào' });
	if (theoryFinal && form.weight !== '' && !(Number(form.weight) >= 0 && Number(form.weight) <= 100))
		issues.push({ level: 'error', text: 'Trọng số phải trong khoảng 0–100%' });
	if (attempts > 0)
		issues.push({
			level: 'warn',
			text: `Đề đã có ${attempts} lượt làm — không đổi được cách ra đề / bốc lại câu`,
		});
	const blocking = issues.filter((i) => i.level === 'error');

	// ── Thao tác câu hỏi (đề chọn câu cụ thể) ──
	const addQuestions = (qs: ExamQuestion[]) =>
		setForm((f) => {
			if (!f) return f;
			const have = new Set(f.questions.map((q) => q.id));
			return { ...f, questions: [...f.questions, ...qs.filter((q) => !have.has(q.id))] };
		});
	const removeQuestion = (id: string) =>
		setForm((f) => (f ? { ...f, questions: f.questions.filter((q) => q.id !== id) } : f));
	const moveQuestion = (from: number, to: number) =>
		setForm((f) => {
			if (!f || from === to || to < 0 || to >= f.questions.length) return f;
			const next = [...f.questions];
			const [item] = next.splice(from, 1);
			next.splice(to, 0, item);
			return { ...f, questions: next };
		});

	// Đổi kho / lớp ⇒ câu đã chọn thuộc ngân hàng khác, phải bỏ
	const changeScope = (patch: Partial<Form>) => {
		if (form.questions.length && !confirm('Đổi loại đề / lớp sẽ bỏ các câu đã chọn trong đề. Tiếp tục?')) return;
		update({ ...patch, questions: [] });
	};
	const changePurpose = (p: QuestionPool) =>
		// Đầu vào: mặc định 1 đề gồm cả trắc nghiệm + tự luận, chỉ phần lý thuyết
		changeScope(p === 'entrance' ? { purpose: p, kind: 'mixed', examPart: 'theory' } : { purpose: p });
	const changeKind = (kind: PaperKind) => {
		const t = kind === 'mixed' ? null : PAPER_QUESTION_TYPE[kind];
		const keep = t ? form.questions.filter((q) => q.question_type === t) : form.questions;
		const dropped = form.questions.length - keep.length;
		if (dropped && !confirm(`Đổi dạng đề sẽ bỏ ${dropped} câu khác loại khỏi đề. Tiếp tục?`)) return;
		update({ kind, questions: keep });
	};

	// Nhập đề từ Word/PDF: câu lưu vào ngân hàng của lớp; đề chọn câu cụ thể thì thêm luôn vào đề
	const importFromFile = async (imported: ImportedQuestion[]) => {
		const payload: QuestionPayload[] = [];
		for (const q of imported) {
			payload.push({
				question_type: q.question_type,
				question_text: q.question_text,
				options: q.options,
				correct_option: q.correctIndex != null ? q.options[q.correctIndex] : null,
				points: q.points ?? 1,
				image_url: q.image ? (await examApi.uploadQuestionImage(q.image)).url : null,
				program_id: form.programId || null,
				pool: form.purpose,
			});
		}
		const { ids } = await examApi.createQuestionsBulk(payload);
		const fresh = await reloadBank();
		setImporting(false);
		if (random) {
			notify.success(`Đã nhập ${ids.length} câu vào ngân hàng của lớp — đề sẽ bốc ngẫu nhiên từ đây`);
			return;
		}
		const byId = new Map(fresh.map((b) => [b.id, b]));
		addQuestions(ids.flatMap((id) => byId.get(id) ?? []));
		notify.success(`Đã thêm ${ids.length} câu vào đề (đồng thời lưu vào ngân hàng của lớp)`);
	};

	// Soạn câu mới: lưu vào ngân hàng của lớp rồi thêm vào đề
	const composeQuestion = async (p: QuestionPayload) => {
		setComposeBusy(true);
		try {
			const q = await examApi.createQuestion({ ...p, program_id: form.programId || null, pool: form.purpose });
			addQuestions([q]);
			setComposing(false);
			void reloadBank();
			notify.success('Đã thêm câu hỏi vào đề và ngân hàng của lớp');
		} catch (err) {
			notify.error(err instanceof Error ? err.message : 'Không lưu được câu hỏi');
		} finally {
			setComposeBusy(false);
		}
	};

	const sampleRandom = () => [...sample(bankMc, mcNeed), ...sample(bankEssay, essayNeed)];
	const openPreview = () => {
		if (!random) return setPreview({ questions: form.questions, resample: false });
		if (generated.length && form.codeMode !== 'per_trainee')
			return setPreview({
				questions: generated.filter((q) => (q.code_no ?? 1) === 1),
				note:
					paper?.code_mode === 'codes'
						? `Mã đề 1 / ${paper.code_count}. Thứ tự câu và phương án được trộn riêng cho từng học viên.`
						: 'Bộ câu đã bốc khi lưu đề. Thứ tự câu và phương án được trộn riêng cho từng học viên.',
				resample: false,
			});
		setPreview({
			questions: sampleRandom(),
			note: 'Đề mẫu bốc thử từ ngân hàng — bộ câu thật được bốc khi lưu đề / khi học viên bắt đầu làm.',
			resample: true,
		});
	};

	const regenerate = async () => {
		if (!paper || !confirm('Bốc lại toàn bộ câu hỏi của đề từ ngân hàng?')) return;
		try {
			setPaper(await examApi.updatePaper(paper.id, { title: paper.title, regenerate: true }));
			notify.success('Đã bốc lại câu hỏi');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Bốc lại thất bại');
		}
	};

	// ── Lưu ──
	const save = async (asDraft: boolean) => {
		if (blocking.length) {
			setError(blocking[0].text);
			return;
		}
		setError('');
		setSaving(asDraft ? 'draft' : 'save');
		const status: PaperStatus = asDraft ? 'draft' : form.status;
		const payload: PaperPayload = {
			title: form.title.trim(),
			paper_type: paperType,
			duration_minutes: Number(form.duration) || 45,
			status,
			exam_part: form.purpose === 'entrance' ? 'theory' : form.examPart,
			blind_grading: form.blind,
			grader_ids: form.graders,
			purpose: form.purpose,
			program_id: form.programId || null,
			weight: theoryFinal && form.weight !== '' ? Number(form.weight) : null,
			gen_mc_count: random && useMc ? Number(form.mcCount) || 0 : null,
			gen_essay_count: random && useEssay ? Number(form.essayCount) || 0 : null,
			code_mode: random ? form.codeMode : null,
			code_count: random && form.codeMode === 'codes' ? Number(form.codeCount) || 2 : null,
			...(random ? {} : { question_ids: form.questions.map((q) => q.id) }),
		};
		try {
			const saved = examId
				? await examApi.updatePaper(examId, payload)
				: await examApi.createPaper({ course_id: courseId, ...payload });
			const next = { ...form, status };
			setPaper(saved);
			setForm(next);
			setSavedSnap(snapshot(next));
			allowNextNavigation();
			if (asDraft) {
				notify.success('Đã lưu nháp — học viên chưa thấy đề');
				if (!examId)
					navigate(`/admin/courses/${courseId}/exams/${saved.id}/edit${programParam ? `?program=${programParam}` : ''}`, {
						replace: true,
					});
			} else {
				notify.success(examId ? 'Đã lưu đề thi' : 'Đã tạo đề thi');
				navigate(backUrl);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Lưu đề thi thất bại');
		} finally {
			setSaving(null);
		}
	};

	const menuKey = course?.training_type_id === TRAINING_TYPE.CTCV ? 'ctcv' : 'dtlt';
	const heading = form.title.trim() || (examId ? 'Đề thi' : 'Đề thi mới');

	return (
		<AdminLayout
			breadcrumbs={[{ label: 'Đào tạo' }, { label: course?.name ?? 'Khóa học' }]}
			activeKey={menuKey}
		>
			<div className={styles.page}>
				{/* ── Đầu trang: breadcrumb, tên đề, thao tác ── */}
				<header
					ref={headerRef}
					className={styles.header}
				>
					<nav
						className={styles.crumbs}
						aria-label='Đường dẫn'
					>
						<Link
							className={styles.crumbLink}
							to={backUrl}
						>
							<ChevLSvg /> {course?.name ?? 'Khóa học'}
						</Link>
						<span className={styles.crumbSep}>/</span>
						<Link
							className={styles.crumbLink}
							to={backUrl}
						>
							Thi & kiểm tra
						</Link>
						<span className={styles.crumbSep}>/</span>
						<span>{examId ? 'Sửa đề' : 'Tạo đề'}</span>
					</nav>
					<div className={styles.headerMain}>
						<div className={styles.headerTitle}>
							<h1 title={heading}>{heading}</h1>
							<span
								className={styles.statusPill}
								data-status={form.status}
							>
								{STATUS_LABEL[form.status]}
							</span>
							{dirty && <span className={styles.dirtyTag}>Chưa lưu</span>}
						</div>
						<div className={styles.headerActions}>
							<Button
								variant='ghost'
								onClick={() => navigate(backUrl)}
							>
								Hủy
							</Button>
							<Button
								variant='secondary'
								loading={saving === 'draft'}
								disabled={!!saving}
								onClick={() => void save(true)}
								title='Lưu ở trạng thái Nháp (học viên chưa thấy) và tiếp tục soạn'
							>
								Lưu nháp
							</Button>
							<Button
								loading={saving === 'save'}
								disabled={!!saving}
								onClick={() => void save(false)}
								title={`Lưu với trạng thái "${STATUS_LABEL[form.status]}" và quay lại danh sách đề`}
							>
								{form.status === 'published' ? 'Lưu & mở đề' : 'Lưu'}
							</Button>
						</div>
					</div>
				</header>

				{error && <div className={styles.errorBanner}>{error}</div>}

				<div className={styles.layout}>
					<div className={styles.mainCol}>
						{/* ── Thông tin cơ bản ── */}
						<section className={styles.card}>
							<h2 className={styles.cardTitle}>Thông tin cơ bản</h2>
							<input
								className={styles.titleInput}
								placeholder='Tên đề thi, vd: Thi lý thuyết cuối khóa — trắc nghiệm'
								value={form.title}
								onChange={(e) => update({ title: e.target.value })}
								aria-label='Tên đề thi'
								autoFocus={!examId}
							/>
							<div className={styles.grid2}>
								<Field
									label='Loại bài kiểm tra'
									hint={
										form.purpose === 'entrance'
											? 'Chỉ để tham khảo (so với cuối khóa), không tính vào kết quả.'
											: 'Điểm đổ vào bảng điểm của học viên.'
									}
								>
									<Segmented
										value={form.purpose}
										onChange={changePurpose}
										options={[
											{ value: 'final', label: 'Thi cuối khóa' },
											{ value: 'entrance', label: 'Kiểm tra đầu vào' },
										]}
									/>
								</Field>
								<Field
									label='Lớp / chương trình'
									hint='Học viên lớp này làm đề; câu hỏi lấy từ ngân hàng của chương trình.'
								>
									{soleClass && selectedLink ? (
										<div className={styles.staticValue}>{classLabel(selectedLink)}</div>
									) : links.length === 0 ? (
										<div className={styles.staticValue}>Khóa chưa gắn chương trình</div>
									) : (
										<select
											className={styles.input}
											value={form.programId}
											onChange={(e) => changeScope({ programId: e.target.value })}
										>
											<option value=''>— Chọn lớp —</option>
											{links.map((l) => (
												<option
													key={l.program_id}
													value={l.program_id}
												>
													{classLabel(l)}
												</option>
											))}
										</select>
									)}
								</Field>
								<Field
									label='Dạng đề'
									hint='Đề trắc nghiệm / tự luận chỉ nhận câu cùng loại.'
								>
									<Segmented
										value={form.kind}
										onChange={changeKind}
										options={[
											{ value: 'multiple_choice', label: 'Trắc nghiệm' },
											{ value: 'essay', label: 'Tự luận' },
											{ value: 'mixed', label: 'TN + TL' },
										]}
									/>
								</Field>
								<Field label='Thời gian làm bài'>
									<div className={styles.withUnit}>
										<input
											className={styles.input}
											type='number'
											min={1}
											value={form.duration}
											onChange={(e) => update({ duration: e.target.value })}
											aria-label='Thời gian làm bài (phút)'
										/>
										<span>phút</span>
									</div>
								</Field>
							</div>

							{form.purpose === 'final' && (
								<div className={styles.scoreBox}>
									<div className={styles.scoreHead}>Thang điểm & tính điểm</div>
									<div className={styles.grid2}>
										<Field label='Tính điểm vào'>
											<Segmented
												value={form.examPart}
												onChange={(v) => update({ examPart: v })}
												options={[
													{ value: 'theory', label: 'Phần lý thuyết' },
													{ value: 'practice', label: 'Phần thực hành' },
												]}
											/>
										</Field>
										{theoryFinal && (
											<Field
												label='Trọng số trong điểm lý thuyết'
												hint='Điểm LT = trung bình có trọng số các đề LT cuối khóa của lớp (vd TN 50% + TL 50%).'
											>
												<div className={styles.withUnit}>
													<input
														className={styles.input}
														type='number'
														min={0}
														max={100}
														value={form.weight}
														onChange={(e) => update({ weight: e.target.value })}
														aria-label='Trọng số (%)'
													/>
													<span>%</span>
												</div>
											</Field>
										)}
									</div>
									<div className={styles.hint}>
										Điểm bài = điểm đạt được ÷ tổng điểm đề × 10 (thang 10). Điểm đạt của phần thi theo quy chế đánh giá
										chung (Cấu hình hệ thống).
									</div>
								</div>
							)}
						</section>

						{/* ── Soạn câu hỏi ── */}
						<section className={styles.card}>
							<div className={styles.cardHeadRow}>
								<h2 className={styles.cardTitle}>Câu hỏi</h2>
								<Segmented
									value={form.mode}
									onChange={(m) => update({ mode: m })}
									options={[
										{ value: 'manual', label: 'Chọn câu cụ thể' },
										{ value: 'random', label: 'Bốc ngẫu nhiên khi thi' },
									]}
								/>
							</div>
							<div className={styles.bankLine}>
								<LayersSvg />
								{form.programId || links.length === 0 ? (
									<span>
										{bankLabel}: <strong>{bankMc.length}</strong> câu trắc nghiệm, <strong>{bankEssay.length}</strong> câu tự
										luận
									</span>
								) : (
									<span>Chọn lớp để lấy câu từ ngân hàng của lớp.</span>
								)}
								<a
									className={styles.bankLink}
									href={`/admin/question-bank${form.programId ? `?program=${form.programId}&pool=${form.purpose}` : ''}`}
									target='_blank'
									rel='noreferrer'
									title='Soạn / sửa câu ở Ngân hàng câu hỏi (tab mới) — quay lại đây danh sách tự cập nhật'
								>
									<LinkSvg /> Mở ngân hàng
								</a>
							</div>

							<div className={styles.toolbar}>
								{!random && (
									<>
										<Button
											icon={<LayersSvg />}
											disabled={needsClass}
											onClick={() => setPicking(true)}
										>
											Lấy từ ngân hàng
										</Button>
										<Button
											variant='secondary'
											icon={<DocPlusSvg />}
											disabled={needsClass}
											onClick={() => setComposing(true)}
										>
											Soạn câu mới
										</Button>
									</>
								)}
								<Button
									variant='secondary'
									icon={<UploadSvg />}
									disabled={needsClass}
									onClick={() => setImporting(true)}
									title={
										random
											? 'Đọc câu từ file .docx / .pdf vào ngân hàng của lớp — đề bốc ngẫu nhiên từ đó'
											: 'Đọc câu từ file .docx / .pdf, lưu vào ngân hàng của lớp và thêm vào đề'
									}
								>
									Nhập từ Word/PDF
								</Button>
								<span className={styles.spacer} />
								{!random && form.questions.length > 0 && (
									<Button
										variant='ghost'
										icon={<TrashSvg />}
										onClick={() => confirm('Bỏ toàn bộ câu hỏi khỏi đề?') && update({ questions: [] })}
									>
										Bỏ hết
									</Button>
								)}
								<Button
									variant='secondary'
									icon={<EyeSvg />}
									disabled={random ? mcNeed + essayNeed === 0 && !generated.length : !form.questions.length}
									onClick={openPreview}
								>
									Xem trước
								</Button>
							</div>
							{needsClass && <div className={styles.hint}>Chọn lớp ở phần Thông tin cơ bản trước khi thêm câu hỏi.</div>}

							{random ? (
								<>
									<div className={styles.countGrid}>
										{useMc && (
											<CountCard
												label='Câu trắc nghiệm'
												value={form.mcCount}
												available={needsClass ? null : bankMc.length}
												onChange={(v) => update({ mcCount: v })}
											/>
										)}
										{useEssay && (
											<CountCard
												label='Câu tự luận'
												value={form.essayCount}
												available={needsClass ? null : bankEssay.length}
												onChange={(v) => update({ essayCount: v })}
											/>
										)}
									</div>
									<div className={styles.hint}>
										Cách chia đề: <strong>{CODE_MODE_LABEL[form.codeMode]}</strong>
										{form.codeMode === 'codes' ? ` (${form.codeCount} mã)` : ''} — đổi ở “Cài đặt khác”.{' '}
										{form.codeMode === 'per_trainee'
											? 'Mỗi học viên được bốc bộ câu riêng khi bắt đầu làm bài.'
											: 'Câu hỏi được bốc khi lưu đề.'}{' '}
										Thi lại: học viên nhận đề mới, ưu tiên câu chưa gặp.
									</div>
									{generated.length > 0 && (
										<div className={styles.generated}>
											<div className={styles.generatedHead}>
												<span>
													Câu đã bốc: {generated.filter((q) => (q.code_no ?? 1) === 1).length} câu
													{paper?.code_mode === 'codes' ? ` × ${paper.code_count} mã đề` : ''}
												</span>
												{attempts === 0 && (
													<Button
														variant='secondary'
														size='sm'
														icon={<RefreshSvg />}
														disabled={dirty}
														title={dirty ? 'Lưu thay đổi trước khi bốc lại' : 'Bốc lại toàn bộ câu từ ngân hàng'}
														onClick={() => void regenerate()}
													>
														Bốc lại câu
													</Button>
												)}
											</div>
											<ol className={styles.generatedList}>
												{generated.map((q) => (
													<li key={q.link_id}>
														{q.code_no != null && <span className={styles.codeTag}>Mã {q.code_no}</span>}
														<span className={styles.typeTag} data-type={q.question_type}>
															{QUESTION_TYPE_SHORT[q.question_type]}
														</span>
														<span className={styles.generatedText}>
															<QuestionText text={q.question_text} />
														</span>
														<span className={styles.muted}>{fmtPoints(q.points)} đ</span>
													</li>
												))}
											</ol>
										</div>
									)}
								</>
							) : form.questions.length === 0 ? (
								<div className={styles.emptyQuestions}>
									<div className={styles.emptyTitle}>Đề chưa có câu hỏi</div>
									<div className={styles.muted}>
										Lấy câu từ ngân hàng của lớp (chọn nhiều hoặc bốc ngẫu nhiên), soạn câu mới hoặc nhập từ file Word/PDF.
									</div>
								</div>
							) : (
								<ol className={styles.qList}>
									{form.questions.map((q, i) => (
										<li
											key={q.id}
											className={`${styles.qRow} ${dragIdx === i ? styles.qRowDragging : ''} ${overIdx === i && dragIdx !== i ? styles.qRowOver : ''}`}
											draggable
											onDragStart={(e) => {
												setDragIdx(i);
												e.dataTransfer.effectAllowed = 'move';
											}}
											onDragOver={(e) => {
												e.preventDefault();
												if (overIdx !== i) setOverIdx(i);
											}}
											onDrop={(e) => {
												e.preventDefault();
												if (dragIdx != null) moveQuestion(dragIdx, i);
												setDragIdx(null);
												setOverIdx(null);
											}}
											onDragEnd={() => {
												setDragIdx(null);
												setOverIdx(null);
											}}
										>
											<span
												className={styles.grip}
												title='Kéo để sắp xếp'
												aria-hidden
											>
												⋮⋮
											</span>
											<span className={styles.qNo}>{i + 1}</span>
											<div className={styles.qBody}>
												<div className={styles.qText}>
													<QuestionText text={q.question_text} />
												</div>
												<QuestionImageView
													url={q.image_url}
													compact
												/>
												{q.question_type === 'single_choice' && (
													<div className={styles.qOptions}>
														{q.options.map((o, oi) => (
															<span
																key={oi}
																className={o === q.correct_option ? styles.qOptionCorrect : undefined}
															>
																{String.fromCharCode(65 + oi)}. {o}
															</span>
														))}
													</div>
												)}
											</div>
											<span
												className={styles.typeTag}
												data-type={q.question_type}
											>
												{QUESTION_TYPE_SHORT[q.question_type]}
											</span>
											<span className={styles.qPoints}>{fmtPoints(q.points)} đ</span>
											<div className={styles.qActions}>
												<button
													type='button'
													className={`${styles.iconBtn} ${styles.up}`}
													disabled={i === 0}
													onClick={() => moveQuestion(i, i - 1)}
													aria-label='Đưa lên'
													title='Đưa lên'
												>
													<ChevDSvg />
												</button>
												<button
													type='button'
													className={styles.iconBtn}
													disabled={i === form.questions.length - 1}
													onClick={() => moveQuestion(i, i + 1)}
													aria-label='Đưa xuống'
													title='Đưa xuống'
												>
													<ChevDSvg />
												</button>
												<button
													type='button'
													className={`${styles.iconBtn} ${styles.danger}`}
													onClick={() => removeQuestion(q.id)}
													aria-label='Bỏ khỏi đề'
													title='Bỏ khỏi đề (câu vẫn còn trong ngân hàng)'
												>
													<TrashSvg />
												</button>
											</div>
										</li>
									))}
								</ol>
							)}
						</section>
					</div>

					{/* ── Cột phải: tổng hợp (luôn hiện) + cài đặt ít đổi ── */}
					<aside className={styles.sideCol}>
						<section className={`${styles.card} ${styles.summaryCard}`}>
							<div className={styles.summaryNums}>
								<div>
									<strong>{summary.count}</strong>
									<span>câu hỏi</span>
								</div>
								<div>
									<strong>
										{summary.approx ? '≈' : ''}
										{fmtPoints(summary.points)}
									</strong>
									<span>tổng điểm</span>
								</div>
							</div>
							<dl className={styles.summaryRows}>
								{useMc && (
									<>
										<dt>Trắc nghiệm</dt>
										<dd>
											{summary.mc} câu · {fmtPoints(summary.mcPoints)} đ
										</dd>
									</>
								)}
								{useEssay && (
									<>
										<dt>Tự luận</dt>
										<dd>
											{summary.essay} câu · {fmtPoints(summary.essayPoints)} đ
										</dd>
									</>
								)}
								<dt>Thời gian</dt>
								<dd>{Number(form.duration) || 0} phút</dd>
								<dt>Thang điểm</dt>
								<dd>{form.purpose === 'entrance' ? 'Tham khảo, quy về 10' : 'Quy về thang 10'}</dd>
							</dl>
							{random && (
								<div className={styles.hint}>
									Mỗi học viên nhận {summary.count} câu
									{summary.approx ? ' — tổng điểm thay đổi theo câu được bốc' : ''}.
								</div>
							)}
							<ul className={styles.checklist}>
								{issues.length === 0 ? (
									<li data-level='ok'>
										<CheckCircleSvg /> Sẵn sàng lưu
									</li>
								) : (
									issues.map((it) => (
										<li
											key={it.text}
											data-level={it.level}
										>
											<AlertSvg /> {it.text}
										</li>
									))
								)}
							</ul>
						</section>

						<section className={styles.card}>
							<h2 className={styles.cardTitle}>Cài đặt khác</h2>
							<Field
								label='Trạng thái'
								hint='Học viên chỉ thấy đề khi “Đang mở”.'
							>
								<select
									className={styles.input}
									value={form.status}
									onChange={(e) => update({ status: e.target.value as PaperStatus })}
								>
									<option value='draft'>Nháp</option>
									<option value='published'>Đang mở</option>
									<option value='closed'>Đã đóng</option>
								</select>
							</Field>
							{random && (
								<Field
									label='Cách chia đề'
									hint='Mỗi HV một đề: bốc riêng lúc bắt đầu làm. Chung đề: cả lớp cùng bộ câu, trộn thứ tự. Nhiều mã đề: chia đều các mã.'
								>
									<div className={styles.withUnit}>
										<select
											className={styles.input}
											value={form.codeMode}
											onChange={(e) => update({ codeMode: e.target.value as CodeMode })}
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
										{form.codeMode === 'codes' && (
											<input
												className={`${styles.input} ${styles.narrow}`}
												type='number'
												min={2}
												max={10}
												value={form.codeCount}
												onChange={(e) => update({ codeCount: e.target.value })}
												aria-label='Số mã đề'
												title='Số mã đề'
											/>
										)}
									</div>
								</Field>
							)}
							<Field
								label='Người chấm tự luận'
								hint='Để trống = giảng viên được phân công bài học.'
							>
								<MultiSelect
									options={lecturers}
									selected={new Set(form.graders)}
									onChange={(s) => update({ graders: [...s] })}
									placeholder={form.graders.length ? `${form.graders.length} người chấm` : 'GV được phân công bài học'}
									searchable
								/>
							</Field>
							<label className={styles.checkLabel}>
								<input
									type='checkbox'
									checked={form.blind}
									onChange={(e) => update({ blind: e.target.checked })}
								/>
								Chấm ẩn danh (ẩn tên học viên)
							</label>
						</section>
					</aside>
				</div>
			</div>

			{!headerVisible && (
				<div
					className={styles.floatBar}
					role='region'
					aria-label='Tóm tắt đề thi'
				>
					<span className={styles.floatNums}>
						<strong>{summary.count}</strong> câu ·{' '}
						<strong>
							{summary.approx ? '≈' : ''}
							{fmtPoints(summary.points)}
						</strong>{' '}
						điểm
					</span>
					{blocking.length > 0 && (
						<span
							className={styles.floatWarn}
							title={blocking.map((b) => b.text).join(' · ')}
						>
							<AlertSvg /> {blocking[0].text}
						</span>
					)}
					{dirty && <span className={styles.dirtyTag}>Chưa lưu</span>}
					<Button
						size='sm'
						variant='secondary'
						loading={saving === 'draft'}
						disabled={!!saving}
						onClick={() => void save(true)}
					>
						Lưu nháp
					</Button>
					<Button
						size='sm'
						loading={saving === 'save'}
						disabled={!!saving}
						onClick={() => void save(false)}
					>
						{form.status === 'published' ? 'Lưu & mở đề' : 'Lưu'}
					</Button>
				</div>
			)}
			{picking && (
				<BankPickerModal
					bank={bank}
					excludeIds={new Set(form.questions.map((q) => q.id))}
					allowedType={allowedType}
					bankLabel={bankLabel}
					onClose={() => setPicking(false)}
					onAdd={(qs) => {
						addQuestions(qs);
						setPicking(false);
						notify.success(`Đã thêm ${qs.length} câu vào đề`);
					}}
				/>
			)}
			{composing && (
				<QuestionFormModal
					question={null}
					busy={composeBusy}
					onlyType={allowedType ?? undefined}
					title='Soạn câu hỏi mới cho đề'
					onClose={() => setComposing(false)}
					onSave={(p) => void composeQuestion(p)}
				/>
			)}
			{importing && (
				<ImportQuestionsModal
					onlyType={allowedType ?? undefined}
					onClose={() => setImporting(false)}
					onImport={importFromFile}
				/>
			)}
			{preview && (
				<ExamPreviewModal
					title={form.title}
					durationMinutes={Number(form.duration) || 0}
					questions={preview.questions}
					note={preview.note}
					onResample={preview.resample ? () => setPreview({ ...preview, questions: sampleRandom() }) : undefined}
					onClose={() => setPreview(null)}
				/>
			)}
			<Modal
				open={blocker.state === 'blocked'}
				onClose={() => blocker.reset?.()}
				title='Rời trang khi chưa lưu?'
				size='sm'
				footer={
					<>
						<Button
							variant='secondary'
							onClick={() => blocker.reset?.()}
						>
							Ở lại soạn tiếp
						</Button>
						<Button
							variant='danger'
							onClick={() => blocker.proceed?.()}
						>
							Bỏ thay đổi & rời trang
						</Button>
					</>
				}
			>
				Đề thi còn thay đổi chưa lưu. Rời trang bây giờ sẽ mất các thay đổi này.
			</Modal>
		</AdminLayout>
	);
}

// ─── Thành phần nhỏ ──────────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
	return (
		<div className={styles.field}>
			<div className={styles.label}>{label}</div>
			{children}
			{hint && <div className={styles.hint}>{hint}</div>}
		</div>
	);
}

function Segmented<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T;
	options: { value: T; label: string }[];
	onChange: (v: T) => void;
}) {
	return (
		<div
			className={styles.segmented}
			role='radiogroup'
		>
			{options.map((o) => (
				<button
					key={o.value}
					type='button'
					role='radio'
					aria-checked={value === o.value}
					className={value === o.value ? styles.segOn : undefined}
					onClick={() => value !== o.value && onChange(o.value)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

function CountCard({
	label,
	value,
	available,
	onChange,
}: {
	label: string;
	value: string;
	/** null = chưa chọn lớp, chưa biết ngân hàng có bao nhiêu câu */
	available: number | null;
	onChange: (v: string) => void;
}) {
	const need = Number(value) || 0;
	const short = available != null && need > available;
	const pct = !available ? (short ? 100 : 0) : Math.min(100, (need / available) * 100);
	return (
		<div className={`${styles.countCard} ${short ? styles.countShort : ''}`}>
			<div className={styles.label}>{label}</div>
			<div className={styles.withUnit}>
				<input
					className={`${styles.input} ${styles.narrow}`}
					type='number'
					min={0}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					aria-label={`Số ${label.toLowerCase()} cần bốc`}
				/>
				<span>{available == null ? 'câu (chọn lớp để xem ngân hàng)' : `/ ${available} câu trong ngân hàng`}</span>
			</div>
			<div className={styles.bar}>
				<span style={{ width: `${pct}%` }} />
			</div>
			{short && (
				<div className={styles.shortText}>Thiếu {need - (available ?? 0)} câu — bổ sung vào ngân hàng của lớp</div>
			)}
		</div>
	);
}
