import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevLSvg, ChevRSvg, DeptSvg, UserCheckSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { DatePicker, InlineLoading, SearchInput } from '@/shared/components';
import { formatDateVN, toIsoDate } from '../../../shared/utils/formatDate';
import { getPracticeBoard } from '../api/courseApi';
import type {
	PracticeBoard as Board,
	PracticeBoardRow,
} from '../types/course.type';
import styles from './Courses.module.css';
import local from './PracticeBoard.module.css';

type Tab = 'department' | 'mentor';

const todayKey = () => toIsoDate(new Date());
const shiftDay = (day: string, delta: number) => {
	const d = new Date(`${day}T00:00:00`);
	d.setDate(d.getDate() + delta);
	return toIsoDate(d);
};
const span = (r: PracticeBoardRow) => `${formatDateVN(r.start_date)} – ${formatDateVN(r.end_date)}`;
const deptOf = (r: PracticeBoardRow) => r.current_department_name || r.department_name || '';

// Từ khóa khớp tên học viên, mã thực hành, NHD, khoa, chương trình, khóa
const matches = (r: PracticeBoardRow, q: string) =>
	!q ||
	[r.trainee_name, r.practice_code, r.mentor_name, deptOf(r), r.program_code, r.course_name]
		.filter(Boolean)
		.some((v) => String(v).toLowerCase().includes(q));


/** Thực hành GPHN vào 1 ngày: ai đang ở khoa nào, mỗi người hướng dẫn đang kèm mấy học viên. */
export default function PracticeBoard() {
	const navigate = useNavigate();
	const [date, setDate] = useState(todayKey);
	const [tab, setTab] = useState<Tab>('department');
	const [search, setSearch] = useState('');
	const [board, setBoard] = useState<Board | null>(null);
	const [error, setError] = useState('');
	const [refreshKey, setRefreshKey] = useState(0);

	const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate(['course_enrollment', 'course'], refresh);

	useEffect(() => {
		let cancelled = false;
		getPracticeBoard(date)
			.then((res) => {
				if (cancelled) return;
				setBoard(res);
				setError('');
			})
			.catch((e: Error) => {
				if (!cancelled) setError(e.message || 'Không thể tải dữ liệu thực hành');
			});
		return () => {
			cancelled = true;
		};
	}, [date, refreshKey]);

	const loading = !error && board?.date !== date;
	const q = search.trim().toLowerCase();

	const departments = useMemo(
		() =>
			(board?.departments ?? [])
				.map((d) => ({ ...d, rows: d.rows.filter((r) => matches(r, q)) }))
				.filter((d) => d.rows.length),
		[board, q],
	);
	// Số học viên của NHD giữ nguyên theo server (tải thật), ô tìm chỉ lọc dòng hiển thị
	const mentors = useMemo(
		() =>
			(board?.mentors ?? []).filter(
				(m) => !q || m.name.toLowerCase().includes(q) || m.rows.some((r) => matches(r, q)),
			),
		[board, q],
	);

	const openEnrollment = (r: PracticeBoardRow) => navigate(`/admin/practice-records/${r.enrollment_id}?tab=rotations`);

	const openCourse = (courseId: string) => navigate(`/admin/courses/${courseId}?tab=enrollments`);

	const traineeCell = (r: PracticeBoardRow) => (
		<>
			<span
				className={styles.itemName}
				title='Mở hồ sơ thực hành'
				onClick={() => openEnrollment(r)}
			>
				{r.trainee_name}
			</span>
			<div className={styles.descText}>
				{[r.practice_code, r.program_code || r.program_name].filter(Boolean).join(' · ') || '—'}
			</div>
		</>
	);
	const courseCell = (r: PracticeBoardRow) => (
		<span
			className={styles.itemName}
			title='Mở khóa học'
			onClick={() => openCourse(r.course_id)}
		>
			{r.course_name}
		</span>
	);

	const isToday = date === todayKey();
	const max = board?.max_mentor_load ?? 0;
	const s = board?.summary;

	return (
		<AdminLayout
			pageTitle='Thực hành theo ngày'
			pageSubtitle='Học viên đang thực hành ở khoa nào, mỗi người hướng dẫn đang kèm bao nhiêu học viên'
			breadcrumbs={[{ label: 'Đào tạo' }]}
		>
			<div className={local.toolbar}>
				<div className={local.dateNav}>
					<button
						className={local.navBtn}
						title='Ngày trước'
						onClick={() => setDate((d) => shiftDay(d, -1))}
					>
						<ChevLSvg />
					</button>
					<DatePicker
						className={local.dateField}
						value={date}
						onChange={(v) => v && setDate(v)}
					/>
					<button
						className={local.navBtn}
						title='Ngày sau'
						onClick={() => setDate((d) => shiftDay(d, 1))}
					>
						<ChevRSvg />
					</button>
					<button
						className={local.navBtn}
						disabled={isToday}
						onClick={() => setDate(todayKey())}
					>
						Hôm nay
					</button>
				</div>
				<div className={`${styles.segment} ${local.tabs}`} role='tablist'>
					<button
						role='tab'
						aria-selected={tab === 'department'}
						className={`${styles.segBtn}${tab === 'department' ? ` ${styles.segBtnActive}` : ''}`}
						onClick={() => setTab('department')}
					>
						<DeptSvg /> Theo khoa
					</button>
					<button
						role='tab'
						aria-selected={tab === 'mentor'}
						className={`${styles.segBtn}${tab === 'mentor' ? ` ${styles.segBtnActive}` : ''}`}
						onClick={() => setTab('mentor')}
					>
						<UserCheckSvg /> Theo người hướng dẫn
					</button>
				</div>
				<span className={local.spacer} />
				<SearchInput
					value={search}
					onChange={setSearch}
					placeholder='Tìm học viên, mã, NHD, khoa...'
				/>
			</div>

			{s && !error && (
				<div className={local.summary}>
					<span className={local.stat}>
						<b>{s.trainee_count}</b> học viên đang thực hành
					</span>
					<span className={local.stat}>
						<b>{s.department_count}</b> khoa
					</span>
					<span className={local.stat}>
						<b>{s.mentor_count}</b> người hướng dẫn
					</span>
					{s.over_limit_count > 0 && (
						<span className={`${local.stat} ${local.statDanger}`}>
							<b>{s.over_limit_count}</b> NHD kèm quá {max} học viên
						</span>
					)}
					{s.unassigned_mentor_count > 0 && (
						<span className={`${local.stat} ${local.statDanger}`}>
							<b>{s.unassigned_mentor_count}</b> học viên chưa có NHD
						</span>
					)}
				</div>
			)}

			{error ? (
				<div className={styles.errorBanner}>{error}</div>
			) : loading ? (
				<InlineLoading label='Đang tải dữ liệu thực hành…' />
			) : tab === 'department' ? (
				departments.length === 0 ? (
					<Empty
						text={
							q
								? 'Không có học viên khớp từ khóa'
								: `Không có học viên nào đang thực hành ngày ${formatDateVN(date)}`
						}
					/>
				) : (
					departments.map((d) => (
						<div
							key={d.key || '-'}
							className={`${styles.tableCard} ${local.group}`}
						>
							<div className={styles.tableHeader}>
								<div className={styles.tableHeaderLeft}>
									<span className={styles.tableTitle}>{d.name}</span>
									<span className={local.groupCount}>{d.trainee_count} học viên</span>
								</div>
							</div>
							<div className={styles.tableWrap}>
								<table className={styles.table}>
									<thead>
										<tr>
											<th className={`${styles.th} ${styles.tdIdx}`}>STT</th>
											<th className={styles.th}>Học viên</th>
											<th className={styles.th}>Vòng</th>
											<th className={styles.th}>Người hướng dẫn</th>
											<th className={styles.th}>Từ – đến</th>
											<th className={styles.th}>Khóa</th>
										</tr>
									</thead>
									<tbody>
										{d.rows.map((r, i) => (
											<tr
												key={r.id}
												className={styles.tr}
											>
												<td className={`${styles.td} ${styles.tdIdx}`}>{i + 1}</td>
												<td className={styles.td}>{traineeCell(r)}</td>
												<td className={styles.td}>
													{r.round_title || '—'}
													{r.attempt_no > 1 && (
														<div className={styles.descText}>Học lại lần {r.attempt_no}</div>
													)}
												</td>
												<td className={styles.td}>
													{r.mentor_name || <span className={local.muted}>Chưa phân công</span>}
												</td>
												<td className={`${styles.td} ${local.nowrap}`}>
													{span(r)}
													{r.duration_text && <div className={styles.descText}>{r.duration_text}</div>}
												</td>
												<td className={styles.td}>{courseCell(r)}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					))
				)
			) : mentors.length === 0 ? (
				<Empty
					text={
						q
							? 'Không có người hướng dẫn khớp từ khóa'
							: `Không có học viên nào đang thực hành ngày ${formatDateVN(date)}`
					}
				/>
			) : (
				<div className={styles.tableCard}>
					<div className={styles.tableHeader}>
						<div className={styles.tableHeaderLeft}>
							<span className={styles.tableTitle}>Người hướng dẫn</span>
							<span className={local.groupCount}>Ngưỡng: tối đa {max} học viên / NHD</span>
						</div>
					</div>
					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th className={`${styles.th} ${styles.tdIdx}`}>STT</th>
									<th className={styles.th}>Người hướng dẫn</th>
									<th className={styles.th}>Số học viên</th>
									<th className={styles.th}>Khoa</th>
									<th className={styles.th}>Học viên đang kèm</th>
								</tr>
							</thead>
							<tbody>
								{mentors.map((m, i) => (
									<tr
										key={m.key || '-'}
										className={`${styles.tr}${m.over_limit ? ` ${local.overRow}` : ''}`}
									>
										<td className={`${styles.td} ${styles.tdIdx}`}>{i + 1}</td>
										<td className={styles.td}>
											{m.key ? m.name : <span className={local.muted}>{m.name}</span>}
											{m.rows[0]?.mentor_license_no && (
												<div className={styles.descText}>CCHN {m.rows[0].mentor_license_no}</div>
											)}
										</td>
										<td className={styles.td}>
											<span
												className={`${local.load}${m.over_limit ? ` ${local.loadOver}` : ''}`}
												title={m.over_limit ? `Vượt ngưỡng ${max} học viên` : undefined}
											>
												{m.key ? `${m.trainee_count} / ${max}` : m.trainee_count}
											</span>
										</td>
										<td className={styles.td}>{m.departments.join(', ') || '—'}</td>
										<td className={styles.td}>
											<div className={local.traineeList}>
												{m.rows.map((r) => (
													<button
														key={r.id}
														className={local.traineeChip}
														title={`${deptOf(r) || 'Chưa chọn khoa'} · ${span(r)} · ${r.course_name}`}
														onClick={() => openEnrollment(r)}
													>
														{r.trainee_name}
														{r.practice_code ? ` (${r.practice_code})` : ''}
													</button>
												))}
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{!error && !loading && (
				<p className={local.hint}>
					Tính các vòng có ngày bắt đầu ≤ ngày đang xem ≤ ngày kết thúc, chưa bị đánh “không đạt”,
					hồ sơ chưa nghỉ học. Ngưỡng số học viên / NHD đổi ở Cài đặt hệ thống
					(PRACTICE_MENTOR_MAX_TRAINEES).
				</p>
			)}

		</AdminLayout>
	);
}

function Empty({ text }: { text: string }) {
	return (
		<div className={styles.tableCard}>
			<div className={styles.emptyState}>
				<div className={styles.emptyTitle}>{text}</div>
				<div className={styles.emptyDesc}>
					Trang này chỉ hiện học viên có vòng thực hành đang diễn ra vào ngày đã chọn. Chưa có dữ liệu? Vào Khóa học → mở
					khóa GPHN (mở liên tục) → tab Học viên → "Nhập sổ Excel" (tự xếp vòng cho dòng mới), hoặc "Thêm học viên" rồi
					"Xếp lịch" hồ sơ đã duyệt. Hoặc chọn ngày khác.
				</div>
			</div>
		</div>
	);
}
