import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckSvg, XSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { Button, Pagination, SearchInput, SkeletonTable, TableEmpty } from '@/shared/components';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { usePermission } from '@/shared/hooks/usePermission';
import { showToast } from '@/shared/utils/feedback';
import { formatDateVN } from '@/shared/utils/formatDate';
import { removeDiacritics } from '@/shared/utils/helper';
import { getPracticeResults, savePracticeResults } from '../api/courseApi';
import type { PracticeResultList, PracticeResultOption, PracticeResultRow } from '../types/course.type';
import styles from './Courses.module.css';
import local from './PracticeResults.module.css';

type Mark = 'pass' | 'fail';
interface Draft {
	result?: Mark;
	comment?: string;
}

const fold = (s: string) => removeDiacritics(s).toLowerCase();
const NO_MENTOR = '-';

/**
 * Nhập kết quả vòng thực hành GPHN hàng loạt (GĐ3): Phòng Đào tạo nhập hộ từ phiếu
 * giấy của người hướng dẫn — chọn NHD → các vòng đã kết thúc chưa có kết quả →
 * bấm Đạt / Không đạt từng dòng (hoặc "Tất cả Đạt") → Lưu một lần.
 */
export default function PracticeResults() {
	const navigate = useNavigate();
	const canEdit = usePermission().has('courses:update');
	const [params, setParams] = useSearchParams();
	const mentor = params.get('mentor') ?? '';
	const department = params.get('department') ?? '';
	const setParam = (k: string, v: string) =>
		setParams(
			(p) => {
				if (v) p.set(k, v);
				else p.delete(k);
				return p;
			},
			{ replace: true },
		);

	const [data, setData] = useState<PracticeResultList | null>(null);
	const [error, setError] = useState('');
	const [search, setSearch] = useState('');
	const [drafts, setDrafts] = useState<Record<string, Draft>>({});
	const [saving, setSaving] = useState(false);

	const load = useCallback(
		() =>
			getPracticeResults()
				.then((d) => {
					setData(d);
					setError('');
				})
				.catch((err) => setError(err instanceof Error ? err.message : 'Không tải được danh sách')),
		[],
	);
	useEffect(() => {
		void load();
	}, [load]);
	useRealtimeUpdate('course_enrollment', load);

	const filtered = useMemo(() => {
		const q = fold(search.trim());
		return (data?.rows ?? []).filter(
			(r) =>
				(!mentor || (r.mentor_user_id ?? NO_MENTOR) === mentor) &&
				(!department || r.department_id === department) &&
				(!q ||
					fold([r.trainee_name, r.practice_code, r.trainee_phone, r.round_title, r.course_name].filter(Boolean).join(' ')).includes(q)),
		);
	}, [data, mentor, department, search]);
	const pg = useClientPaging(filtered);

	const marked = Object.entries(drafts).filter(([, d]) => d.result);
	const setDraft = (id: string, patch: Draft) => setDrafts((m) => ({ ...m, [id]: { ...m[id], ...patch } }));
	const toggle = (id: string, result: Mark) => setDraft(id, { result: drafts[id]?.result === result ? undefined : result });
	const markAllPass = () =>
		setDrafts((m) => {
			const next = { ...m };
			for (const r of filtered) if (!next[r.id]?.result) next[r.id] = { ...next[r.id], result: 'pass' };
			return next;
		});

	const save = async () => {
		if (!marked.length) return;
		setSaving(true);
		try {
			const res = await savePracticeResults(
				marked.map(([id, d]) => ({ id, result: d.result as Mark, comment: d.comment?.trim() || null })),
			);
			const failedIds = new Set(res.failed.map((f) => f.id));
			setDrafts((m) => Object.fromEntries(Object.entries(m).filter(([id]) => failedIds.has(id))));
			if (res.failed.length)
				showToast('error', `Lưu ${res.saved} vòng; ${res.failed.length} vòng lỗi: ${res.failed[0].message}`);
			else showToast('success', `Đã lưu kết quả ${res.saved} vòng`);
			void load();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Lưu kết quả thất bại');
		} finally {
			setSaving(false);
		}
	};

	const optionLabel = (o: PracticeResultOption, empty: string) => `${o.name || empty} (${o.count})`;
	const filterActive = Boolean(mentor || department || search);

	const headerActions = canEdit && (
		<div className={local.headerActions}>
			{marked.length > 0 && (
				<Button variant='ghost' size='sm' disabled={saving} onClick={() => setDrafts({})}>
					Bỏ chọn
				</Button>
			)}
			<Button icon={<CheckSvg />} loading={saving} disabled={!marked.length} onClick={() => void save()}>
				Lưu {marked.length || ''} kết quả
			</Button>
		</div>
	);

	return (
		<AdminLayout
			pageTitle='Nhập kết quả vòng'
			pageSubtitle='Vòng thực hành GPHN đã kết thúc chưa có kết quả — nhập hộ từ phiếu đánh giá của người hướng dẫn'
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={headerActions}
		>
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Chờ nhập kết quả</span>
						<span className={styles.descText}>
							{filtered.length}
							{data && filtered.length !== data.total && ` / ${data.total}`} vòng
							{marked.length > 0 && ` · đã chọn ${marked.length}`}
						</span>
					</div>
					{canEdit && filtered.length > 0 && (
						<Button
							size='sm'
							variant='secondary'
							icon={<CheckSvg />}
							onClick={markAllPass}
							title='Đánh dấu Đạt cho mọi vòng đang hiện chưa chọn kết quả (chưa lưu)'
						>
							Tất cả Đạt
						</Button>
					)}
				</div>

				<div className={styles.enrFilters}>
					<div className={styles.enrFilterRow}>
						<select
							className={`${tbl.filterSelect} ${local.filter} ${mentor ? tbl.filterActive : ''}`}
							aria-label='Người hướng dẫn'
							value={mentor}
							onChange={(e) => setParam('mentor', e.target.value)}
						>
							<option value=''>Người hướng dẫn: tất cả</option>
							{data?.mentors.map((o) => (
								<option key={o.id || NO_MENTOR} value={o.id || NO_MENTOR}>
									{optionLabel(o, 'Chưa phân NHD')}
								</option>
							))}
						</select>
						<select
							className={`${tbl.filterSelect} ${local.filter} ${department ? tbl.filterActive : ''}`}
							aria-label='Khoa'
							value={department}
							onChange={(e) => setParam('department', e.target.value)}
						>
							<option value=''>Khoa: tất cả</option>
							{data?.departments
								.filter((o) => o.id)
								.map((o) => (
									<option key={o.id} value={o.id}>
										{optionLabel(o, '')}
									</option>
								))}
						</select>
						<div className={styles.enrSearch}>
							<SearchInput value={search} onChange={setSearch} placeholder='Tìm theo tên, mã thực hành, SĐT, vòng...' />
						</div>
						{filterActive && (
							<button
								type='button'
								className={styles.enrClear}
								onClick={() => {
									setSearch('');
									setParams({}, { replace: true });
								}}
							>
								Xoá bộ lọc
							</button>
						)}
					</div>
				</div>

				{error ? (
					<div className={styles.errorBanner}>{error}</div>
				) : (
					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th className={`${styles.th} ${styles.tdIdx}`}>STT</th>
									<th className={styles.th}>Học viên</th>
									<th className={styles.th}>Vòng · khoa</th>
									<th className={styles.th}>Thời gian</th>
									<th className={styles.th}>Người hướng dẫn</th>
									<th className={styles.th}>Kết quả</th>
									<th className={styles.th}>Nhận xét</th>
								</tr>
							</thead>
							<tbody>
								{!data ? (
									<SkeletonTable cols={7} />
								) : pg.paged.length === 0 ? (
									<TableEmpty
										colSpan={7}
										title={filterActive ? 'Không có vòng khớp bộ lọc' : 'Không còn vòng nào chờ nhập kết quả'}
										desc={filterActive ? 'Thử đổi người hướng dẫn, khoa hoặc từ khoá.' : undefined}
									/>
								) : (
									pg.paged.map((r, i) => (
										<ResultRow
											key={r.id}
											idx={pg.offset + i + 1}
											row={r}
											draft={drafts[r.id]}
											canEdit={canEdit && !saving}
											onToggle={(m) => toggle(r.id, m)}
											onComment={(c) => setDraft(r.id, { comment: c })}
											onOpen={() => navigate(`/admin/practice-records/${r.enrollment_id}?tab=rotations`)}
										/>
									))
								)}
							</tbody>
						</table>
					</div>
				)}
				<Pagination {...pg.pagination} itemLabel='vòng' />
			</div>
		</AdminLayout>
	);
}

function ResultRow({
	idx,
	row: r,
	draft,
	canEdit,
	onToggle,
	onComment,
	onOpen,
}: {
	idx: number;
	row: PracticeResultRow;
	draft: Draft | undefined;
	canEdit: boolean;
	onToggle: (m: Mark) => void;
	onComment: (c: string) => void;
	onOpen: () => void;
}) {
	const mark = draft?.result;
	return (
		<tr className={`${styles.tr} ${mark ? local.rowMarked : ''}`}>
			<td className={`${styles.td} ${styles.tdIdx}`}>{idx}</td>
			<td className={styles.td}>
				<span className={styles.itemName} onClick={onOpen}>
					{r.trainee_name}
				</span>
				<div className={styles.descText}>{[r.practice_code, r.program_code || r.program_name].filter(Boolean).join(' · ')}</div>
			</td>
			<td className={styles.td}>
				{r.round_title || `Vòng ${r.seq}`}
				{r.attempt_no > 1 && <span className={local.muted}> · lần {r.attempt_no}</span>}
				<div className={styles.descText}>{r.department_name || '—'}</div>
			</td>
			<td className={`${styles.td} ${local.nowrap}`}>
				{formatDateVN(r.start_date)} – {formatDateVN(r.end_date)}
				{r.duration_text && <div className={styles.descText}>{r.duration_text}</div>}
			</td>
			<td className={styles.td}>{r.mentor_name || <span className={local.muted}>Chưa phân</span>}</td>
			<td className={styles.td}>
				<div className={local.marks} role='group' aria-label={`Kết quả ${r.trainee_name}`}>
					<button
						type='button'
						className={`${local.mark} ${mark === 'pass' ? local.markPass : ''}`}
						aria-pressed={mark === 'pass'}
						disabled={!canEdit}
						onClick={() => onToggle('pass')}
					>
						<CheckSvg /> Đạt
					</button>
					<button
						type='button'
						className={`${local.mark} ${mark === 'fail' ? local.markFail : ''}`}
						aria-pressed={mark === 'fail'}
						disabled={!canEdit}
						onClick={() => onToggle('fail')}
					>
						<XSvg /> Không đạt
					</button>
				</div>
			</td>
			<td className={styles.td}>
				<input
					className={local.comment}
					value={draft?.comment ?? r.result_comment ?? ''}
					maxLength={1000}
					placeholder='Nhận xét (nếu có)'
					disabled={!canEdit}
					aria-label={`Nhận xét ${r.trainee_name}`}
					onChange={(e) => onComment(e.target.value)}
				/>
			</td>
		</tr>
	);
}
