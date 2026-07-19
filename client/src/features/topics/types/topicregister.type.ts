import type { ArticleType, MemberRole, TopicStatus } from './topic.type';

export interface PendingMember {
	id: string;
	ho_ten: string;
	staff_number: string;
	email?: string;
	phone_number?: string;
	chuc_vu: string;
	role: MemberRole;
	department_id?: string;
}

export interface RegisterForm {
	article_type: ArticleType;
	title: string;
	description: string;
	staff_number: string;
	round_id: string;
	category_id: string;
	level_id: string;
	department_id: string;
	doi: string;
	publish_date: string;
}

export interface PendingTopic {
	localId: string;
	article_type: ArticleType;
	title: string;
	description: string;
	staff_number: string;
	round_id: string;
	category_id: string;
	level_id: string;
	department_id: string;
	doi: string;
	publish_date: string;
	members: PendingMember[];
	attachments: File[];
}

export interface MyTopic {
	id: string;
	title: string;
	status: TopicStatus;
	created_at: string;
}
