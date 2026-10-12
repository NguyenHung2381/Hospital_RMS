import { Modal } from '@/shared/components';
import { useState } from 'react';
import { CheckSvg, PlusSvg, TrashSvg, XSvg } from '@/assets/icons';
import { updateSeminarTest } from '../api/seminarApi';
import type { Seminar, SeminarTestQuestion } from '../types/seminar.type';
import styles from '../pages/Seminar.module.css';

const parse = (json: string | null): SeminarTestQuestion[] => {
	try {
		return JSON.parse(json || '[]');
	} catch {
		return [];
	}
};

const blank = (): SeminarTestQuestion => ({ q: '', options: ['', ''], answer: -1 });

// Soạn bài test trắc nghiệm cuối buổi + mở/đóng bài test. Người tự đăng ký qua
// QR phải điểm danh + nộp bài mới được cấp CME (chấm tự động, chỉ ghi nhận điểm).
export function SeminarTestModal({
	seminar,
	onClose,
	onSaved,
}: {
	seminar: Seminar;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [questions, setQuestions] = useState<SeminarTestQuestion[]>(() => {
		const list = parse(seminar.test_questions);
		return list.length ? list : [blank()];
	});
	const [open, setOpen] = useState(seminar.test_open);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	const patch = (i: number, p: Partial<SeminarTestQuestion>) =>
		setQuestions((qs) => qs.map((q, k) => (k === i ? { ...q, ...p } : q)));

	const save = async () => {
		setError('');
		// Bỏ câu để trống hoàn toàn; câu dở dang để server báo lỗi cụ thể
		const list = questions.filter((q) => q.q.trim() || q.options.some((o) => o.trim()));
		if (open && !list.length) return setError('Chưa có câu hỏi nào để mở bài test.');
		setSaving(true);
		try {
			await updateSeminarTest(seminar.id, { test_questions: list, test_open: open });
			onSaved();
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Lưu thất bại');
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			title='Bài test cuối buổi'
			subtitle='Trắc nghiệm 1 đáp án · chọn ô tròn cạnh phương án đúng · chấm tự động'
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={saving}
					>
						Huỷ
					</button>
					<button
						className={styles.btnPrimary}
						onClick={() => void save()}
						disabled={saving}
					>
						{saving ? <span className={styles.spinner} /> : <CheckSvg />}
						Lưu
					</button>
				</>
			}
		>
			<label className={styles.checkFilter} style={{ marginBottom: 12 }}>
				<input
					type='checkbox'
					checked={open}
					onChange={(e) => setOpen(e.target.checked)}
				/>
				Mở bài test (người đã điểm danh làm được ngay trên vé QR của mình)
			</label>
			{error && <div className={`${styles.noticeBox} ${styles.noticeWarn}`}>{error}</div>}

			{questions.map((q, i) => (
				<div
					key={i}
					className={styles.infoCard}
					style={{ marginBottom: 12 }}
				>
					<div className={styles.formGroup}>
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
							<label className={styles.formLabel}>Câu {i + 1}</label>
							<button
								type='button'
								className={`${styles.actionBtn} ${styles.danger}`}
								title='Xoá câu hỏi'
								onClick={() => setQuestions((qs) => qs.filter((_, k) => k !== i))}
							>
								<TrashSvg />
							</button>
						</div>
						<textarea
							className={styles.formTextarea}
							rows={2}
							value={q.q}
							onChange={(e) => patch(i, { q: e.target.value })}
							placeholder='Nội dung câu hỏi'
						/>
					</div>
					{q.options.map((o, j) => (
						<div
							key={j}
							style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}
						>
							<input
								type='radio'
								name={`answer-${i}`}
								title='Đáp án đúng'
								checked={q.answer === j}
								onChange={() => patch(i, { answer: j })}
							/>
							<input
								className={styles.formInput}
								value={o}
								onChange={(e) =>
									patch(i, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })
								}
								placeholder={`Phương án ${String.fromCharCode(65 + j)}`}
							/>
							{q.options.length > 2 && (
								<button
									type='button'
									className={styles.actionBtn}
									title='Xoá phương án'
									onClick={() =>
										patch(i, {
											options: q.options.filter((_, k) => k !== j),
											answer: q.answer === j ? -1 : q.answer > j ? q.answer - 1 : q.answer,
										})
									}
								>
									<XSvg />
								</button>
							)}
						</div>
					))}
					<button
						type='button'
						className={styles.btnGhost}
						style={{ marginTop: 8 }}
						onClick={() => patch(i, { options: [...q.options, ''] })}
					>
						<PlusSvg /> Thêm phương án
					</button>
				</div>
			))}
			<button
				type='button'
				className={styles.btnGhost}
				onClick={() => setQuestions((qs) => [...qs, blank()])}
			>
				<PlusSvg /> Thêm câu hỏi
			</button>
		</Modal>
	);
}
