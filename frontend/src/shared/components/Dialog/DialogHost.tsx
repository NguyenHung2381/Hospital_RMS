import { CheckCircleSvg } from '@/assets/icons';
import { useEffect, useSyncExternalStore } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { dialogStore } from './dialogStore';
import { PromptDialog } from './PromptDialog';

/**
 * Hiện hộp thoại gọi bằng `confirmDialog()` / `alertDialog()` / `promptDialog()`.
 * Gắn MỘT lần ở AppProviders. Mỗi lúc chỉ hiện yêu cầu đầu hàng đợi; trả lời xong mới tới cái sau.
 */
export function DialogHost() {
	const queue = useSyncExternalStore(dialogStore.subscribe, dialogStore.getSnapshot);
	useEffect(() => dialogStore.registerHost(), []);

	const current = queue[0];
	if (!current) return null;

	if (current.kind === 'confirm') {
		const { onConfirm, ...opts } = current.options;
		const finish = (ok: boolean) => {
			dialogStore.settle(current.id);
			current.resolve(ok);
		};
		return (
			<ConfirmDialog
				key={current.id}
				open
				{...opts}
				onCancel={() => finish(false)}
				onConfirm={
					onConfirm
						? async () => {
								await onConfirm();
								finish(true);
							}
						: () => finish(true)
				}
			/>
		);
	}

	if (current.kind === 'alert') {
		const { okLabel = 'Đã hiểu', tone, icon, ...opts } = current.options;
		const finish = () => {
			dialogStore.settle(current.id);
			current.resolve();
		};
		return (
			<ConfirmDialog
				key={current.id}
				open
				{...opts}
				tone={tone}
				icon={icon ?? (tone === 'danger' ? undefined : <CheckCircleSvg />)}
				confirmLabel={okLabel}
				cancelLabel={null}
				onCancel={finish}
				onConfirm={finish}
			/>
		);
	}

	const { onConfirm, ...opts } = current.options;
	const finish = (value: string | null) => {
		dialogStore.settle(current.id);
		current.resolve(value);
	};
	return (
		<PromptDialog
			key={current.id}
			open
			{...opts}
			onCancel={() => finish(null)}
			onConfirm={
				onConfirm
					? async (value) => {
							await onConfirm(value);
							finish(value);
						}
					: finish
			}
		/>
	);
}
