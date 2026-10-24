import { useCallback, useEffect, useState } from 'react';
import { BadgeSvg, TrashSvg } from '@/assets/icons';
import { Modal } from '@/shared/components/Modal';
import { usePermission } from '@/shared/hooks/usePermission';
import { showToast } from '@/shared/utils/feedback';
import { formatDateVN } from '@/shared/utils/formatDate';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import {
	getGradeHistory,
	getGradebook,
	issueCertificatesBulk,
	lockGrades,
	retakeGrade,
	saveGradesBulk,
	syncCourseCme,
	unlockGrades,
	type CourseCmeSyncResult,
} from '../api/courseApi';
import type { useCourseDetail } from '../hooks/useCourseDetail';
import {
	GRADE_FLAG_LABEL,
	type GradePart,
	type Gradebook,
	type GradebookRow,
	type GradeHistoryItem,
} from '../types/course.type';
import { GradebookTable } from './GradebookTable';
import styles from '../pages/Courses.module.css';

const PART_LABEL: Record<GradePart, string> = { theory: 'LT', practice: 'TH' };

const cmeSyncMessage = (r: CourseCmeSyncResult) => {
	const parts = [
		r.trainees == null ? 'học viên: công tắc đang tắt' : `${r.trainees} học viên`,
		r.lecturers == null
			? `giảng viên: ${r.lecturer_enabled ? 'điểm chưa khóa' : 'công tắc đang tắt'}`
			: `${r.lecturers} giảng viên`,
	];
	return `Đã ghi lại CME — ${parts.join(', ')}`;
};
const SOURCE_LABEL: Record<GradeHistoryItem['source'], string> = {
	manual: 'Nhập tay',
	exam: 'Bài thi',
	import: 'Nhập Excel',
	retake: 'Mở thi lại',
	unlock: 'Mở khóa',
};

/** Bước cuối: nhập điểm Lý thuyết + Thực hành → khóa điểm → cấp giấy chứng nhận cho người Đạt. */
export function ResultsTab({ courseId, d }: { courseId: string; d: ReturnType<typeof useCourseDetail> }) {
	const { has } = usePermission();
	const [book, setBook] = useState<Gradebook | null>(null);
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [certExpiry, setCertExpiry] = useState('');
	const [historyOf, setHistoryOf] = useState<GradebookRow | null>(null);
	const [history, setHistory] = useState<GradeHistoryItem[]>([]);

	const load = useCallback(
		() =>
			getGradebook(courseId)
				.then((b) => {
					setBook(b);
					setError('');
				})
				.catch((err) => setError(err instanceof Error ? err.message : 'Không tải được bảng điểm')),
		[courseId],
	);
	useEffect(() => {
		void load();
	}, [load]);
	useRealtimeUpdate(['grade', 'certificate', 'attendance'], load);

	const run = async (fn: () => Promise<unknown>, ok?: string) => {
		setBusy(true);
		try {
			await fn();
			if (ok) showToast('success', ok);
			await Promise.all([load(), d.reload()]);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Thao tác thất bại');
		} finally {
			setBusy(false);
		}
	};

	useEffect(() => {
		if (!historyOf) return;
		getGradeHistory(historyOf.enrollment_id)
			.then(setHistory)
			.catch(() => setHistory([]));
	}, [historyOf]);

	if (error) return <div className={styles.errorBanner}>{error}</div>;
	if (!book) return <div className={styles.subEmpty}>Đang tải bảng điểm…</div>;

	const passed = book.rows.filter((r) => r.computed.result === 'pass');
	const toIssue = passed.filter((r) => !r.certificate_id).length;
	const certOf = (row: GradebookRow) => d.certificates.find((c) => c.enrollment_id === row.enrollment_id);

	const toolbar = (
		<>
			{!book.locked ? (
				<button
					className={styles.btnGhost}
					disabled={busy || !book.rows.length}
					title='Khóa điểm cả khóa — sau khi khóa không ai sửa được, trừ người có quyền mở khóa'
					onClick={() => {
						const missing = book.rows.filter((r) => r.computed.result == null).length;
						const msg = missing
							? `Còn ${missing} học viên chưa đủ điểm. Vẫn khóa điểm?`
							: 'Khóa điểm cả khóa? Sau khi khóa chỉ người có quyền mở khóa mới sửa được.';
						if (confirm(msg)) void run(() => lockGrades(courseId), 'Đã khóa điểm');
					}}
				>
					Khóa điểm
				</button>
			) : (
				has('grades:unlock') && (
					<button
						className={styles.btnGhost}
						disabled={busy}
						onClick={() => {
							const reason = window.prompt('Lý do mở khóa điểm (ghi nhật ký):');
							if (reason !== null) void run(() => unlockGrades(courseId, reason), 'Đã mở khóa điểm');
						}}
					>
						Mở khóa điểm
					</button>
				)
			)}
			{book.locked && has('courses:approve') && toIssue > 0 && (
				<>
					<input
						type='date'
						className={styles.subInput}
						style={{ maxWidth: 150 }}
						title='Hạn giấy chứng nhận (bỏ trống = không thời hạn)'
						value={certExpiry}
						onChange={(e) => setCertExpiry(e.target.value)}
					/>
					<button
						className={styles.btnPrimary}
						disabled={busy}
						onClick={() =>
							void run(
								() => issueCertificatesBulk(courseId, certExpiry || undefined),
								`Đã cấp giấy chứng nhận cho ${toIssue} học viên đạt`,
							)
						}
					>
						<BadgeSvg /> Cấp giấy chứng nhận ({toIssue} người đạt)
					</button>
				</>
			)}
			{book.locked && has('courses:approve') && (
				<button
					className={styles.btnGhost}
					disabled={busy}
					title='Tự cộng tín chỉ CME: học viên nội viện đã có giấy chứng nhận + giảng viên theo số tiết (Cài đặt hệ thống → Đào tạo)'
					onClick={() => {
						setBusy(true);
						syncCourseCme(courseId)
							.then((r) => showToast('success', cmeSyncMessage(r)))
							.catch((err) => showToast('error', err instanceof Error ? err.message : 'Ghi CME thất bại'))
							.finally(() => setBusy(false));
					}}
				>
					Ghi lại CME
				</button>
			)}
		</>
	);

	const rowActions = (row: GradebookRow) => {
		const cert = certOf(row);
		const retakeBtns = (['theory', 'practice'] as GradePart[])
			.filter(
				(p) =>
					!row.locked_at &&
					row.computed[p].passed === false &&
					row[`${p}_attempt`] < 1 + book.rules.maxRetakes,
			)
			.map((p) => (
				<button
					key={p}
					className={styles.btnSmall}
					disabled={busy}
					title={`Mở lượt thi lại phần ${PART_LABEL[p]} (điểm cũ lưu ở lịch sử)`}
					onClick={() => {
						if (confirm(`Mở thi lại phần ${PART_LABEL[p]} cho ${row.trainee_name}?`))
							void run(() => retakeGrade(row.enrollment_id, p), 'Đã mở lượt thi lại');
					}}
				>
					Thi lại {PART_LABEL[p]}
				</button>
			));
		return (
			<>
				{retakeBtns}
				<button
					className={styles.btnSmall}
					onClick={() => setHistoryOf(row)}
				>
					Lịch sử
				</button>
				{cert && (
					<>
						<span
							className={styles.certBadge}
							style={cert.status === 'revoked' ? { background: '#fcebeb', color: '#791f1f' } : undefined}
							title={`Cấp ngày ${formatDateVN(cert.issue_date)}${cert.expiry_date ? ` · Hạn ${formatDateVN(cert.expiry_date)}` : ''}`}
						>
							{cert.cert_no} · {cert.status === 'revoked' ? 'Đã thu hồi' : 'Đã cấp'}
						</span>
						{has('courses:approve') &&
							(cert.status === 'active' ? (
								<button
									className={styles.actionBtn}
									title='Thu hồi giấy chứng nhận'
									disabled={busy}
									onClick={() => {
										const reason = window.prompt('Lý do thu hồi (không bắt buộc):') ?? '';
										void d.revokeCertificate(cert.id, reason || undefined).then(load);
									}}
								>
									<TrashSvg />
								</button>
							) : (
								<button
									className={styles.actionBtn}
									title='Xoá hẳn giấy chứng nhận'
									disabled={busy}
									onClick={() => void d.removeCertificate(cert.id).then(load)}
								>
									<TrashSvg />
								</button>
							))}
					</>
				)}
			</>
		);
	};

	return (
		<>
			<div
				className={styles.subRowMeta}
				style={{ marginBottom: 10 }}
			>
				{book.rows.length} học viên · Đạt {passed.length} · Chưa đạt{' '}
				{book.rows.filter((r) => r.computed.result === 'fail').length} · Chưa đủ điểm{' '}
				{book.rows.filter((r) => r.computed.result == null).length}. Điểm bài thi trên hệ thống tự điền vào cột LT/TH
				(quy về thang 10). Giảng viên nhập phần mình được phân ở cổng cá nhân.
			</div>
			<GradebookTable
				book={book}
				fileName='bang-diem'
				toolbar={toolbar}
				rowActions={rowActions}
				traineeHref={has('trainees:read') ? (r) => `/admin/trainees/${r.trainee_id}?tab=results` : undefined}
				onSave={async (rows, source) => {
					const r = await saveGradesBulk(courseId, rows, source);
					showToast('success', `Đã lưu điểm ${r.saved} học viên`);
					await load();
				}}
			/>
			<Modal
				open={!!historyOf}
				onClose={() => setHistoryOf(null)}
				title='Lịch sử điểm'
				subtitle={historyOf?.trainee_name}
			>
				{history.length === 0 ? (
					<div className={styles.subEmpty}>Chưa có thay đổi nào.</div>
				) : (
					<div className={styles.subList}>
						{history.map((h) => (
							<div
								key={h.id}
								className={styles.subRow}
							>
								<div className={styles.subRowMain}>
									<div className={styles.subRowName}>
										{PART_LABEL[h.part]} lần {h.attempt_no}:{' '}
										{h.flag ? GRADE_FLAG_LABEL[h.flag] : h.score != null ? String(h.score).replace('.', ',') : '—'}
									</div>
									<div className={styles.subRowMeta}>
										{SOURCE_LABEL[h.source] ?? h.source} · {h.changed_by_name ?? '—'} ·{' '}
										{new Date(h.changed_at).toLocaleString('vi-VN')}
										{h.note ? ` · ${h.note}` : ''}
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</Modal>
		</>
	);
}
