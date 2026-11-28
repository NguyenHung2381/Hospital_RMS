import { useState } from 'react';
import { ChevDSvg, DownloadSvg, EyeSvg } from '@/assets/icons';
import { BASE_URL } from '../../../shared/api/axios';
import { DocumentView, FileViewerModal } from '@/shared/components/FileViewerModal';
import type { EvaluationFile } from '../../council/api/councilApi';
import { fileExt, viewKind } from '../utils/councilProgressHelpers';
import styles from '../pages/CouncilProgress.module.css';

export interface ReaderFile {
	file: EvaluationFile;
	/** Nhóm file: hồ sơ đề tài / file đánh giá / biên bản. */
	group: string;
}

interface ProgressDocReaderProps {
	files: ReaderFile[];
	activeId: string | null;
	onSelect: (fileId: string) => void;
	open: boolean;
	onToggle: () => void;
}

/** Khung đọc hồ sơ ngay trong trang chấm — PDF / Word / ảnh xem trực tiếp, loại khác tải về. */
export function ProgressDocReader({ files, activeId, onSelect, open, onToggle }: ProgressDocReaderProps) {
	const [fullscreen, setFullscreen] = useState(false);
	const active = files.find((f) => f.file.id === activeId) ?? files[0];
	if (!active) return null;

	const f = active.file;
	const kind = viewKind(f.file_name);
	const viewable = kind !== 'other';
	const target = { url: f.file_url, name: f.file_name, isWord: kind === 'word' };
	const bodyId = 'progress-reader-body';

	return (
		<section
			id='progress-reader'
			className={`${styles.panel} ${styles.reader}`}
			aria-label='Đọc hồ sơ'
		>
			<header className={styles.readerHead}>
				<button
					type='button'
					className={styles.readerToggle}
					aria-expanded={open}
					aria-controls={bodyId}
					onClick={onToggle}
				>
					<ChevDSvg
						aria-hidden
						className={open ? undefined : styles.chevCollapsed}
					/>
					<span className={styles.panelTitle}>Đọc hồ sơ</span>
					<span className={styles.fileCount}>{files.length}</span>
				</button>

				<div className={styles.readerActions}>
					{open && viewable && (
						<button
							type='button'
							className={styles.readerBtn}
							onClick={() => setFullscreen(true)}
						>
							<EyeSvg aria-hidden />
							Toàn màn hình
						</button>
					)}
					<a
						className={styles.readerBtn}
						href={`${BASE_URL}${f.file_url}`}
						download={f.file_name}
						target='_blank'
						rel='noreferrer'
					>
						<DownloadSvg aria-hidden />
						Tải về
					</a>
				</div>
			</header>

			{open && (
				<div id={bodyId}>
					{files.length > 1 && (
						<div
							className={styles.readerTabs}
							role='tablist'
							aria-label='Chọn tài liệu'
						>
							{files.map(({ file, group }) => {
								const selected = file.id === f.id;
								return (
									<button
										key={file.id}
										type='button'
										role='tab'
										aria-selected={selected}
										className={`${styles.readerTab} ${selected ? styles.readerTabActive : ''}`}
										title={`${group}: ${file.file_name}`}
										onClick={() => onSelect(file.id)}
									>
										<span
											className={styles.readerTabExt}
											aria-hidden
										>
											{fileExt(file.file_name)}
										</span>
										<span className={styles.readerTabName}>{file.file_name}</span>
									</button>
								);
							})}
						</div>
					)}

					<div className={styles.readerBody}>
						{viewable ? (
							<DocumentView
								key={f.id}
								file={target}
							/>
						) : (
							<div className={styles.readerNoPreview}>
								<span className={styles.fileExt}>{fileExt(f.file_name)}</span>
								<p>Định dạng này không xem trước được trên trang.</p>
								<a
									className={styles.saveBtn}
									href={`${BASE_URL}${f.file_url}`}
									download={f.file_name}
									target='_blank'
									rel='noreferrer'
								>
									<DownloadSvg aria-hidden />
									Tải về để mở
								</a>
							</div>
						)}
					</div>
				</div>
			)}

			{fullscreen && (
				<FileViewerModal
					file={target}
					onClose={() => setFullscreen(false)}
				/>
			)}
		</section>
	);
}
