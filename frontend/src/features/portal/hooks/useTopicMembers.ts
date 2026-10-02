import { useState } from 'react';
import { notify } from '../../../shared/utils/feedback';
import {
	addTopicMember,
	deleteTopicMember,
	getTopicMembers,
	updateTopicMember,
} from '../../topics/api/topicApi';
import type { TopicMember } from '../../topics/types/topic.type';
import { blankMember, type MemberFormState } from '../types/topicDetail.type';

const toPayload = (f: MemberFormState) => ({
	ho_ten: f.ho_ten.trim(),
	email: f.email.trim() || undefined,
	so_dien_thoai: f.so_dien_thoai.trim() || undefined,
	chuc_vu: f.chuc_vu.trim() || undefined,
	staff_number: f.staff_number.trim() || undefined,
	role: f.role,
});

/** State + thao tác thêm/sửa/xoá thành viên đề tài (dùng cho MembersTab). */
export function useTopicMembers(topicId: string | null | undefined) {
	const [members, setMembers] = useState<TopicMember[]>([]);
	const [addingMember, setAddingMember] = useState(false);
	const [newMember, setNewMember] = useState<MemberFormState>(blankMember);
	const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
	const [editMemberForm, setEditMemberForm] =
		useState<MemberFormState>(blankMember);
	const [savingMember, setSavingMember] = useState(false);
	const [memberErr, setMemberErr] = useState('');

	const handleAddMember = async () => {
		if (!topicId || !newMember.ho_ten.trim()) {
			setMemberErr('Họ tên không được để trống.');
			return;
		}
		setSavingMember(true);
		setMemberErr('');
		try {
			await addTopicMember(topicId, toPayload(newMember));
			setMembers(await getTopicMembers(topicId));
			setNewMember(blankMember);
			setAddingMember(false);
			notify.success('Đã thêm thành viên');
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
		if (!topicId || !editingMemberId || !editMemberForm.ho_ten.trim()) {
			setMemberErr('Họ tên không được để trống.');
			return;
		}
		setSavingMember(true);
		setMemberErr('');
		try {
			await updateTopicMember(topicId, editingMemberId, toPayload(editMemberForm));
			setMembers(await getTopicMembers(topicId));
			setEditingMemberId(null);
			notify.success('Đã cập nhật thành viên');
		} catch (e) {
			setMemberErr(e instanceof Error ? e.message : 'Lưu thất bại');
		} finally {
			setSavingMember(false);
		}
	};

	const handleDeleteMember = async (memberId: string) => {
		if (!topicId) return;
		try {
			await deleteTopicMember(topicId, memberId);
			setMembers((p) => p.filter((m) => m.id !== memberId));
			notify.success('Đã xoá thành viên');
		} catch (e) {
			setMemberErr(e instanceof Error ? e.message : 'Xoá thất bại');
		}
	};

	return {
		members,
		setMembers,
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
	};
}
