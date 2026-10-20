import { useState } from 'react';
import { ChevDSvg, ChevRSvg, WarnSvg } from '@/assets/icons';
import { formatDate } from '../../../shared/utils/formatDate';
import type {
	ProgressPace,
	RotationProgressItem,
	RotationProgressStatus,
	TheoryProgressStatus,
	TraineeProgress,
} from '../types/trainee.type';
import styles from './TraineeProgressPanel.module.css';

type Tone = 'green' | 'blue' | 'amber' | 'red' | 'gray' | 'violet';

const PACE: Record<ProgressPace, { label: string; tone: Tone }> = {
	completed: { label: 'Đã hoàn thành', tone: 'green' },
	dropped: { label: 'Nghỉ học', tone: 'gray' },
	not_started: { label: 'Chưa đến ngày bắt đầu', tone: 'gray' },
	ahead: { label: 'Nhanh hơn kế hoạch', tone: 'blue' },
	on_track: { label: 'Đúng tiến độ', tone: 'green' },
	behind: { label: 'Chậm so với kế hoạch', tone: 'amber' },
	overdue: { label: 'Quá hạn chưa xong', tone: 'red' },
	unknown: { label: 'Chưa có thời gian học', tone: 'gray' },
};

const THEORY: Record<TheoryProgressStatus, { label: string; tone: Tone }> = {
	done: { label: 'Đã học', tone: 'green' },
	in_progress: { label: 'Đang học', tone: 'blue' },
	not_started: { label: 'Chưa học', tone: 'gray' },
	missing: { label: 'Chưa có trong hồ sơ', tone: 'violet' },
};

const ROTATION: Record<RotationProgressStatus, { label: string; tone: Tone }> = {
	passed: { label: 'Đạt', tone: 'green' },
	in_progress: { label: 'Đang thực hành', tone: 'blue' },
	scheduled: { label: 'Đã xếp lịch', tone: 'gray' },
	not_scheduled: { label: 'Chưa xếp lịch', tone: 'gray' },
	overdue: { label: 'Hết hạn, chưa chấm', tone: 'amber' },
	failed: { label: 'Không đạt — cần học lại', tone: 'red' },
	missing: { label: 'Chưa có trong hồ sơ', tone: 'violet' },
};

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
	return <span className={`${styles.chip} ${styles[`tone_${tone}`]}`}>{children}</span>;
}

function RotationRow({ item }: { item: RotationProgressItem }) {
	const cfg = ROTATION[item.status];
	return (
		<li className={`${styles.item} ${item.in_program ? '' : styles.itemExtra}`}>
			<div className={styles.itemMain}>
				<div className={styles.itemTitle}>
					{item.title}
					{item.required_duration && <span className={styles.muted}> · {item.required_duration}</span>}
				</div>
				{item.segments.length > 0 && (
					<div className={styles.segments}>
						{item.segments.map((s) => (
							<div
								key={s.id}
								className={styles.segment}
							>
								{s.department_name ?? 'Chưa chọn khoa'}
								{s.start_date &&
									` · ${formatDate(s.start_date)} – ${s.end_date ? formatDate(s.end_date) : '…'}`}
								{s.mentor_name && ` · NHD ${s.mentor_name}`}
								{s.attempt_no > 1 && ` · lần ${s.attempt_no}`}
								{s.result === 'pass' ? ' · Đạt' : s.result === 'fail' ? ' · Không đạt' : ''}
							</div>
						))}
					</div>
				)}
				{!item.in_program && (
					<div className={styles.extraNote}>Chương trình hiện tại không còn vòng này</div>
				)}
			</div>
			<Chip tone={cfg.tone}>{cfg.label}</Chip>
		</li>
	);
}

/** Tiến độ thực tế của 1 lượt ghi danh so với chương trình hiện tại. */
export function TraineeProgressPanel({ progress }: { progress: TraineeProgress }) {
	const [open, setOpen] = useState(false);
	const { summary, theory, rotations } = progress;
	const pace = PACE[summary.pace];

	if (!progress.program_id) {
		return (
			<div className={styles.panel}>
				<div className={styles.emptyNote}>
					Lượt ghi danh chưa chọn chương trình — chưa so được tiến độ.
				</div>
			</div>
		);
	}

	const doneWidth = summary.completion == null ? 0 : summary.completion * 100;
	const elapsedLeft = summary.elapsed == null ? null : summary.elapsed * 100;

	return (
		<div className={styles.panel}>
			<button
				type='button'
				className={styles.head}
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
			>
				<span className={styles.chev}>{open ? <ChevDSvg /> : <ChevRSvg />}</span>
				<div className={styles.headMain}>
					<div className={styles.headLine}>
						<span className={styles.headTitle}>
							Tiến độ thực tế: {summary.done}/{summary.required} ({pct(summary.completion)})
						</span>
						<Chip tone={pace.tone}>{pace.label}</Chip>
						{summary.out_of_sync && (
							<Chip tone='violet'>
								<WarnSvg /> Lệch chương trình hiện tại
							</Chip>
						)}
					</div>
					<div
						className={styles.bar}
						title={
							elapsedLeft == null
								? undefined
								: `Đã qua ${Math.round(elapsedLeft)}% thời gian · hoàn thành ${pct(summary.completion)}`
						}
					>
						<div
							className={styles.barFill}
							style={{ width: `${doneWidth}%` }}
						/>
						{elapsedLeft != null && summary.pace !== 'completed' && (
							<div
								className={styles.barMarker}
								style={{ left: `${elapsedLeft}%` }}
							/>
						)}
					</div>
					<div className={styles.headMeta}>
						{theory.summary.required > 0 &&
							`Lý thuyết ${theory.summary.done}/${theory.summary.required} bài` +
								(theory.summary.hours_required
									? ` (${theory.summary.hours_done}/${theory.summary.hours_required} tiết)`
									: '')}
						{theory.summary.required > 0 && rotations.summary.required > 0 && ' · '}
						{rotations.summary.required > 0 &&
							`Thực hành ${rotations.summary.passed}/${rotations.summary.required} vòng đạt`}
						{summary.start_date &&
							` · ${formatDate(summary.start_date)} – ${summary.end_date ? formatDate(summary.end_date) : '…'}`}
						{elapsedLeft != null &&
							summary.pace !== 'completed' &&
							` · đã qua ${Math.round(elapsedLeft)}% thời gian`}
					</div>
				</div>
			</button>

			{open && (
				<div className={styles.body}>
					{summary.out_of_sync && (
						<div className={styles.syncNote}>
							Chương trình đã thay đổi sau khi ghi danh:
							{theory.summary.missing + rotations.summary.missing > 0 &&
								` ${theory.summary.missing + rotations.summary.missing} bài/vòng mới chưa có trong hồ sơ`}
							{theory.summary.missing + rotations.summary.missing > 0 &&
								theory.summary.extra + rotations.summary.extra > 0 &&
								','}
							{theory.summary.extra + rotations.summary.extra > 0 &&
								` ${theory.summary.extra + rotations.summary.extra} bài/vòng trong hồ sơ đã bị bỏ khỏi chương trình`}
							. Đồng bộ lại ở màn hình khóa học nếu cần.
						</div>
					)}

					{theory.items.length > 0 && (
						<section>
							<div className={styles.sectionTitle}>Bài lý thuyết</div>
							<ul className={styles.list}>
								{theory.items.map((it) => {
									const cfg = THEORY[it.status];
									return (
										<li
											key={it.lesson_id}
											className={`${styles.item} ${it.in_program ? '' : styles.itemExtra}`}
										>
											<div className={styles.itemMain}>
												<div className={styles.itemTitle}>
													{it.code && <span className={styles.code}>{it.code}</span>}
													{it.title}
													{it.hours ? <span className={styles.muted}> · {it.hours} tiết</span> : null}
												</div>
												{it.completed_at && (
													<div className={styles.segment}>Xong ngày {formatDate(it.completed_at)}</div>
												)}
												{!it.in_program && (
													<div className={styles.extraNote}>
														Chương trình hiện tại không còn bài này
													</div>
												)}
											</div>
											<Chip tone={cfg.tone}>{cfg.label}</Chip>
										</li>
									);
								})}
							</ul>
						</section>
					)}

					{rotations.items.length > 0 && (
						<section>
							<div className={styles.sectionTitle}>Vòng thực hành</div>
							<ul className={styles.list}>
								{rotations.items.map((it, i) => (
									<RotationRow
										key={it.lesson_id ?? `extra-${i}`}
										item={it}
									/>
								))}
							</ul>
						</section>
					)}

					{theory.items.length === 0 && rotations.items.length === 0 && (
						<div className={styles.emptyNote}>Chương trình chưa có bài học / vòng thực hành nào.</div>
					)}
				</div>
			)}
		</div>
	);
}
