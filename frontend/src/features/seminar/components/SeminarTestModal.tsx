import { DatePicker, Modal, QuestionImageField, TimePicker } from '@/shared/components';
import { formatDateOr } from '@/shared/utils/formatDate';
import { useId, useState, type ReactNode } from 'react';
import { CheckSvg, PlusSvg, TrashSvg, UploadSvg, XSvg } from '@/assets/icons';
import { ImportQuestionsModal, type ImportedQuestion } from '@/features/exam/components/ImportQuestionsModal';
import { createSeminarTest, updateSeminarTest, uploadSeminarTestImage } from '../api/seminarApi';
import type { Seminar, SeminarTest, SeminarTestInput, SeminarTestQuestion } from '../types/seminar.type';
import styles from '../pages/Seminar.module.css';

const parse = (json: string | null): SeminarTestQuestion[] => {
	try {
		return JSON.parse(json || '[]');
	} catch {
		return [];
	}
};

const blank = (): SeminarTestQuestion => ({ q: '', options: ['', ''], answer: -1, points: 1 });
const isBlank = (q: SeminarTestQuestion) => !q.q.trim() && !q.image && q.options.every((o) => !o.trim());
// Câu chưa đặt điểm tính 1 — khớp questionPoints() ở backend
const pointsOf = (q: SeminarTestQuestion) => (q.points && q.points > 0 ? q.points : 1);
const round2 = (n: number) => Math.round(n * 100) / 100;
const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

// Soạn 1 đề kiểm tra trắc nghiệm của hội nghị (một hội nghị có nhiều đề) + cấu hình (giờ mở /
// dừng tiếp nhận, thời gian làm bài, điểm từng câu, điểm đạt, trộn đề). Người tự đăng ký
// qua QR phải điểm danh + nộp (và đạt điểm đạt nếu có) mọi đề "tính điều kiện CME" mới
// được cấp CME. test = null → thêm đề mới.
export function SeminarTestModal({
	seminar,
	test,
	onClose,
	onSaved,
}: {
	seminar: Seminar;
	test: SeminarTest | null;
	onClose: () => void;
	onSaved: () => void;
}) {
	const existing = seminar.tests ?? [];
	const [title, setTitle] = useState(
		() => test?.title ?? (existing.length ? `Bài kiểm tra ${existing.length + 1}` : 'Bài kiểm tra cuối buổi'),
	);
	const [countsForCme, setCountsForCme] = useState(test?.counts_for_cme ?? true);
	// QR chung của đề: quét → nhập họ tên → làm bài (không cần vé cá nhân)
	const [qrEnabled, setQrEnabled] = useState(!!test?.qr_enabled);
	const [qrCountsForCme, setQrCountsForCme] = useState(!!test?.qr_counts_for_cme);
	const [questions, setQuestions] = useState<SeminarTestQuestion[]>(() => {
		const list = parse(test?.test_questions ?? null);
		return list.length ? list : [blank()];
	});
	const [open, setOpen] = useState(test?.test_open ?? false);
	const [testDate, setTestDate] = useState(test?.test_date?.slice(0, 10) ?? '');
	const [startTime, setStartTime] = useState(test?.test_start_time ?? '');
	const [endDate, setEndDate] = useState(test?.test_end_date?.slice(0, 10) ?? '');
	const [endTime, setEndTime] = useState(test?.test_end_time ?? '');
	const [duration, setDuration] = useState(test?.test_duration_minutes?.toString() ?? '');
	const [passScore, setPassScore] = useState(test?.test_pass_score?.toString() ?? '');
	// Thang điểm tối đa (vd 10, 100) — trống = thang là tổng điểm các câu
	const [scale, setScale] = useState(test?.test_score_scale?.toString() ?? '');
	const [shuffleQuestions, setShuffleQuestions] = useState(!!test?.test_shuffle_questions);
	const [shuffleOptions, setShuffleOptions] = useState(!!test?.test_shuffle_options);
	// Ngày mở bài mặc định khi để trống — khớp testWindow() ở backend
	const defaultDate = (seminar.end_date || seminar.start_date || '').slice(0, 10);
	const openDay = testDate || defaultDate;
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [importing, setImporting] = useState(false);
	const titleId = useId();

	const filled = questions.filter((q) => !isBlank(q));
	const totalPoints = round2(filled.reduce((s, q) => s + pointsOf(q), 0));
	const scaleNum = numOrNull(scale);
	// Điểm đạt nhập theo thang (nếu đặt), không thì theo tổng điểm câu hỏi
	const passMax = scaleNum ?? totalPoints;

	const patch = (i: number, p: Partial<SeminarTestQuestion>) =>
		setQuestions((qs) => qs.map((q, k) => (k === i ? { ...q, ...p } : q)));

	const validate = () => {
		if (!title.trim()) return 'Chưa nhập tên đề kiểm tra.';
		if (open && !filled.length) return 'Chưa có câu hỏi nào để mở bài kiểm tra.';
		if (endDate && !endTime) return 'Chọn giờ dừng tiếp nhận (hoặc bỏ trống ngày dừng tiếp nhận).';
		if (startTime && endTime && `${endDate || openDay} ${endTime}` <= `${openDay} ${startTime}`)
			return 'Thời điểm dừng tiếp nhận phải sau thời điểm mở bài.';
		const d = numOrNull(duration);
		if (d !== null && !(Number.isInteger(d) && d >= 1 && d <= 1440))
			return 'Thời gian làm bài phải là số phút nguyên từ 1 đến 1440.';
		if (scaleNum !== null && !(scaleNum >= 1 && scaleNum <= 10000))
			return 'Thang điểm tối đa phải là số từ 1 đến 10000.';
		const p = numOrNull(passScore);
		if (p !== null && !(p >= 0)) return 'Điểm đạt không hợp lệ.';
		if (p !== null && scaleNum !== null && p > scaleNum)
			return `Điểm đạt (${p}) lớn hơn thang điểm tối đa (${scaleNum}).`;
		if (p !== null && scaleNum === null && filled.length && p > totalPoints)
			return `Điểm đạt (${p}) lớn hơn tổng điểm bài kiểm tra (${totalPoints}).`;
		const bad = questions.findIndex((q) => !isBlank(q) && q.points !== undefined && !(q.points > 0));
		if (bad >= 0) return `Câu ${bad + 1}: điểm phải lớn hơn 0.`;
		return '';
	};

	const save = async () => {
		// Bỏ câu để trống hoàn toàn; câu dở dang để server báo lỗi cụ thể
		const msg = validate();
		setError(msg);
		if (msg) return;
		setSaving(true);
		try {
			const data: SeminarTestInput = {
				title: title.trim(),
				counts_for_cme: countsForCme,
				qr_enabled: qrEnabled,
				qr_counts_for_cme: qrCountsForCme,
				test_questions: filled.map((q) => ({ ...q, points: pointsOf(q) })),
				test_open: open,
				test_date: testDate || null,
				test_start_time: startTime || null,
				test_end_date: (endTime && endDate) || null,
				test_end_time: endTime || null,
				test_duration_minutes: numOrNull(duration),
				test_pass_score: numOrNull(passScore),
				test_score_scale: scaleNum,
				test_shuffle_questions: shuffleQuestions,
				test_shuffle_options: shuffleOptions,
			};
			await (test ? updateSeminarTest(seminar.id, test.id, data) : createSeminarTest(seminar.id, data));
			onSaved();
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Lưu thất bại');
		} finally {
			setSaving(false);
		}
	};

	// Câu nhập từ file nối vào cuối (bỏ câu trống sẵn có); bấm Lưu mới ghi vào đề
	const handleImport = async (imported: ImportedQuestion[]) => {
		const added: SeminarTestQuestion[] = [];
		for (const x of imported) {
			added.push({
				q: x.question_text,
				image: x.image ? (await uploadSeminarTestImage(seminar.id, x.image)).url : null,
				options: x.options,
				answer: x.correctIndex ?? -1,
				points: x.points > 0 ? x.points : 1,
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
				title={test ? `Sửa đề — ${test.title}` : 'Thêm đề kiểm tra'}
				subtitle='Trắc nghiệm 1 đáp án · chấm tự động'
				size='lg'
				bodyClassName={styles.modalBody}
				footer={
					<>
						<button
							type='button'
							className={styles.btnCancel}
							onClick={onClose}
							disabled={saving}
						>
							Hủy
						</button>
						<button
							type='button'
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
				{/* ── Tên đề ── */}
				<div className={styles.formGroup}>
					<label
						className={styles.formLabel}
						htmlFor={titleId}
					>
						Tên đề <span className={styles.required}>*</span>
					</label>
					<input
						id={titleId}
						className={styles.formInput}
						value={title}
						maxLength={255}
						aria-required='true'
						onChange={(e) => setTitle(e.target.value)}
						placeholder='VD: Bài trước buổi, Bài cuối buổi, Phiên 1...'
					/>
				</div>

				{/* ── Thiết lập ── */}
				<label className={`${styles.testSwitch} ${open ? styles.testSwitchOn : ''}`}>
					<input
						type='checkbox'
						checked={open}
						onChange={(e) => setOpen(e.target.checked)}
					/>
					<span className={styles.testSwitchTrack} />
					<span>
						<b>{open ? 'Đang mở bài kiểm tra' : 'Bài kiểm tra đang tắt'}</b>
						<span className={styles.hint}>
							{open
								? 'Người đã điểm danh làm bài ngay trên vé QR (trong khung giờ bên dưới nếu có)'
								: 'Bật để người tham dự làm được bài'}
						</span>
					</span>
				</label>

				<div className={styles.testSettings}>
					<SettingRow
						label='Mở bài'
					>
						<DatePicker
							value={testDate}
							onChange={setTestDate}
							placeholder={defaultDate ? formatDateOr(defaultDate) : 'Hôm nay'}
							className={styles.testDate}
						/>
						<TimePicker
							className={styles.testTime}
							value={startTime}
							onChange={setStartTime}
							aria-label='Giờ mở bài'
						/>
					</SettingRow>
					<SettingRow
						label='Dừng nhận bài'
					>
						<DatePicker
							value={endDate}
							onChange={setEndDate}
							placeholder='Như ngày mở'
							min={openDay || undefined}
							className={styles.testDate}
						/>
						<TimePicker
							className={styles.testTime}
							value={endTime}
							onChange={setEndTime}
							aria-label='Giờ dừng nhận bài'
						/>
					</SettingRow>
					<SettingRow
						label='Thời gian làm'
					>
						<input
							type='number'
							min={1}
							max={1440}
							step={1}
							className={`${styles.formInput} ${styles.testNum}`}
							value={duration}
							onChange={(e) => setDuration(e.target.value)}
							placeholder='∞'
							aria-label='Thời gian làm bài (phút)'
						/>
						<span className={styles.testUnit}>phút</span>
					</SettingRow>
					<SettingRow
						label='Thang điểm'
						hint={
							scaleNum !== null && filled.length
								? `Điểm bài làm được quy về thang ${scaleNum}: điểm câu đúng ÷ ${totalPoints} × ${scaleNum}.`
								: 'Để trống = chấm theo tổng điểm các câu.'
						}
					>
						<input
							type='number'
							min={1}
							max={10000}
							step='any'
							className={`${styles.formInput} ${styles.testNum}`}
							value={scale}
							onChange={(e) => setScale(e.target.value)}
							placeholder={totalPoints ? String(totalPoints) : 'VD: 10'}
							aria-label='Thang điểm tối đa'
						/>
						<span className={styles.testUnit}>điểm tối đa</span>
					</SettingRow>
					<SettingRow
						label='Điểm đạt'
					>
						<input
							type='number'
							min={0}
							step='any'
							className={`${styles.formInput} ${styles.testNum}`}
							value={passScore}
							onChange={(e) => setPassScore(e.target.value)}
							placeholder='—'
							aria-label='Điểm đạt'
						/>
						<span className={styles.testUnit}>/ {passMax} điểm</span>
					</SettingRow>
					<SettingRow
						label='Điều kiện CME'
						hint={
							countsForCme
								? 'Người tự đăng ký phải nộp (và đạt điểm đạt nếu đặt) đề này mới được cấp CME.'
								: 'Đề tham khảo — làm hay không không ảnh hưởng việc cấp CME.'
						}
					>
						<label className={styles.checkFilter}>
							<input
								type='checkbox'
								checked={countsForCme}
								onChange={(e) => setCountsForCme(e.target.checked)}
							/>
							Tính vào điều kiện cấp CME
						</label>
					</SettingRow>
					<SettingRow
						label='QR chung'
						hint={
							qrEnabled
								? 'Chiếu mã QR của đề lên màn hình: người dự quét → nhập họ tên → làm bài, không cần vé cá nhân. Trùng tên người đã đăng ký thì họ tự xác nhận; không trùng ai thì được thêm vào danh sách là khách.'
								: 'Chỉ làm bài trên vé QR cá nhân (phải đăng ký + điểm danh).'
						}
					>
						<label className={styles.checkFilter}>
							<input
								type='checkbox'
								checked={qrEnabled}
								onChange={(e) => setQrEnabled(e.target.checked)}
							/>
							Cho làm bài bằng QR chung (nhập họ tên)
						</label>
						{qrEnabled && countsForCme && (
							<label className={styles.checkFilter}>
								<input
									type='checkbox'
									checked={qrCountsForCme}
									onChange={(e) => setQrCountsForCme(e.target.checked)}
								/>
								Tính bài nộp qua QR chung vào điều kiện CME
							</label>
						)}
					</SettingRow>
					<SettingRow label='Trộn đề'>
						<label className={styles.checkFilter}>
							<input
								type='checkbox'
								checked={shuffleQuestions}
								onChange={(e) => setShuffleQuestions(e.target.checked)}
							/>
							Câu hỏi
						</label>
						<label className={styles.checkFilter}>
							<input
								type='checkbox'
								checked={shuffleOptions}
								onChange={(e) => setShuffleOptions(e.target.checked)}
							/>
							Phương án
						</label>
					</SettingRow>
				</div>

				{error && <div className={`${styles.noticeBox} ${styles.noticeWarn}`}>{error}</div>}

				{/* ── Câu hỏi ── */}
				<div className={styles.testQHeader}>
					<span>
						<b>Câu hỏi</b>
						<span className={styles.muted}>
							{' '}
							· {filled.length} câu · {totalPoints} điểm
						</span>
					</span>
					<button
						type='button'
						className={styles.btnGhost}
						onClick={() => setImporting(true)}
						disabled={saving}
					>
						<UploadSvg /> Nhập từ Word/PDF
					</button>
				</div>

				{questions.map((q, i) => (
					<div
						key={i}
						className={styles.testQCard}
					>
						<div className={styles.testQHead}>
							<span className={styles.testQNum}>{i + 1}</span>
							<textarea
								className={styles.formTextarea}
								rows={2}
								value={q.q}
								onChange={(e) => patch(i, { q: e.target.value })}
								aria-label={`Nội dung câu hỏi ${i + 1}`}
								placeholder='Nội dung câu hỏi'
							/>
							<div className={styles.testQSide}>
								<label className={styles.testPoints}>
									<input
										type='number'
										min={0.25}
										step='any'
										value={q.points ?? ''}
										placeholder='1'
										onChange={(e) =>
											patch(i, { points: e.target.value === '' ? undefined : Number(e.target.value) })
										}
										aria-label={`Điểm câu ${i + 1}`}
									/>
									điểm
								</label>
								<button
									type='button'
									className={`${styles.actionBtn} ${styles.danger}`}
									title='Xóa câu hỏi'
									aria-label={`Xóa câu hỏi ${i + 1}`}
									onClick={() => setQuestions((qs) => qs.filter((_, k) => k !== i))}
								>
									<TrashSvg />
								</button>
							</div>
						</div>
						<div className={styles.testQBody}>
							<QuestionImageField
								value={q.image}
								onChange={(url) => patch(i, { image: url })}
								upload={(file) => uploadSeminarTestImage(seminar.id, file)}
								disabled={saving}
							/>
							{q.options.map((o, j) => (
								<div
									key={j}
									className={`${styles.testOption} ${q.answer === j ? styles.testOptionCorrect : ''}`}
								>
									<input
										type='radio'
										name={`answer-${i}`}
										title='Đánh dấu là đáp án đúng'
										aria-label={`Đáp án đúng của câu ${i + 1}: phương án ${String.fromCharCode(65 + j)}`}
										checked={q.answer === j}
										onChange={() => patch(i, { answer: j })}
									/>
									<span className={styles.testOptionKey}>{String.fromCharCode(65 + j)}</span>
									<input
										className={styles.formInput}
										value={o}
										onChange={(e) =>
											patch(i, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })
										}
										aria-label={`Phương án ${String.fromCharCode(65 + j)} của câu ${i + 1}`}
										placeholder={`Phương án ${String.fromCharCode(65 + j)}`}
									/>
									{q.options.length > 2 && (
										<button
											type='button'
											className={styles.actionBtn}
											title='Xóa phương án'
											aria-label={`Xóa phương án ${String.fromCharCode(65 + j)} của câu ${i + 1}`}
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
								className={styles.testLinkBtn}
								onClick={() => patch(i, { options: [...q.options, ''] })}
							>
								<PlusSvg /> Thêm phương án
							</button>
						</div>
					</div>
				))}
				<button
					type='button'
					className={styles.testAddQ}
					onClick={() => setQuestions((qs) => [...qs, blank()])}
				>
					<PlusSvg /> Thêm câu hỏi
				</button>
			</Modal>
			{importing && (
				<ImportQuestionsModal
					onlyType='single_choice'
					onClose={() => setImporting(false)}
					onImport={handleImport}
				/>
			)}
		</>
	);
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
	return (
		<div className={styles.testSettingRow}>
			<span className={styles.testSettingLabel}>{label}</span>
			<div className={styles.testSettingControl}>
				<div className={styles.testSettingInputs}>{children}</div>
				{hint && <span className={styles.hint}>{hint}</span>}
			</div>
		</div>
	);
}
