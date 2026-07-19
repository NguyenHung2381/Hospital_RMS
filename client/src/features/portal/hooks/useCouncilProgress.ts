import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getStoredUser, type StoredUser } from '../../../shared/utils/storage';
import {
	deleteEvaluationFile,
	deleteMinutesFile,
	getMyProgress,
	saveProgressReview,
	saveTopicResult,
	uploadEvaluationFiles,
	uploadMinutesFiles,
	type ProgressTopic,
} from '../../council/api/councilApi';
import { compareCouncilsBySpecialty } from '../../council/utils/councilHelpers';
import type { Draft, ResultDraft } from '../types/councilProgress.type';

export function useCouncilProgress() {
	const user = getStoredUser<StoredUser>();
	const [topics, setTopics] = useState<ProgressTopic[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [drafts, setDrafts] = useState<Record<string, Draft>>({});
	const [savingId, setSavingId] = useState<string | null>(null);
	const [savedId, setSavedId] = useState<string | null>(null);
	const [uploadingId, setUploadingId] = useState<string | null>(null);
	const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
	const [resultDrafts, setResultDrafts] = useState<Record<string, ResultDraft>>(
		{},
	);
	const [savingResultId, setSavingResultId] = useState<string | null>(null);
	const [savedResultId, setSavedResultId] = useState<string | null>(null);
	const [uploadingMinutesId, setUploadingMinutesId] = useState<string | null>(
		null,
	);
	const minutesInputs = useRef<Record<string, HTMLInputElement | null>>({});
	const setFileInputRef = useCallback(
		(id: string, el: HTMLInputElement | null) => {
			fileInputs.current[id] = el;
		},
		[],
	);
	const clickFileInput = useCallback((id: string) => {
		fileInputs.current[id]?.click();
	}, []);
	const setMinutesInputRef = useCallback(
		(id: string, el: HTMLInputElement | null) => {
			minutesInputs.current[id] = el;
		},
		[],
	);
	const clickMinutesInput = useCallback((id: string) => {
		minutesInputs.current[id]?.click();
	}, []);
	const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<'my-review' | 'council-conclusion'>('my-review');

	const selectedTopic = useMemo(() => {
		if (!selectedTopicId) return null;
		return topics.find((t) => t.id === selectedTopicId) ?? null;
	}, [topics, selectedTopicId]);

	const stats = useMemo(() => {
		const reviewed = topics.filter((t) => {
			const mine = t.reviews.find((r) => r.user_id === user?.id);
			return mine && (mine.rating != null || mine.progress_percent != null);
		}).length;
		return { total: topics.length, reviewed, pending: topics.length - reviewed };
	}, [topics, user?.id]);

	const load = async () => {
		try {
			const data = await getMyProgress();
			setTopics(data);

			if (data.length > 0) {
				setSelectedTopicId((curr) => {
					if (curr && data.some((t) => t.id === curr)) return curr;
					return data[0].id;
				});
			} else {
				setSelectedTopicId(null);
			}

			// Điền nháp từ đánh giá đã lưu của chính mình
			setDrafts((prev) => {
				const next = { ...prev };
				for (const t of data) {
					if (next[t.id]) continue;
					const mine = t.reviews.find((r) => r.user_id === user?.id);
					next[t.id] = {
						percent:
							mine?.progress_percent != null
								? String(mine.progress_percent)
								: '',
						rating: mine?.rating ?? '',
						comment: mine?.comment ?? '',
					};
				}
				return next;
			});
			setResultDrafts((prev) => {
				const next = { ...prev };
				for (const t of data) {
					if (next[t.id]) continue;
					next[t.id] = {
						conclusion: t.result?.conclusion ?? '',
						general_comment: t.result?.general_comment ?? '',
					};
				}
				return next;
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Không tải được dữ liệu');
		} finally {
			setLoading(false);
		}
	};
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const councils = useMemo(() => {
		const map = new Map<string, ProgressTopic[]>();
		for (const t of topics) {
			const arr = map.get(t.council_id) ?? [];
			arr.push(t);
			map.set(t.council_id, arr);
		}
		const res = [...map.values()];

		res.sort((a, b) =>
			compareCouncilsBySpecialty(
				{ name: a[0]?.council_name ?? '' },
				{ name: b[0]?.council_name ?? '' },
			),
		);

		return res;
	}, [topics]);

	const setDraft = (id: string, patch: Partial<Draft>) =>
		setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

	const handleSave = async (t: ProgressTopic) => {
		const d = drafts[t.id];
		const percent = d.percent.trim() === '' ? null : Number(d.percent);
		if (
			percent != null &&
			(!Number.isInteger(percent) || percent < 0 || percent > 100)
		) {
			alert('Tiến độ phải là số nguyên từ 0 đến 100 (%)');
			return;
		}
		setSavingId(t.id);
		try {
			await saveProgressReview(t.id, {
				progress_percent: percent,
				rating: d.rating || null,
				comment: d.comment,
			});
			setSavedId(t.id);
			setTimeout(() => setSavedId((s) => (s === t.id ? null : s)), 2500);
			await load();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Lưu đánh giá thất bại');
		} finally {
			setSavingId(null);
		}
	};

	const handleUpload = async (t: ProgressTopic, files: FileList | null) => {
		if (!files || files.length === 0) return;
		setUploadingId(t.id);
		try {
			await uploadEvaluationFiles(t.id, [...files]);
			await load();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Upload thất bại');
		} finally {
			setUploadingId(null);
			const input = fileInputs.current[t.id];
			if (input) input.value = '';
		}
	};

	const handleDeleteFile = async (t: ProgressTopic, fileId: string) => {
		if (!confirm('Xóa file đánh giá này?')) return;
		try {
			await deleteEvaluationFile(t.id, fileId);
			await load();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Xóa file thất bại');
		}
	};

	const setResultDraft = (id: string, patch: Partial<ResultDraft>) =>
		setResultDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

	const handleSaveResult = async (t: ProgressTopic) => {
		const d = resultDrafts[t.id];
		setSavingResultId(t.id);
		try {
			await saveTopicResult(t.id, {
				conclusion: d.conclusion || null,
				general_comment: d.general_comment,
			});
			setSavedResultId(t.id);
			setTimeout(() => setSavedResultId((s) => (s === t.id ? null : s)), 2500);
			await load();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Lưu kết luận thất bại');
		} finally {
			setSavingResultId(null);
		}
	};

	const handleUploadMinutes = async (
		t: ProgressTopic,
		files: FileList | null,
	) => {
		if (!files || files.length === 0) return;
		setUploadingMinutesId(t.id);
		try {
			await uploadMinutesFiles(t.id, [...files]);
			await load();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Upload thất bại');
		} finally {
			setUploadingMinutesId(null);
			const input = minutesInputs.current[t.id];
			if (input) input.value = '';
		}
	};

	const handleDeleteMinutes = async (t: ProgressTopic, fileId: string) => {
		if (!confirm('Xóa biên bản này?')) return;
		try {
			await deleteMinutesFile(t.id, fileId);
			await load();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Xóa file thất bại');
		}
	};

	return {
		user,
		loading,
		error,
		stats,
		councils,
		selectedTopicId,
		setSelectedTopicId,
		selectedTopic,
		activeTab,
		setActiveTab,
		drafts,
		setDraft,
		savingId,
		savedId,
		handleSave,
		uploadingId,
		setFileInputRef,
		clickFileInput,
		handleUpload,
		handleDeleteFile,
		resultDrafts,
		setResultDraft,
		savingResultId,
		savedResultId,
		handleSaveResult,
		uploadingMinutesId,
		setMinutesInputRef,
		clickMinutesInput,
		handleUploadMinutes,
		handleDeleteMinutes,
	};
}
