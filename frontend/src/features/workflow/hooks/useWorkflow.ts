import { showToast } from '@/shared/utils/feedback';
import { useCallback, useEffect, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { workflowApi, type SimpleRole } from '../api/workflowApi';
import type { ModalType, WorkflowDefinition, WorkflowFormData } from '../types/workflow.type';

export const EMPTY_FORM: WorkflowFormData = {
	resource: 'topics',
	name: '',
	is_active: false,
	steps: [],
};

export function useWorkflow() {
	const [items, setItems] = useState<WorkflowDefinition[]>([]);
	const [roles, setRoles] = useState<SimpleRole[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [modal, setModal] = useState<ModalType>(null);
	const [editingItem, setEditingItem] = useState<WorkflowDefinition | null>(null);
	const [deletingItem, setDeletingItem] = useState<WorkflowDefinition | null>(null);
	const [loading, setLoading] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('workflow_definition', refreshData);

	useEffect(() => {
		workflowApi
			.list()
			.then(setItems)
			.catch(() => showToast('error', 'Không thể tải danh sách workflow'))
			.finally(() => setIsLoadingData(false));
	}, [refreshKey]);

	useEffect(() => {
		workflowApi
			.getRoles()
			.then((res) => setRoles(res.data))
			.catch(() => {});
	}, []);

	const toPayload = (data: WorkflowFormData) => ({
		resource: data.resource,
		name: data.name.trim(),
		is_active: data.is_active,
		steps: data.steps
			.filter((s) => s.name.trim())
			.map((s) => ({
				name: s.name.trim(),
				approver_role_id: s.approver_role_id || null,
				sla_days: s.sla_days ? Number(s.sla_days) : null,
			})),
	});

	const handleAdd = useCallback(
		async (data: WorkflowFormData) => {
			setLoading(true);
			try {
				const createdItem = await workflowApi.create(toPayload(data));
				setItems((prev) => [createdItem, ...prev]);
				setModal(null);
				showToast('success', `Đã tạo workflow "${createdItem.name}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Tạo thất bại');
			} finally {
				setLoading(false);
			}
		},
		[],
	);

	const handleEdit = useCallback(
		async (data: WorkflowFormData) => {
			if (!editingItem) return;
			setLoading(true);
			try {
				const updated = await workflowApi.update(editingItem.id, toPayload(data));
				setItems((prev) => prev.map((d) => (d.id === editingItem.id ? updated : d)));
				setModal(null);
				setEditingItem(null);
				showToast('success', `Đã cập nhật "${updated.name}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Cập nhật thất bại');
			} finally {
				setLoading(false);
			}
		},
		[editingItem],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingItem) return;
		setLoading(true);
		try {
			await workflowApi.remove(deletingItem.id);
			setItems((prev) => prev.filter((d) => d.id !== deletingItem.id));
			setModal(null);
			setDeletingItem(null);
			showToast('success', `Đã xoá "${deletingItem.name}"`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deletingItem]);

	return {
		items,
		roles,
		isLoadingData,
		modal,
		editingItem,
		deletingItem,
		loading,
		setModal,
		setEditingItem,
		setDeletingItem,
		handleAdd,
		handleEdit,
		handleDelete,
	};
}
