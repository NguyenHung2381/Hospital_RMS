import { useMemo, useState } from 'react';
import UserLayout from '../../../layouts/UserLayout';
import { ChevLSvg, ChevRSvg } from '@/assets/icons';
import { formatDateVN } from '../../../shared/utils/formatDate';
import { SEAT_ROLE_LABELS } from '../../council/types/council.type';
import { ProgressConclusion } from '../components/ProgressConclusion';
import { ProgressDocReader, type ReaderFile } from '../components/ProgressDocReader';
import { ProgressCouncilReviews } from '../components/ProgressCouncilReviews';
import { ProgressFilesSection } from '../components/ProgressFilesSection';
import { ProgressMyReview } from '../components/ProgressMyReview';
import { ProgressSidebar } from '../components/ProgressSidebar';
import { useCouncilProgress } from '../hooks/useCouncilProgress';
import {
	findMyReview,
	flattenInOrder,
	isDraftDirty,
	reviewWindow,
	SESSION_LABELS,
} from '../utils/councilProgressHelpers';
import { InlineLoading } from '@/shared/components';
import { useRevealOnSelect } from '@/shared/hooks/useRevealOnSelect';
import styles from './CouncilProgress.module.css';

export default function CouncilProgress() {
	const {
		user,
		loading,
		error,
		stats,
		councils,
		selectedTopicId,
		setSelectedTopicId,
		selectedTopic,
		drafts,
		setDraft,
		savingId,
		savedId,
		handleSave,
		uploadingId,
		setFileInputRef,
		clickFileInput,
		handleUpload,
		handleDeleteFile,
		resultDrafts,
		setResultDraft,
		savingResultId,
		savedResultId,
		handleSaveResult,
		uploadingMinutesId,
		setMinutesInputRef,
		clickMinutesInput,
		handleUploadMinutes,
		handleDeleteMinutes,
	} = useCouncilProgress();

	const ordered = useMemo(() => flattenInOrder(councils), [councils]);
	const dirtyIds = useMemo(() => {
		const s = new Set<string>();
		for (const t of ordered) {
			if (isDraftDirty(drafts[t.id], findMyReview(t, user?.id))) s.add(t.id);
		}
		return s;
	}, [ordered, drafts, user?.id]);
	const detailRef = useRevealOnSelect<HTMLElement>(selectedTopicId);

	// Khung "Đọc hồ sơ": mở/thu gọn giữ nguyên khi đổi đề tài; file đang đọc nhớ theo đề tài
	const [readerOpen, setReaderOpen] = useState(true);
	const [readerPick, setReaderPick] = useState<Record<string, string>>({});
	const openInReader = (topicId: string, fileId: string) => {
		setReaderPick((p) => ({ ...p, [topicId]: fileId }));
		setReaderOpen(true);
		requestAnimationFrame(() => {
			const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			document
				.getElementById('progress-reader')
				?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
		});
	};

	const idx = selectedTopic ? ordered.findIndex((x) => x.id === selectedTopic.id) : -1;
	const prev = idx > 0 ? ordered[idx - 1] : null;
	const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;

	const renderDetail = () => {
		if (!selectedTopic) {
			return (
				<div className={styles.detailEmpty}>
					<div className={styles.detailEmptyTitle}>Chọn một đề tài để chấm</div>
					<div className={styles.detailEmptyDesc}>
						Danh sách bên trái gồm các đề tài bạn có ghế trong hội đồng.
					</div>
				</div>
			);
		}
		const t = selectedTopic;
		const d = drafts[t.id] ?? { percent: '', rating: '' as const, comment: '' };
		const rd = resultDrafts[t.id] ?? { conclusion: '' as const, general_comment: '' };
		const mine = findMyReview(t, user?.id);
		const readerFiles: ReaderFile[] = [
			...t.topic_files.map((file) => ({ file, group: 'Hồ sơ đề tài' })),
			...t.evaluation_files.map((file) => ({ file, group: 'File đánh giá' })),
			...t.minutes_files.map((file) => ({ file, group: 'Biên bản hội đồng' })),
		];
		const activeFileId =
			readerFiles.find((x) => x.file.id === readerPick[t.id])?.file.id ?? readerFiles[0]?.file.id ?? null;

		const meta: { label: string; value: string }[] = [
			{ label: 'Hội đồng', value: t.council_name },
			...(t.defense_date ? [{ label: 'Ngày họp', value: formatDateVN(t.defense_date) }] : []),
			...(t.session ? [{ label: 'Phiên', value: SESSION_LABELS[t.session] || t.session }] : []),
			...(t.location ? [{ label: 'Địa điểm', value: t.location }] : []),
			...(t.round_name ? [{ label: 'Đợt', value: t.round_name }] : []),
		];

		return (
			<>
				<header className={styles.detailHead}>
					<div className={styles.detailTopRow}>
						<div className={styles.detailTags}>
							<span className={styles.seatChip}>{SEAT_ROLE_LABELS[t.my_role]}</span>
							{t.department_name && <span className={styles.metaChip}>{t.department_name}</span>}
							{t.category_name && <span className={styles.metaChip}>{t.category_name}</span>}
						</div>
						<nav
							className={styles.stepper}
							aria-label='Chuyển đề tài'
						>
							<button
								type='button'
								className={styles.stepBtn}
								disabled={!prev}
								onClick={() => prev && setSelectedTopicId(prev.id)}
								aria-label='Đề tài trước'
								title={prev ? prev.title : undefined}
							>
								<ChevLSvg aria-hidden />
							</button>
							<span className={`${styles.stepCount} ${styles.num}`}>
								{idx + 1}/{ordered.length}
							</span>
							<button
								type='button'
								className={styles.stepBtn}
								disabled={!next}
								onClick={() => next && setSelectedTopicId(next.id)}
								aria-label='Đề tài sau'
								title={next ? next.title : undefined}
							>
								<ChevRSvg aria-hidden />
							</button>
						</nav>
					</div>
					<h2 className={styles.detailTitle}>{t.title}</h2>
					<dl className={styles.metaList}>
						{meta.map((m) => (
							<div
								key={m.label}
								className={styles.metaItem}
							>
								<dt>{m.label}</dt>
								<dd>{m.value}</dd>
							</div>
						))}
					</dl>
				</header>

				<div className={styles.detailBody}>
					{readerFiles.length > 0 && (
						<div className={styles.detailWide}>
							<ProgressDocReader
								files={readerFiles}
								activeId={activeFileId}
								onSelect={(id) => setReaderPick((p) => ({ ...p, [t.id]: id }))}
								open={readerOpen}
								onToggle={() => setReaderOpen((o) => !o)}
							/>
						</div>
					)}
					<div className={styles.detailMain}>
						<ProgressMyReview
							key={t.id}
							topic={t}
							draft={d}
							setDraft={setDraft}
							savingId={savingId}
							savedId={savedId}
							onSave={handleSave}
							window={reviewWindow(t.defense_date)}
							mine={mine}
							dirty={dirtyIds.has(t.id)}
						/>
						<ProgressCouncilReviews
							topic={t}
							userId={user?.id}
						/>
						<ProgressConclusion
							key={`c-${t.id}`}
							topic={t}
							isChairman={t.my_role === 'chairman'}
							resultDraft={rd}
							setResultDraft={setResultDraft}
							savingResultId={savingResultId}
							savedResultId={savedResultId}
							onSaveResult={handleSaveResult}
						/>
					</div>
					<div className={styles.detailAside}>
						<ProgressFilesSection
							topic={t}
							isSecretary={t.my_role === 'secretary'}
							setFileInputRef={setFileInputRef}
							clickFileInput={clickFileInput}
							uploadingId={uploadingId}
							onUpload={handleUpload}
							onDeleteFile={handleDeleteFile}
							setMinutesInputRef={setMinutesInputRef}
							clickMinutesInput={clickMinutesInput}
							uploadingMinutesId={uploadingMinutesId}
							onUploadMinutes={handleUploadMinutes}
							onDeleteMinutes={handleDeleteMinutes}
							onOpen={(id) => openInReader(t.id, id)}
							activeFileId={readerOpen ? activeFileId : null}
						/>
					</div>
				</div>
			</>
		);
	};

	return (
		<UserLayout
			pageTitle='Đánh giá tiến độ đề tài'
			pageSubtitle='Chấm tiến độ các đề tài bạn được phân công; thư ký tải biên bản và file đánh giá'
			userName={user?.full_name ?? user?.username ?? 'Người dùng'}
			userRole={user?.role ?? user?.role_name ?? 'Thành viên'}
			hideSidebar
		>
			{loading ? (
				<InlineLoading label='Đang tải…' />
			) : error ? (
				<div className={`${styles.stateBox} ${styles.stateError}`}>{error}</div>
			) : councils.length === 0 ? (
				<div className={styles.stateBox}>
					<div className={styles.emptyTitle}>Bạn chưa được phân công vào hội đồng nào</div>
					<div className={styles.emptyDesc}>
						Khi bạn có ghế trong một hội đồng, các đề tài cần chấm tiến độ sẽ hiện ở đây.
					</div>
				</div>
			) : (
				<div className={styles.split}>
					<ProgressSidebar
						councils={councils}
						stats={stats}
						selectedTopicId={selectedTopicId}
						setSelectedTopicId={setSelectedTopicId}
						userId={user?.id}
						dirtyIds={dirtyIds}
					/>
					<section
						ref={detailRef}
						className={styles.detail}
					>
						{renderDetail()}
					</section>
				</div>
			)}
		</UserLayout>
	);
}
