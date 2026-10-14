/* Barrel dùng chung cho toàn bộ component tái sử dụng.
 * Import gọn:  import { Badge, EmptyState, Pagination } from '@/shared/components'; */

export { Badge } from './Badge';
export { badgeTone } from './Badge/badgeTone';
export type { BadgeTone } from './Badge/badgeTone';

export { EmptyState, TableEmpty } from './EmptyState';
export { Card } from './Card';

export { Button } from './Button';
export { Modal, ModalActions, ConfirmDeleteModal } from './Modal';
export { Can } from './Can';

/* Nặng (docx-preview / dompurify / html5-qrcode) — import trực tiếp theo đường dẫn, không qua barrel:
 *   import { FileViewerModal } from '@/shared/components/FileViewerModal';
 *   import RichTextEditor from '@/shared/components/RichTextEditor';
 *   import { QrScanner } from '@/shared/components/QrScanner'; */

export { DatePicker } from './Input/DatePicker';
export { MultiSelect } from './Input/MultiSelect';
export { SearchableSelect } from './Input/SearchableSelect';
export { FileDropzone } from './Input/FileDropzone';

export { Pagination } from './Table/Pagination';
export {
	SelectCheckbox,
	SelectionBar,
	BulkButton,
	BulkDeleteModal,
	BulkBar,
	DeleteAllButton,
} from './Table/RowSelect';
export type { RowSelectionLike } from './Table/RowSelect';
export { SearchInput, SelectionCount, RowAction, RowActions } from './Table/TableToolbar';

export {
	Skeleton,
	SkeletonTable,
	SkeletonCard,
	InlineLoading,
} from './Loading/Skeleton';
export { default as PageLoading } from './Loading';
