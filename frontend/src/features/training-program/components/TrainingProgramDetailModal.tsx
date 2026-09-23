import { useEffect, useState } from 'react';
import { BadgeSvg, EditSvg, InfoSvg, LayersSvg, ListSvg, XSvg } from '@/assets/icons';
import { getProgramResults } from '../api/trainingProgramApi';
import type { ProgramResultRow, TrainingProgram } from '../types/trainingProgram.type';
import { ProgramLessonsPanel } from './ProgramLessonsPanel';
import styles from '../pages/TrainingPrograms.module.css';

export type DetailTab = 'info' | 'lessons' | 'results';

const TABS: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
	{ key: 'info', label: 'Thông tin', icon: <InfoSvg /> },
	{ key: 'lessons', label: 'Bài học', icon: <ListSvg /> },
	{ key: 'results', label: 'Kết quả học tập', icon: <BadgeSvg /> },
];

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className={styles.formGroup}>
			<label className={styles.formLabel}>{label}</label>
			<div className={styles.subRowMeta}>{value ?? '—'}</div>
		</div>
	);
}

function ResultsPanel({ programId }: { programId: string }) {
	const [rows, setRows] = useState<ProgramResultRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		let cancelled = false;
		getProgramResults(programId)
			.then((r) => {
				if (!cancelled) setRows(r);
			})
			.catch((err) => {
				if (!cancelled) setError(err instanceof Error ? err.message : 'Không thể tải kết quả học tập');
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [programId]);

	if (loading) return <div className={styles.subEmpty}>Đang tải...</div>;
	if (error) return <div className={styles.errorBanner}>{error}</div>;
	if (rows.length === 0) {
		return (
			<div className={styles.subEmpty}>
				Chưa có kết quả học tập nào cho chương trình này. Điểm được chấm ở màn Khóa học (tab "Kết quả & Chứng chỉ").
			</div>
		);
	}

	return (
		<div style={{ overflowX: 'auto' }}>
			<table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
				<thead>
					<tr>
						<th style={{ textAlign: 'left', padding: 8 }}>Học viên</th>
						<th style={{ textAlign: 'left', padding: 8 }}>Khóa học</th>
						<th style={{ padding: 8 }}>TX</th>
						<th style={{ padding: 8 }}>GK</th>
						<th style={{ padding: 8 }}>CK</th>
						<th style={{ padding: 8 }}>Xếp loại</th>
						<th style={{ padding: 8 }}>Kết quả</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => (
						<tr
							key={r.id}
							style={{ borderTop: '1px solid var(--color-gray-100)' }}
						>
							<td style={{ padding: 8 }}>{r.trainee_name}</td>
							<td style={{ padding: 8 }}>{r.course_name}</td>
							<td style={{ padding: 8, textAlign: 'center' }}>{r.regular_score ?? '—'}</td>
							<td style={{ padding: 8, textAlign: 'center' }}>{r.midterm_score ?? '—'}</td>
							<td style={{ padding: 8, textAlign: 'center' }}>{r.final_score ?? r.score ?? '—'}</td>
							<td style={{ padding: 8, textAlign: 'center' }}>{r.classification ?? '—'}</td>
							<td style={{ padding: 8, textAlign: 'center' }}>{r.result ?? '—'}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export function TrainingProgramDetailModal({
	program,
	programs,
	initialTab = 'info',
	onClose,
	onEdit,
}: {
	program: TrainingProgram;
	programs: TrainingProgram[];
	initialTab?: DetailTab;
	onClose: () => void;
	onEdit: () => void;
}) {
	const [tab, setTab] = useState<DetailTab>(initialTab);

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalWide}`}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<LayersSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>{program.name}</div>
						<div className={styles.modalSub}>{program.code ?? 'Chương trình đào tạo'}</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>

				<div className={styles.subToolbar}>
					{TABS.map((t) => (
						<button
							key={t.key}
							type='button'
							className={styles.btnGhost}
							style={tab === t.key ? { background: 'var(--color-gray-100)' } : undefined}
							onClick={() => setTab(t.key)}
						>
							{t.icon} {t.label}
						</button>
					))}
				</div>

				<div className={styles.modalBody}>
					{tab === 'info' && (
						<div>
							<div className={styles.formGrid2}>
								<InfoRow
									label='Mã chương trình'
									value={program.code}
								/>
								<InfoRow
									label='Thời lượng'
									value={program.duration}
								/>
								<InfoRow
									label='Khoa / Phòng'
									value={program.department_name}
								/>
								<InfoRow
									label='Đối tượng học viên'
									value={program.trainee_type_name}
								/>
								<InfoRow
									label='Sĩ số tối đa'
									value={program.max_capacity}
								/>
							</div>
							<InfoRow
								label='Mô tả'
								value={program.description}
							/>
							<div className={styles.subToolbar}>
								<button
									className={styles.btnGhost}
									onClick={onEdit}
								>
									<EditSvg /> Chỉnh sửa chương trình
								</button>
							</div>
						</div>
					)}
					{tab === 'lessons' && (
						<ProgramLessonsPanel
							program={program}
							programs={programs}
						/>
					)}
					{tab === 'results' && <ResultsPanel programId={program.id} />}
				</div>
			</div>
		</div>
	);
}
