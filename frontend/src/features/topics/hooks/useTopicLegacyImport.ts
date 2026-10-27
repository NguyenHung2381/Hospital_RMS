import { showToast } from '@/shared/utils/feedback';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CustomValues } from '@/shared/formConfig/types';
import { useFormConfig } from '@/shared/formConfig/useFormConfig';
import { getStoredUser } from '../../../shared/utils/storage';
import { getInitials } from '../../../shared/utils/helper';
import {
	createLegacyTopic,
	getCategories,
	getDepts,
	getRounds,
	getTopics,
	uploadTopicFiles,
	type SimpleItem,
} from '../api/topicApi';
import type { AcceptanceRating, FormErrors } from '../types/topic.type';
import type { MyTopic } from '../types/topicregister.type';
import { useAttachmentPicker } from './useAttachmentPicker';
import { useMemberPicker } from './useMemberPicker';

export interface LegacyTopicForm {
	title: string;
	description: string;
	round_id: string;
	category_id: string;
	department_id: string;
	acceptance_rating: AcceptanceRating | '';
	acceptance_score: string;
	acceptance_date: string;
}

const emptyForm = (deptId: string): LegacyTopicForm => ({
	title: '',
	description: '',
	round_id: '',
	category_id: '',
	department_id: deptId,
	acceptance_rating: '',
	acceptance_score: '',
	acceptance_date: '',
});

const errorMessage = (err: unknown) =>
	err instanceof Error ? err.message : 'Có lỗi xảy ra, vui lòng thử lại.';

// Nhập bổ sung đề tài ĐÃ HOÀN THÀNH (đợt cũ trước khi có hệ thống): chọn đợt có
// sẵn (kể cả đã đóng), không xét mốc đăng ký. Tạo đề tài + thành viên trong 1
// lần gọi, rồi tải file lên — đề tài vào hàng chờ duyệt.
export function useTopicLegacyImport() {
	const navigate = useNavigate();
	const userInfo = getStoredUser<Record<string, string>>();
	const currentUserId = userInfo?.id ?? '';
	const currentDeptId = userInfo?.department_id ?? '';
	const userName = userInfo?.full_name ?? userInfo?.username ?? 'Người dùng';
	const userRole = userInfo?.role_name ?? '';
	const userInitials = getInitials(userName || 'U');

	const [rounds, setRounds] = useState<SimpleItem[]>([]);
	const [categories, setCategories] = useState<SimpleItem[]>([]);
	const [depts, setDepts] = useState<SimpleItem[]>([]);
	const [myTopics, setMyTopics] = useState<MyTopic[]>([]);
	const [loadingRef, setLoadingRef] = useState(true);

	const [form, setForm] = useState<LegacyTopicForm>(() => emptyForm(currentDeptId));
	const [errors, setErrors] = useState<FormErrors>({});
	const [submitting, setSubmitting] = useState(false);

	// Cùng cấu hình form 'topic' với trang Đăng ký (biến thể cổng nhân viên)
	const cfg = useFormConfig('topic', 'portal');
	const [custom, setCustomState] = useState<CustomValues>({});

	const members = useMemberPicker();
	const files = useAttachmentPicker();
	const { pendingMembers, resetMembers } = members;
	const { attachments, resetAttachments } = files;

	useEffect(() => {
		Promise.all([getRounds(), getCategories(), getDepts()])
			.then(([r, c, d]) => {
				setRounds(r.data);
				setCategories(c.data);
				setDepts(d.data);
			})
			.catch((err: unknown) => showToast('error', errorMessage(err)))
			.finally(() => setLoadingRef(false));
	}, []);

	useEffect(() => {
		if (!currentUserId) return;
		getTopics({ participant_id: currentUserId, limit: 20 })
			.then((res) =>
				setMyTopics(
					res.data.map((t) => ({
						id: t.id,
						title: t.title,
						status: t.status,
						created_at: t.created_at,
					})),
				),
			)
			.catch(() => {});
	}, [currentUserId]);

	// Đợt đã hủy không nhận đề tài; đợt mới nhất lên đầu
	const roundOptions = useMemo(
		() =>
			rounds
				.filter((r) => r.status !== 'cancelled')
				.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name, 'vi')),
		[rounds],
	);

	const setField = useCallback(
		<K extends keyof LegacyTopicForm>(key: K, val: LegacyTopicForm[K]) => {
			setForm((f) => ({ ...f, [key]: val }));
			setErrors((e) => {
				const n = { ...e };
				delete n[key];
				return n;
			});
		},
		[],
	);

	const setCustom = useCallback((next: CustomValues) => {
		setCustomState((prev) => {
			const changed = Object.keys(next).filter((k) => next[k] !== prev[k]);
			if (changed.length)
				setErrors((e) => {
					const n = { ...e };
					changed.forEach((k) => delete n[k]);
					return n;
				});
			return next;
		});
	}, []);

	// Cấp độ lấy theo đợt — server tự gán khi tạo đề tài, form chỉ hiển thị
	const roundLevelName = rounds.find((r) => r.id === form.round_id)?.level_name ?? null;

	const clearForm = useCallback(() => {
		setForm(emptyForm(currentDeptId));
		setErrors({});
		setCustomState({});
		resetMembers();
		resetAttachments();
	}, [currentDeptId, resetMembers, resetAttachments]);

	const validate = (): FormErrors => {
		// Bắt buộc / ràng buộc / trường tùy chỉnh theo Cấu hình form; phần cứng bên dưới
		const e: FormErrors = cfg.validate(
			{
				title: form.title,
				description: form.description,
				round_id: form.round_id,
				category_id: form.category_id,
				department_id: form.department_id,
				article_type: 'de_tai',
			},
			custom,
			{ mode: 'create' },
		);
		if (!form.title.trim()) e.title = 'Tên đề tài là bắt buộc';
		if (!form.round_id) e.round_id = 'Vui lòng chọn đợt nghiên cứu';
		// Mã đề tài sinh theo ký hiệu danh mục — bắt buộc
		if (!form.category_id) e.category_id = 'Vui lòng chọn danh mục';
		if (!form.department_id) e.department_id = 'Vui lòng chọn khoa/phòng';
		if (form.acceptance_score !== '') {
			const score = Number(form.acceptance_score);
			if (Number.isNaN(score) || score < 0 || score > 100)
				e.acceptance_score = 'Điểm nghiệm thu phải từ 0 đến 100';
		}
		if (!pendingMembers.some((m) => m.role === 'leader'))
			e.members = 'Đề tài cần có chủ nhiệm';
		return e;
	};

	const submit = async () => {
		const e = validate();
		if (Object.keys(e).length) {
			setErrors(e);
			showToast('error', Object.values(e)[0]);
			return;
		}
		setSubmitting(true);
		try {
			const topic = await createLegacyTopic({
				title: form.title.trim(),
				description: form.description.trim() || undefined,
				round_id: form.round_id,
				category_id: form.category_id,
				department_id: form.department_id,
				acceptance_rating: form.acceptance_rating || undefined,
				acceptance_score:
					form.acceptance_score !== '' ? Number(form.acceptance_score) : undefined,
				acceptance_date: form.acceptance_date || undefined,
				custom,
				members: pendingMembers.map((m) => ({
					// Thành viên chọn từ gợi ý mang mã tài khoản — server gắn tài khoản người nhập
					user_id: m.id.startsWith('manual_') ? undefined : m.id,
					ho_ten: m.ho_ten,
					email: m.email,
					so_dien_thoai: m.phone_number || null,
					chuc_vu: m.chuc_vu || null,
					staff_number: m.staff_number || null,
					department_id: m.department_id || form.department_id || null,
					role: m.role,
				})),
			});
			if (attachments.length) {
				try {
					await uploadTopicFiles(topic.id, attachments, 'Hồ sơ đề tài đã hoàn thành');
				} catch (err) {
					// Đề tài đã tạo — bổ sung file sau ở "Đề tài của tôi" (được sửa khi chờ duyệt)
					showToast(
						'error',
						`Đã gửi đề tài nhưng chưa tải được tệp: ${errorMessage(err)}. Bổ sung tệp ở mục "Đề tài của tôi".`,
					);
					setTimeout(() => navigate('/user/my-topics'), 2500);
					return;
				}
			}
			showToast('success', 'Đã gửi đề tài — chờ quản lý NCKH xác nhận.');
			clearForm();
			setTimeout(() => navigate('/user/my-topics'), 1500);
		} catch (err) {
			showToast('error', errorMessage(err));
		} finally {
			setSubmitting(false);
		}
	};

	return {
		userName,
		userRole,
		userInitials,
		currentDeptId,
		roundOptions,
		categories,
		roundLevelName,
		depts,
		myTopics,
		loadingRef,
		form,
		errors,
		setField,
		cfg,
		custom,
		setCustom,
		submitting,
		submit,
		clearForm,
		navigate,
		...members,
		...files,
	};
}
