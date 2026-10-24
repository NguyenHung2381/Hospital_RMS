import { useCallback, useEffect, useState } from 'react';
import { CalendarSvg, CheckSvg, DeptSvg, PhoneSvg, XSvg } from '@/assets/icons';
import { Badge, Button, Card, EmptyState, InlineLoading } from '@/shared/components';
import { formatDateVN } from '@/shared/utils/formatDate';
import { showToast } from '@/shared/utils/feedback';
import UserLayout from '../../../layouts/UserLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import type { RotationResult } from '../../course/types/course.type';
import { mentoringApi, type MentorPhase, type MentorRotation } from '../api/mentoringApi';
import self from './SelfService.module.css';
import styles from './MyMentoring.module.css';

// Nhóm thẻ theo thứ tự việc cần làm trước: vòng đã xong chờ đánh giá lên đầu.
const GROUPS: { phase: MentorPhase; title: string }[] = [
	{ phase: 'awaiting', title: 'Đã kết thúc — chờ bạn đánh giá' },
	{ phase: 'current', title: 'Đang thực hành' },
	{ phase: 'upcoming', title: 'Sắp bắt đầu (30 ngày tới)' },
	{ phase: 'done', title: 'Đã đánh giá gần đây' },
];

const RESULT_LABEL: Record<RotationResult, string> = { pending: 'Chưa đánh giá', pass: 'Đạt', fail: 'Không đạt' };
const RESULT_TONE = { pending: 'gray', pass: 'green', fail: 'red' } as const;

/** Người hướng dẫn thực hành GPHN: xem học viên mình kèm, đánh giá Đạt / Không đạt từng vòng (dùng trên điện thoại). */
export default function MyMentoring() {
	const [rows, setRows] = useState<MentorRotation[] | null>(null);
	const [error, setError] = useState('');

	const load = useCallback(
		() =>
			mentoringApi
				.list()
				.then((r) => {
					setRows(r);
					setError('');
				})
				.catch((err) => setError(err instanceof Error ? err.message : 'Không tải được danh sách')),
		[],
	);
	useEffect(() => {
		void load();
	}, [load]);
	useRealtimeUpdate('course_enrollment', load);

	return (
		<UserLayout pageTitle='Hướng dẫn thực hành' pageSubtitle='Học viên thực hành GPHN bạn được phân công hướng dẫn'>
			{error && <EmptyState title='Không tải được dữ liệu' desc={error} />}
			{!rows && !error && <InlineLoading />}
			{rows && rows.length === 0 && (
				<EmptyState
					title='Chưa có học viên'
					desc='Bạn chưa được phân công hướng dẫn vòng thực hành nào trong thời gian này.'
				/>
			)}
			{rows && rows.length > 0 && (
				<div className={self.stack}>
					{GROUPS.map((g) => {
						const items = rows.filter((r) => r.phase === g.phase);
						if (!items.length) return null;
						return (
							<section key={g.phase}>
								<div className={self.groupTitle}>
									{g.title} ({items.length})
								</div>
								<div className={self.list}>
									{items.map((r) => (
										<RotationCard key={r.id} row={r} onSaved={load} />
									))}
								</div>
							</section>
						);
					})}
				</div>
			)}
		</UserLayout>
	);
}

function RotationCard({ row, onSaved }: { row: MentorRotation; onSaved: () => void }) {
	const canEvaluate = row.phase !== 'upcoming';
	const [editing, setEditing] = useState(row.phase !== 'done');
	const [comment, setComment] = useState(row.result_comment ?? '');
	const [saving, setSaving] = useState<RotationResult | null>(null);

	const save = async (result: RotationResult) => {
		setSaving(result);
		try {
			await mentoringApi.evaluate(row.id, result, comment.trim() || null);
			showToast('success', result === 'pending' ? 'Đã bỏ đánh giá' : `Đã đánh giá: ${RESULT_LABEL[result]}`);
			setEditing(false);
			onSaved();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Lưu đánh giá thất bại');
		} finally {
			setSaving(null);
		}
	};

	return (
		<Card className={self.item}>
			<div className={self.itemHead}>
				<div className={styles.who}>
					<div className={self.itemTitle}>{row.trainee_name}</div>
					<div className={styles.round}>
						{row.round_title || `Vòng ${row.seq}`}
						{row.attempt_no > 1 && ` · lần ${row.attempt_no}`}
					</div>
				</div>
				{row.result !== 'pending' && <Badge tone={RESULT_TONE[row.result]}>{RESULT_LABEL[row.result]}</Badge>}
			</div>
			<div className={styles.facts}>
				<span>
					<CalendarSvg />
					{formatDateVN(row.start_date)} – {formatDateVN(row.end_date)}
					{row.duration_text && ` (${row.duration_text})`}
				</span>
				{row.department_name && (
					<span>
						<DeptSvg />
						{row.department_name}
					</span>
				)}
				{row.trainee_phone && (
					<a href={`tel:${row.trainee_phone}`} className={styles.phone}>
						<PhoneSvg />
						{row.trainee_phone}
					</a>
				)}
				{row.program_name && <span className={styles.program}>{row.program_name}</span>}
			</div>

			{canEvaluate && !editing && (
				<div className={styles.doneBox}>
					{row.result_comment && <p className={styles.comment}>“{row.result_comment}”</p>}
					<div className={styles.doneMeta}>
						{row.result_source === 'staff'
							? `Phòng Đào tạo nhập${row.result_by_name ? ` (${row.result_by_name})` : ''}`
							: 'Bạn đánh giá'}
						{row.result_at && ` · ${formatDateVN(row.result_at)}`}
						<button type='button' className={styles.link} onClick={() => setEditing(true)}>
							Sửa đánh giá
						</button>
					</div>
				</div>
			)}

			{canEvaluate && editing && (
				<div className={styles.evaluate}>
					<textarea
						className={styles.textarea}
						rows={2}
						maxLength={1000}
						placeholder='Nhận xét (không bắt buộc)'
						value={comment}
						onChange={(e) => setComment(e.target.value)}
					/>
					<div className={styles.actions}>
						<Button
							icon={<CheckSvg />}
							className={styles.bigBtn}
							loading={saving === 'pass'}
							disabled={!!saving}
							onClick={() => void save('pass')}
						>
							Đạt
						</Button>
						<Button
							variant='danger'
							icon={<XSvg />}
							className={styles.bigBtn}
							loading={saving === 'fail'}
							disabled={!!saving}
							onClick={() => void save('fail')}
						>
							Không đạt
						</Button>
					</div>
					{row.result !== 'pending' && (
						<div className={styles.doneMeta}>
							<button type='button' className={styles.link} onClick={() => setEditing(false)}>
								Huỷ
							</button>
							<button
								type='button'
								className={styles.link}
								disabled={!!saving}
								onClick={() => void save('pending')}
							>
								Bỏ đánh giá
							</button>
						</div>
					)}
				</div>
			)}
		</Card>
	);
}
