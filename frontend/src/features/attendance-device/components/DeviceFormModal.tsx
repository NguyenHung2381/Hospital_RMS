import { Modal, ModalActions } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import { Toggle } from '@/shared/components/Input/Toggle';
import base from '@/shared/components/Table/CrudPage.module.css';
import { useState } from 'react';
import type { AttendanceDevice, DeviceFormData } from '../types/attendanceDevice.type';
import styles from '../pages/AttendanceDevices.module.css';

/** Sửa tên / vị trí máy; với máy chờ duyệt thì lưu = duyệt luôn. */
export function DeviceFormModal({
	device,
	approving,
	loading,
	onClose,
	onSave,
}: {
	device: AttendanceDevice;
	approving: boolean;
	loading: boolean;
	onClose: () => void;
	onSave: (d: DeviceFormData) => void;
}) {
	const initial: DeviceFormData = {
		name: device.name ?? '',
		location: device.location ?? '',
		name_ascii: device.name_ascii,
	};
	const [form, setForm] = useState<DeviceFormData>(initial);
	const dirty = JSON.stringify(form) !== JSON.stringify(initial);

	return (
		<Modal
			open
			dirty={dirty}
			onClose={onClose}
			title={approving ? 'Duyệt máy chấm công' : 'Sửa máy chấm công'}
			subtitle={`Số serial ${device.serial_no}${device.last_ip ? ` · gửi từ ${device.last_ip}` : ''}`}
			className={base.modal}
			bodyClassName={base.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={() => onSave(form)}
					loading={loading}
					confirmLabel={approving ? 'Duyệt và bắt đầu nhận dữ liệu' : 'Lưu thay đổi'}
				/>
			}
		>
			{approving && (
				<p className={styles.modalNote}>
					Chỉ duyệt khi số serial trùng với số in trên máy của viện (Menu → Thông tin hệ thống →
					Thông tin thiết bị). Sau khi duyệt, server nhận lượt chấm của máy và gửi danh sách học
					viên đang học xuống máy.
				</p>
			)}
			<FormField label='Tên máy'>
				<input
					className={base.formInput}
					value={form.name}
					onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
					placeholder='VD: Máy giảng đường A'
					maxLength={150}
					autoFocus
				/>
			</FormField>
			<FormField label='Vị trí đặt máy'>
				<input
					className={base.formInput}
					value={form.location}
					onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
					placeholder='VD: Cửa phòng đào tạo, tầng 2 nhà B'
					maxLength={255}
				/>
			</FormField>
			<div className={styles.toggleRow}>
				<div>
					<div className={styles.toggleTitle}>Gửi tên không dấu</div>
					<div className={styles.toggleDesc}>
						Bật khi màn hình máy hiện tên tiếng Việt bị lỗi font. Đổi xong, tên học viên trên máy
						được gửi lại.
					</div>
				</div>
				<Toggle
					on={form.name_ascii}
					onChange={() => setForm((f) => ({ ...f, name_ascii: !f.name_ascii }))}
					title='Gửi tên không dấu'
				/>
			</div>
		</Modal>
	);
}
