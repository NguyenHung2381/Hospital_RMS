import { createContext, useContext } from 'react';
import type { FormConfig } from '@/shared/formConfig/useFormConfig';
import type { RegForm } from '../../utils/courseRegisterFields';
import { PUBLIC_FIELD } from '../../utils/fieldClasses';
import s from '../../pages/CourseRegisterPublic.module.css';

// Trang này có class ghi chú / lỗi riêng
export const COURSE_FIELD = { ...PUBLIC_FIELD, hint: s.hint, error: s.fieldError, inputError: s.inputError };

interface RegisterCtx {
	cfg: FormConfig;
	form: RegForm;
	errors: Record<string, string | undefined>;
	setField: (key: keyof RegForm, value: string) => void;
	traineeTypes: { id: string; name: string }[];
}

const Ctx = createContext<RegisterCtx | null>(null);
export const RegisterProvider = Ctx.Provider;

export function useRegister() {
	const ctx = useContext(Ctx);
	if (!ctx) throw new Error('useRegister phải nằm trong RegisterProvider');
	return ctx;
}
