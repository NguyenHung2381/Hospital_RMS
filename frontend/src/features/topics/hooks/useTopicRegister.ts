import { showToast } from '@/shared/utils/feedback';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getStoredUser } from '../../../shared/utils/storage';
import { getTopicRoundByToken } from '../../public/api/publicApi';
import {
	addTopicMember,
	createTopic,
	getCategories,
	getDepts,
	getRounds,
	getTopics,
	uploadTopicFiles,
	type SimpleItem,
	type UserSuggestion,
} from '../api/topicApi';
import type { FormErrors, MemberRole, TopicStatus } from '../types/topic.type';
import type {
	MyTopic,
	PendingMember,
	PendingTopic,
	RegisterForm,
} from '../types/topicregister.type';
import { getInitials } from '../../../shared/utils/helper';
import { useFormConfig, type FormConfig } from '@/shared/formConfig/useFormConfig';
import type { CustomValues } from '@/shared/formConfig/types';
import { useAttachmentPicker } from './useAttachmentPicker';
import { useMemberPicker, type ManualForm } from './useMemberPicker';

export type { ManualForm } from './useMemberPicker';

export interface TopicRegisterState {
	// User
	userName: string;
	userRole: string;
	userInitials: string;
	currentDeptId: string;
	canRegister: boolean;

	// Reference data
	rounds: SimpleItem[];
	categories: SimpleItem[];
	/** Cấp độ của đợt đang chọn (đề tài lấy cấp độ theo đợt, không hỏi). */
	roundLevelName: string | null;
	depts: SimpleItem[];
	myTopics: MyTopic[];
	loadingRef: boolean;
	lockedRound: {
		id: string;
		name: string;
	} | null;

	// Round picker (bước chọn đợt trước khi vào form)
	pickedRoundId: string;
	pickRound: (id: string) => void;
	resetRound: () => void;

	// Form
	form: RegisterForm;
	errors: FormErrors;
	setField: <K extends keyof RegisterForm>(
		key: K,
		val: RegisterForm[K],
	) => void;
	handleDeptChange: (deptId: string) => void;
	/** Cấu hình form (nhãn / bắt buộc / trường tùy chỉnh) — biến thể cổng nhân viên */
	cfg: FormConfig;
	custom: CustomValues;
	setCustom: (next: CustomValues) => void;

	// Pending topics
	pendingTopics: PendingTopic[];
	submittingAll: boolean;
	submitError: string;
	addTopicToList: () => void;
	removeTopicFromList: (localId: string) => void;
	submitAll: (status: TopicStatus) => Promise<void>;

	// Members
	pendingMembers: PendingMember[];
	memberQuery: string;
	suggestions: UserSuggestion[];
	showSuggestions: boolean;
	isSearching: boolean;
	addRole: MemberRole;
	addedIds: Set<string>;
	setMemberQuery: (v: string) => void;
	setSuggestions: (v: UserSuggestion[]) => void;
	setShowSuggestions: (v: boolean) => void;
	setAddRole: (v: MemberRole) => void;
	addMember: (u: UserSuggestion) => void;
	removeMember: (id: string) => void;
	changeRole: (id: string, role: MemberRole) => void;

	// Manual form
	showManualForm: boolean;
	manualForm: ManualForm;
	manualErrors: Record<string, string>;
	setShowManualForm: (v: boolean) => void;
	setManualForm: (v: ManualForm) => void;
	setManualErrors: (v: Record<string, string>) => void;
	addMemberManual: () => void;

	// Files
	attachments: File[];
	fileError: string;
	isDragging: boolean;
	fileInputRef: React.RefObject<HTMLInputElement | null>;
	handleFiles: (files: FileList | null) => void;
	removeAttachment: (name: string) => void;
	setIsDragging: (v: boolean) => void;


	// Nav
	navigate: ReturnType<typeof useNavigate>;
	clearForm: () => void;
}

import type React from 'react';

export function useTopicRegister(): TopicRegisterState {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const publicToken = searchParams.get('token');

	const userInfo = getStoredUser<Record<string, string>>();
	const currentUserId = userInfo?.id ?? '';
	const currentDeptId = userInfo?.department_id ?? '';
	const userName = userInfo?.full_name ?? userInfo?.username ?? 'Người dùng';
	const userRole = userInfo?.role_name ?? '';
	const userInitials = getInitials(userName || 'U');
	const canRegister = !!currentDeptId;

	const [rounds, setRounds] = useState<SimpleItem[]>([]);
	const [categories, setCategories] = useState<SimpleItem[]>([]);
	const [depts, setDepts] = useState<SimpleItem[]>([]);
	const [myTopics, setMyTopics] = useState<MyTopic[]>([]);
	const [loadingRef, setLoadingRef] = useState(true);
	const [lockedRound, setLockedRound] =
		useState<TopicRegisterState['lockedRound']>(null);
	const [pickedRoundId, setPickedRoundId] = useState('');

	const [form, setFormState] = useState<RegisterForm>({
		article_type: 'de_tai',
		title: '',
		description: '',
		staff_number: '',
		round_id: '',
		category_id: '',
		department_id: currentDeptId,
		doi: '',
		publish_date: '',
	});
	const [errors, setErrors] = useState<FormErrors>({});
	const cfg = useFormConfig('topic', 'portal');
	const [custom, setCustomState] = useState<CustomValues>({});

	const [pendingTopics, setPendingTopics] = useState<PendingTopic[]>([]);
	const [submittingAll, setSubmittingAll] = useState(false);
	const [submitError, setSubmitError] = useState('');

	const members = useMemberPicker();
	const files = useAttachmentPicker();
	const { pendingMembers, resetMembers } = members;
	const { attachments, resetAttachments } = files;

	// Load reference data
	useEffect(() => {
		// Cấp độ KHÔNG tải ở đây: effect theo round_id bên dưới lo — tải song song
		// "tất cả cấp độ" dễ về sau và ghi đè danh sách đã lọc theo đợt.
		const base = Promise.all([
			getRounds(),
			getCategories(),
			getDepts(),
		]).then(([r, c, d]) => {
			setRounds(r.data);
			setCategories(c.data);
			setDepts(d.data);
		});
		const tokenLoad = publicToken
			? getTopicRoundByToken(publicToken)
					.then((round) => {
						if (!round.registration_open) {
							showToast('error', `Đợt "${round.name}" hiện không nhận đăng ký đề tài.`);
							return;
						}
						setLockedRound({
							id: round.id,
							name: round.name,
						});
						setPickedRoundId(round.id);
						setFormState((prev) => ({ ...prev, round_id: round.id }));
					})
					.catch((err: unknown) =>
						showToast('error', err instanceof Error ? err.message : 'Liên kết đăng ký không hợp lệ.'),
					)
			: Promise.resolve();
		Promise.all([base, tokenLoad]).finally(() => setLoadingRef(false));
	}, [publicToken]);


	// Load my topics — lọc theo participant_id ngay ở server, không phải lấy N đề
	// tài mới nhất trong phạm vi rồi tự lọc created_by (dễ sai/rỗng với scope
	// department/all khi đề tài của mình không nằm trong N bản ghi mới nhất đó).
	useEffect(() => {
		if (!currentUserId) return;
		getTopics({ participant_id: currentUserId, limit: 20 })
			.then((res) => {
				setMyTopics(
					res.data.map((t) => ({
						id: t.id,
						title: t.title,
						status: t.status,
						created_at: t.created_at,
					})),
				);
			})
			.catch(() => {});
	}, [currentUserId]);

	const setField = useCallback(
		<K extends keyof RegisterForm>(key: K, val: RegisterForm[K]) => {
			setFormState((f) => ({ ...f, [key]: val }));
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

	// Admin thu hẹp loại bài (Cấu hình form) ⇒ chuyển sang loại đầu tiên còn cho phép
	const typeOptions = cfg.field('article_type')?.options;
	const [seenTypeOptions, setSeenTypeOptions] = useState<typeof typeOptions>();
	if (typeOptions !== seenTypeOptions) {
		setSeenTypeOptions(typeOptions);
		if (typeOptions?.length && !typeOptions.some((o) => o.value === form.article_type))
			setFormState((f) => ({ ...f, article_type: typeOptions[0].value as RegisterForm['article_type'] }));
	}

	const handleDeptChange = useCallback(
		(deptId: string) => {
			setField('department_id', deptId);
		},
		[setField],
	);

	const pickRound = useCallback(
		(id: string) => {
			setPickedRoundId(id);
			setField('round_id', id);
		},
		[setField],
	);

	const resetRound = useCallback(() => {
		if (lockedRound) return; // đợt đã khóa theo link công khai
		setPickedRoundId('');
		setField('round_id', '');
	}, [lockedRound, setField]);

	const clearForm = useCallback(() => {
		setFormState((f) => ({
			article_type: f.article_type,
			title: '',
			description: '',
			staff_number: '',
			round_id: lockedRound ? lockedRound.id : pickedRoundId,
			category_id: '',
			department_id: currentDeptId,
			doi: '',
			publish_date: '',
		}));
		setErrors({});
		setCustomState({});
		resetMembers();
		resetAttachments();
	}, [lockedRound, pickedRoundId, currentDeptId, resetMembers, resetAttachments]);

	// Cấp độ lấy theo đợt — server tự gán khi tạo đề tài, form chỉ hiển thị.
	const roundLevelName = rounds.find((r) => r.id === form.round_id)?.level_name ?? null;

	const addTopicToList = useCallback(() => {
		// Bắt buộc / ràng buộc theo Cấu hình form (gồm trường tùy chỉnh); các lỗi
		// cứng bên dưới vẫn giữ để lời nhắc quen thuộc khi chưa tải được cấu hình.
		const e: FormErrors = cfg.validate({ ...form }, custom, { mode: 'create' });
		if (!form.title.trim())
			e.title =
				form.article_type === 'bai_bao'
					? 'Tiêu đề bài báo là bắt buộc'
					: 'Tiêu đề đề tài là bắt buộc';
		if (!form.round_id) e.round_id = 'Vui lòng chọn đợt nghiên cứu';
		// Mã đề tài sinh theo ký hiệu danh mục (sp_gen_topic_id) — bắt buộc cả với bài báo
		if (!form.category_id) e.category_id = 'Vui lòng chọn danh mục';
		if (!form.department_id) e.department_id = 'Vui lòng chọn khoa/phòng';
		if (Object.keys(e).length) {
			setErrors(e);
			return;
		}
		setPendingTopics((prev) => [
			...prev,
			{
				localId: `t_${Date.now()}`,
				article_type: form.article_type,
				title: form.title.trim(),
				description: form.description.trim(),
				staff_number: form.staff_number.trim(),
				round_id: form.round_id,
				category_id: form.category_id,
				department_id: form.department_id,
				doi: form.doi.trim(),
				publish_date: form.publish_date,
				members: pendingMembers,
				attachments,
				custom,
			},
		]);
		showToast('success', form.article_type === 'bai_bao' ? 'Đã thêm bài báo vào danh sách.' : 'Đã thêm đề tài vào danh sách.');
		setFormState({
			article_type: form.article_type,
			title: '',
			description: '',
			staff_number: '',
			round_id: form.round_id,
			category_id: '',
			department_id: form.department_id,
			doi: '',
			publish_date: '',
		});
		setErrors({});
		setCustomState({});
		resetMembers();
		resetAttachments();
	}, [form, custom, cfg, pendingMembers, attachments, resetMembers, resetAttachments]);

	const removeTopicFromList = useCallback(
		(localId: string) =>
			setPendingTopics((prev) => prev.filter((t) => t.localId !== localId)),
		[],
	);

	const submitAll = useCallback(
		async (status: TopicStatus) => {
			if (pendingTopics.length === 0) {
				showToast('error', 'Chưa có đề tài nào trong danh sách.');
				return;
			}
			setSubmittingAll(true);
			setSubmitError('');
			const results = await Promise.allSettled(
				pendingTopics.map(async (t) => {
					const created = await createTopic({
						title: t.title,
						description: t.description || undefined,
						round_id: t.round_id,
						category_id: t.category_id,
						department_id: t.department_id,
						status,
						article_type: t.article_type,
						doi: t.doi || undefined,
						publish_date: t.publish_date || undefined,
						custom: t.custom,
					});
					if (t.members.length > 0) {
						await Promise.allSettled(
							t.members.map((m) =>
								addTopicMember(created.id, {
									ho_ten: m.ho_ten,
									email: m.email,
									so_dien_thoai: m.phone_number || null,
									chuc_vu: m.chuc_vu || null,
									staff_number: m.staff_number || null,
									department_id: m.department_id || t.department_id || null,
									role: m.role,
								}),
							),
						);
					}
					if (t.attachments.length > 0)
						await uploadTopicFiles(created.id, t.attachments);
					return t.localId;
				}),
			);
			const succeededIds = new Set(
				results
					.filter(
						(r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled',
					)
					.map((r) => r.value),
			);
			const failedCount = pendingTopics.length - succeededIds.size;
			// Chỉ xóa khỏi danh sách chờ các đề tài đã tạo thành công — tránh gửi
			// trùng khi user bấm gửi lại sau khi 1 phần bị lỗi.
			setPendingTopics((prev) => prev.filter((t) => !succeededIds.has(t.localId)));
			setSubmittingAll(false);
			if (failedCount === 0) {
				showToast('success', `Đã gửi ${succeededIds.size} mục để phê duyệt!`);
				setTimeout(() => navigate('/user/my-topics'), 1800);
			} else if (succeededIds.size === 0) {
				setSubmitError('Có lỗi xảy ra, vui lòng thử lại.');
			} else {
				showToast('error', `Đã gửi ${succeededIds.size} mục, ${failedCount} mục lỗi. Vui lòng thử lại các mục còn trong danh sách.`);
			}
		},
		[pendingTopics, navigate],
	);

	return {
		userName,
		userRole,
		userInitials,
		currentDeptId,
		canRegister,
		rounds,
		categories,
		roundLevelName,
		depts,
		myTopics,
		loadingRef,
		lockedRound,
		pickedRoundId,
		pickRound,
		resetRound,
		form,
		errors,
		setField,
		handleDeptChange,
		cfg,
		custom,
		setCustom,
		pendingTopics,
		submittingAll,
		submitError,
		addTopicToList,
		removeTopicFromList,
		submitAll,
		...members,
		...files,
		navigate,
		clearForm,
	};
}
