import { useState } from 'react';
import { FormField } from '@/shared/components/Input/FormField';
import { FileDropzone, Modal, ModalActions } from '@/shared/components';
import { InlineLoading } from '@/shared/components/Loading';
import { CheckSvg, InfoSvg, UploadSvg } from '@/assets/icons';
import { importPracticeBook, type PracticeBookImportResult } from '../api/courseApi';
import styles from '../pages/Courses.module.css';

const ACTION_LABEL = { new: 'Thêm mới', update: 'Cập nhật' } as const;

// Nhập sổ thực hành GPHN (Excel mẫu sổ theo dõi) vào khóa: chọn file → xem trước
// (học viên, hồ sơ, vòng, chương trình suy ra, cảnh báo) → xác nhận ghi. Dòng mới chỉ
// cần thông tin học viên (+ ngày bắt đầu) — mã, vòng, khoa, NHD hệ thống tự điền.
export function PracticeBookImportModal({
	courseId,
	onClose,
	onImported,
}: {
	courseId: string;
	onClose: () => void;
	onImported: () => void;
}) {
	const [file, setFile] = useState<File | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [preview, setPreview] = useState<PracticeBookImportResult | null>(null);
	const [result, setResult] = useState<PracticeBookImportResult | null>(null);

	const pick = async (f: File | null) => {
		setFile(f);
		setPreview(null);
		setResult(null);
		setError('');
		if (!f) return;
		setLoading(true);
		try {
			setPreview(await importPracticeBook(courseId, f, true));
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Đọc file thất bại');
		} finally {
			setLoading(false);
		}
	};

	const commit = async () => {
		if (!file) return;
		setLoading(true);
		setError('');
		try {
			setResult(await importPracticeBook(courseId, file, false));
			onImported();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Nhập sổ thất bại');
		} finally {
			setLoading(false);
		}
	};

	const s = preview?.summary;
	const missingPrograms = preview?.rows?.some((r) => r.program_code && !r.program_found);
	const warnings = (result ?? preview)?.warnings ?? [];

	return (
		<Modal
			open
			onClose={onClose}
			size='xl'
			icon={<UploadSvg />}
			title='Nhập sổ thực hành (Excel)'
			subtitle='Học viên, hồ sơ thực hành, vòng khoa và người hướng dẫn'
			footer={
				result ? (
					<ModalActions
						onCancel={onClose}
						onConfirm={onClose}
						confirmLabel='Đóng'
					/>
				) : (
					<ModalActions
						onCancel={onClose}
						onConfirm={commit}
						loading={loading}
						confirmLabel={s ? `Nhập ${s.records} hồ sơ` : 'Nhập'}
					/>
				)
			}
		>
			{!result && (
				<>
					<div className={styles.noticeBox}>
						<InfoSvg />
						<span>
							File theo bố cục sổ theo dõi thực hành (cột <b>Mã thực hành</b>, <b>Họ và tên</b>, CMT/CCCD…, các
							nhóm <b>Khoa thực hành 1…n</b>). Học viên khớp theo CCCD; hồ sơ khớp theo <b>mã thực hành</b> — nhập lại
							thì cập nhật và thay các vòng của hồ sơ bằng vòng trong file.
							<br />
							<b>Học viên mới:</b> chỉ cần điền thông tin cá nhân, trình độ và <b>Ngày bắt đầu</b> (để trống mã
							thực hành và các cột khoa) — hệ thống tự sinh mã, xếp các khoa so le, chọn người hướng dẫn đang kèm ít
							người nhất và điền ngày từng khoa. Thực hành ≤ 3 tháng mà không ghi hình thức hành nghề được hiểu là
							chương trình "về Hồi sức cấp cứu".
						</span>
					</div>
					<FormField label='File Excel (.xlsx)'>
						<FileDropzone
							value={file}
							onChange={pick}
							accept='.xlsx'
							disabled={loading}
						/>
					</FormField>
					{loading && <InlineLoading label={preview ? 'Đang ghi dữ liệu… (vài phút với sổ lớn)' : 'Đang đọc file…'} />}
					{error && <div className={styles.fieldError}>{error}</div>}

					{s && preview && (
						<>
							<div
								className={`${styles.noticeBox} ${styles.noticeOk}`}
								style={{ marginTop: 12 }}
							>
								<CheckSvg />
								<span>
									<b>{s.records}</b> hồ sơ ({s.records_new} mới, {s.records_update} cập nhật
									{s.skipped ? `, bỏ qua ${s.skipped}` : ''}) · học viên: {s.trainees_new} mới, {s.trainees_update}{' '}
									đã có (trùng CCCD) · <b>{s.rotations}</b> vòng khoa, {s.mentors_linked} vòng gắn được tài khoản
									người hướng dẫn.
									<br />
									Chương trình:{' '}
									{Object.entries(s.programs)
										.map(([code, n]) => `${code} (${n})`)
										.join(', ')}
									{s.auto_arrange > 0 && (
										<>
											<br />
											<b>{s.auto_arrange}</b> hồ sơ chưa có khoa — sẽ tự xếp vòng, khoa, người hướng dẫn sau khi nhập.
										</>
									)}
								</span>
							</div>
							{missingPrograms && (
								<div className={styles.fieldError}>
									Một số chương trình chưa có trong danh mục — hồ sơ vẫn nhập được nhưng để trống chương trình. Nhập
									danh mục chương trình trước rồi nhập lại sổ để gắn.
								</div>
							)}
							{warnings.length > 0 && (
								<ul className={styles.warnList}>
									{warnings.map((w, i) => (
										<li key={i}>{w}</li>
									))}
								</ul>
							)}
							<div className={styles.importPreview}>
								<table className={styles.table}>
									<thead>
										<tr>
											<th>Dòng</th>
											<th>Mã thực hành</th>
											<th>Học viên</th>
											<th>Chương trình</th>
											<th>Vòng</th>
											<th>Hồ sơ</th>
										</tr>
									</thead>
									<tbody>
										{preview.rows?.map((r) => (
											<tr key={r.row}>
												<td>{r.row}</td>
												<td>{r.practice_code || <span className={styles.hint}>tự sinh</span>}</td>
												<td>
													{r.full_name}
													<div className={styles.subRowMeta}>
														{r.trainee_action === 'new' ? 'Học viên mới' : 'Học viên đã có'}
													</div>
												</td>
												<td style={{ color: r.program_code && !r.program_found ? '#b42318' : undefined }}>
													{r.program_code ?? '—'}
												</td>
												<td>
													{r.auto ? <span className={styles.hint}>tự xếp</span> : r.rotations}
													{r.departments && <div className={styles.subRowMeta}>{r.departments}</div>}
												</td>
												<td>{ACTION_LABEL[r.action]}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</>
					)}
				</>
			)}

			{result && (
				<>
					<div className={`${styles.noticeBox} ${styles.noticeOk}`}>
						<CheckSvg />
						<span>
							Đã ghi <b>{result.written}</b>/{result.summary.records} hồ sơ · học viên: {result.trainees_inserted} mới,{' '}
							{result.trainees_updated} cập nhật
							{result.programs_linked ? ` · gắn thêm ${result.programs_linked} chương trình vào khóa` : ''}
							{result.arranged ? ` · tự xếp vòng cho ${result.arranged} hồ sơ` : ''}.
							{!!result.templates?.length && (
								<>
									<br />
									Đã tạo mẫu vòng từ sổ cho:{' '}
									{result.templates.map((t) => `${t.program_code} (${t.rounds} vòng)`).join(', ')} — xem / sửa ở màn
									Chương trình đào tạo.
								</>
							)}
						</span>
					</div>
					{warnings.length > 0 && (
						<ul className={styles.warnList}>
							{warnings.map((w, i) => (
								<li key={i}>{w}</li>
							))}
						</ul>
					)}
				</>
			)}
		</Modal>
	);
}
