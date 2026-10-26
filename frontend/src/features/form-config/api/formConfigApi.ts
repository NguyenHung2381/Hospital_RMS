import { apiClient } from '../../../shared/api/axios';
import type { FormDefinition, FormOverride } from '../../../shared/formConfig/types';

export const formConfigApi = {
	list: () => apiClient.get<FormDefinition[]>('/form-configs/admin'),
	save: (formKey: string, config: FormOverride) =>
		apiClient.put<FormDefinition>(`/form-configs/admin/${formKey}`, { config }),
	reset: (formKey: string) => apiClient.delete<FormDefinition>(`/form-configs/admin/${formKey}`),
};
