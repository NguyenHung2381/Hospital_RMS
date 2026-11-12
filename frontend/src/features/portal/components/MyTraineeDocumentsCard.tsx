import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FileTextSvg, TrashSvg } from '@/assets/icons';
import { Badge, Button, Card, FileDropzone } from '@/shared/components';
import { useUploadPolicy } from '@/shared/hooks/useUploadPolicy';
import { notify } from '@/shared/utils/feedback';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { myTraineeDocumentsApi, type DocumentChecklist } from '../../trainee/api/traineeRecordApi';
import styles from '../pages/SelfService.module.css';

const STATE: Record<DocumentChecklist['state'], { label: string; tone: 'green' | 'amber' | 'red' }> = {
	done: { label: 'Đã nộp', tone: 'green' },
	pending: { label: 'Chờ duyệt', tone: 'amber' },
	missing: { label: 'Chưa nộp', tone: 'red' },
};

/**
 * Hồ sơ học viên của tôi: nộp 1 file PDF đầy đủ thông tin — chờ phòng Đào tạo duyệt.
 * Tài khoản không gắn hồ sơ học viên thì ẩn.
 */
export function MyTraineeDocumentsCard({ empty = null }: { empty?: ReactNode } = {}) {
	const uploadPolicy = useUploadPolicy();
	const [data, setData] = useState<DocumentChecklist | null | undefined>(undefined);
	const [file, setFile] = useState<File | null>(null);
	const [busy, setBusy] = useState(false);

	const load = useCallback(() => {
		myTraineeDocumentsApi
			.get()
			.then(setData)
			.catch(() => setData(null));
	}, []);
	useEffect(load, [load]);
	useRealtimeUpdate('trainee_document', load);

	if (data === undefined) return null;
	if (!data) return <>{empty}</>;
	const state = STATE[data.state];

	const upload = async () => {
		if (!file) return;
		setBusy(true);
		try {
			setData(await myTraineeDocumentsApi.upload(file));
			setFile(null);
			notify.success('Đã nộp, chờ phòng Đào tạo duyệt');
		} catch (err) {
			notify.error(err instanceof Error ? err.message : 'Nộp hồ sơ thất bại');
		} finally {
			setBusy(false);
		}
	};

	const withdraw = async (docId: string) => {
		setBusy(true);
		try {
			setData(await myTraineeDocumentsApi.remove(docId));
		} catch (err) {
			notify.error(err instanceof Error ? err.message : 'Rút lại thất bại');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Card>
			<Card.Header
				icon={<FileTextSvg />}
				title='Hồ sơ học viên'
				sub='Nộp 1 file PDF gộp đủ thông tin (CCCD, bằng cấp, ảnh thẻ...)'
				actions={
					<Badge
						tone={state.tone}
						dot
					>
						{state.label}
					</Badge>
				}
			/>
			<Card.Body>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
					<div style={{ flex: 1, minWidth: 200 }}>
						<FileDropzone
							compact
							accept='.pdf,application/pdf'
							hint='Chỉ nhận file PDF'
							maxSizeMB={uploadPolicy.maxSizeMB}
							value={file}
							onChange={setFile}
							disabled={busy}
						/>
					</div>
					<Button
						size='sm'
						loading={busy}
						disabled={!file}
						onClick={() => void upload()}
					>
						{data.documents.length ? 'Nộp bản mới' : 'Nộp'}
					</Button>
				</div>
				{data.documents.length > 0 && (
					<div
						className={styles.list}
						style={{ marginTop: 12 }}
					>
						{data.documents.map((d) => (
							<div
								key={d.id}
								className={styles.meta}
								style={{ alignItems: 'center' }}
							>
								<span>
									{d.doc_type_name && <b>{d.doc_type_name} · </b>}
									{d.file_name}
								</span>
								<Badge tone={d.status === 'approved' ? 'green' : d.status === 'pending' ? 'amber' : 'red'}>
									{d.status === 'approved' ? 'Đã duyệt' : d.status === 'pending' ? 'Chờ duyệt' : 'Bị từ chối'}
								</Badge>
								{d.review_note && <span>Lý do: {d.review_note}</span>}
								{d.status !== 'approved' && (
									<Button
										size='sm'
										variant='secondary'
										icon={<TrashSvg />}
										disabled={busy}
										onClick={() => void withdraw(d.id)}
									>
										Rút lại
									</Button>
								)}
							</div>
						))}
					</div>
				)}
			</Card.Body>
		</Card>
	);
}
