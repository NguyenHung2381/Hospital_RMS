import type { Dispatch, RefObject, SetStateAction } from 'react';
import { DocSvg } from '@/assets/icons';
import type {
	Approval as ApprovalHistory,
	TopicApprovalDetail,
} from '../../approval/api/approval';
import type { TopicFile } from '../../topics/types/topic.type';
import { TopicFilesSection } from './TopicFilesSection';
import { TopicHistorySection } from './TopicHistorySection';
import { TopicHeader, TopicInfoSection } from './TopicInfoSection';
import { TopicStatusActionPanel } from './TopicStatusActionPanel';
import styles from '../pages/MyTopics.module.css';

interface MyTopicsDetailPanelProps {
	selectedId: string | null;
	detailLoading: boolean;
	detailTopic: TopicApprovalDetail | null;
	detailFiles: TopicFile[];
	detailHistory: ApprovalHistory[];
	latestApproval: ApprovalHistory | null;
	canUploadFiles: boolean;
	canEditTopic: boolean;
	setFileViewer: (
		v: { url: string; name: string; isWord: boolean } | null,
	) => void;
	fileInputRef: RefObject<HTMLInputElement | null>;
	pendingFiles: File[];
	setPendingFiles: Dispatch<SetStateAction<File[]>>;
	batchNote: string;
	setBatchNote: (v: string) => void;
	uploadLoading: boolean;
	uploadError: string;
	handleUpload: () => void;
	openEdit: () => void;
	formatFileSize: (size: number) => string;
}

export function MyTopicsDetailPanel({
	selectedId,
	detailLoading,
	detailTopic,
	detailFiles,
	detailHistory,
	latestApproval,
	canUploadFiles,
	canEditTopic,
	setFileViewer,
	fileInputRef,
	pendingFiles,
	setPendingFiles,
	batchNote,
	setBatchNote,
	uploadLoading,
	uploadError,
	handleUpload,
	openEdit,
	formatFileSize,
}: MyTopicsDetailPanelProps) {
	return (
		<div className={styles.detailPanel}>
			{!selectedId ? (
				<div className={styles.detailEmpty}>
					<DocSvg className={styles.detailEmptyIcon} />
					<p className={styles.detailEmptyTitle}>
						Chọn một đề tài để xem chi tiết
					</p>
					<p className={styles.detailEmptyDesc}>
						Nhấn vào một đề tài ở danh sách bên trái
					</p>
				</div>
			) : (
				<>
					{detailLoading && !detailTopic ? (
						<div className={styles.detailEmpty}>
							<div className={styles.detailSpinner} />
							<p className={styles.detailEmptyDesc}>Đang tải chi tiết...</p>
						</div>
					) : detailTopic ? (
						<>
							<TopicHeader detailTopic={detailTopic} />

							<div
								className={styles.detailBody}
								style={
									detailLoading
										? { opacity: 0.5, pointerEvents: 'none' }
										: undefined
								}
							>
								<TopicInfoSection
									detailTopic={detailTopic}
									latestApproval={latestApproval}
								/>
								<TopicHistorySection detailHistory={detailHistory} />
								<TopicFilesSection
									detailFiles={detailFiles}
									canUploadFiles={canUploadFiles}
									setFileViewer={setFileViewer}
									fileInputRef={fileInputRef}
									pendingFiles={pendingFiles}
									setPendingFiles={setPendingFiles}
									batchNote={batchNote}
									setBatchNote={setBatchNote}
									uploadLoading={uploadLoading}
									uploadError={uploadError}
									handleUpload={handleUpload}
									formatFileSize={formatFileSize}
								/>
							</div>

							<TopicStatusActionPanel
								detailTopic={detailTopic}
								latestApproval={latestApproval}
								canEditTopic={canEditTopic}
								openEdit={openEdit}
							/>
						</>
					) : null}
				</>
			)}
		</div>
	);
}
