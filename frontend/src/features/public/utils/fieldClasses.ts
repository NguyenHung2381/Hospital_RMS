import type { FieldClasses } from '@/shared/formConfig/CfgField';
import styles from '../pages/PublicPortal.module.css';

/** Ô nhập theo Cấu hình form (CfgField / CustomFields) vẽ bằng style cổng công khai. */
export const PUBLIC_FIELD: FieldClasses = {
	group: styles.formGroup,
	label: styles.label,
	required: styles.required,
	hint: styles.fieldHint,
	error: styles.fieldError,
	inputError: styles.inputError,
};
