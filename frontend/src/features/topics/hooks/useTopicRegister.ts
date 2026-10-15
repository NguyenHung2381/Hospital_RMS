import { showToast } from '@/shared/utils/feedback';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getStoredUser } from '../../../shared/utils/storage';
import { getTopicRoundByToken } from '../../public/api/publicApi';
import {
	addTopicMember,
	createTopic,
	getCategories,
	getDepts,
	getLevels,
	getRounds,
	getTopics,
	searchUsers,
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
import { useUploadPolicy } from '@/shared/hooks/useUploadPolicy';
import { nextAddRole } from '../utils/topicHelpers';

export interface ManualForm {
	ho_ten: string;
	staff_number: string;
	phone_number: string;
	chuc_vu: string;
	department_id: string;
	role: MemberRole;
}

const EMPTY_MANUAL: ManualForm = {
	ho_ten: '',
	staff_number: '',
	phone_number: '',
	chuc_vu: '',
	department_id: '',
	role: 'member',
};

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
	levels: SimpleItem[];
	/** Đợt chỉ cho 1 cấp độ ⇒ cấp độ đó (tự gán, không cho chọn). */
	autoLevel: SimpleItem | null;
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
	const [levels, setLevels] = useState<SimpleItem[]>([]);
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
		level_id: '',
		department_id: currentDeptId,
		doi: '',
		publish_date: '',
	});
	const [errors, setErrors] = useState<FormErrors>({});

	const [pendingTopics, setPendingTopics] = useState<PendingTopic[]>([]);
	const [submittingAll, setSubmittingAll] = useState(false);
	const [submitError, setSubmitError] = useState('');

	const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
	const [memberQuery, setMemberQuery] = useState('');
	const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [isSearching, setIsSearching] = useState(false);
	const [addRole, setAddRole] = useState<MemberRole>('leader');
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [showManualForm, setShowManualForm] = useState(false);
	const [manualForm, setManualForm] = useState<ManualForm>(EMPTY_MANUAL);
	const [manualErrors, setManualErrors] = useState<Record<string, string>>({});

	const [attachments, setAttachments] = useState<File[]>([]);
	const [fileError, setFileError] = useState('');
	const [isDragging, setIsDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);


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

	// Cấp độ "ăn theo" đợt (cấu hình ở đợt / loại đợt): mỗi khi đổi vòng nghiên
	// cứu, tải lại danh sách cấp độ được phép. Nếu cấp độ đang chọn không còn hợp
	// lệ → bỏ chọn. Chưa chọn đợt ⇒ tất cả cấp độ.
	useEffect(() => {
		const roundId = form.round_id;
		let alive = true;
		getLevels(roundId ? { round_id: roundId } : undefined)
			.then((res) => {
				if (!alive) return;
				setLevels(res.data);
				setFormState((f) =>
					f.level_id && !res.data.some((l) => l.id === f.level_id)
						? { ...f, level_id: '' }
						: f,
				);
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, [form.round_id]);

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

	// Member search debounce
	useEffect(() => {
		if (memberQuery.trim().length < 2) return;
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			setIsSearching(true);
			searchUsers(memberQuery)
				.then((res) => {
					setSuggestions(res.data);
					setShowSuggestions(true);
				})
				.catch(() => setSuggestions([]))
				.finally(() => setIsSearching(false));
		}, 300);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [memberQuery]);

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
		if (lockedRound) return; // đợt đã khoá theo link công khai
		setPickedRoundId('');
		setField('round_id', '');
	}, [lockedRound, setField]);

	const addMember = useCallback(
		(u: UserSuggestion) => {
			if (pendingMembers.some((m) => m.id === u.id)) return;
			const next = [
				...pendingMembers,
				{
					id: u.id,
					ho_ten: u.full_name,
					staff_number: u.staff_number != null ? String(u.staff_number) : '',
					email: u.email,
					chuc_vu: '',
					role: addRole,
				},
			];
			setPendingMembers(next);
			// Người thêm tiếp theo mặc định lần lượt Chủ nhiệm → Thư ký → Thành viên
			setAddRole(nextAddRole(next));
			setMemberQuery('');
			setSuggestions([]);
			setShowSuggestions(false);
		},
		[pendingMembers, addRole],
	);

	const removeMember = useCallback(
		(id: string) =>
			setPendingMembers((prev) => prev.filter((m) => m.id !== id)),
		[],
	);
	const changeRole = useCallback(
		(id: string, role: MemberRole) =>
			setPendingMembers((prev) =>
				prev.map((m) => (m.id === id ? { ...m, role } : m)),
			),
		[],
	);

	const addMemberManual = useCallback(() => {
		const errs: Record<string, string> = {};
		if (!manualForm.ho_ten.trim()) errs.ho_ten = 'Nhập họ tên';
		if (!manualForm.staff_number.trim())
			errs.staff_number = 'Nhập mã nhân viên';
		if (!manualForm.phone_number.trim())
			errs.phone_number = 'Nhập số điện thoại';
		if (!manualForm.chuc_vu.trim()) errs.chuc_vu = 'Nhập chức danh';
		if (Object.keys(errs).length) {
			setManualErrors(errs);
			return;
		}
		if (
			pendingMembers.some(
				(m) => m.staff_number === manualForm.staff_number.trim(),
			)
		) {
			showToast('error', 'Thành viên này đã được thêm.');
			return;
		}
		setPendingMembers((prev) => [
			...prev,
			{
				id: `manual_${Date.now()}`,
				ho_ten: manualForm.ho_ten.trim(),
				staff_number: manualForm.staff_number.trim(),
				phone_number: manualForm.phone_number.trim(),
				chuc_vu: manualForm.chuc_vu.trim(),
				department_id: manualForm.department_id || undefined,
				role: manualForm.role,
			},
		]);
		setManualForm(EMPTY_MANUAL);
		setManualErrors({});
		setShowManualForm(false);
		setMemberQuery('');
	}, [pendingMembers, manualForm]);

	const uploadPolicy = useUploadPolicy();
	const handleFiles = useCallback((files: FileList | null) => {
		if (!files) return;
		const toAdd: File[] = [];
		const problems: string[] = [];
		Array.from(files).forEach((f) => {
			const problem = uploadPolicy.check(f);
			if (problem) problems.push(problem);
			else toAdd.push(f);
		});
		setFileError(problems.join(' · '));
		if (toAdd.length)
			setAttachments((prev) => {
				const s = new Set(prev.map((f) => f.name));
				return [...prev, ...toAdd.filter((f) => !s.has(f.name))];
			});
	}, [uploadPolicy]);

	const removeAttachment = useCallback((name: string) => {
		setAttachments((prev) => prev.filter((f) => f.name !== name));
		setFileError('');
	}, []);

	const clearForm = useCallback(() => {
		setFormState((f) => ({
			article_type: f.article_type,
			title: '',
			description: '',
			staff_number: '',
			round_id: lockedRound ? lockedRound.id : pickedRoundId,
			category_id: '',
			level_id: '',
			department_id: currentDeptId,
			doi: '',
			publish_date: '',
		}));
		setErrors({});
		setPendingMembers([]);
		setAddRole('leader');
		setMemberQuery('');
		setSuggestions([]);
		setShowManualForm(false);
		setManualErrors({});
		setAttachments([]);
		setFileError('');
	}, [lockedRound, pickedRoundId, currentDeptId]);

	// Đợt chỉ cho 1 cấp độ ⇒ tự gán, không hỏi (giống cổng đăng ký công khai).
	const autoLevel = form.round_id && levels.length === 1 ? levels[0] : null;

	const addTopicToList = useCallback(() => {
		const levelId = form.level_id || autoLevel?.id || '';
		const e: FormErrors = {};
		if (!form.title.trim())
			e.title =
				form.article_type === 'bai_bao'
					? 'Tiêu đề bài báo là bắt buộc'
					: 'Tiêu đề đề tài là bắt buộc';
		if (!form.round_id) e.round_id = 'Vui lòng chọn vòng nghiên cứu';
		if (form.article_type !== 'bai_bao' && !levelId)
			e.level_id = 'Vui lòng chọn cấp độ đề tài';
		if (!form.department_id) e.department_id = 'Vui lòng chọn khoa phòng';
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
				level_id: form.article_type === 'bai_bao' ? '' : levelId,
				department_id: form.department_id,
				doi: form.doi.trim(),
				publish_date: form.publish_date,
				members: pendingMembers,
				attachments,
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
			level_id: '',
			department_id: form.department_id,
			doi: '',
			publish_date: '',
		});
		setErrors({});
		setPendingMembers([]);
		setAddRole('leader');
		setMemberQuery('');
		setSuggestions([]);
		setShowSuggestions(false);
		setShowManualForm(false);
		setManualForm(EMPTY_MANUAL);
		setManualErrors({});
		setAttachments([]);
		setFileError('');
	}, [form, autoLevel, pendingMembers, attachments]);

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
						category_id: t.category_id || undefined,
						level_id: t.level_id || undefined,
						department_id: t.department_id,
						status,
						article_type: t.article_type,
						doi: t.doi || undefined,
						publish_date: t.publish_date || undefined,
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
			// Chỉ xoá khỏi danh sách chờ các đề tài đã tạo thành công — tránh gửi
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
		levels,
		autoLevel,
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
		pendingTopics,
		submittingAll,
		submitError,
		addTopicToList,
		removeTopicFromList,
		submitAll,
		pendingMembers,
		memberQuery,
		suggestions,
		showSuggestions,
		isSearching,
		addRole,
		addedIds: new Set(pendingMembers.map((m) => m.id)),
		setMemberQuery,
		setSuggestions,
		setShowSuggestions,
		setAddRole,
		addMember,
		removeMember,
		changeRole,
		showManualForm,
		manualForm,
		manualErrors,
		setShowManualForm,
		setManualForm: setManualForm as (v: ManualForm) => void,
		setManualErrors: setManualErrors as (v: Record<string, string>) => void,
		addMemberManual,
		attachments,
		fileError,
		isDragging,
		fileInputRef,
		handleFiles,
		removeAttachment,
		setIsDragging,
		navigate,
		clearForm,
	};
}
