import { FormField } from '@/shared/components/Input/FormField';
import { useEffect, useState } from 'react';
import { BadgeSvg, EditSvg, InfoSvg, LayersSvg, ListSvg, XSvg } from '@/assets/icons';
import { getProgramResults } from '../api/trainingProgramApi';
import type { ProgramResultRow, TrainingProgram } from '../types/trainingProgram.type';
import { ProgramLessonsPanel } from './ProgramLessonsPanel';
import styles from '../pages/TrainingPrograms.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { Pagination } from '@/shared/components/Table/Pagination';

export type DetailTab = 'info' | 'lessons' | 'results';

const TABS: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
	{ key: 'info', label: 'Thông tin', icon: <InfoSvg /> },
	{ key: 'lessons', label: 'Bài học', icon: <ListSvg /> },
	{ key: 'results', label: 'Kết quả học tập', icon: <BadgeSvg /> },
];

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<FormField label={label}>
			<div className={styles.subRowMeta}>{value ?? '—'}</div>
		</FormField>
	);
}

function ResultsPanel({ programId }: { programId: string }) {
	const [rows, setRows] = useState<ProgramResultRow[]>([]);
	const pg = useClientPaging(rows);
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
			<table className={tbl.table}>
				<thead>
					<tr>
						<th className={tbl.thIdx}>STT</th>
						<th>Học viên</th>
						<th>Khóa học</th>
						<th className={tbl.thCenter}>TX</th>
						<th className={tbl.thCenter}>GK</th>
						<th className={tbl.thCenter}>CK</th>
						<th className={tbl.thCenter}>Xếp loại</th>
						<th className={tbl.thCenter}>Kết quả</th>
					</tr>
				</thead>
				<tbody>
					{pg.paged.map((r, i) => (
						<tr key={r.id}>
							<td className={tbl.tdIdx}>{pg.offset + i + 1}</td>
							<td><span className={tbl.cellTitle}>{r.trainee_name}</span></td>
							<td>{r.course_name}</td>
							<td className={tbl.tdCenter}>{r.regular_score ?? '—'}</td>
							<td className={tbl.tdCenter}>{r.midterm_score ?? '—'}</td>
							<td className={tbl.tdCenter}>{r.final_score ?? r.score ?? '—'}</td>
							<td className={tbl.tdCenter}>{r.classification ?? '—'}</td>
							<td className={tbl.tdCenter}>{r.result ?? '—'}</td>
						</tr>
					))}
				</tbody>
			</table>
			<Pagination
				{...pg.pagination}
				itemLabel='kết quả'
			/>
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
									label='Loại hình'
									value={program.training_type_name}
								/>
								<InfoRow
									label='Thời lượng'
									value={program.duration}
								/>
								<InfoRow
									label='Số tiết (LT / TH / tổng)'
									value={
										program.theory_hours != null || program.practice_hours != null
											? `${program.theory_hours ?? 0} / ${program.practice_hours ?? 0} / ${program.total_hours}`
											: null
									}
								/>
								<InfoRow
									label='Số giờ tín chỉ'
									value={program.credit_hours}
								/>
								<InfoRow
									label='Học phí'
									value={program.tuition_fee != null ? `${Number(program.tuition_fee).toLocaleString('vi-VN')} đ` : null}
								/>
								<InfoRow
									label='Khoa / Phòng'
									value={program.department_name ?? program.department_note}
								/>
								<InfoRow
									label='Đối tượng học viên'
									value={program.target_audience ?? program.trainee_type_name}
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
