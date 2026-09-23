import { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DocSvg, EditSvg, LinkSvg, MoreVSvg, PlusSvg, TrashSvg } from '@/assets/icons';
import { useRowSelection } from '@/shared/hooks/useRowSelection';
import { BulkButton, SelectCheckbox } from '@/shared/components/Table/RowSelect';
import { getAllLessons, getLessons, linkLessons, reorderLessons, unlinkLesson } from '../api/trainingProgramApi';
import type { Lesson, ProgramLessonLink, TrainingProgram } from '../types/trainingProgram.type';
import { LessonDocumentsModal } from './LessonDocumentsModal';
import { LessonFormModal } from './LessonFormModal';
import styles from '../pages/TrainingPrograms.module.css';

function SortableLessonRow({
	link,
	busy,
	onDocs,
	onEdit,
	onUnlink,
}: {
	link: ProgramLessonLink;
	busy: boolean;
	onDocs: () => void;
	onEdit: () => void;
	onUnlink: () => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id });
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.6 : 1,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={styles.subRow}
		>
			<span
				className={styles.dragHandle}
				title='Kéo để sắp xếp'
				{...attributes}
				{...listeners}
			>
				<MoreVSvg />
			</span>
			<div className={styles.subRowMain}>
				<div className={styles.subRowName}>
					{link.code ? `${link.code} · ` : ''}
					{link.title}
					{!link.is_active && (
						<span
							className={styles.tagPill}
							style={{ marginLeft: 6, background: 'var(--color-gray-100)', color: 'var(--color-gray-500)' }}
						>
							Ngưng hoạt động
						</span>
					)}
				</div>
				<div className={styles.subRowMeta}>
					{link.theory_hours} tiết LT · {link.practice_hours} tiết TH · {link.total_hours} tổng tiết · {link.credits} tín
					chỉ
					{link.description ? ` — ${link.description}` : ''}
				</div>
			</div>
			<button
				className={styles.btnGhost}
				onClick={onDocs}
			>
				<DocSvg /> Tài liệu
			</button>
			<button
				className={styles.actionBtn}
				title='Sửa'
				disabled={busy}
				onClick={onEdit}
			>
				<EditSvg />
			</button>
			<button
				className={styles.actionBtn}
				title='Gỡ khỏi chương trình này'
				disabled={busy}
				onClick={onUnlink}
			>
				<TrashSvg />
			</button>
		</div>
	);
}

export function ProgramLessonsPanel({ program, programs }: { program: TrainingProgram; programs: TrainingProgram[] }) {
	const [links, setLinks] = useState<ProgramLessonLink[]>([]);
	const [allLessons, setAllLessons] = useState<Lesson[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [docsLesson, setDocsLesson] = useState<{ id: string; title: string } | null>(null);
	const [formModal, setFormModal] = useState<{ mode: 'add' | 'edit'; lesson?: ProgramLessonLink } | null>(null);

	const load = useCallback(() => {
		return Promise.all([getLessons(program.id), getAllLessons()])
			.then(([l, all]) => {
				setLinks(l);
				setAllLessons(all);
			})
			.catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải bài học'))
			.finally(() => setLoading(false));
	}, [program.id]);

	useEffect(() => {
		load();
	}, [load]);

	const attachableLessons = useMemo(
		() => allLessons.filter((l) => !links.some((link) => link.lesson_id === l.id)),
		[allLessons, links],
	);
	const pickSel = useRowSelection(attachableLessons.map((l) => l.id));

	const handleAttachSelected = async () => {
		if (!pickSel.selectedCount) return;
		setBusy(true);
		setError('');
		try {
			await linkLessons(program.id, [...pickSel.selectedIds]);
			pickSel.clearSelection();
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Đính kèm bài học thất bại');
		} finally {
			setBusy(false);
		}
	};

	const handleUnlink = async (link: ProgramLessonLink) => {
		setBusy(true);
		try {
			await unlinkLesson(link.id);
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Gỡ bài học thất bại');
		} finally {
			setBusy(false);
		}
	};

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

	const handleDragEnd = async (e: DragEndEvent) => {
		const { active, over } = e;
		if (!over || active.id === over.id) return;
		const oldIndex = links.findIndex((l) => l.id === active.id);
		const newIndex = links.findIndex((l) => l.id === over.id);
		if (oldIndex < 0 || newIndex < 0) return;
		const next = [...links];
		const [moved] = next.splice(oldIndex, 1);
		next.splice(newIndex, 0, moved);
		setLinks(next);
		try {
			await reorderLessons(
				program.id,
				next.map((l) => l.id),
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Cập nhật thứ tự thất bại');
			await load();
		}
	};

	return (
		<div>
			{error && <div className={styles.errorBanner}>{error}</div>}

			<div
				className={styles.subRowMeta}
				style={{ marginBottom: 8 }}
			>
				Một bài học có thể được dùng chung ở nhiều chương trình đào tạo — sửa nội dung sẽ áp dụng cho mọi chương trình
				đang dùng bài học đó. Kéo biểu tượng ở đầu mỗi dòng để sắp xếp lại thứ tự.
			</div>

			<div className={styles.subToolbar}>
				<button
					className={styles.btnGhost}
					disabled={busy}
					onClick={() => setFormModal({ mode: 'add' })}
				>
					<PlusSvg /> Thêm bài học mới
				</button>
			</div>

			{attachableLessons.length > 0 && (
				<>
					<div className={styles.checkList}>
						{attachableLessons.map((l) => (
							<label
								key={l.id}
								className={styles.checkItem}
							>
								<SelectCheckbox
									title={l.title}
									checked={pickSel.isSelected(l.id)}
									onChange={() => pickSel.toggleSelect(l.id)}
								/>
								{l.code ? `${l.code} - ${l.title}` : l.title}
							</label>
						))}
					</div>
					<div className={styles.subToolbar}>
						<BulkButton
							disabled={busy || !pickSel.selectedCount}
							onClick={handleAttachSelected}
						>
							<LinkSvg /> Đính kèm đã chọn ({pickSel.selectedCount})
						</BulkButton>
					</div>
				</>
			)}

			{loading ? (
				<div className={styles.subEmpty}>Đang tải...</div>
			) : links.length === 0 ? (
				<div className={styles.subEmpty}>Chưa có bài học nào.</div>
			) : (
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={links.map((l) => l.id)}
						strategy={verticalListSortingStrategy}
					>
						<div className={styles.subList}>
							{links.map((link) => (
								<SortableLessonRow
									key={link.id}
									link={link}
									busy={busy}
									onDocs={() => setDocsLesson({ id: link.lesson_id, title: link.title })}
									onEdit={() => setFormModal({ mode: 'edit', lesson: link })}
									onUnlink={() => handleUnlink(link)}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
			)}

			{formModal && (
				<LessonFormModal
					mode={formModal.mode}
					lesson={formModal.lesson}
					programs={programs}
					defaultProgramId={program.id}
					onClose={() => setFormModal(null)}
					onSaved={load}
				/>
			)}

			{docsLesson && (
				<LessonDocumentsModal
					lesson={docsLesson}
					onClose={() => setDocsLesson(null)}
				/>
			)}
		</div>
	);
}
