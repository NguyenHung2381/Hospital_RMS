import { useState } from 'react';
import { CheckSvg, DownloadSvg, InfoSvg, UploadSvg } from '@/assets/icons';
import { FileDropzone, Modal } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import { InlineLoading } from '@/shared/components/Loading';
import { fileTitle, saveBlob } from '@/shared/utils/saveBlob';
import {
	downloadLessonLecturerTemplate,
	importLessonLecturers,
	type LessonLecturerImportPerson,
	type LessonLecturerImportResult,
	type LessonLecturerImportRow,
} from '../api/trainingProgramApi';
import type { TrainingProgram } from '../types/trainingProgram.type';
import styles from '../pages/TrainingPrograms.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import m from './LessonLecturerImportModal.module.css';

const STATUS: Record<LessonLecturerImportRow['status'], { label: string; className: string }> = {
	set: { label: 'Cập nhật', className: m.tagSet },
	clear: { label: 'Gỡ giảng viên', className: m.tagClear },
	unchanged: { label: 'Không đổi', className: '' },
	skipped: { label: 'Bỏ qua', className: m.tagSkipped },
};

function Person({ person }: { person: LessonLecturerImportPerson }) {
	if (person.status === 'error') {
		return (
			<div>
				<span className={m.personError}>{person.name}</span>
				{person.note && <div className={m.personNote}>{person.note}</div>}
			</div>
		);
	}
	return (
		<div>
			{person.name}
			{person.status === 'new' && (
				<>
					<span className={`${m.tag} ${m.tagNew}`}>Giảng viên mới</span>
					<div className={m.personNote}>
						{[person.degree, person.has_account ? 'gắn tài khoản nhân sự' : 'chưa gắn tài khoản']
							.filter(Boolean)
							.join(' · ')}
					</div>
				</>
			)}
		</div>
	);
}

function People({ people }: { people: LessonLecturerImportPerson[] }) {
	if (!people.length) return <>—</>;
	return (
		<div className={m.people}>
			{people.map((p, i) => (
				<Person
					key={i}
					person={p}
				/>
			))}
		</div>
	);
}

// Nhập giảng viên giảng dạy từng bài của 1 chương trình từ Excel: tải file mẫu (điền sẵn
// các bài) → chọn file → xem trước → xác nhận. Mỗi dòng đặt lại giảng viên của bài đúng
// như trong file; bài không có trong file giữ nguyên — xem programLessonLecturerImportService.
export function LessonLecturerImportModal({
	program,
	onClose,
	onImported,
}: {
	program: TrainingProgram;
	onClose: () => void;
	onImported: () => void;
}) {
	const [file, setFile] = useState<File | null>(null);
	const [loading, setLoading] = useState(false);
	const [downloading, setDownloading] = useState(false);
	const [error, setError] = useState('');
	const [preview, setPreview] = useState<LessonLecturerImportResult | null>(null);
	const [result, setResult] = useState<LessonLecturerImportResult | null>(null);

	const downloadTemplate = async () => {
		setDownloading(true);
		setError('');
		try {
			const blob = await downloadLessonLecturerTemplate(program.id);
			// Tên file theo tên chương trình
			saveBlob(blob, `Giảng viên bài học - ${fileTitle(program.name) || 'Chương trình'}.xlsx`);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Không tải được file mẫu');
		} finally {
			setDownloading(false);
		}
	};

	const onPickFile = async (f: File | null) => {
		setFile(f);
		setResult(null);
		setPreview(null);
		setError('');
		if (!f) return;
		setLoading(true);
		try {
			setPreview(await importLessonLecturers(program.id, f, true));
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
			setResult(await importLessonLecturers(program.id, file, false));
			onImported();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Nhập giảng viên thất bại');
		} finally {
			setLoading(false);
		}
	};

	const s = preview?.summary;
	const changes = s ? s.lessons_set + s.lessons_cleared : 0;
	const warnings = (result ?? preview)?.warnings ?? [];
	const done = result?.summary;

	return (
		<Modal
			open
			onClose={onClose}
			icon={<UploadSvg />}
			title='Nhập giảng viên giảng dạy'
			subtitle={[program.code, program.name].filter(Boolean).join(' · ')}
			size='xl'
			bodyClassName={styles.modalBody}
			footer={
				<>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						{result ? 'Đóng' : 'Hủy'}
					</button>
					{!result && (
						<button
							className={styles.btnConfirm}
							onClick={commit}
							disabled={loading || !changes}
						>
							{loading ? <span className={styles.spinner} /> : <UploadSvg />}
							{changes ? `Cập nhật giảng viên ${changes} bài` : 'Cập nhật giảng viên'}
						</button>
					)}
				</>
			}
		>
			{!result && (
				<>
					<div className={`${styles.noticeBox} ${m.templateRow}`}>
						<InfoSvg />
						<span>
							Mỗi dòng 1 bài học: <b>Mã bài học</b> (hoặc <b>Tên bài học</b>), <b>Giảng viên</b>,{' '}
							<b>Giảng viên phụ</b> — nhiều người cách nhau bằng dấu chấm phẩy. Giảng viên của bài được đặt lại đúng
							như trong file (ô trống = gỡ); bài không có trong file giữ nguyên. Tên chưa có trong danh mục Giảng viên
							sẽ được tạo mới.
						</span>
						<button
							type='button'
							className={m.templateBtn}
							onClick={downloadTemplate}
							disabled={downloading}
						>
							<DownloadSvg /> {downloading ? 'Đang tạo…' : 'Tải file mẫu'}
						</button>
					</div>

					<FormField label='File Excel (.xlsx)'>
						<FileDropzone
							value={file}
							onChange={onPickFile}
							accept='.xlsx'
							disabled={loading}
						/>
					</FormField>

					{loading && <InlineLoading label={preview ? 'Đang nhập…' : 'Đang đọc file…'} />}
					{error && <div className={styles.fieldError}>{error}</div>}

					{s && preview && (
						<>
							<div
								className={`${styles.noticeBox} ${changes ? styles.noticeOk : ''}`}
								style={{ marginTop: 12 }}
							>
								{changes ? <CheckSvg /> : <InfoSvg />}
								<span>
									<b>{s.lessons_total}</b> bài trong file: <b>{s.lessons_set}</b> cập nhật giảng viên
									{s.lessons_cleared > 0 && (
										<>
											, <b>{s.lessons_cleared}</b> gỡ giảng viên
										</>
									)}
									, {s.lessons_unchanged} không đổi, {s.lessons_skipped} bỏ qua
									{s.lecturers_new > 0 && (
										<>
											{' '}
											· tạo <b>{s.lecturers_new}</b> giảng viên mới ({s.lecturers_linked} gắn tài khoản nhân sự)
										</>
									)}
									.
								</span>
							</div>
							{warnings.length > 0 && (
								<ul className={styles.warnList}>
									{warnings.map((w, i) => (
										<li key={i}>{w}</li>
									))}
								</ul>
							)}

							{preview.lessons.length > 0 && (
								<div className={styles.importPreview}>
									<table className={styles.table}>
										<thead>
											<tr>
												<th>Bài học</th>
												<th>Giảng viên</th>
												<th>Giảng viên phụ</th>
												<th className={m.thStatus} />
											</tr>
										</thead>
										<tbody>
											{preview.lessons.map((l) => (
												<tr
													key={l.row}
													className={l.status === 'unchanged' ? m.rowMuted : undefined}
												>
													<td>
														<span className={tbl.cellTitle}>{l.title}</span>
														{l.code && <div className={styles.descText}>{l.code}</div>}
													</td>
													<td>
														<People people={l.main ? [l.main] : []} />
													</td>
													<td>
														<People people={l.assistants} />
													</td>
													<td>
														<span className={`${m.tag} ${STATUS[l.status].className}`}>{STATUS[l.status].label}</span>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</>
					)}
				</>
			)}

			{result && done && (
				<>
					<div className={`${styles.noticeBox} ${styles.noticeOk}`}>
						<CheckSvg />
						<span>
							Đã cập nhật giảng viên cho <b>{done.lessons_set}</b> bài
							{done.lessons_cleared > 0 && (
								<>
									, gỡ giảng viên <b>{done.lessons_cleared}</b> bài
								</>
							)}
							{(result.lecturers_created ?? 0) > 0 && (
								<>
									{' '}
									· tạo <b>{result.lecturers_created}</b> giảng viên mới
								</>
							)}
							{done.lessons_skipped > 0 && <> · bỏ qua {done.lessons_skipped} bài</>}.
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
