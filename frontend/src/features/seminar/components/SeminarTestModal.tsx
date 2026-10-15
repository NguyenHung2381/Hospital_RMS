import { DatePicker, Modal, QuestionImageField } from '@/shared/components';
import { formatDateOr } from '@/shared/utils/formatDate';
import { useState } from 'react';
import { CheckSvg, PlusSvg, TrashSvg, UploadSvg, XSvg } from '@/assets/icons';
import { ImportQuestionsModal, type ImportedQuestion } from '@/features/exam/components/ImportQuestionsModal';
import { updateSeminarTest, uploadSeminarTestImage } from '../api/seminarApi';
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
const isBlank = (q: SeminarTestQuestion) => !q.q.trim() && !q.image && q.options.every((o) => !o.trim());

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
	const [testDate, setTestDate] = useState(seminar.test_date?.slice(0, 10) ?? '');
	const [startTime, setStartTime] = useState(seminar.test_start_time ?? '');
	const [endTime, setEndTime] = useState(seminar.test_end_time ?? '');
	// Ngày làm bài mặc định khi để trống — khớp testWindow() ở backend
	const defaultDate = (seminar.end_date || seminar.start_date || '').slice(0, 10);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [importing, setImporting] = useState(false);

	const patch = (i: number, p: Partial<SeminarTestQuestion>) =>
		setQuestions((qs) => qs.map((q, k) => (k === i ? { ...q, ...p } : q)));

	const save = async () => {
		setError('');
		// Bỏ câu để trống hoàn toàn; câu dở dang để server báo lỗi cụ thể
		const list = questions.filter((q) => !isBlank(q));
		if (open && !list.length) return setError('Chưa có câu hỏi nào để mở bài test.');
		if (startTime && endTime && endTime <= startTime) return setError('Giờ đóng bài test phải sau giờ mở.');
		setSaving(true);
		try {
			await updateSeminarTest(seminar.id, {
				test_questions: list,
				test_open: open,
				test_date: testDate || null,
				test_start_time: startTime || null,
				test_end_time: endTime || null,
			});
			onSaved();
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Lưu thất bại');
		} finally {
			setSaving(false);
		}
	};

	// Câu nhập từ file nối vào cuối (bỏ câu trống sẵn có); bấm Lưu mới ghi vào hội nghị
	const handleImport = async (imported: ImportedQuestion[]) => {
		const added: SeminarTestQuestion[] = [];
		for (const x of imported) {
			added.push({
				q: x.question_text,
				image: x.image ? (await uploadSeminarTestImage(seminar.id, x.image)).url : null,
				options: x.options,
				answer: x.correctIndex ?? -1,
			});
		}
		setQuestions((qs) => [...qs.filter((q) => !isBlank(q)), ...added]);
		setImporting(false);
	};

	return (
		<>
			<Modal
				open
				// Esc khi đang mở modal nhập file chỉ đóng modal đó
				onClose={importing ? () => {} : onClose}
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
				<div className={styles.formGrid} style={{ marginBottom: 12 }}>
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Ngày làm bài</label>
						<DatePicker
							value={testDate}
							onChange={setTestDate}
						/>
						<span className={styles.hint}>
							Trống = {defaultDate ? `ngày kết thúc hội nghị (${formatDateOr(defaultDate)})` : 'hôm nay'}
						</span>
					</div>
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Thời gian làm bài</label>
						<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
							<input
								type='time'
								className={styles.formInput}
								value={startTime}
								onChange={(e) => setStartTime(e.target.value)}
								title='Giờ mở'
							/>
							<span>–</span>
							<input
								type='time'
								className={styles.formInput}
								value={endTime}
								onChange={(e) => setEndTime(e.target.value)}
								title='Giờ đóng'
							/>
						</div>
						<span className={styles.hint}>
							Có giờ thì bài test tự mở / tự đóng theo khung giờ (vẫn cần tích "Mở bài test")
						</span>
					</div>
				</div>
				{error && <div className={`${styles.noticeBox} ${styles.noticeWarn}`}>{error}</div>}

				{questions.map((q, i) => (
					<div
						key={i}
						className={styles.infoCard}
						style={{ marginBottom: 12 }}
					>
						<div className={styles.formGroup}>
							<div
								style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
							>
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
						<QuestionImageField
							value={q.image}
							onChange={(url) => patch(i, { image: url })}
							upload={(file) => uploadSeminarTestImage(seminar.id, file)}
							disabled={saving}
						/>
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
				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					<button
						type='button'
						className={styles.btnGhost}
						onClick={() => setQuestions((qs) => [...qs, blank()])}
					>
						<PlusSvg /> Thêm câu hỏi
					</button>
					<button
						type='button'
						className={styles.btnGhost}
						onClick={() => setImporting(true)}
						disabled={saving}
					>
						<UploadSvg /> Nhập từ Word/PDF
					</button>
				</div>
			</Modal>
			{importing && (
				<ImportQuestionsModal
					multipleChoiceOnly
					withPoints={false}
					onClose={() => setImporting(false)}
					onImport={handleImport}
				/>
			)}
		</>
	);
}
