import { useEffect, useState } from 'react';
import { AlertSvg as IcAlert, CheckSvg as IcCheck, PlusSvg as IcPlus, TrashSvg as IcTrash } from '@/assets/icons';
import { getTopicAuthors, setTopicAuthors } from '../api/topicApi';
import styles from '../pages/Topic.module.css';

interface AuthorDraft {
	tempId: string;
	author_name: string;
	affiliation: string;
	is_corresponding: boolean;
}

let tempSeq = 0;
const nextTempId = () => `new-${Date.now()}-${tempSeq++}`;

export function DrawerAuthorsTab({ topicId }: { topicId: string }) {
	const [authors, setAuthors] = useState<AuthorDraft[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		getTopicAuthors(topicId)
			.then((list) =>
				setAuthors(
					list.map((a) => ({
						tempId: a.id,
						author_name: a.author_name,
						affiliation: a.affiliation ?? '',
						is_corresponding: a.is_corresponding,
					})),
				),
			)
			.catch(() => setError('Không thể tải danh sách đồng tác giả'))
			.finally(() => setLoading(false));
	}, [topicId]);

	const addAuthor = () =>
		setAuthors((prev) => [
			...prev,
			{ tempId: nextTempId(), author_name: '', affiliation: '', is_corresponding: prev.length === 0 },
		]);

	const removeAuthor = (tempId: string) =>
		setAuthors((prev) => prev.filter((a) => a.tempId !== tempId));

	const updateAuthor = (tempId: string, patch: Partial<AuthorDraft>) =>
		setAuthors((prev) => prev.map((a) => (a.tempId === tempId ? { ...a, ...patch } : a)));

	// Chỉ 1 tác giả liên hệ tại 1 thời điểm — bật cái này thì tắt các cái khác.
	const setCorresponding = (tempId: string) =>
		setAuthors((prev) => prev.map((a) => ({ ...a, is_corresponding: a.tempId === tempId })));

	const moveAuthor = (index: number, dir: -1 | 1) =>
		setAuthors((prev) => {
			const next = [...prev];
			const target = index + dir;
			if (target < 0 || target >= next.length) return prev;
			[next[index], next[target]] = [next[target], next[index]];
			return next;
		});

	const handleSave = async () => {
		setSaving(true);
		setError('');
		setSaved(false);
		try {
			const result = await setTopicAuthors(
				topicId,
				authors
					.filter((a) => a.author_name.trim())
					.map((a) => ({
						author_name: a.author_name.trim(),
						affiliation: a.affiliation.trim() || undefined,
						is_corresponding: a.is_corresponding,
					})),
			);
			setAuthors(
				result.map((a) => ({
					tempId: a.id,
					author_name: a.author_name,
					affiliation: a.affiliation ?? '',
					is_corresponding: a.is_corresponding,
				})),
			);
			setSaved(true);
			setTimeout(() => setSaved(false), 2500);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Lưu danh sách đồng tác giả thất bại');
		} finally {
			setSaving(false);
		}
	};

	if (loading) return <div className={styles.infoLabel}>Đang tải...</div>;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
			<div
				className={styles.infoLabel}
				style={{ marginBottom: 0 }}
			>
				Danh sách đồng tác giả theo đúng thứ tự in trên bài báo
			</div>

			{authors.length === 0 && (
				<div style={{ fontSize: 13, color: 'var(--color-gray-400)', fontStyle: 'italic' }}>
					Chưa có tác giả nào
				</div>
			)}

			<div className={styles.memberList}>
				{authors.map((a, i) => (
					<div
						key={a.tempId}
						className={styles.memberItem}
						style={{ alignItems: 'flex-start', gap: 8 }}
					>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 6 }}>
							<button
								type='button'
								className={styles.actionBtn}
								onClick={() => moveAuthor(i, -1)}
								disabled={i === 0}
								title='Lên'
								style={{ width: 22, height: 22 }}
							>
								↑
							</button>
							<button
								type='button'
								className={styles.actionBtn}
								onClick={() => moveAuthor(i, 1)}
								disabled={i === authors.length - 1}
								title='Xuống'
								style={{ width: 22, height: 22 }}
							>
								↓
							</button>
						</div>

						<div className={styles.memberInfo} style={{ flex: 1 }}>
							<input
								className={styles.formInput}
								placeholder={`Tác giả ${i + 1}`}
								value={a.author_name}
								onChange={(e) => updateAuthor(a.tempId, { author_name: e.target.value })}
								style={{ marginBottom: 6 }}
							/>
							<input
								className={styles.formInput}
								placeholder='Đơn vị công tác (nếu có)'
								value={a.affiliation}
								onChange={(e) => updateAuthor(a.tempId, { affiliation: e.target.value })}
								style={{ marginBottom: 6 }}
							/>
							<label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
								<input
									type='radio'
									name='corresponding'
									checked={a.is_corresponding}
									onChange={() => setCorresponding(a.tempId)}
								/>
								Tác giả liên hệ
							</label>
						</div>

						<div
							className={`${styles.actionBtn} ${styles.danger}`}
							title='Xoá tác giả'
							onClick={() => removeAuthor(a.tempId)}
						>
							<IcTrash />
						</div>
					</div>
				))}
			</div>

			<button
				type='button'
				className={styles.btnSecondary}
				onClick={addAuthor}
				style={{ alignSelf: 'flex-start' }}
			>
				<IcPlus /> Thêm tác giả
			</button>

			{error && (
				<div className={styles.errorItem}>
					<IcAlert />
					<span>{error}</span>
				</div>
			)}

			<button
				type='button'
				className={styles.btnPrimary}
				onClick={() => void handleSave()}
				disabled={saving}
				style={{ alignSelf: 'flex-start' }}
			>
				{saving ? '...' : saved ? <IcCheck /> : null}
				{saving ? 'Đang lưu...' : saved ? 'Đã lưu' : 'Lưu danh sách tác giả'}
			</button>
		</div>
	);
}
