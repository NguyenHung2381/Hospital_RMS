import { useMemo, useRef, useState } from 'react';
import { CheckSvg, SearchSvg, UserPlusSvg, XSvg } from '@/assets/icons';
import type { EnrollCandidate } from '../hooks/useCourseDetail';
import {
	ENROLLMENT_STATUS_CFG,
	type CourseProgramLink,
	type Enrollment,
	type EnrollmentStatus,
} from '../types/course.type';
import styles from './AddEnrollmentPanel.module.css';

/** Bỏ dấu + chữ thường để tìm "nguyen van" khớp "Nguyễn Văn". */
const normalize = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/g, 'd')
		.replace(/Đ/g, 'D')
		.toLowerCase();

/** Số dòng tối đa trong danh sách kết quả — gõ thêm để thu hẹp. */
const MAX_RESULTS = 40;

const programLabel = (p: CourseProgramLink) =>
	p.program_code ? `${p.program_code} — ${p.program_name}` : p.program_name;

/** Trạng thái lớp ngắn gọn (khóa ĐTLT / CTCV) kèm tông màu cho nhãn; khóa không theo sĩ số ⇒ null. */
const classBadge = (l: CourseProgramLink): { text: string; tone: 'open' | 'ready' | 'full' | 'wait' } | null => {
	if (!l.class_rule) return null;
	if (l.class_max != null && l.class_approved >= l.class_max) return { text: 'Đã đầy', tone: 'full' };
	if (l.class_opened_at) return { text: 'Đã mở lớp', tone: 'open' };
	if (l.class_approved >= l.class_min) return { text: 'Đủ sĩ số, chờ mở', tone: 'ready' };
	return { text: `Chưa mở · ${l.class_approved}/${l.class_min}`, tone: 'wait' };
};

/** 1 lượt ghi danh trong phiên mở khung — hiện ở cột "Vừa thêm" để đối chiếu đúng người, đúng lớp. */
export type RecentAdd = {
	key: string;
	name: string;
	programText: string | null;
	enrollmentId?: string;
	status?: EnrollmentStatus;
	waitlistPosition?: number | null;
	error?: string;
};

type OriginTab = 'all' | 'internal' | 'external';

export function AddEnrollmentPanel({
	candidates,
	enrollments,
	programLinks,
	programId,
	onProgramChange,
	busy,
	isRolling,
	recent,
	onAdd,
	onReveal,
	onClose,
}: {
	candidates: EnrollCandidate[];
	enrollments: Enrollment[];
	programLinks: CourseProgramLink[];
	/** Chương trình đang ghi danh vào ("" = chưa chọn). Đồng bộ với bộ lọc chương trình của bảng. */
	programId: string;
	onProgramChange: (programId: string) => void;
	busy: boolean;
	isRolling?: boolean;
	recent: RecentAdd[];
	onAdd: (candidate: EnrollCandidate) => Promise<void>;
	/** Cuộn tới dòng của đăng ký trong bảng (tự đổi bộ lọc nếu đang ẩn). */
	onReveal: (enrollmentId: string) => void;
	onClose: () => void;
}) {
	const [query, setQuery] = useState('');
	const [origin, setOrigin] = useState<OriginTab>('all');
	const [active, setActive] = useState(0);
	// Người đang ghi danh — nạp lại danh sách mất vài giây, hiện "Đang ghi danh…" trên đúng dòng đó.
	const [pendingId, setPendingId] = useState<string | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	// Bước 1: đang mở danh sách chọn lớp (chưa chọn lớp thì luôn mở).
	const [picking, setPicking] = useState(false);
	const [progQuery, setProgQuery] = useState('');
	const [progActive, setProgActive] = useState(0);
	const progSearchRef = useRef<HTMLInputElement>(null);
	const progListRef = useRef<HTMLDivElement>(null);

	const multiProgram = programLinks.length > 1;
	const needProgram = multiProgram && !programId;
	const program = programLinks.find((p) => p.program_id === programId);
	const showPicker = picking || !program;

	// Học viên đã có trong khóa — để báo "đã ở lớp này" / "đang học lớp khác của khóa".
	const byTrainee = useMemo(() => {
		const m = new Map<string, Enrollment[]>();
		for (const e of enrollments) m.set(e.trainee_id, [...(m.get(e.trainee_id) ?? []), e]);
		return m;
	}, [enrollments]);

	const programCount = useMemo(() => {
		const m = new Map<string, number>();
		for (const e of enrollments)
			if (e.program_id && e.status !== 'rejected') m.set(e.program_id, (m.get(e.program_id) ?? 0) + 1);
		return m;
	}, [enrollments]);

	const index = useMemo(
		() => candidates.map((c) => ({ c, text: normalize(`${c.full_name} ${c.sub}`) })),
		[candidates],
	);
	const originCount = (o: OriginTab) =>
		o === 'all' ? candidates.length : candidates.filter((c) => c.is_internal === (o === 'internal')).length;
	const matches = useMemo(() => {
		const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
		return index
			.filter(
				({ c, text }) =>
					(origin === 'all' || c.is_internal === (origin === 'internal')) && words.every((w) => text.includes(w)),
			)
			.map(({ c }) => c);
	}, [index, query, origin]);
	const shown = matches.slice(0, MAX_RESULTS);
	const activeIdx = Math.min(active, Math.max(shown.length - 1, 0));

	/** Đăng ký của người này ở chương trình đang chọn (khóa không có chương trình: ở khóa). */
	const sameClass = (c: EnrollCandidate) =>
		byTrainee.get(c.id)?.find((e) => !programLinks.length || (e.program_id ?? '') === programId);

	const add = async (c: EnrollCandidate) => {
		if (busy || pendingId || needProgram || sameClass(c)) return;
		setPendingId(c.id);
		try {
			await onAdd(c);
		} finally {
			setPendingId(null);
		}
		setQuery('');
		setActive(0);
		searchRef.current?.focus();
	};

	const onSearchKey = (e: React.KeyboardEvent) => {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (!shown.length) return;
			const next = (activeIdx + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
			setActive(next);
			listRef.current?.querySelector(`[data-idx="${next}"]`)?.scrollIntoView({ block: 'nearest' });
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (shown[activeIdx]) void add(shown[activeIdx]);
		} else if (e.key === 'Escape' && query) {
			e.preventDefault();
			setQuery('');
		}
	};

	const programMatches = useMemo(() => {
		const words = normalize(progQuery.trim()).split(/\s+/).filter(Boolean);
		return programLinks.filter((p) => {
			const text = normalize(`${p.program_code ?? ''} ${p.program_name}`);
			return words.every((w) => text.includes(w));
		});
	}, [programLinks, progQuery]);
	const progIdx = Math.min(progActive, Math.max(programMatches.length - 1, 0));

	const pickProgram = (id: string) => {
		onProgramChange(id);
		setPicking(false);
		setProgQuery('');
		setProgActive(0);
		setTimeout(() => searchRef.current?.focus(), 0);
	};
	const openPicker = () => {
		setPicking(true);
		setProgQuery('');
		setProgActive(Math.max(programLinks.findIndex((p) => p.program_id === programId), 0));
		setTimeout(() => progSearchRef.current?.focus(), 0);
	};

	const onProgKey = (e: React.KeyboardEvent) => {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (!programMatches.length) return;
			const n = programMatches.length;
			const next = (progIdx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
			setProgActive(next);
			progListRef.current?.querySelector(`[data-idx="${next}"]`)?.scrollIntoView({ block: 'nearest' });
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (programMatches[progIdx]) pickProgram(programMatches[progIdx].program_id);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			if (progQuery) setProgQuery('');
			else if (program) setPicking(false);
		}
	};

	const badge = (p: CourseProgramLink) => {
		const b = classBadge(p);
		return b && <span className={`${styles.badge} ${styles[`badge_${b.tone}`]}`}>{b.text}</span>;
	};

	const programShort = (id: string | null) => {
		const p = programLinks.find((l) => l.program_id === id);
		return p ? (p.program_code ?? p.program_name) : null;
	};

	return (
		<section className={styles.panel} aria-label='Thêm học viên vào khóa'>
			<header className={styles.head}>
				<div className={styles.headTitle}>
					<UserPlusSvg />
					<span>Thêm học viên vào khóa</span>
				</div>
				<button type='button' className={styles.close} onClick={onClose} aria-label='Đóng khung thêm học viên'>
					<XSvg />
				</button>
			</header>

			{multiProgram && (
				<div className={styles.step}>
					<div className={styles.stepLabel}>
						<span className={styles.stepNo}>1</span> Lớp ghi danh
						<span className={styles.stepNote}>
							{!showPicker
								? '· bảng bên dưới đang hiện học viên của lớp này'
								: `· ${programLinks.length} chương trình — gõ mã hoặc tên để tìm, ↑ ↓ Enter để chọn`}
						</span>
					</div>

					{!showPicker ? (
						<div className={styles.chosen}>
							<span className={styles.chosenCheck} aria-hidden>
								<CheckSvg />
							</span>
							<span className={styles.chosenName} title={programLabel(program)}>
								{program.program_code && <b>{program.program_code}</b>} {program.program_name}
							</span>
							<span className={styles.chosenMeta}>
								{programCount.get(program.program_id) ?? 0} học viên
								{badge(program)}
							</span>
							<button type='button' className={styles.changeBtn} onClick={openPicker}>
								Đổi lớp
							</button>
						</div>
					) : (
						<div className={styles.picker}>
							<div className={styles.search}>
								<SearchSvg className={styles.searchIcon} />
								<input
									ref={progSearchRef}
									className={styles.searchInput}
									value={progQuery}
									onChange={(e) => {
										setProgQuery(e.target.value);
										setProgActive(0);
									}}
									onKeyDown={onProgKey}
									placeholder='Tìm lớp theo mã hoặc tên chương trình…'
									aria-label='Tìm lớp ghi danh'
								/>
								{program && (
									<button type='button' className={styles.pickerCancel} onClick={() => setPicking(false)}>
										Giữ {program.program_code ?? 'lớp cũ'}
									</button>
								)}
							</div>
							<div className={styles.progList} ref={progListRef} role='listbox' aria-label='Chương trình ghi danh'>
								{programMatches.length === 0 ? (
									<div className={styles.empty}>Không có lớp nào khớp “{progQuery}”.</div>
								) : (
									programMatches.map((p, i) => {
										const on = p.program_id === programId;
										return (
											<button
												key={p.program_id}
												type='button'
												role='option'
												aria-selected={on}
												data-idx={i}
												className={`${styles.progRow} ${on ? styles.progRowOn : ''} ${i === progIdx ? styles.progRowActive : ''}`}
												title={programLabel(p)}
												onMouseEnter={() => setProgActive(i)}
												onClick={() => pickProgram(p.program_id)}
											>
												<span className={styles.programRadio} aria-hidden>
													{on && <CheckSvg />}
												</span>
												<span className={styles.progCode}>{p.program_code ?? '—'}</span>
												<span className={styles.progName}>{p.program_name}</span>
												<span className={styles.progMeta}>
													{programCount.get(p.program_id) ?? 0} HV
													{badge(p)}
												</span>
											</button>
										);
									})
								)}
							</div>
						</div>
					)}
				</div>
			)}

			<div className={styles.body}>
				<div className={styles.step}>
					<div className={styles.stepLabel}>
						{multiProgram && <span className={styles.stepNo}>2</span>} Tìm học viên / nhân viên nội viện
					</div>
					<div className={styles.searchRow}>
						<div className={styles.search}>
							<SearchSvg className={styles.searchIcon} />
							<input
								ref={searchRef}
								autoFocus
								className={styles.searchInput}
								value={query}
								onChange={(e) => {
									setQuery(e.target.value);
									setActive(0);
								}}
								onKeyDown={onSearchKey}
								placeholder='Gõ tên, SĐT, email, mã NV hoặc khoa…'
								aria-label='Tìm học viên để ghi danh'
							/>
							{query && (
								<button
									type='button'
									className={styles.searchClear}
									aria-label='Xóa tìm kiếm'
									onClick={() => {
										setQuery('');
										searchRef.current?.focus();
									}}
								>
									<XSvg />
								</button>
							)}
						</div>
						<div className={styles.originTabs} role='tablist' aria-label='Nguồn học viên'>
							{(
								[
									['all', 'Tất cả'],
									['internal', 'Nội viện'],
									['external', 'Ngoại viện'],
								] as const
							).map(([k, label]) => (
								<button
									key={k}
									type='button'
									role='tab'
									aria-selected={origin === k}
									className={`${styles.originTab} ${origin === k ? styles.originTabOn : ''}`}
									onClick={() => {
										setOrigin(k);
										setActive(0);
									}}
								>
									{label} <span className={styles.originCount}>{originCount(k)}</span>
								</button>
							))}
						</div>
					</div>

					{needProgram && (
						<div className={styles.warn}>Chọn chương trình / lớp ở bước 1 trước khi ghi danh.</div>
					)}

					<div className={styles.results} ref={listRef} role='listbox' aria-label='Kết quả tìm kiếm'>
						{shown.length === 0 ? (
							<div className={styles.empty}>
								{candidates.length === 0
									? 'Đang tải danh sách học viên…'
									: 'Không tìm thấy — thêm hồ sơ ở mục Học viên trước rồi quay lại ghi danh.'}
							</div>
						) : (
							shown.map((c, i) => {
								const here = sameClass(c);
								const others = (byTrainee.get(c.id) ?? []).filter((e) => e !== here && e.status !== 'rejected');
								const pending = pendingId === c.id;
								const disabled = busy || !!pendingId || needProgram;
								return (
									<div
										key={c.id}
										data-idx={i}
										role='option'
										aria-selected={i === activeIdx}
										className={`${styles.result} ${i === activeIdx ? styles.resultActive : ''} ${here ? styles.resultDone : ''}`}
										onMouseEnter={() => setActive(i)}
									>
										<div className={styles.resultMain}>
											<div className={styles.resultName}>
												{c.full_name}
												<span className={`${styles.tag} ${c.is_internal ? styles.tagIn : styles.tagOut}`}>
													{c.is_internal ? 'Nội viện' : 'Ngoại viện'}
												</span>
												{c.is_staff && (
													<span className={styles.tagNew} title='Nhân viên chưa có hồ sơ học viên — ghi danh sẽ tự tạo hồ sơ'>
														Chưa có hồ sơ HV
													</span>
												)}
											</div>
											{(c.sub || others.length > 0) && (
												<div className={styles.resultSub}>
													{c.sub}
													{others.length > 0 && (
														<span className={styles.otherClass}>
															{c.sub ? ' · ' : ''}Đã ghi danh lớp khác:{' '}
															{others.map((e) => programShort(e.program_id) ?? 'khóa này').join(', ')}
														</span>
													)}
												</div>
											)}
										</div>
										{here ? (
											<button
												type='button'
												className={styles.inClass}
												title='Đã ghi danh lớp này — bấm để xem trong bảng'
												onClick={() => onReveal(here.id)}
											>
												<CheckSvg /> Đã ở lớp này · {ENROLLMENT_STATUS_CFG[here.status].label}
											</button>
										) : (
											<button
												type='button'
												className={styles.addBtn}
												disabled={disabled}
												title={
													needProgram
														? 'Chọn chương trình trước'
														: `Ghi danh vào ${program ? programLabel(program) : 'khóa'}`
												}
												onClick={() => void add(c)}
											>
												{pending
													? 'Đang ghi danh…'
													: `Ghi danh${program?.program_code ? ` vào ${program.program_code}` : ''}`}
											</button>
										)}
									</div>
								);
							})
						)}
						{matches.length > shown.length && (
							<div className={styles.more}>
								Còn {matches.length - shown.length} người khác — gõ thêm để thu hẹp.
							</div>
						)}
					</div>
					<div className={styles.keys}>
						↑ ↓ chọn · Enter ghi danh · Ghi danh ở đây được duyệt luôn (lớp đủ sĩ số tối đa: nội viện vào danh sách
						chờ đợt sau)
						{isRolling && '; khóa thực hành: duyệt xong thì xếp lịch vòng ở bước sau'}.
					</div>
				</div>

				<aside className={styles.recent} aria-label='Vừa ghi danh'>
					<div className={styles.stepLabel}>
						Vừa ghi danh {recent.length > 0 && <span className={styles.recentCount}>{recent.length}</span>}
					</div>
					{recent.length === 0 ? (
						<div className={styles.recentEmpty}>
							Người ghi danh sẽ hiện ở đây kèm lớp đã vào, bấm “Xem” để tới đúng dòng trong bảng.
						</div>
					) : (
						<ul className={styles.recentList}>
							{recent.map((r) => (
								<li
									key={r.key}
									className={`${styles.recentItem} ${r.error ? styles.recentErr : r.status === 'waitlisted' ? styles.recentWait : ''}`}
								>
									<span className={styles.recentIcon} aria-hidden>
										{r.error ? <XSvg /> : <CheckSvg />}
									</span>
									<div className={styles.recentText}>
										<div className={styles.recentName}>{r.name}</div>
										<div className={styles.recentSub}>
											{r.programText && <>→ {r.programText} · </>}
											{r.error
												? r.error
												: r.status === 'waitlisted'
													? `Danh sách chờ${r.waitlistPosition ? ` (vị trí ${r.waitlistPosition})` : ''}`
													: r.status
														? ENROLLMENT_STATUS_CFG[r.status].label
														: ''}
										</div>
									</div>
									{r.enrollmentId && (
										<button type='button' className={styles.recentView} onClick={() => onReveal(r.enrollmentId!)}>
											Xem
										</button>
									)}
								</li>
							))}
						</ul>
					)}
				</aside>
			</div>
		</section>
	);
}
