import { useCallback, useEffect, useState } from 'react';
import { FileTextSvg, TrashSvg } from '@/assets/icons';
import { Badge, Button, Card, FileDropzone } from '@/shared/components';
import { useUploadPolicy } from '@/shared/hooks/useUploadPolicy';
import { notify } from '@/shared/utils/feedback';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { myTraineeDocumentsApi, type DocumentChecklist } from '../../trainee/api/traineeRecordApi';
import styles from '../pages/SelfService.module.css';

const STATE: Record<DocumentChecklist['items'][number]['state'], { label: string; tone: 'green' | 'amber' | 'red' }> = {
	done: { label: 'Đã nộp', tone: 'green' },
	pending: { label: 'Chờ duyệt', tone: 'amber' },
	missing: { label: 'Còn thiếu', tone: 'red' },
};

/**
 * Hồ sơ học viên của tôi (giai đoạn 3): checklist giấy tờ bắt buộc theo khóa đã ghi danh,
 * tự nộp file còn thiếu — chờ phòng Đào tạo duyệt. Tài khoản không gắn hồ sơ học viên thì ẩn.
 */
export function MyTraineeDocumentsCard() {
	const uploadPolicy = useUploadPolicy();
	const [data, setData] = useState<DocumentChecklist | null>(null);
	const [docType, setDocType] = useState('');
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

	if (!data) return null;
	const required = data.items.filter((i) => i.required);
	const missing = required.filter((i) => i.state === 'missing');
	const ownDocs = data.items.flatMap((i) => i.documents.map((d) => ({ ...d, type_name: i.name })));
	const selected = docType || missing[0]?.id || data.items[0]?.id || '';

	const upload = async () => {
		if (!file || !selected) return;
		setBusy(true);
		try {
			setData(await myTraineeDocumentsApi.upload(file, selected));
			setFile(null);
			setDocType('');
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
				sub={
					required.length
						? `${data.required_done}/${data.required_total} giấy tờ bắt buộc đã nộp`
						: 'Nộp giấy tờ cho phòng Đào tạo'
				}
			/>
			<Card.Body>
				{required.length > 0 && (
					<div
						className={styles.meta}
						style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}
					>
						{required.map((i) => (
							<Badge
								key={i.id}
								tone={STATE[i.state].tone}
							>
								{i.name}: {STATE[i.state].label}
							</Badge>
						))}
					</div>
				)}
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
					<select
						value={selected}
						onChange={(e) => setDocType(e.target.value)}
						title='Loại giấy tờ'
						style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid var(--color-gray-200)' }}
					>
						{data.items.map((i) => (
							<option
								key={i.id}
								value={i.id}
							>
								{i.name}
								{i.required && i.state === 'missing' ? ' (còn thiếu)' : ''}
							</option>
						))}
					</select>
					<div style={{ flex: 1, minWidth: 200 }}>
						<FileDropzone
							compact
							accept={uploadPolicy.accept}
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
						Nộp
					</Button>
				</div>
				{ownDocs.length > 0 && (
					<div
						className={styles.list}
						style={{ marginTop: 12 }}
					>
						{ownDocs.map((d) => (
							<div
								key={d.id}
								className={styles.meta}
								style={{ alignItems: 'center' }}
							>
								<span>
									<b>{d.type_name}</b> · {d.file_name}
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
