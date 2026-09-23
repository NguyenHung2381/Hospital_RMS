import { notify } from '../../../shared/utils/feedback';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { BASE_URL } from '../../../shared/api/axios';
import {
	addTopicMember,
	deleteTopicFile,
	deleteTopicMember,
	getTopicFiles,
	getTopicMembers,
	grantTopicMemberAccounts,
	searchUsers,
	uploadTopicFiles,
	type GrantedAccount,
	type UserSuggestion,
} from '../api/topicApi';
import type {
	MemberRole,
	Topic,
	TopicFile,
	TopicMember,
} from '../types/topic.type';

export interface NewMemberForm {
	ho_ten: string;
	email: string;
	so_dien_thoai: string;
	chuc_vu: string;
	staff_number: string;
	department_id: string;
	role: MemberRole;
}

const EMPTY_NEW_MEMBER: NewMemberForm = {
	ho_ten: '',
	email: '',
	so_dien_thoai: '',
	chuc_vu: '',
	staff_number: '',
	department_id: '',
	role: 'member',
};

export function useTopicDrawer(topic: Topic) {
	const [members, setMembers] = useState<TopicMember[]>([]);
	const [files, setFiles] = useState<TopicFile[]>([]);

	const [showAddMember, setShowAddMember] = useState(false);
	const [newMember, setNewMember] = useState<NewMemberForm>(EMPTY_NEW_MEMBER);
	const [savingMember, setSavingMember] = useState(false);
	const [memberError, setMemberError] = useState('');
	const [nameSuggestions, setNameSuggestions] = useState<UserSuggestion[]>([]);
	const [showNameSuggestions, setShowNameSuggestions] = useState(false);
	const [isSearchingName, setIsSearchingName] = useState(false);
	const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [batchNote, setBatchNote] = useState('');
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState('');
	const [dragging, setDragging] = useState(false);

	const [filesToDelete, setFilesToDelete] = useState<TopicFile[]>([]);
	const [showUploadConfirm, setShowUploadConfirm] = useState(false);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	const [grantingIds, setGrantingIds] = useState<Set<string>>(new Set());
	const [grantedAccounts, setGrantedAccounts] = useState<GrantedAccount[]>([]);
	const [grantError, setGrantError] = useState('');

	const pendingMembers = members.filter(
		(m) => !m.account_granted && !m.has_existing_account,
	);
	const membersMissingEmail = pendingMembers.filter(
		(m) => !m.email || !m.email.trim(),
	);
	const canGrantAccountsNoEmail = topic.status === 'approved';

	useEffect(() => {
		if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
		nameDebounceRef.current = setTimeout(() => {
			const q = newMember.ho_ten.trim();
			if (q.length < 2) {
				setNameSuggestions([]);
				setShowNameSuggestions(false);
				return;
			}
			setIsSearchingName(true);
			searchUsers(q)
				.then((res) => {
					setNameSuggestions(res.data);
					setShowNameSuggestions(true);
				})
				.catch(() => setNameSuggestions([]))
				.finally(() => setIsSearchingName(false));
		}, 300);
		return () => {
			if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
		};
	}, [newMember.ho_ten]);

	useEffect(() => {
		getTopicMembers(topic.id)
			.then(setMembers)
			.catch((err) => {
				console.error('getTopicMembers failed:', err);
				setMembers([]);
			});
		getTopicFiles(topic.id)
			.then((res) => setFiles(res.data))
			.catch((err) => {
				console.error('getTopicFiles failed:', err);
				setFiles([]);
			});
	}, [topic.id]);

	const handleGrantAccountsNoEmail = async () => {
		if (topic.status !== 'approved') {
			setGrantError(
				'Đề tài chưa được duyệt nên chưa thể cấp tài khoản thành viên.',
			);
			return;
		}
		setGrantingIds(new Set(['all']));
		setGrantError('');
		try {
			const result = await grantTopicMemberAccounts(topic.id);
			const refreshed = await getTopicMembers(topic.id);
			setMembers(refreshed);
			if (result.credentials.length > 0) setGrantedAccounts(result.credentials);
		} catch (err) {
			setGrantError(err instanceof Error ? err.message : 'Lỗi cấp tài khoản');
		} finally {
			setGrantingIds(new Set());
		}
	};

	const handleGrantSingleMember = async (memberId: string) => {
		if (topic.status !== 'approved') {
			setGrantError(
				'Đề tài chưa được duyệt nên chưa thể cấp tài khoản thành viên.',
			);
			return;
		}
		setGrantingIds(new Set([memberId]));
		setGrantError('');
		try {
			const result = await grantTopicMemberAccounts(topic.id, [memberId]);
			const refreshed = await getTopicMembers(topic.id);
			setMembers(refreshed);
			if (result.credentials.length > 0) setGrantedAccounts(result.credentials);
		} catch (err) {
			setGrantError(err instanceof Error ? err.message : 'Lỗi cấp tài khoản');
		} finally {
			setGrantingIds(new Set());
		}
	};

	const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
		const selected = Array.from(e.target.files ?? []);
		setPendingFiles((prev) => [...prev, ...selected]);
		e.target.value = '';
	};

	const removePending = (idx: number) =>
		setPendingFiles((prev) => prev.filter((_, i) => i !== idx));

	const handleUpload = async () => {
		if (pendingFiles.length === 0) return;
		setUploading(true);
		setUploadError('');
		try {
			await uploadTopicFiles(
				topic.id,
				pendingFiles,
				batchNote.trim() || undefined,
			);
			const res = await getTopicFiles(topic.id);
			setFiles(res.data);
			setPendingFiles([]);
			setBatchNote('');
		} catch (err) {
			setUploadError(err instanceof Error ? err.message : 'Lỗi upload file');
		} finally {
			setUploading(false);
		}
	};

	const toggleSelect = (id: string) =>
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	const toggleSelectAll = () =>
		setSelectedIds(
			selectedIds.size === files.length
				? new Set()
				: new Set(files.map((f) => f.id)),
		);

	const handleDeleteFile = (file: TopicFile) => setFilesToDelete([file]);

	const handleBulkDelete = () =>
		setFilesToDelete(files.filter((f) => selectedIds.has(f.id)));

	const handleBulkDownload = () => {
		files
			.filter((f) => selectedIds.has(f.id))
			.forEach((f, i) => {
				setTimeout(() => {
					const a = document.createElement('a');
					a.href = `${BASE_URL}${f.file_url}`;
					a.download = f.file_name;
					document.body.appendChild(a);
					a.click();
					document.body.removeChild(a);
				}, i * 250);
			});
	};

	const doDeleteFiles = async () => {
		const ids = filesToDelete.map((f) => f.id);
		await Promise.all(ids.map((id) => deleteTopicFile(id)));
		notify.success(`Đã xoá ${ids.length} file`);
		setFiles((prev) => prev.filter((f) => !ids.includes(f.id)));
		setSelectedIds((prev) => {
			const next = new Set(prev);
			ids.forEach((id) => next.delete(id));
			return next;
		});
		setFilesToDelete([]);
	};

	const handleAddMember = async () => {
		if (!newMember.ho_ten.trim()) {
			setMemberError('Vui lòng nhập họ tên');
			return;
		}
		if (!String(newMember.staff_number ?? '').trim()) {
			setMemberError('Vui lòng nhập mã nhân viên');
			return;
		}
		setSavingMember(true);
		setMemberError('');
		try {
			await addTopicMember(topic.id, {
				ho_ten: newMember.ho_ten.trim(),
				email: newMember.email.trim(),
				so_dien_thoai: newMember.so_dien_thoai.trim() || null,
				chuc_vu: newMember.chuc_vu.trim() || null,
				staff_number: String(newMember.staff_number ?? '').trim() || null,
				department_id: newMember.department_id || null,
				role: newMember.role,
			});
			const updated = await getTopicMembers(topic.id);
			setMembers(updated);
			setNewMember(EMPTY_NEW_MEMBER);
			setShowAddMember(false);
			notify.success('Đã thêm thành viên');
		} catch (err) {
			setMemberError(
				err instanceof Error ? err.message : 'Lỗi thêm thành viên',
			);
		} finally {
			setSavingMember(false);
		}
	};

	const handleDeleteMember = async (memberId: string) => {
		try {
			await deleteTopicMember(topic.id, memberId);
			setMembers((prev) => prev.filter((m) => m.id !== memberId));
			notify.success('Đã xoá thành viên');
		} catch (err) {
			notify.error(err instanceof Error ? err.message : 'Xoá thành viên thất bại');
		}
	};

	return {
		members,
		files,
		showAddMember,
		setShowAddMember,
		newMember,
		setNewMember,
		savingMember,
		memberError,
		setMemberError,
		nameSuggestions,
		showNameSuggestions,
		setShowNameSuggestions,
		isSearchingName,
		fileInputRef,
		pendingFiles,
		setPendingFiles,
		batchNote,
		setBatchNote,
		uploading,
		uploadError,
		dragging,
		setDragging,
		filesToDelete,
		setFilesToDelete,
		showUploadConfirm,
		setShowUploadConfirm,
		selectedIds,
		setSelectedIds,
		grantingIds,
		grantedAccounts,
		setGrantedAccounts,
		grantError,
		pendingMembers,
		membersMissingEmail,
		canGrantAccountsNoEmail,
		handleGrantAccountsNoEmail,
		handleGrantSingleMember,
		handleFileSelect,
		removePending,
		handleUpload,
		toggleSelect,
		toggleSelectAll,
		handleDeleteFile,
		handleBulkDelete,
		handleBulkDownload,
		doDeleteFiles,
		handleAddMember,
		handleDeleteMember,
	};
}
