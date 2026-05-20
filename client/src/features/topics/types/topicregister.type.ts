import type { MemberRole, TopicStatus } from './topic.type';

export interface PendingMember {
	id: string;
	ho_ten: string;
	staff_number: string;
	email: string;
	chuc_vu: string;
	role: MemberRole;
}

export interface RegisterForm {
	title: string;
	description: string;
	staff_number: string;
	round_id: string;
	category_id: string;
	level_id: string;
	department_id: string;
}

export interface PendingTopic {
	localId: string;
	title: string;
	description: string;
	staff_number: string;
	round_id: string;
	category_id: string;
	level_id: string;
	department_id: string;
	members: PendingMember[];
	attachments: File[];
}

export interface MyTopic {
	id: string;
	title: string;
	status: TopicStatus;
	created_at: string;
}
