import { notify } from '../../../shared/utils/feedback';
import { scopeOf } from '../../../shared/utils/permissions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { BASE_URL } from '../../../shared/api/axios';
import { getStoredUser } from '../../../shared/utils/storage';
import { getDeadlines } from '../../round/api/roundApi';
import type { RoundDeadline } from '../../round/types/round.type';
import {
	deleteTopicFile,
	getCategories,
	getDepts,
	getLevels,
	getRounds,
	getTopic,
	getTopicFiles,
	getTopicMembers,
	updateTopic,
	uploadTopicFiles,
	type SimpleItem,
} from '../../topics/api/topicApi';
import type {
	Topic,
	TopicFile,
} from '../../topics/types/topic.type';
import { getTopicPermissions } from '../services/topicDetailService';
import { useTopicMembers } from './useTopicMembers';
import {
	type InfoForm,
} from '../types/topicDetail.type';

export function useTopicDetail() {
	const { id } = useParams<{ id: string }>();
	const location = useLocation();
	const navigate = useNavigate();

	const userInfo = getStoredUser<{
		id?: string;
		full_name?: string;
		username?: string;
		role?: string;
		role_name?: string;
		permissions?: string[];
	}>();
	const currentUserId = userInfo?.id ?? '';
	const isAdminAccount = scopeOf(userInfo, 'topics') === 'all';
	const fullName = userInfo?.full_name ?? userInfo?.username ?? 'Người dùng';
	const userRole = userInfo?.role ?? userInfo?.role_name ?? 'Thành viên';
	const initials = fullName
		.split(' ')
		.map((w: string) => w[0])
		.filter(Boolean)
		.slice(-2)
		.join('')
		.toUpperCase();

	// ── Data state ──
	const [topic, setTopic] = useState<Topic | null>(
		(location.state as { topic?: Topic } | null)?.topic ?? null,
	);
	const [roundDeadlines, setRoundDeadlines] = useState<RoundDeadline[]>([]);
	const [meta, setMeta] = useState<{
		categories: SimpleItem[];
		levels: SimpleItem[];
		rounds: SimpleItem[];
		departments: SimpleItem[];
	}>({ categories: [], levels: [], rounds: [], departments: [] });
	const memberCtl = useTopicMembers(id);
	const { members, setMembers } = memberCtl;
	const [files, setFiles] = useState<TopicFile[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	// ── Info edit state ──
	const [editingInfo, setEditingInfo] = useState(false);
	const [infoForm, setInfoForm] = useState<InfoForm>({
		title: '',
		description: '',
		category_id: '',
		level_id: '',
	});
	const [savingInfo, setSavingInfo] = useState(false);
	const [infoErr, setInfoErr] = useState('');

	// ── File upload state ──
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [batchNote, setBatchNote] = useState('');
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState('');

	const [dragging, setDragging] = useState(false);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate(['topic', 'round'], refreshData);

	// ── Quyền thao tác (chủ nhiệm / thư ký + mốc thời gian đang mở) ──
	const myRole = useMemo(
		() => members.find((m) => m.user_id === currentUserId)?.role ?? null,
		[members, currentUserId],
	);

	const perms = useMemo(
		() => getTopicPermissions(myRole, roundDeadlines, isAdminAccount),
		[myRole, roundDeadlines, isAdminAccount],
	);

	const canEditTitle = perms.canEditTitle;
	const canEditInfo = perms.canEditInfo;
	const canEditMembers = perms.canEditMembers;
	const canUploadFiles = perms.canAddFiles;
	const canDeleteFiles = perms.canDeleteFiles;
	const editBanner = perms.banner;

	// ── Fetch ──
	useEffect(() => {
		if (!id) return;
		async function fetchData() {
			setLoading(true);
			setError('');
			try {
				const [catRes, lvlRes, roundRes, deptRes] = await Promise.all([
					getCategories(),
					getLevels(),
					getRounds(),
					getDepts(),
				]);
				setMeta({
					categories: catRes.data,
					levels: lvlRes.data,
					rounds: roundRes.data,
					departments: deptRes.data,
				});

				let cur = topic;
				if (!cur) {
					cur = await getTopic(id!);
					setTopic(cur);
				}

				if (cur?.round_id) {
					setRoundDeadlines(await getDeadlines(cur.round_id));
				}
			} catch {
				setError('Không thể tải thông tin đề tài.');
			} finally {
				setLoading(false);
			}
		}
		fetchData();
	}, [id, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (!id) return;
		getTopicMembers(id)
			.then(setMembers)
			.catch(() => setMembers([]));
		getTopicFiles(id)
			.then((r) => setFiles(r.data))
			.catch(() => setFiles([]));
	}, [id, refreshKey, setMembers]);

	// ── Handlers ──
	const startEditInfo = () => {
		if (!topic) return;
		setInfoForm({
			title: topic.title,
			description: topic.description ?? '',
			category_id: topic.category_id ?? '',
			level_id: topic.level_id ?? '',
		});
		setInfoErr('');
		setEditingInfo(true);
	};

	const handleSaveInfo = async () => {
		if (!topic || !infoForm.title.trim()) {
			setInfoErr('Tên đề tài không được để trống.');
			return;
		}
		// Chỉ gửi những trường mốc thời gian đang cho phép — tránh bị server từ chối.
		const payload: Parameters<typeof updateTopic>[1] = {};
		if (canEditTitle) payload.title = infoForm.title.trim();
		if (canEditInfo) {
			payload.description = infoForm.description.trim() || undefined;
			payload.category_id = infoForm.category_id || undefined;
			payload.level_id = infoForm.level_id || undefined;
		}
		if (Object.keys(payload).length === 0) {
			setEditingInfo(false);
			return;
		}
		setSavingInfo(true);
		setInfoErr('');
		try {
			setTopic(await updateTopic(topic.id, payload));
			setEditingInfo(false);
			notify.success('Đã lưu thông tin đề tài');
		} catch (e) {
			setInfoErr(e instanceof Error ? e.message : 'Lưu thất bại');
		} finally {
			setSavingInfo(false);
		}
	};

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const selectedFiles = Array.from(e.target.files ?? []);
		setPendingFiles((p) => [...p, ...selectedFiles]);
		e.target.value = '';
	};

	const handleUpload = async () => {
		if (!id || !pendingFiles.length) return;
		setUploading(true);
		setUploadError('');
		try {
			await uploadTopicFiles(id, pendingFiles, batchNote.trim() || undefined);
			setFiles((await getTopicFiles(id)).data);
			notify.success(`Đã tải lên ${pendingFiles.length} file`);
			setPendingFiles([]);
			setBatchNote('');
		} catch (err) {
			console.error('Tải lên file thất bại cho đề tài:', id, err);
			setUploadError(err instanceof Error ? err.message : 'Lỗi tải lên file');
		} finally {
			setUploading(false);
		}
	};

	const toggleSelect = (fileId: string) =>
		setSelectedIds((p) => {
			const n = new Set(p);
			if (n.has(fileId)) n.delete(fileId);
			else n.add(fileId);
			return n;
		});

	const toggleSelectAll = () =>
		setSelectedIds(
			selectedIds.size === files.length
				? new Set()
				: new Set(files.map((f) => f.id)),
		);

	const handleDeleteFile = async (fileId: string) => {
		await deleteTopicFile(fileId);
		setFiles((p) => p.filter((f) => f.id !== fileId));
		notify.success('Đã xoá file');
		setSelectedIds((p) => {
			const n = new Set(p);
			n.delete(fileId);
			return n;
		});
	};

	const handleBulkDelete = async () => {
		const ids = Array.from(selectedIds);
		await Promise.all(ids.map((fid) => deleteTopicFile(fid)));
		setFiles((p) => p.filter((f) => !ids.includes(f.id)));
		notify.success(`Đã xoá ${ids.length} file`);
		setSelectedIds(new Set());
	};

	const handleBulkDownload = () =>
		files
			.filter((f) => selectedIds.has(f.id))
			.forEach((f, i) =>
				setTimeout(() => {
					const a = Object.assign(document.createElement('a'), {
						href: `${BASE_URL}${f.file_url}`,
						download: f.file_name,
					});
					document.body.appendChild(a);
					a.click();
					document.body.removeChild(a);
				}, i * 250),
			);

	return {
		id,
		navigate,
		fullName,
		userRole,
		initials,
		topic,
		meta,
		files,
		loading,
		error,
		canEditTitle,
		canEditInfo,
		canEditMembers,
		canUploadFiles,
		canDeleteFiles,
		editBanner,
		editingInfo,
		setEditingInfo,
		infoForm,
		setInfoForm,
		savingInfo,
		infoErr,
		startEditInfo,
		handleSaveInfo,
		...memberCtl,
		fileInputRef,
		pendingFiles,
		setPendingFiles,
		batchNote,
		setBatchNote,
		uploading,
		uploadError,
		dragging,
		setDragging,
		selectedIds,
		handleFileSelect,
		handleUpload,
		toggleSelect,
		toggleSelectAll,
		handleDeleteFile,
		handleBulkDelete,
		handleBulkDownload,
	};
}
