import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getStoredUser } from '../../../shared/utils/storage';
import { getRoundByPublicToken } from '../../round/api/roundApi';
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
import { MAX_FILE_SIZE } from '../utils/topicRegisterHelpers';

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
	depts: SimpleItem[];
	myTopics: MyTopic[];
	loadingRef: boolean;
	lockedRound: {
		id: string;
		name: string;
	} | null;

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

	// Toast
	toast: { msg: string; type: 'success' | 'error' } | null;
	setToast: (v: { msg: string; type: 'success' | 'error' } | null) => void;

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

	const [form, setFormState] = useState<RegisterForm>({
		title: '',
		description: '',
		staff_number: '',
		round_id: '',
		category_id: '',
		level_id: '',
		department_id: currentDeptId,
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
	const [addRole, setAddRole] = useState<MemberRole>('member');
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [showManualForm, setShowManualForm] = useState(false);
	const [manualForm, setManualForm] = useState<ManualForm>(EMPTY_MANUAL);
	const [manualErrors, setManualErrors] = useState<Record<string, string>>({});

	const [attachments, setAttachments] = useState<File[]>([]);
	const [fileError, setFileError] = useState('');
	const [isDragging, setIsDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [toast, setToast] = useState<{
		msg: string;
		type: 'success' | 'error';
	} | null>(null);

	// Load reference data
	useEffect(() => {
		const base = Promise.all([
			getRounds(),
			getCategories(),
			getLevels(),
			getDepts(),
		]).then(([r, c, l, d]) => {
			setRounds(r.data);
			setCategories(c.data);
			setLevels(l.data);
			setDepts(d.data);
		});
		const tokenLoad = publicToken
			? getRoundByPublicToken(publicToken).then((round) => {
					if (round) {
						setLockedRound({
							id: round.id,
							name: round.name,
						});
						setFormState((prev) => ({ ...prev, round_id: round.id }));
					}
				})
			: Promise.resolve();
		Promise.all([base, tokenLoad]).finally(() => setLoadingRef(false));
	}, [publicToken]);

	// Load my topics
	useEffect(() => {
		if (!currentUserId) return;
		getTopics({ limit: 20 })
			.then((res) => {
				setMyTopics(
					res.data
						.filter((t) => t.created_by === currentUserId)
						.map((t) => ({
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

	// Auto-hide toast
	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 3500);
		return () => clearTimeout(t);
	}, [toast]);

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

	const addMember = useCallback(
		(u: UserSuggestion) => {
			if (pendingMembers.some((m) => m.id === u.id)) return;
			setPendingMembers((prev) => [
				...prev,
				{
					id: u.id,
					ho_ten: u.full_name,
					staff_number: u.staff_number != null ? String(u.staff_number) : '',
					email: u.email,
					chuc_vu: '',
					role: addRole,
				},
			]);
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
			setToast({ msg: 'Thành viên này đã được thêm.', type: 'error' });
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

	const handleFiles = useCallback((files: FileList | null) => {
		if (!files) return;
		const toAdd: File[] = [];
		const oversized: string[] = [];
		Array.from(files).forEach((f) => {
			if (f.size > MAX_FILE_SIZE) oversized.push(f.name);
			else toAdd.push(f);
		});
		if (oversized.length)
			setFileError(`File vượt quá 150MB: ${oversized.join(', ')}`);
		else setFileError('');
		if (toAdd.length)
			setAttachments((prev) => {
				const s = new Set(prev.map((f) => f.name));
				return [...prev, ...toAdd.filter((f) => !s.has(f.name))];
			});
	}, []);

	const removeAttachment = useCallback((name: string) => {
		setAttachments((prev) => prev.filter((f) => f.name !== name));
		setFileError('');
	}, []);

	const clearForm = useCallback(() => {
		setFormState({
			title: '',
			description: '',
			staff_number: '',
			round_id: lockedRound ? lockedRound.id : '',
			category_id: '',
			level_id: '',
			department_id: currentDeptId,
		});
		setErrors({});
		setPendingMembers([]);
		setMemberQuery('');
		setSuggestions([]);
		setShowManualForm(false);
		setManualErrors({});
		setAttachments([]);
		setFileError('');
	}, [lockedRound, currentDeptId]);

	const addTopicToList = useCallback(() => {
		const e: FormErrors = {};
		if (!form.title.trim()) e.title = 'Tiêu đề đề tài là bắt buộc';
		if (!form.round_id) e.round_id = 'Vui lòng chọn vòng nghiên cứu';
		if (!form.department_id) e.department_id = 'Vui lòng chọn khoa phòng';
		if (Object.keys(e).length) {
			setErrors(e);
			return;
		}
		setPendingTopics((prev) => [
			...prev,
			{
				localId: `t_${Date.now()}`,
				title: form.title.trim(),
				description: form.description.trim(),
				staff_number: form.staff_number.trim(),
				round_id: form.round_id,
				category_id: form.category_id,
				level_id: form.level_id,
				department_id: form.department_id,
				members: pendingMembers,
				attachments,
			},
		]);
		setToast({ msg: 'Đã thêm đề tài vào danh sách.', type: 'success' });
		setFormState({
			title: '',
			description: '',
			staff_number: '',
			round_id: form.round_id,
			category_id: '',
			level_id: '',
			department_id: form.department_id,
		});
		setErrors({});
		setPendingMembers([]);
		setMemberQuery('');
		setSuggestions([]);
		setShowSuggestions(false);
		setShowManualForm(false);
		setManualForm(EMPTY_MANUAL);
		setManualErrors({});
		setAttachments([]);
		setFileError('');
	}, [form, pendingMembers, attachments]);

	const removeTopicFromList = useCallback(
		(localId: string) =>
			setPendingTopics((prev) => prev.filter((t) => t.localId !== localId)),
		[],
	);

	const submitAll = useCallback(
		async (status: TopicStatus) => {
			if (pendingTopics.length === 0) {
				setToast({ msg: 'Chưa có đề tài nào trong danh sách.', type: 'error' });
				return;
			}
			setSubmittingAll(true);
			setSubmitError('');
			try {
				await Promise.all(
					pendingTopics.map(async (t) => {
						const created = await createTopic({
							title: t.title,
							description: t.description || undefined,
							round_id: t.round_id,
							category_id: t.category_id || undefined,
							level_id: t.level_id || undefined,
							department_id: t.department_id,
							status,
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
					}),
				);
				setToast({
					msg: `Đã gửi ${pendingTopics.length} đề tài để phê duyệt!`,
					type: 'success',
				});
				setTimeout(() => navigate('/user/my-topics'), 1800);
			} catch {
				setSubmitError('Có lỗi xảy ra, vui lòng thử lại.');
				setSubmittingAll(false);
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
		depts,
		myTopics,
		loadingRef,
		lockedRound,
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
		toast,
		setToast,
		navigate,
		clearForm,
	};
}
