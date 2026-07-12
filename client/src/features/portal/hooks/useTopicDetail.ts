import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { BASE_URL } from '../../../shared/api/axios';
import { getStoredUser } from '../../../shared/utils/storage';
import { getDeadlines, getRoundById } from '../../round/api/roundApi';
import type {
	ResearchRound,
	RoundDeadline,
} from '../../round/types/round.type';
import {
	addTopicMember,
	deleteTopicFile,
	deleteTopicMember,
	getCategories,
	getDepts,
	getLevels,
	getRounds,
	getTopic,
	getTopicFiles,
	getTopicMembers,
	updateTopic,
	updateTopicMember,
	uploadTopicFiles,
	type SimpleItem,
} from '../../topics/api/topicApi';
import type {
	Topic,
	TopicFile,
	TopicMember,
} from '../../topics/types/topic.type';
import { getEditMode } from '../services/topicDetailService';
import {
	blankMember,
	EDIT_MODE_INFO,
	type EditMode,
	type InfoForm,
	type MemberFormState,
	type TopicDetailTabKey,
} from '../types/topicDetail.type';

export function useTopicDetail() {
	const { id } = useParams<{ id: string }>();
	const location = useLocation();
	const navigate = useNavigate();

	const userInfo = getStoredUser<Record<string, string>>();
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
	const [activeRound, setActiveRound] = useState<ResearchRound | null>(null);
	const [roundDeadlines, setRoundDeadlines] = useState<RoundDeadline[]>([]);
	const [meta, setMeta] = useState<{
		categories: SimpleItem[];
		levels: SimpleItem[];
		rounds: SimpleItem[];
		departments: SimpleItem[];
	}>({ categories: [], levels: [], rounds: [], departments: [] });
	const [members, setMembers] = useState<TopicMember[]>([]);
	const [files, setFiles] = useState<TopicFile[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [tab, setTab] = useState<TopicDetailTabKey>('info');

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

	// ── Member edit state ──
	const [addingMember, setAddingMember] = useState(false);
	const [newMember, setNewMember] = useState<MemberFormState>(blankMember);
	const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
	const [editMemberForm, setEditMemberForm] =
		useState<MemberFormState>(blankMember);
	const [savingMember, setSavingMember] = useState(false);
	const [memberErr, setMemberErr] = useState('');

	// ── File upload state ──
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [batchNote, setBatchNote] = useState('');
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState('');

	const prevPendingRef = useRef<File[]>([]);
	useEffect(() => {
		const prev = prevPendingRef.current;
		const curr = pendingFiles;
		if (curr.length > prev.length) {
			const added = curr.filter((f) => !prev.includes(f));
			if (added.length > 0) {
				console.log('Đã nạp file vào danh sách chờ tải lên:', added.map((f) => ({ name: f.name, size: f.size })));
			}
		} else if (curr.length < prev.length) {
			if (curr.length === 0 && prev.length > 0) {
				console.log('Đã xóa toàn bộ file trong danh sách chờ.');
			} else {
				const removed = prev.filter((f) => !curr.includes(f));
				if (removed.length > 0) {
					console.log('Đã xóa file khỏi danh sách chờ:', removed.map((f) => f.name));
				}
			}
		}
		prevPendingRef.current = curr;
	}, [pendingFiles]);

	const [dragging, setDragging] = useState(false);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate(['topic', 'round'], refreshData);

	// ── Edit mode ──
	const editMode = useMemo<EditMode>(() => {
		if (!topic || !activeRound) return 'none';
		return getEditMode(topic, activeRound, roundDeadlines);
	}, [topic, activeRound, roundDeadlines]);

	const canEditInfo = editMode === 'full' || editMode === 'supplement';
	const canUploadFiles = editMode !== 'none';
	const canDeleteFiles = editMode === 'full' || editMode === 'supplement';
	const editBanner = EDIT_MODE_INFO[editMode];

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
					const [rd, dl] = await Promise.all([
						getRoundById(cur.round_id),
						getDeadlines(cur.round_id),
					]);
					setActiveRound(rd);
					setRoundDeadlines(dl);
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
	}, [id, refreshKey]);

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
		setSavingInfo(true);
		setInfoErr('');
		try {
			setTopic(
				await updateTopic(topic.id, {
					title: infoForm.title.trim(),
					description: infoForm.description.trim() || undefined,
					category_id: infoForm.category_id || undefined,
					level_id: infoForm.level_id || undefined,
				}),
			);
			setEditingInfo(false);
		} catch (e) {
			setInfoErr(e instanceof Error ? e.message : 'Lưu thất bại');
		} finally {
			setSavingInfo(false);
		}
	};

	const handleAddMember = async () => {
		if (!topic || !newMember.ho_ten.trim()) {
			setMemberErr('Họ tên không được để trống.');
			return;
		}
		setSavingMember(true);
		setMemberErr('');
		try {
			await addTopicMember(topic.id, {
				ho_ten: newMember.ho_ten.trim(),
				email: newMember.email.trim() || undefined,
				so_dien_thoai: newMember.so_dien_thoai.trim() || undefined,
				chuc_vu: newMember.chuc_vu.trim() || undefined,
				staff_number: newMember.staff_number.trim() || undefined,
				role: newMember.role,
			});
			setMembers(await getTopicMembers(topic.id));
			setNewMember(blankMember);
			setAddingMember(false);
		} catch (e) {
			setMemberErr(e instanceof Error ? e.message : 'Thêm thất bại');
		} finally {
			setSavingMember(false);
		}
	};

	const startEditMember = (m: TopicMember) => {
		setEditingMemberId(m.id);
		setEditMemberForm({
			ho_ten: m.ho_ten,
			email: m.email ?? '',
			so_dien_thoai: m.so_dien_thoai ?? '',
			chuc_vu: m.chuc_vu ?? '',
			staff_number: m.staff_number != null ? String(m.staff_number) : '',
			role: m.role,
		});
		setMemberErr('');
	};

	const handleSaveMember = async () => {
		if (!topic || !editingMemberId || !editMemberForm.ho_ten.trim()) {
			setMemberErr('Họ tên không được để trống.');
			return;
		}
		setSavingMember(true);
		setMemberErr('');
		try {
			await updateTopicMember(topic.id, editingMemberId, {
				ho_ten: editMemberForm.ho_ten.trim(),
				email: editMemberForm.email.trim() || undefined,
				so_dien_thoai: editMemberForm.so_dien_thoai.trim() || undefined,
				chuc_vu: editMemberForm.chuc_vu.trim() || undefined,
				staff_number: editMemberForm.staff_number.trim() || undefined,
				role: editMemberForm.role,
			});
			setMembers(await getTopicMembers(topic.id));
			setEditingMemberId(null);
		} catch (e) {
			setMemberErr(e instanceof Error ? e.message : 'Lưu thất bại');
		} finally {
			setSavingMember(false);
		}
	};

	const handleDeleteMember = async (memberId: string) => {
		if (!topic) return;
		try {
			await deleteTopicMember(topic.id, memberId);
			setMembers((p) => p.filter((m) => m.id !== memberId));
		} catch (e) {
			setMemberErr(e instanceof Error ? e.message : 'Xoá thất bại');
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
		console.log('Bắt đầu quá trình tải lên file cho đề tài:', id, {
			files: pendingFiles.map((f) => ({ name: f.name, size: f.size, type: f.type })),
			batchNote,
		});
		try {
			await uploadTopicFiles(id, pendingFiles, batchNote.trim() || undefined);
			console.log('Tải lên file thành công cho đề tài:', id);
			setFiles((await getTopicFiles(id)).data);
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
		setSelectedIds((p) => {
			const n = new Set(p);
			n.delete(fileId);
			return n;
		});
	};

	const handleBulkDelete = async () => {
		const ids = Array.from(selectedIds);
		for (const fid of ids) await deleteTopicFile(fid);
		setFiles((p) => p.filter((f) => !ids.includes(f.id)));
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
		members,
		files,
		loading,
		error,
		tab,
		setTab,
		editMode,
		canEditInfo,
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
		addingMember,
		setAddingMember,
		newMember,
		setNewMember,
		editingMemberId,
		setEditingMemberId,
		editMemberForm,
		setEditMemberForm,
		savingMember,
		memberErr,
		setMemberErr,
		handleAddMember,
		startEditMember,
		handleSaveMember,
		handleDeleteMember,
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
