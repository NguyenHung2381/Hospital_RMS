import { useCallback, useEffect, useState } from 'react';
import { getTraineeEnrollments } from '../api/traineeApi';
import {
	addTraineeDocument,
	getTraineeDocuments,
	removeTraineeDocument,
	type TraineeDocument,
} from '../api/traineeDocumentApi';
import type { TraineeEnrollment } from '../types/trainee.type';

export type DetailTab = 'general' | 'documents' | 'enrollments';

export function useTraineeDetail(traineeId: string, initialTab: DetailTab = 'general') {
	const [tab, setTab] = useState<DetailTab>(initialTab);
	const [documents, setDocuments] = useState<TraineeDocument[]>([]);
	const [enrollments, setEnrollments] = useState<TraineeEnrollment[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	const load = useCallback(() => {
		return Promise.all([getTraineeDocuments(traineeId), getTraineeEnrollments(traineeId)])
			.then(([docs, enr]) => {
				setDocuments(docs);
				setEnrollments(enr);
				setError('');
			})
			.catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải chi tiết học viên'))
			.finally(() => setLoading(false));
	}, [traineeId]);

	useEffect(() => {
		load();
	}, [load]);

	const addDocument = useCallback(
		async (file: File, docType: string) => {
			setBusy(true);
			setError('');
			try {
				await addTraineeDocument(traineeId, file, docType);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Tải lên thất bại');
			} finally {
				setBusy(false);
			}
		},
		[traineeId, load],
	);

	const removeDocument = useCallback(
		async (docId: string) => {
			setBusy(true);
			setError('');
			try {
				await removeTraineeDocument(docId);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Xoá thất bại');
			} finally {
				setBusy(false);
			}
		},
		[load],
	);

	return {
		tab,
		setTab,
		documents,
		enrollments,
		loading,
		busy,
		error,
		addDocument,
		removeDocument,
	};
}
