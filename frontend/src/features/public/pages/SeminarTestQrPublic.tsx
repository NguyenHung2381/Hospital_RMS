import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertSvg, CheckSvg } from '@/assets/icons';
import PublicLayout from '../../../layouts/PublicLayout';
import {
	enterSeminarTestQr,
	getSeminarTestAttempt,
	getSeminarTestQr,
	startSeminarTestAttempt,
	submitSeminarTestAttempt,
	type SeminarTestAttempt,
	type SeminarTestQrChoice,
	type SeminarTestQrInfo,
} from '../api/publicApi';
import { SeminarTestSection } from '../components/SeminarTestSection';
import { seminarWhen, testWindowText } from '../utils/seminarWhen';
import styles from './PublicPortal.module.css';

// Mã lượt làm bài giữ trong máy: tải lại trang / quét lại QR thì làm tiếp, khỏi nhập lại tên
const attemptKey = (token: string) => `seminar-test-qr:${token}`;
const readAttempt = (token: string) => {
	try {
		return localStorage.getItem(attemptKey(token)) || '';
	} catch {
		return '';
	}
};
const writeAttempt = (token: string, code: string | null) => {
	try {
		if (code) localStorage.setItem(attemptKey(token), code);
		else localStorage.removeItem(attemptKey(token));
	} catch {
		/* chế độ ẩn danh / bị chặn lưu trữ — vẫn làm bài trong phiên này */
	}
};

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

const cmeNote = (grantsCme: boolean, counts: boolean) =>
	!grantsCme
		? null
		: counts
			? 'Bài nộp qua mã QR này được tính vào điều kiện cấp chứng nhận CME (vẫn cần điểm danh).'
			: 'Bài làm qua mã QR chung không tính vào điều kiện cấp CME — muốn được cấp CME, hãy làm bài trên vé QR cá nhân.';

// QR chung của 1 đề kiểm tra (ban tổ chức chiếu lên màn hình hội trường): quét → nhập họ
// tên → làm bài. Trùng tên người đã đăng ký thì xác nhận "là tôi" (hoặc làm với tư cách
// khách); không trùng ai thì hệ thống thêm khách. Backend: seminarTestQrService.
export default function SeminarTestQrPublic() {
	const { token = '' } = useParams();
	const [info, setInfo] = useState<SeminarTestQrInfo | null>(null);
	const [loadError, setLoadError] = useState('');
	const [code, setCode] = useState(() => readAttempt(token));
	const [attempt, setAttempt] = useState<SeminarTestAttempt | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	// Hạn nộp theo đồng hồ máy này (server trả số giây còn lại)
	const [deadline, setDeadline] = useState<number | null>(null);
	const [loadedAt, setLoadedAt] = useState(0);

	useEffect(() => {
		getSeminarTestQr(token)
			.then(setInfo)
			.catch((e) => setLoadError(errText(e, 'Không tải được bài kiểm tra')));
	}, [token]);

	const applyAttempt = useCallback((a: SeminarTestAttempt) => {
		const at = Date.now();
		setAttempt(a);
		setLoadedAt(at);
		setDeadline(a.test.questions && a.test.remaining_seconds != null ? at + a.test.remaining_seconds * 1000 : null);
	}, []);

	const fetchAttempt = useCallback(
		() =>
			code
				? getSeminarTestAttempt(code)
						.then((a) => {
							applyAttempt(a);
							setError('');
						})
						.catch((e) => {
							// Mã lượt cũ không còn (đề bị xoá...) → quay về nhập tên
							if (e instanceof Error && /không tồn tại/i.test(e.message)) {
								writeAttempt(token, null);
								setCode('');
							} else setError(errText(e, 'Không tải được bài làm'));
						})
				: Promise.resolve(),
		[code, token, applyAttempt],
	);

	useEffect(() => {
		void fetchAttempt();
	}, [fetchAttempt]);

	const reload = useCallback(() => {
		setLoading(true);
		void fetchAttempt().finally(() => setLoading(false));
	}, [fetchAttempt]);

	const enterWith = (c: string) => {
		writeAttempt(token, c);
		setCode(c);
	};
	const leave = () => {
		writeAttempt(token, null);
		setCode('');
		setAttempt(null);
		setError('');
	};

	if (!info) {
		return (
			<PublicLayout
				bare
				title='Bài kiểm tra hội nghị'
			>
				{loadError ? (
					<div
						className={`${styles.alertBox} ${styles.alertError}`}
						role='alert'
					>
						<AlertSvg /> {loadError}
					</div>
				) : (
					<div className={styles.emptyNotice}>Đang tải bài kiểm tra...</div>
				)}
			</PublicLayout>
		);
	}

	const { seminar, test } = info;
	const header = (
		<div className={styles.section}>
			<div className={styles.sectionBody}>
				<div className={styles.courseName}>{test.title}</div>
				<div className={styles.courseMeta}>
					{seminar.title} · {seminarWhen(seminar)}
					{seminar.location ? ` · ${seminar.location}` : ''}
				</div>
				<div className={styles.courseMeta}>
					{test.question_count} câu · {test.max_score} điểm
					{test.duration_minutes ? ` · ${test.duration_minutes} phút` : ''}
					{test.pass_score != null ? ` · đạt từ ${test.pass_score} điểm` : ''}
				</div>
			</div>
		</div>
	);

	return (
		<PublicLayout
			bare
			title='Bài kiểm tra hội nghị'
			subtitle={seminar.title}
		>
			{header}
			{error && (
				<div
					className={`${styles.alertBox} ${styles.alertError}`}
					role='alert'
				>
					<AlertSvg /> {error}
				</div>
			)}
			{code ? (
				attempt ? (
					<AttemptView
						code={code}
						attempt={attempt}
						deadline={deadline}
						loadedAt={loadedAt}
						loading={loading}
						onAttempt={applyAttempt}
						onReload={reload}
						onLeave={leave}
					/>
				) : (
					!error && <div className={styles.emptyNotice}>Đang tải bài làm...</div>
				)
			) : (
				<EnterForm
					token={token}
					info={info}
					onEntered={enterWith}
				/>
			)}
		</PublicLayout>
	);
}

// Nhập họ tên → (trùng tên) chọn đúng người hoặc làm với tư cách khách → mã lượt
function EnterForm({
	token,
	info,
	onEntered,
}: {
	token: string;
	info: SeminarTestQrInfo;
	onEntered: (code: string) => void;
}) {
	const { test, seminar } = info;
	const [fullName, setFullName] = useState('');
	const [organization, setOrganization] = useState('');
	const [choices, setChoices] = useState<SeminarTestQrChoice[] | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	const send = async (extra: { participant_id?: string; as_guest?: boolean } = {}) => {
		setBusy(true);
		try {
			const r = await enterSeminarTestQr(token, {
				full_name: fullName.trim(),
				organization: organization.trim() || undefined,
				...extra,
			});
			setError('');
			if ('attempt_code' in r) onEntered(r.attempt_code);
			else setChoices(r.choices);
		} catch (e) {
			setError(errText(e, 'Không vào được bài kiểm tra'));
		} finally {
			setBusy(false);
		}
	};

	const closedText = !test.enabled
		? 'Ban tổ chức chưa mở làm bài qua mã QR này.'
		: test.state === 'off'
			? 'Bài kiểm tra chưa mở — ban tổ chức sẽ mở khi tới giờ.'
			: test.state === 'closed'
				? 'Đã hết thời gian nhận bài kiểm tra.'
				: null;
	if (closedText)
		return (
			<div
				className={`${styles.alertBox} ${styles.alertError}`}
				role='status'
			>
				<AlertSvg /> {closedText}
			</div>
		);

	const note = cmeNote(seminar.grants_cme, test.counts_for_cme);

	if (choices)
		return (
			<section className={styles.section}>
				<header className={styles.sectionHead}>
					<h2 className={styles.sectionHeading}>Bạn là ai trong danh sách?</h2>
				</header>
				<div className={styles.sectionBody}>
					<p className={styles.sectionDesc}>
						Có người tham dự trùng họ tên "{fullName.trim()}". Chọn đúng bạn để bài làm được ghi cho bạn.
					</p>
					{error && (
						<div
							className={`${styles.alertBox} ${styles.alertError}`}
							role='alert'
						>
							<AlertSvg /> {error}
						</div>
					)}
					<div className={styles.courseList}>
						{choices.map((c) => (
							<button
								key={c.id}
								type='button'
								className={styles.courseCard}
								style={{
									textAlign: 'left',
									background: 'none',
									font: 'inherit',
								}}
								disabled={busy}
								onClick={() => void send({ participant_id: c.id })}
							>
								<span className={styles.courseName}>Tôi là {c.full_name}</span>
								<span className={styles.courseMeta}>
									{[c.department, c.organization].filter(Boolean).join(' · ') ||
										(c.guest ? 'Khách đã vào làm bài trước đó' : 'Chưa ghi đơn vị')}
								</span>
							</button>
						))}
						<button
							type='button'
							className={styles.courseCard}
							style={{ textAlign: 'left', background: 'none', font: 'inherit' }}
							disabled={busy}
							onClick={() => void send({ as_guest: true })}
						>
							<span className={styles.courseName}>Không phải tôi</span>
							<span className={styles.courseMeta}>Làm bài với tư cách khách</span>
						</button>
					</div>
					<div className={styles.formFooter}>
						<button
							type='button'
							className={styles.searchBtn}
							onClick={() => setChoices(null)}
							disabled={busy}
						>
							Nhập lại họ tên
						</button>
					</div>
				</div>
			</section>
		);

	return (
		<section className={styles.section}>
			<header className={styles.sectionHead}>
				<h2 className={styles.sectionHeading}>Nhập họ tên để vào làm bài</h2>
			</header>
			<div className={styles.sectionBody}>
				{test.state === 'scheduled' && test.window && (
					<p className={styles.sectionDesc}>Thời gian làm bài: {testWindowText(test.window)}.</p>
				)}
				{note && (
					<p
						className={styles.sectionDesc}
						style={{ marginBottom: 'var(--space-4)' }}
					>
						{note}
					</p>
				)}
				{error && (
					<div
						className={`${styles.alertBox} ${styles.alertError}`}
						role='alert'
					>
						<AlertSvg /> {error}
					</div>
				)}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						if (fullName.trim()) void send();
					}}
				>
					<div className={styles.formGrid}>
						<div className={styles.formGroup}>
							<label
								className={styles.label}
								htmlFor='qr-full-name'
							>
								Họ và tên <span className={styles.required}>*</span>
							</label>
							<input
								id='qr-full-name'
								className={styles.input}
								value={fullName}
								onChange={(e) => setFullName(e.target.value)}
								placeholder='VD: Nguyễn Văn An'
								autoComplete='name'
								maxLength={255}
								required
								autoFocus
							/>
						</div>
						<div className={styles.formGroup}>
							<label
								className={styles.label}
								htmlFor='qr-org'
							>
								Đơn vị công tác
							</label>
							<input
								id='qr-org'
								className={styles.input}
								value={organization}
								onChange={(e) => setOrganization(e.target.value)}
								placeholder='Không bắt buộc'
								autoComplete='organization'
								maxLength={255}
							/>
						</div>
					</div>
					<div className={styles.formFooter}>
						<button
							type='submit'
							className={styles.submitBtn}
							disabled={busy || !fullName.trim()}
						>
							{busy ? 'Đang vào...' : 'Vào làm bài'}
						</button>
					</div>
				</form>
			</div>
		</section>
	);
}

// Lượt làm bài: người làm + đề (bắt đầu / làm / kết quả)
function AttemptView({
	code,
	attempt,
	deadline,
	loadedAt,
	loading,
	onAttempt,
	onReload,
	onLeave,
}: {
	code: string;
	attempt: SeminarTestAttempt;
	deadline: number | null;
	loadedAt: number;
	loading: boolean;
	onAttempt: (a: SeminarTestAttempt) => void;
	onReload: () => void;
	onLeave: () => void;
}) {
	const t = attempt.test;
	const holder = `${attempt.title_prefix ? `${attempt.title_prefix} ` : ''}${attempt.full_name}`;
	const done = !!t.submitted_at;
	// Đang làm dở (đã nhận đề) thì không cho đổi người
	const working = !!t.questions || !!t.expired;
	const note = cmeNote(attempt.seminar.grants_cme, attempt.counts_for_cme);
	const score = t.score ?? t.correct;
	const max = t.max_score ?? t.total;

	return (
		<>
			<div className={styles.section}>
				<div
					className={styles.sectionBody}
					style={{
						display: 'flex',
						gap: 12,
						alignItems: 'center',
						justifyContent: 'space-between',
						flexWrap: 'wrap',
					}}
				>
					<div>
						<div className={styles.courseName}>{holder}</div>
						<div className={styles.courseMeta}>{attempt.organization || 'Người làm bài'}</div>
					</div>
					{!done && !working && (
						<button
							type='button'
							className={styles.searchBtn}
							onClick={onLeave}
						>
							Không phải tôi
						</button>
					)}
				</div>
			</div>

			{done && (
				<div
					className={`${styles.alertBox} ${t.passed === false ? styles.alertError : styles.alertSuccess}`}
					role='status'
				>
					{t.passed === false ? <AlertSvg /> : <CheckSvg />} Đã nộp bài: {score}/{max} điểm
					{t.pass_score != null ? (t.passed ? ' · Đạt' : ' · Chưa đạt') : ''}
				</div>
			)}
			{!done && note && <p className={styles.sectionDesc}>{note}</p>}

			<SeminarTestSection
				draftId={code}
				test={t}
				blockedReason={attempt.qr_enabled ? null : 'Ban tổ chức đã tắt làm bài qua mã QR chung của đề này.'}
				cmeWarn={attempt.seminar.grants_cme && attempt.counts_for_cme}
				deadline={deadline}
				loadedAt={loadedAt}
				loading={loading}
				onStart={async () => onAttempt(await startSeminarTestAttempt(code))}
				onSubmit={async (answers) => {
					await submitSeminarTestAttempt(code, answers);
				}}
				onReload={onReload}
			/>
		</>
	);
}
