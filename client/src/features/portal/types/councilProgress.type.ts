import type { Conclusion, ProgressRating } from '../../council/api/councilApi';

export interface Draft {
	percent: string;
	rating: '' | ProgressRating;
	comment: string;
}

export interface ResultDraft {
	conclusion: '' | Conclusion;
	general_comment: string;
}
