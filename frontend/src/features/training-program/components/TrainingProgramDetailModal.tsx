import { useEffect, useState } from 'react';
import { Button, Modal } from '@/shared/components';
import { BadgeSvg, EditSvg, InfoSvg, LayersSvg, ListSvg } from '@/assets/icons';
import { getProgramResults } from '../api/trainingProgramApi';
import { formatDuration, type ProgramResultRow, type TrainingProgram } from '../types/trainingProgram.type';
import { ProgramLessonsPanel } from './ProgramLessonsPanel';
import styles from '../pages/TrainingPrograms.module.css';
import m from './TrainingProgramDetailModal.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { Pagination } from '@/shared/components/Table/Pagination';

export type DetailTab = 'info' | 'lessons' | 'results';

const TABS: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
	{ key: 'info', label: 'Thông tin', icon: <InfoSvg /> },
	{ key: 'lessons', label: 'Bài học', icon: <ListSvg /> },
	{ key: 'results', label: 'Kết quả học tập', icon: <BadgeSvg /> },
];

const isBlank = (v: React.ReactNode) => v == null || v === '';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className={m.field}>
			<dt>{label}</dt>
			<dd>{isBlank(value) ? <span className={m.empty}>Chưa có</span> : value}</dd>
		</div>
	);
}

function Fact({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
	return (
		<div className={m.fact}>
			<div className={m.factLabel}>{label}</div>
			<div className={m.factValue}>{isBlank(value) ? <span className={m.factEmpty}>—</span> : value}</div>
			{hint && <div className={m.factHint}>{hint}</div>}
		</div>
	);
}

function capacityText(min: number | null, max: number | null) {
	if (min != null && max != null) return `${min}–${max}`;
	if (max != null) return `Tối đa ${max}`;
	if (min != null) return `Tối thiểu ${min}`;
	return null;
}

function InfoPanel({ program }: { program: TrainingProgram }) {
	const hasHours = program.theory_hours != null || program.practice_hours != null;
	const durationText = program.duration ?? formatDuration(program.duration_value, program.duration_unit);
	const hasCapacity = program.min_capacity != null || program.max_capacity != null;

	return (
		<div className={m.info}>
			<div className={m.facts}>
				<Fact
					label='Thời lượng'
					value={durationText}
				/>
				<Fact
					label='Tổng số tiết'
					value={hasHours || program.total_hours ? program.total_hours : null}
					hint={hasHours ? `LT ${program.theory_hours ?? 0} · TH ${program.practice_hours ?? 0}` : undefined}
				/>
				<Fact
					label='Sĩ số'
					value={capacityText(program.min_capacity, program.max_capacity)}
					hint={hasCapacity ? 'học viên / khóa' : undefined}
				/>
				<Fact
					label='Học phí'
					value={program.tuition_fee != null ? `${Number(program.tuition_fee).toLocaleString('vi-VN')} đ` : null}
				/>
			</div>

			<section className={m.section}>
				<h3 className={m.sectionTitle}>Thông tin chung</h3>
				<dl className={m.fields}>
					<Field
						label='Mã chương trình'
						value={program.code}
					/>
					<Field
						label='Loại hình'
						value={program.training_type_name}
					/>
					<Field
						label='Khoa / Phòng'
						value={program.department_name ?? program.department_note}
					/>
					<Field
						label='Số giờ tín chỉ'
						value={program.credit_hours}
					/>
					{program.professional_field_name && (
						<Field
							label='Lĩnh vực chuyên môn'
							value={program.professional_field_name}
						/>
					)}
					{program.practice_form_name && (
						<Field
							label='Hình thức hành nghề'
							value={program.practice_form_name}
						/>
					)}
				</dl>
			</section>

			<section className={m.section}>
				<h3 className={m.sectionTitle}>Đối tượng học viên</h3>
				<dl className={m.fields}>
					<Field
						label='Đối tượng'
						value={program.trainee_type_name}
					/>
					<Field
						label='Ghi chú'
						value={program.target_audience}
					/>
				</dl>
			</section>

			{!!program.rotations?.length && (
				<section className={m.section}>
					<h3 className={m.sectionTitle}>Vòng thực hành ({program.rotations.length} vòng)</h3>
					<div className={m.tableWrap}>
						<table className={tbl.table}>
							<thead>
								<tr>
									<th className={tbl.thIdx}>Vòng</th>
									<th>Tên vòng</th>
									<th>Thời lượng</th>
									<th>Khoa thực hành</th>
								</tr>
							</thead>
							<tbody>
								{program.rotations.map((r, i) => (
									<tr key={r.link_id}>
										<td className={tbl.tdIdx}>{i + 1}</td>
										<td>
											<span className={tbl.cellTitle}>{r.title}</span>
										</td>
										<td style={{ whiteSpace: 'nowrap' }}>
											{formatDuration(r.duration_value, r.duration_unit) ?? '—'}
										</td>
										<td>{r.department_names ?? '—'}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			)}

			<section className={m.section}>
				<h3 className={m.sectionTitle}>Mô tả</h3>
				{program.description ? (
					<p className={m.description}>{program.description}</p>
				) : (
					<p className={m.descriptionEmpty}>Chưa có mô tả cho chương trình này.</p>
				)}
			</section>
		</div>
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
				Chưa có kết quả học tập nào cho chương trình này. Điểm được chấm ở màn Khóa học (tab "Kết quả & chứng chỉ").
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
	const counts: Partial<Record<DetailTab, number | undefined>> = { lessons: program.lesson_count };

	return (
		<Modal
			open
			onClose={onClose}
			size='xl'
			className={m.dialog}
			bodyClassName={m.body}
			icon={<LayersSvg />}
			title={program.name}
			subtitle={
				<span className={m.subtitle}>
					{program.code && <span className={m.code}>{program.code}</span>}
					{program.code && program.training_type_name && <span className={m.dot}>·</span>}
					{program.training_type_name ?? (program.code ? null : 'Chương trình đào tạo')}
				</span>
			}
			footer={
				<>
					<Button
						variant='secondary'
						onClick={onClose}
					>
						Đóng
					</Button>
					<Button
						variant='primary'
						icon={<EditSvg />}
						onClick={onEdit}
					>
						Chỉnh sửa chương trình
					</Button>
				</>
			}
		>
			<div
				className={m.tabs}
				role='tablist'
			>
				{TABS.map((t) => {
					const active = tab === t.key;
					const count = counts[t.key];
					return (
						<button
							key={t.key}
							type='button'
							role='tab'
							aria-selected={active}
							className={`${m.tabBtn} ${active ? m.tabBtnActive : ''}`}
							onClick={() => setTab(t.key)}
						>
							{t.icon}
							{t.label}
							{count != null && <span className={m.tabCount}>{count}</span>}
						</button>
					);
				})}
			</div>

			{tab === 'info' && <InfoPanel program={program} />}
			{tab === 'lessons' && (
				<ProgramLessonsPanel
					program={program}
					programs={programs}
				/>
			)}
			{tab === 'results' && <ResultsPanel programId={program.id} />}
		</Modal>
	);
}
