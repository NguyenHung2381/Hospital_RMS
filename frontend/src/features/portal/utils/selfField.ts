import type { FieldClasses } from '@/shared/formConfig/CfgField';
import styles from '../pages/SelfService.module.css';

/**
 * CfgField / CustomFields trong modal cổng nhân viên — giữ kiểu
 * <label>Nhãn<input/></label> của `.formGrid` (SelfService.module.css).
 */
export const SELF_FIELD: FieldClasses = {
	labelWraps: true,
	hint: styles.cfgHint,
	error: styles.cfgError,
	inputError: styles.cfgInputError,
};
