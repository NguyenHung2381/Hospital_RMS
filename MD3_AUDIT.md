# Báo cáo audit Material Design 3 — Hospital RMS (frontend)

- Ngày audit: 2026-11-20 · Nhánh: `main` · Không sửa dòng code nào.
- Phạm vi: toàn bộ `frontend/src` (380 file `.tsx`, 229 `.ts`, 133 `.css` ≈ 89.000 dòng TSX + 49.000 dòng CSS). Bỏ qua `node_modules`, `dist`, file sinh tự động (`permissions.generated.ts`).
- Mọi đường dẫn trong bảng tính từ `frontend/src/`.

## Cách đọc báo cáo này

**Đây là audit tĩnh (đọc mã nguồn), chưa chạy ứng dụng trên trình duyệt.** Số liệu đếm lấy từ quét AST của TypeScript (JSX) và quét mẫu trên CSS; tỷ lệ tương phản tính từ giá trị hex trong token. Những gì chỉ kiểm được khi chạy thật (thứ tự focus thực tế, phóng chữ 200%, hành vi trên điện thoại thật, trình đọc màn hình) đều ghi **"cần xác nhận"**.

Hai giới hạn của phép đếm:

- Ô nhập được truyền thuộc tính qua `{...props}` được coi là đã có nhãn (đếm thiếu chứ không đếm thừa).
- Trang đăng nhập (`AuthLayout`, `Login.module.css`) vẫn nằm trong các con số tổng, nhưng không bị nêu thành lỗi riêng vì hiệu ứng ở đó là chủ đích đã duyệt.

## Stack và cách dự án định nghĩa theme

| Hạng mục | Hiện trạng |
|---|---|
| Framework | React 19 + Vite 8 + TypeScript 6, React Router 7, TanStack Query 5 |
| Thư viện UI | **Không dùng thư viện Material nào** (không có MUI, `@material/web`). `antd` 6 có cài nhưng chỉ dùng `QRCode` (3 file), `Dropdown` (2 file), `Tooltip` (1 file). Toàn bộ component còn lại tự viết bằng CSS Modules. |
| Bộ component dùng chung | `shared/components`: Button, Modal (+ConfirmDeleteModal), Drawer, Badge, Card/StatCard, EmptyState, Loading/Skeleton, Table (Pagination, RowSelect, Toolbar), Input (DatePicker, TimePicker, SearchableSelect, MultiSelect, Toggle, FileDropzone, FormField), GlobalFeedback (toast) |
| Theme | CSS custom properties trong `styles/variables.css` (màu, cỡ chữ, khoảng cách, bo góc, bóng, transition, z-index). `app/providers/AntdProvider.tsx` chép tay lại 14 mã hex sang token của antd. |
| Dark theme | **Không có** (0 kết quả cho `prefers-color-scheme`, `data-theme`, `darkAlgorithm`) |
| Layout | 5 layout: Admin (sidebar), User (sidebar), Trainee (menu ngang + tab đáy), Public, Auth |

Vì không có thư viện M3, báo cáo đối chiếu theo **ngữ nghĩa và quan hệ token của M3** (vai trò màu, thang chữ, component theo hành vi, trạng thái, thích ứng, accessibility), không đòi hỏi giao diện phải trông giống Android.

Một số điểm khác M3 là **chủ đích đã duyệt** của dự án và không tính là lỗi: màu nhận diện xanh `#0A9B4A` + hồng `#DF0984` (không dùng dynamic color), font Inter + Literata, thẻ/bảng dùng viền 1px thay cho bóng (tương đương outlined card của M3), trang đăng nhập nhiều hiệu ứng.

## Tóm tắt

| Mức độ | Số vấn đề |
|---|---:|
| Nghiêm trọng | 2 |
| Cao | 11 |
| Trung bình | 29 |
| Thấp | 27 |
| **Tổng** | **69** |

Mỗi dòng trong các bảng dưới là một vấn đề và có một mã ở đầu cột "Vấn đề" (C = component, M = màu, T = typography, S = shape/elevation/spacing, L = layout, A = accessibility, F = form, MO = motion); danh sách việc cần làm ở cuối tham chiếu theo mã này. Lỗi lặp lại nhiều nơi được gom thành một dòng kèm số lần xuất hiện.

### 5 vấn đề cần sửa trước

1. **380/599 ô nhập (63%) không có nhãn mà máy đọc được** (A2). Nhãn hiển thị trên màn hình nhưng không gắn với ô (`<label>` thiếu `htmlFor`); `FormField` dùng 124 lần, chỉ 27 lần truyền `htmlFor`. Sửa một chỗ ở `FormField` giải quyết phần lớn.
2. **70 phần tử `div`/`span`/`tr` gắn `onClick` nhưng không có role, không focus được, không bấm được bằng bàn phím** (A1). Trong đó có nút Sửa / Đặt lại mật khẩu / Xóa ở bảng người dùng và bảng vai trò.
3. **Hộp thoại không đồng nhất** (C1, C2, A5): 47 lần gọi `confirm()` / `alert()` / `prompt()` của trình duyệt và 17 modal tự viết không có Esc, không giữ focus, trong khi `<Modal>` dùng chung đã làm đủ. `Drawer` cũng chưa giữ focus.
4. **Vùng chạm dưới 48dp trên toàn bộ kit** (A4): nút 38/32px (44px trên màn cảm ứng), nút icon bảng 32px, nút đóng 24–32px, công tắc 36×20px.
5. **Token màu theo bảng màu, không theo vai trò, và màu còn viết cứng trong JS** (M2, M3, M1): 378 mã hex trong `.ts/.tsx`, không có lớp `surface / on-surface / outline…`, nên chưa thể có dark theme và nhiều trạng thái hiển thị lệch bảng màu.

### Điểm đang làm tốt (giữ nguyên)

- CSS dùng token màu 5.620 lần; cỡ chữ dùng token 96% (1.617 so với 69 giá trị viết cứng).
- `global.css:204` tắt animation/transition toàn cục khi người dùng bật giảm chuyển động.
- `<Modal>` dùng chung: `role="dialog"`, `aria-modal`, giữ Tab trong hộp thoại, trả focus khi đóng, hỏi lại khi còn thay đổi chưa lưu; trên điện thoại tự thành bottom sheet.
- `AdminLayout`: mục menu là link thật có `aria-current`, sidebar đóng được đặt `inert`.
- Token đã ghi rõ ràng buộc tương phản (`--color-primary-dark` cho chữ trắng, `gray-400/500` đạt 4.5:1); 6 cặp `--tone-*` đều đạt 7:1 trở lên.
- Master–detail, bảng chuyển thành thẻ ở ≤640px, tab đáy cho cổng học viên.

### Tự chấm theo thang của skill (0 = sai/thiếu, 1 = cần chỉnh, 2 = đạt)

| Hạng mục | Điểm | Ghi chú |
|---|:-:|---|
| Rõ nhiệm vụ chính | — | Cần xác nhận trên giao diện thật |
| Phân cấp thông tin | — | Cần xác nhận trên giao diện thật |
| Component đúng ngữ nghĩa | 1 | Kit tốt nhưng còn `div` bấm được, modal tự viết, hộp thoại trình duyệt |
| Kỷ luật token | 1 | CSS tốt; JS/inline style và khoảng cách còn viết cứng; chưa có vai trò màu |
| Thích ứng | 1 | Có nav thích ứng; drawer mobile của cổng nhân viên lỗi focus |
| Trạng thái & phản hồi | 1 | Thiếu pressed, lỗi form chưa gắn với ô |
| Accessibility | **0** | Nhãn ô nhập, bàn phím, vùng chạm |
| Tiết chế biểu cảm | 2 | Giao diện nghiệp vụ điềm tĩnh, nhấn có chọn lọc |

Theo quy tắc của skill, có điểm 0 ở Accessibility nghĩa là **chưa đạt để duyệt** cho đến khi xử lý nhóm Nghiêm trọng và Cao của mục 6.

---

## 1. Component

| Mức độ | File:dòng | Vấn đề | Quy tắc M3 bị vi phạm | Cách sửa đề xuất |
|---|---|---|---|---|
| Cao | `features/course/components/EnrollmentsTab.tsx:497,502,522,580` · `features/exam/pages/ExamBuilder.tsx:320,330,397,733` · `features/course/components/ResultsTab.tsx:126,137,202,234` · `features/seminar/pages/CmeManualRecords.tsx:1894–1943` (tổng 47 lần ở 24 file) | **C1** · Dùng `confirm()`, `alert()`, `prompt()` của trình duyệt cho xác nhận xóa, hủy, nhập lý do, báo lỗi | Dialog: dùng component đã có thay vì dựng lại; hành động phá hủy phải rõ ràng và nhất quán | Thay `confirm` bằng `ConfirmDeleteModal` (hoặc thêm `ConfirmDialog` trung tính vào kit); `prompt` bằng `<Modal>` có ô nhập; `alert` báo lỗi bằng `notify.error` |
| Cao | `features/council/components/AutoAssignModal.tsx:117` · `CouncilDetailModal.tsx:205` · `CouncilImportModal.tsx:74` · `features/roles/components/RolePermissionModal.tsx:297` · `RoleCompareModal.tsx:104` · `RoleUsersModal.tsx:41` · `UserPermissionsModal.tsx:91` · `features/schedule/components/DeadlineModal.tsx:86` · `features/notifications/components/NotificationSendForm.tsx:87` (17 file) | **C2** · Modal tự dựng bằng `modalBackdrop` thay vì `<Modal>`: cả 17 file không xử lý Esc và không giữ focus; 9 file không có `role="dialog"` | Dialog phải quản lý focus có thể đoán trước; không tự chế khi đã có component chuẩn | Chuyển sang `<Modal>` (đã có `size`, `footer`, `dirty`, `className`) |
| Trung bình | `features/topics/pages/Topic.module.css` (9 lớp nút riêng) · `features/schedule/pages/Schedule.module.css` (7) · `features/course/pages/Courses.module.css` (7) · `shared/components/Input/DatePicker.module.css` (5) · `features/seminar/components/CertificateModal.module.css` (4) | **C3** · 308 lớp kiểu nút được khai báo, chỉ 132 lớp `composes: btn` từ kit; phần còn lại tự đặt cỡ, màu, bo góc | Component cùng vai trò dùng chung logic hình dạng và trạng thái | Cho các lớp này `composes: btn <biến thể>`; chỉ giữ thuộc tính bố cục ở feature |
| Trung bình | `shared/components/Input/Toggle.tsx:16–24` · `Toggle.module.css:2–6` | **C4** · Công tắc 36×20px, dùng `aria-pressed` thay cho `role="switch"` + `aria-checked`; nền khi tắt `gray-200` trên trắng chỉ 1.24:1 | Switch: mục tiêu chạm 48dp; trạng thái không chỉ bằng màu; viền/track cần 3:1 | `role="switch"`, `aria-checked`, track ≥ 52×32 (hoặc giữ kích thước, bọc vùng chạm 48px), viền track khi tắt dùng màu ≥ 3:1 |
| Trung bình | `shared/utils/feedback.ts:57,63–64` · `shared/components/GlobalFeedback/index.tsx:70–72` · `GlobalFeedback.module.css:107–117` | **C5** · Toast lỗi tự tắt sau 3,2 giây, dùng `role="status"` (polite); xếp chồng tới 4 toast ở góc trên phải | Snackbar: ngắn gọn, một lúc một cái; không giấu lỗi cần xử lý trong thông báo thoáng qua | Toast lỗi dùng `role="alert"` và không tự tắt (hoặc ≥ 8 giây + nút đóng); xếp hàng lần lượt; lỗi form hiển thị cạnh ô |
| Trung bình | `shared/components/Input/DatePicker.tsx:446,535,554` · `DatePicker.module.css:190–191` | **C6** · Bộ chọn ngày tự viết (663 dòng) không có thuộc tính `role`/`aria-*` nào; 3 nút icon chỉ có `title`; nút chuyển tháng 28px; 1 trình xử lý phím | Date picker: component tự chế phải có role, tên, bàn phím, vùng chạm | Thêm `role="dialog"` + lưới `role="grid"`, `aria-label` cho nút, điều hướng bằng phím mũi tên; hoặc dùng `DatePicker` của antd (đã có trong dự án) |
| Thấp | `shared/components/Button/index.tsx:4` · `Button.module.css:64–110` | **C7** · Biến thể `primary / secondary / ghost / warning / danger` không ánh xạ rõ sang 5 loại nút M3; chưa có nút tonal trung tính. **Cần xác nhận** trên giao diện: có nhóm hành động nào có 2 nút filled cạnh nhau không | Filled / tonal / outlined / text theo mức nhấn; một nhóm chỉ một nút nhấn mạnh nhất | Ghi chú ánh xạ trong kit: primary = filled, secondary = outlined, ghost = text; thêm `tonal` |
| Thấp | `app/providers/AntdProvider.tsx:8–9` | **C8** · Hai hệ component song song (kit tự viết + antd) với theme đồng bộ bằng tay. **Cần xác nhận** đây là chủ đích | Một nguồn component và token | Hoặc bỏ antd (thay 3 component đang dùng), hoặc chọn antd cho các control phức tạp (date, select) |
| Thấp | `shared/components/Loading/index.tsx:10–12,38` | **C9** · Màn tải trang hiện phần trăm giả (tăng dần tới 92% rồi đứng) | Progress: determinate chỉ khi đo được tiến độ | Dùng chỉ báo không xác định, bỏ con số |
| Thấp | `layouts/TraineeLayout/TraineeLayout.module.css:607–617` | **C10** · Tab "Điểm danh QR" được vẽ như FAB nổi giữa thanh điều hướng đáy. **Cần xác nhận** là chủ đích sản phẩm | Navigation bar chỉ chứa điểm đến; FAB là hành động chính của màn hình | Nếu là điểm đến: vẽ như tab thường; nếu là hành động: tách thành FAB riêng phía trên thanh |
| Thấp | `styles/mixins.css:141–155,158–176,256–276` | **C11** · Các lớp `.card`, `.badge`, `.alert`, `.input-field` không thấy được tham chiếu trong TSX; `.card` dùng bóng `shadow-lg` + bo 24px, `.alert` có sọc trái, trái hướng thiết kế hiện tại. **Cần xác nhận** trước khi xóa | Tránh hai nguồn định nghĩa cho cùng component | Xóa mã chết sau khi xác nhận |

## 2. Màu

| Mức độ | File:dòng | Vấn đề | Quy tắc M3 bị vi phạm | Cách sửa đề xuất |
|---|---|---|---|---|
| Cao | `styles/variables.css:7–195` · `app/providers/AntdProvider.tsx:10–39` | **M1** · Không có dark theme. **Cần xác nhận** sản phẩm có yêu cầu không; nếu không thì hạ xuống Thấp | Theme phải kiểm chứng phân cấp ở cả sáng và tối | Sau khi có lớp vai trò màu (dòng dưới), thêm bộ giá trị tối qua `[data-theme="dark"]` + `prefers-color-scheme` |
| Cao | `styles/variables.css:9–34` | **M2** · Token đặt theo bảng màu (`--color-gray-50…900`, `--color-white`, `--color-primary-pale`), module dùng trực tiếp làm nền/chữ/viền. Không có `surface`, `surface-container-*`, `on-surface`, `on-surface-variant`, `outline`, `outline-variant`, `on-primary`, `primary-container` | Phân tầng: token tham chiếu → vai trò ngữ nghĩa → token component; màn hình phụ thuộc vào vai trò | Thêm lớp bí danh, ví dụ `--surface: var(--color-gray-50)`, `--surface-container: var(--color-white)`, `--on-surface: var(--color-gray-800)`, `--on-surface-variant: var(--color-gray-500)`, `--outline-variant: var(--color-gray-200)`, `--on-primary: var(--color-white)`; chuyển dần module sang vai trò |
| Cao | `features/portal/types/topicDetail.type.ts:56–103` · `features/portal/utils/myTopicsHelpers.ts:14–41` · `features/portal/hooks/useUserHome.ts:18–54` · `features/course/types/course.type.ts:111–122` · `features/topics/components/RoleSelectPill.tsx:19–34,100–101` · `features/portal/pages/Profile.tsx:69,150,241–242,272,319–322,397` (tổng 378 mã hex trong `.ts/.tsx`) | **M3** · Bảng màu trạng thái viết cứng trong JS, nhiều giá trị lệch bảng màu dự án (`#fef3c7/#92400e`, `#dcfce7/#166534`, `#fee2e2/#991b1b`); `Profile.tsx:397` dùng tím `#e0e7ff/#4338ca` | Dùng vai trò ngữ nghĩa thay cho hex; giá trị literal chỉ nằm trong nơi định nghĩa token | Trả về tên tông (`'green' \| 'amber' \| 'red'…`) rồi dùng `<Badge tone>` hoặc `var(--tone-*-bg/fg)` |
| Cao | `features/settings/pages/SystemSettings.module.css:28` (chữ trắng trên `--color-warning`, 2.03:1) · `shared/components/Input/DatePicker.module.css:356–357` và `features/topics/pages/Topic.module.css:1465–1466` (chữ trắng trên `--color-primary`, 3.62:1) · `features/person-merge/pages/PersonMerge.module.css:131` (chữ `--color-info`, 2.33:1) · `features/portal/pages/Profile.tsx:348` (chữ `#22c55e`, 2.28:1) · `features/portal/components/MemberFormFields.tsx:311`, `MembersTab.tsx:58` (chữ `#ef4444`, 3.76:1) | **M4** · Chữ không đạt 4.5:1. Ngoài ra có 19 chỗ dùng `color: var(--color-error)` làm màu chữ (3.91:1), ví dụ `features/course/components/CourseCards.module.css:90`, `features/portal/pages/MyTopics.module.css:1190`, và 5 chỗ dùng `color: var(--color-primary)` (3.62:1), ví dụ `features/dashboard/components/DashKit.module.css:202` (**cần xác nhận** cỡ chữ: chữ lớn chỉ cần 3:1) | Tương phản chữ thường ≥ 4.5:1; kiểm tra lại sau khi tùy biến màu thương hiệu | Chữ lỗi dùng `--tone-red-fg`; chữ xanh dùng `--color-primary-dark`; nền cảnh báo có chữ dùng cặp `--tone-amber-bg/fg`; thêm token `--color-error-text`, `--color-info-text` để tránh lặp lại |
| Trung bình | `features/seminar/components/ticket-scan/TicketCamera.module.css:12,120,125,196–204,228–297` · `features/seminar/pages/TicketScan.module.css:338–344` · `features/council/pages/Council.module.css:660` · `layouts/TraineeLayout/TraineeLayout.module.css:357` · `features/round/components/DeadlineManager.module.css:87–493` (11 lần `#ffffff`) | **M5** · Ngoài `variables.css` còn 203 mã hex và 317 giá trị `rgb()/rgba()` trong CSS. Phần lớn là `#fff` viết tay thay cho `var(--color-white)`; phần còn lại lệch bảng màu (`#0f172a`, `#34d399`, `#fbbf24`, `#22c55e`, `#f59e0b`, `#ef4444`) | Không rải giá trị màu literal ở màn hình | Thay `#fff` bằng token; thêm token cho lớp phủ (`--scrim`, `--overlay-on-dark-*`) và bộ màu cho màn quét vé nền tối |
| Trung bình | `shared/components/Modal/Modal.module.css:206,253` · `styles/select.css:24,36` · `shared/components/Input/Toggle.module.css:6` | **M6** · Viền ô nhập `gray-200` trên nền trắng 1.24:1; mũi tên select `#9aaab6` 2.28:1; track công tắc tắt 1.24:1 | Thành phần đồ họa mang nghĩa (ranh giới ô nhập, icon) cần ≥ 3:1; vai trò `outline` | Viền ô nhập dùng màu ≥ 3:1 (khoảng `#8795a1` trở xuống), giữ `gray-200` cho đường kẻ trang trí (`outline-variant`) |
| Trung bình | `app/providers/AntdProvider.tsx:12–22,34–36` | **M7** · 14 mã hex chép tay từ `variables.css`, phải nhớ sửa hai nơi | Một nguồn sự thật cho token | Đưa giá trị vào một file TS/JSON, sinh cả biến CSS lẫn theme antd từ đó |
| Thấp | `styles/variables.css:37,39` | **M8** · `--color-success` trùng `--color-primary` nên "thành công" và "thương hiệu" không phân biệt được; nhóm lỗi chỉ có một giá trị, thiếu `on-error` / `error-container` (đã có `--status-danger-bg/fg` gần tương đương) | Vai trò error đầy đủ: `error`, `onError`, `errorContainer`, `onErrorContainer` | Đặt bí danh vai trò cho nhóm lỗi; cân nhắc tách sắc độ success |

## 3. Typography

| Mức độ | File:dòng | Vấn đề | Quy tắc M3 bị vi phạm | Cách sửa đề xuất |
|---|---|---|---|---|
| Trung bình | `styles/variables.css:103–122` | **T1** · Thang chữ đặt theo cỡ (`2xs…4xl`), không theo vai trò display / headline / title / body / label; cỡ, chiều cao dòng, độ đậm chọn rời nhau ở từng module. `line-height` viết số ở hơn 230 chỗ với trên 25 giá trị khác nhau (1.5 ×45, 1.4 ×32, 1.3 ×28, 1.35, 1.45, 1.55…), chỉ 21 chỗ dùng token | Chọn kiểu chữ theo vai trò ngữ nghĩa; thang chữ có kiểm soát | Thêm token vai trò gộp sẵn, ví dụ `--type-title-md: 600 1rem/1.5 var(--font-body)`; ánh xạ: `4xl/3xl` → headline, `2xl/xl/lg` → title, `base/sm` → body, `xs/2xs` → label |
| Trung bình | `styles/variables.css:103,105` · `shared/components/Modal/Modal.module.css:229–237` · `features/roles/pages/Roles.module.css:853` · `features/seminar/components/CertificateLayoutEditor.module.css:74` · `layouts/UserLayout/UserLayout.module.css:302` | **T2** · Cỡ 13px (`compact`, 189 lần) nằm ngoài thang M3; cỡ 11px (`2xs`, 251 lần) dùng cả cho chữ lỗi và gợi ý dưới ô nhập; có chỗ 10px | Không thu nhỏ chữ quan trọng để giải quyết bố cục; label-small (11) chỉ cho nhãn | Chữ lỗi/gợi ý dùng 12px; rà lại các chỗ 11px đang mang nội dung đọc; bỏ 10px |
| Trung bình | `features/seminar/pages/TicketScan.module.css` (25 chỗ) · `features/seminar/components/ticket-scan/TicketCamera.module.css` (6) · `features/form-config/pages/FormConfigs.module.css:81,127` · `features/council/components/AutoAssignModal.tsx:126–127` | **T3** · 69 cỡ chữ viết cứng trong CSS và 127 `fontSize` inline trong TSX (12 ×43, 13 ×38, 11 ×19) | Dùng token chữ, không dùng giá trị rời | Thay bằng `var(--font-size-*)`; phần inline chuyển vào class |
| Trung bình | `shared/components/Button/Button.module.css:10,18,45,48,57` | **T4** · Nút đặt `height` cố định (38/32/46px) kèm `white-space: nowrap`: nhãn tiếng Việt dài hoặc người dùng phóng chữ sẽ tràn khung. **Cần xác nhận** bằng thử phóng chữ 200% | Tránh khung chữ cao cố định; hỗ trợ phóng chữ và chuỗi dài | Đổi `height` thành `min-height`, thêm `padding-block`, cho phép xuống dòng ở màn hẹp |
| Thấp | `styles/variables.css:118` · khoảng 175 khai báo `font-weight` số trong CSS | **T5** · Độ đậm viết số (600 ×86, 700 ×70, 500, 400) cạnh token; `--font-weight-extrabold` là bí danh của 700 (35 lần dùng, 3 lần kèm fallback 800) | Token nhất quán | Thay số bằng token; gộp `extrabold` vào `bold` |
| Thấp | `shared/components/Drawer/Drawer.module.css:142` · `features/topics/pages/Topic.module.css:1185` · `features/dashboard/pages/Dashboard.module.css:752` · `features/exam/pages/ExamBuilder.module.css:260` (tổng 13 chỗ) | **T6** · `text-transform: uppercase`. **Cần xác nhận** chỗ nào là mã (được phép) và chỗ nào là nhãn | M3 không viết hoa toàn bộ nhãn; quy ước dự án cũng cấm | Bỏ uppercase ở nhãn thường |
| Thấp | `features/public/components/HumanCheckbox.module.css:15` · `features/seminar/components/CertificateLayoutEditor.module.css:46,255` | **T7** · Khai báo `font-family` trực tiếp (`Roboto…`, `'Inter', sans-serif`) | Token font | Dùng `var(--font-body)` (trừ khi cố ý giả lập widget bên thứ ba: **cần xác nhận**) |

## 4. Shape, elevation, spacing

| Mức độ | File:dòng | Vấn đề | Quy tắc M3 bị vi phạm | Cách sửa đề xuất |
|---|---|---|---|---|
| Trung bình | `shared/components/GlobalFeedback/GlobalFeedback.module.css:87,124` · `shared/components/Modal/Modal.module.css:360` · tổng khoảng 170 khai báo | **S1** · Bo góc viết số cạnh token: `999px/9999px` ×53, 8px ×32, 10px ×22, 14px ×9, 6px, 3px, 18px, 20px. Fallback mâu thuẫn với token: `var(--radius-md, 6px)` ×11 (token là 8px), `var(--radius-xl, 14px)` ×7 và `var(--radius-xl, 12px)` ×2 (token là 16px), `var(--radius-lg, 10px)` | Shape là thang dùng lại; tránh bán kính lệch nhau vài pixel không có lý do | Thay bằng `--radius-*`; bỏ fallback; `999px` → `--radius-full` |
| Trung bình | `features/schedule/pages/Schedule.module.css` (6 chỗ) · `features/topics/pages/Topic.module.css` (5) · `shared/components/Input/DatePicker.module.css` (4) · `features/council/pages/Council.module.css` (4) · `features/seminar/components/detail/Detail.module.css:247` | **S2** · 84 `box-shadow` viết tay so với 118 lần dùng token; `--shadow-xs` được dùng nhưng không tồn tại trong `variables.css` | Elevation theo cấp có nghĩa, không dùng bóng trang trí riêng lẻ | Quy về 4 cấp `--shadow-sm…xl`; vòng focus dùng token riêng (`--focus-ring-input` đã có) |
| Trung bình | `shared/components/Modal/Modal.module.css:11,284` · `shared/components/Drawer/Drawer.module.css:7` · `shared/components/GlobalFeedback/GlobalFeedback.module.css:51,72,111` · `layouts/AdminLayout/AdminLayout.module.css:35,773,855` | **S3** · Token `--z-*` (`variables.css:190–194`) chỉ được dùng 2 lần; còn 127 `z-index` viết số với 41 giá trị khác nhau (−1 đến 3000); `--z-toast: 9999` không khớp giá trị thật 2100 | Phân lớp chồng nhau phải nhất quán và đoán trước được | Bổ sung thang (`dropdown, sticky, drawer, modal, toast, progress`) rồi thay số bằng token |
| Trung bình | `features/portal/pages/CouncilProgress.module.css` (91 chỗ) · `features/portal/pages/UserHome.module.css` (67) · `features/course/pages/Courses.module.css` (61) · `styles/variables.css:125–136` | **S4** · 1.898 khai báo dùng `--space-*` so với 1.624 khai báo chỉ dùng px. Nhiều giá trị lệch lưới 4px: gap 6px ×167, 10px ×54, 5px ×18, 3px ×16, 14px ×12; padding 10px ×152, 6px ×90, 14px ×59, 5px, 7px, 9px. Thang token không có 6/10/14px | Thang khoảng cách mạch lạc, nhịp 4dp | Hoặc bổ sung `--space-1-5` (6px) và `--space-2-5` (10px) vào thang, hoặc làm tròn về 4/8/12; cấm px rời trong lint |
| Trung bình | `features/portal/components/MemberFormFields.tsx` (26 chỗ) · `features/topics/components/MemberSearchBox.tsx:173,253` · `features/topics/components/AddMemberForm.tsx:145` | **S5** · 738 `style={{…}}` inline trong TSX; khoảng 20 chỗ gán style bằng JS khi rê chuột (`e.currentTarget.style.background = '#f0fbf5'`) | Component tùy biến phải kế thừa token và logic trạng thái của hệ thống | Chuyển sang class trong CSS Module, hover bằng `:hover` |
| Thấp | `styles/variables.css:139–145` · `shared/components/Modal/Modal.module.css:21` | **S6** · Thang bo góc 2/4/8/12/16/24/full, không có 28 (extra-large của M3); nút, ô nhập, thẻ cùng 12px. **Cần xác nhận**: đây là lựa chọn nhận diện | Hình dạng khác nhau khi vai trò khác nhau | Giữ nếu là chủ đích; ghi rõ ánh xạ trong `variables.css` |
| Thấp | `shared/components/Modal/Modal.module.css:9–10` · `styles/global.css:447–448` | **S7** · Lớp phủ dùng `backdrop-filter: blur`. **Cần xác nhận** có chủ đích | Scrim của M3 là lớp màu phẳng | Giữ hoặc bỏ blur tùy quyết định thiết kế; đưa màu scrim vào token |

## 5. Layout & navigation

| Mức độ | File:dòng | Vấn đề | Quy tắc M3 bị vi phạm | Cách sửa đề xuất |
|---|---|---|---|---|
| Cao | `layouts/UserLayout/index.tsx:293–296` · `layouts/UserLayout/UserLayout.module.css:773–777` · `layouts/AdminLayout/index.tsx:217–226` | **L1** · Cổng nhân viên: ở ≤1024px sidebar đóng chỉ bị đẩy ra ngoài bằng `transform`, không `inert` nên Tab vẫn đi vào menu không nhìn thấy. Cả hai layout: mở drawer không chuyển focus vào; Esc ở Admin không đóng drawer mobile | Navigation drawer dạng modal phải quản lý focus; thứ tự focus hợp lý | Thêm `inert` như `AdminLayout/index.tsx:272`; chuyển focus vào drawer khi mở, trả lại nút menu khi đóng; Esc đóng drawer |
| Trung bình | `layouts/UserLayout/index.tsx:272–284,298–303,397–414` | **L2** · Mục điều hướng, logo, breadcrumb là `<button onClick={navigate}>` chứ không phải link: không mở tab mới, không chép được địa chỉ, trình đọc màn hình đọc là nút | Tách điểm đến khỏi hành động | Dùng `<Link>` / `<NavLink>` như `AdminLayout/index.tsx:329–363` |
| Trung bình | `layouts/TraineeLayout/TraineeLayout.module.css:466,488,504` · `styles/mixins.css:414,420` · các module dùng 900px, 1100px, 420px, 380px | **L3** · Mốc responsive không đồng nhất: nơi dùng `max-width: 640/1024/1280`, nơi dùng `639/1023/1279`, lệch nhau đúng 1px giữa các layout; có mốc ngoài danh sách chuẩn của dự án. Mốc dự án (480/640/768/1024/1280/1600) cũng khác lớp cửa sổ M3 (600/840/1200/1600) | Kiểm thử tại ranh giới breakpoint; thiết kế theo lớp cửa sổ nhất quán | Thống nhất một quy ước (`max-width: N` đi với `min-width: N+1`); **cần xác nhận** bằng thử ở đúng 640px và 1024px |
| Trung bình | `layouts/TraineeLayout/TraineeLayout.module.css:583–604` | **L4** · Tab đáy đang chọn chỉ đổi màu chữ/icon, không có chỉ báo hình dạng | Navigation bar có active indicator; trạng thái chọn không chỉ bằng màu | Thêm nền dạng viên thuốc sau icon đang chọn hoặc icon tô đặc |
| Thấp | `layouts/UserLayout/index.tsx:292–349` so với `layouts/TraineeLayout/index.tsx:241–253` | **L5** · Hai cổng xử lý màn hẹp khác nhau: học viên có tab đáy, nhân viên dùng drawer. **Cần xác nhận** số điểm đến chính của cổng nhân viên | Chọn bar / rail / drawer theo số điểm đến và kích thước cửa sổ, nhất quán | Nếu cổng nhân viên có 3–5 điểm đến chính, cân nhắc tab đáy ở < 600px |
| Thấp | `layouts/TraineeLayout/index.tsx:125–130` | **L6** · Ở màn vừa và rộng, điểm đến cấp cao nằm trên thanh ngang ở header. **Cần xác nhận** | Medium/expanded: navigation rail hoặc drawer | Chấp nhận được trên web nếu là chủ đích |
| Thấp | `layouts/AdminLayout/AdminLayout.module.css:666–675` | **L7** · Vùng nội dung quản trị không giới hạn bề rộng; form và đoạn văn kéo dài trên màn ≥ 1600px. **Cần xác nhận** theo từng trang (bảng rộng thì có lợi) | Giới hạn bề rộng đọc trên cửa sổ rất rộng | Đặt `max-width` cho trang dạng form/chi tiết |
| Thấp | `frontend/index.html:9` (ngoài `src`) · `shared/components/Modal/Modal.module.css:378` · `layouts/TraineeLayout/TraineeLayout.module.css:511,575–576` | **L8** · Có dùng `env(safe-area-inset-*)` nhưng thẻ viewport không có `viewport-fit=cover`, nên các giá trị này bằng 0. **Cần xác nhận** trên iPhone có tai thỏ | Tôn trọng vùng an toàn | Thêm `viewport-fit=cover` nếu muốn tràn viền; nếu không thì bỏ các `env()` |

## 6. Accessibility

| Mức độ | File:dòng | Vấn đề | Quy tắc M3 bị vi phạm | Cách sửa đề xuất |
|---|---|---|---|---|
| Nghiêm trọng | `features/user/components/UserTable.tsx:232,239,247` · `features/roles/pages/Roles.tsx:294,305,316,327` · `features/round/components/RoundCard.tsx:162,174,181` · `features/venue/pages/Venues.tsx:270,279` · `features/seminar/pages/CmeCreditCatalog.tsx:290,299,362,371` · hàng bảng bấm được: `features/council/pages/Council.tsx:258,311`, `features/activity-log/pages/ActivityLogs.tsx:218` (tổng 70 phần tử, 45 file) | **A1** · `div` / `span` / `tr` / `th` gắn `onClick` nhưng không có `role`, không `tabIndex`, không xử lý phím: người dùng bàn phím và trình đọc màn hình không sửa, xóa, đặt lại mật khẩu được | Icon button; component tự chế phải có role, tên, focus, bàn phím | Đổi thành `<button type="button" aria-label="…">` (lớp `.actionBtn` trong `Table.module.css` dùng được ngay); hàng bảng bấm được thì đặt link/nút ở ô đầu |
| Nghiêm trọng | `shared/components/Input/FormField.tsx:28–35` · ví dụ `features/council/components/ExternalReviewerFormModal.tsx:76–84,90–96,117–122` · `features/seminar/pages/CmeManualRecords.tsx` (19 ô) · `features/seminar/components/ParticipantFormModal.tsx` (9 ô) | **A2** · 380/599 ô `input` / `select` / `textarea` không có tên mà máy đọc được: 186 ô không có gì, 194 ô chỉ có placeholder. Nhãn hiển thị nằm cạnh ô nhưng `<label>` không có `htmlFor` (345 thẻ `<label>`, 52 thẻ có `htmlFor`; `FormField` 124 lần dùng, 27 lần truyền `htmlFor`) | Mỗi ô nhập cần nhãn cố định hoặc tên truy cập; placeholder không phải nhãn | Trong `FormField`: tạo `id` bằng `useId()` và gắn vào ô con (`cloneElement`), hoặc bọc ô trong `<label>`; ô lọc không có nhãn hiển thị thì thêm `aria-label` |
| Cao | Không tên: `shared/components/Table/Pagination.tsx:69,94` · `features/council/components/AutoAssignModal.tsx:129` · `CouncilDetailModal.tsx:225` · `features/roles/components/RoleUsersModal.tsx:56` (tổng 21). Chỉ có `title`: `features/course/components/CourseCards.tsx:62,71,79,86` · `features/course/pages/Courses.tsx:186,194` (tổng 61) | **A3** · Nút chỉ có icon thiếu `aria-label`; riêng nút lùi/tiến trang của phân trang ảnh hưởng mọi bảng | Mọi control chỉ có icon phải có tên truy cập | Thêm `aria-label`; phân trang thêm `aria-label="Trang trước/sau"` và `aria-current="page"` cho trang hiện tại |
| Cao | `shared/components/Button/Button.module.css:10,48,133–138` · `shared/components/Table/Table.module.css:410–411,506–507` · `shared/components/Table/Pagination.module.css:46–47,99–100` · `shared/components/Modal/Modal.module.css:93–94` · `features/notifications/components/NotificationPanel.module.css:120–121` · `shared/components/GlobalFeedback/GlobalFeedback.module.css:188–189` · `features/topics/pages/Topic.module.css:311–312` · `features/course/pages/Courses.module.css:527–528` · `shared/components/Table/RowSelect.module.css:21–22,146–147` · `styles/global.css:251–260` | **A4** · Vùng chạm nhỏ hơn 48dp: nút 38/32px (44px khi `pointer: coarse`), nút icon bảng 32px (40px), phân trang 32px (40px), đóng modal 32px, đóng thông báo/toast 24px, nút bảng đề tài 28px, xóa chip 20px, checkbox 18px (22px). Luật chung cho mobile chỉ ép 38px và loại trừ nút đóng, chip, mũi tên | Mục tiêu chạm tối thiểu 48×48dp; icon có thể nhỏ nhưng vùng bấm phải đủ lớn | Giữ kích thước nhìn thấy, mở rộng vùng bấm bằng `::after { inset: -8px }` hoặc `min-width/min-height: 48px` trong `@media (pointer: coarse)`; nâng mốc 44 → 48 |
| Cao | `shared/components/Drawer/index.tsx:56–74,86–87` | **A5** · `Drawer` khai báo `aria-modal="true"` nhưng không giữ Tab trong panel; focus lọt xuống trang phía sau | Bề mặt modal phải quản lý focus | Dùng chung logic giữ focus của `Modal/index.tsx:83–112` (tách thành hook) |
| Trung bình | `shared/components/Button/Button.module.css:33–36` | **A6** · Vòng focus của nút dùng `--color-primary-light` (`#4fc47e`), 2.2:1 trên nền trắng, đè lên vòng focus chung `--color-primary-dark` (5.3:1) | Focus phải nhìn thấy rõ (≥ 3:1) | Xóa luật riêng để dùng `:focus-visible` chung ở `global.css:185–188` |
| Trung bình | `features/notifications/components/NotificationPanel.tsx:141–160` (và 25 `role="tablist"` khác) | **A7** · 26 tablist, 29 `role="tab"` nhưng chỉ 4 `role="tabpanel"`; không thấy điều hướng mũi tên giữa các tab, thiếu `aria-controls`. **Cần xác nhận** từng nơi | Tabs: ngữ nghĩa và bàn phím đầy đủ | Viết một component `Tabs` dùng chung (roving tabindex, mũi tên trái/phải, `aria-controls`) |
| Trung bình | `layouts/AdminLayout/index.tsx:268,477` · `layouts/UserLayout/index.tsx:293,503` · `layouts/TraineeLayout/index.tsx:105,222` | **A8** · Không layout nào có liên kết "Bỏ qua tới nội dung"; sidebar hơn 20 link đứng trước `<main>` | Thứ tự focus hợp lý; hỗ trợ bàn phím | Thêm skip link là phần tử focus đầu tiên, trỏ tới `<main id="main">` |
| Trung bình | `layouts/AdminLayout/index.tsx:378–393,399,439–449` · `layouts/TraineeLayout/index.tsx:163–180` | **A9** · Menu tài khoản Admin: nút mở có `aria-haspopup="menu"` nhưng danh sách không có `role="menu"/"menuitem"`. Trainee: `role="menu"` chứa link không có `role="menuitem"`. Breadcrumb Admin là các `span`, không nằm trong `<nav aria-label>` | Component tự chế phải khai báo role và trạng thái đúng | Hoàn thiện mẫu menu (role + mũi tên lên/xuống) hoặc bỏ role menu, dùng danh sách link thường; breadcrumb bọc trong `<nav aria-label="Vị trí trang">` |
| Thấp | 783 thuộc tính `title=` trong TSX, ví dụ `features/course/components/CourseCards.tsx:64` | **A10** · Dùng `title` làm tooltip: không hiện khi focus bằng bàn phím hay trên cảm ứng | Tooltip cho control không có nhãn | Dùng một component Tooltip (antd `Tooltip` đã có) cho nút icon |
| Thấp | `features/staff-attendance/pages/Roster.tsx:261,277` · 515 thẻ `<th>` | **A11** · Chỉ 5 `<th>` có `scope`; tiêu đề cột sắp xếp được là `<th onClick>`, toàn dự án chỉ 1 `aria-sort` | Ngữ nghĩa bảng cho trình đọc màn hình | `scope="col"` trong component bảng; tiêu đề sắp xếp là `<button>` bên trong `<th aria-sort>` |
| Thấp | 400/864 thẻ `<button>` | **A12** · Thiếu thuộc tính `type`; nằm trong `<form>` sẽ mặc định là submit | Hành vi control phải đoán trước được | Thêm `type="button"`; bật luật ESLint `react/button-has-type` |
| Thấp | `styles/global.css:303–400` | **A13** · Bảng chuyển thành thẻ ở ≤640px bằng `display: block/flex` trên `table/tr/td`: một số trình duyệt bỏ ngữ nghĩa bảng. **Cần xác nhận** bằng trình đọc màn hình | Giữ ngữ nghĩa khi đổi bố cục | Thêm `role="table"/"row"/"cell"` qua `mobileTableCards.ts` nếu xác nhận có mất |

## 7. Form & trạng thái

| Mức độ | File:dòng | Vấn đề | Quy tắc M3 bị vi phạm | Cách sửa đề xuất |
|---|---|---|---|---|
| Cao | `shared/components/Input/FormField.tsx:36` · `shared/components/Modal/Modal.module.css:225–232` | **F1** · Lỗi của ô nhập không gắn với ô: 599 ô nhập, 12 lần `aria-invalid`, 2 lần `aria-describedby`. Ô lỗi chỉ đổi màu viền; dòng lỗi cỡ 11px, không có `role="alert"` | Thông báo lỗi phải nhận biết được và gắn với control; không báo lỗi chỉ bằng màu | `FormField` tự đặt `aria-invalid`, `aria-describedby` trỏ tới dòng lỗi có `id`; thêm icon lỗi; chữ lỗi 12px |
| Trung bình | `shared/components/Button/Button.module.css` (không có `:active`) · toàn bộ CSS | **F2** · 499 selector `:hover`, 66 `:focus-visible`, chỉ 8 `:active`; chỉ 2 chỗ bọc hover trong `@media (hover: hover)` nên hover dính lại sau khi chạm trên điện thoại | Mỗi control có đủ hover / focus / pressed | Thêm `:active` cho kit (nút, hàng bảng, mục nav); bọc hover trong `@media (hover: hover)` |
| Trung bình | `shared/components/GlobalFeedback/index.tsx:55,61–68` | **F3** · Mọi thao tác ghi chạy quá 400ms đều phủ kín màn hình bằng lớp "Đang xử lý…". **Cần xác nhận** có chủ đích để chặn bấm hai lần | Tránh che cả màn hình cho thao tác cục bộ; giữ ngữ cảnh khi tải | Ưu tiên `loading` trên chính nút bấm (kit `Button` đã có); chỉ phủ màn hình cho thao tác hàng loạt |
| Trung bình | 85 file trang trong `features/*/pages` | **F4** · Chỉ thấy chữ "Thử lại" / "Tải lại" ở 8 file. **Cần xác nhận** từng trang danh sách có trạng thái lỗi kèm cách khôi phục hay không (chưa kiểm từng trang) | Trạng thái lỗi phải có đường khôi phục | Thêm `ErrorState` vào kit (thông điệp + nút "Thử lại"), dùng cùng `EmptyState` và `Skeleton` |
| Thấp | `shared/components/Button/Button.module.css:37–41` · `shared/components/Table/Pagination.module.css:70` · `shared/components/Input/Toggle.module.css:13–16` · `styles/select.css:87–93` | **F5** · Trạng thái vô hiệu mỗi nơi một kiểu: opacity 0.6, 0.4, 0.5, hoặc đổi màu token | Trạng thái nhất quán giữa các component | Một quy ước chung (ví dụ token `--state-disabled-opacity`) |
| Thấp | `layouts/AdminLayout/index.tsx:514` · `layouts/UserLayout/index.tsx:522` · `layouts/TraineeLayout/index.tsx:225` | **F6** · Thông báo "Chức năng này đã được quản trị viên tắt" viết inline với màu `#6b7280`, lặp 3 lần, không có bước tiếp theo | Empty state: giải thích trạng thái và hành động kế tiếp | Dùng `<EmptyState>` kèm nút về trang chủ |
| Thấp | `shared/components/Modal/Modal.module.css:199–201` · `shared/components/Input/FormField.tsx:33` | **F7** · Trường bắt buộc đánh dấu bằng dấu `*` đỏ; toàn dự án có 46 thuộc tính `required`, 0 `aria-required`. **Cần xác nhận** độ phủ | Trạng thái bắt buộc/tùy chọn phải hiểu được | `FormField required` tự gắn `aria-required` cho ô con |
| Thấp | `shared/components/Loading/index.tsx:17–39` | **F8** · Màn tải trang không có `role="status"` / `aria-live`; ảnh có `alt="Loading"` tiếng Anh | Thông báo thay đổi trạng thái tải cho công nghệ hỗ trợ | `role="status"` + chữ ẩn "Đang tải…", ảnh `alt=""` |

## 8. Motion

| Mức độ | File:dòng | Vấn đề | Quy tắc M3 bị vi phạm | Cách sửa đề xuất |
|---|---|---|---|---|
| Trung bình | `styles/variables.css:170–175` | **MO1** · Token chuyển động chỉ có 3 thời lượng với easing `ease` chung. Trong CSS có 154 transition viết tay với hơn 30 thời lượng khác nhau (0.15s ×88, 0.2s ×34, 220ms ×15, 0.18s, 0.12s…) và 7 đường `cubic-bezier` khác nhau | Dùng motion token (thời lượng + easing chuẩn / nhấn mạnh) | Thêm `--motion-duration-short/medium/long` và `--motion-easing-standard: cubic-bezier(0.2, 0, 0, 1)`, `-decelerate: cubic-bezier(0.05, 0.7, 0.1, 1)`, `-accelerate: cubic-bezier(0.3, 0, 0.8, 0.15)`; thay giá trị rời |
| Trung bình | `shared/components/Modal/Modal.module.css:103,213,261` · `layouts/AdminLayout/AdminLayout.module.css:237,629,754` (tổng 166 chỗ) | **MO2** · `transition: all`: mọi thuộc tính đều chuyển động, kể cả bố cục, gây hiệu ứng ngoài ý muốn | Chỉ chuyển động thuộc tính mang nghĩa; thao tác lặp lại phải nhanh, kín đáo | Liệt kê thuộc tính cụ thể (`background-color, border-color, color, box-shadow`) |
| Trung bình | `styles/global.css:209–216` · `shared/components/GlobalFeedback/GlobalFeedback.module.css:200–204` · `shared/components/Button/Button.module.css:117–125` | **MO3** · Khi bật giảm chuyển động, luật chung ép `animation-duration: 0.01ms !important` và `iteration-count: 1 !important`. `Loading.module.css:211–219` ghi đè đúng (có `!important`), nhưng `GlobalFeedback` ghi đè không có `!important` nên vô hiệu; spinner của `Button`, `Modal` và khoảng 20 spinner cục bộ khác đứng yên, người dùng không biết hệ thống còn chạy. **Cần xác nhận** trên trình duyệt | Giảm chuyển động nhưng vẫn giữ nghĩa; không để chuyển động là lời giải thích duy nhất | Thêm `!important` ở `GlobalFeedback`; đưa spinner về một lớp dùng chung có ngoại lệ trong `global.css`; nút đang tải kèm chữ ("Đang lưu…") |
| Thấp | `shared/components/Modal/index.tsx:122` · `shared/components/Drawer/index.tsx:76` | **MO4** · Modal, Drawer, toast chỉ có hiệu ứng vào; khi đóng thì biến mất ngay | Chuyển cảnh giữ tính liên tục (vào giảm tốc, ra tăng tốc) | Thêm trạng thái "đang đóng" 150–200ms trước khi gỡ khỏi DOM |
| Thấp | `layouts/AdminLayout/AdminLayout.module.css:34,521` | **MO5** · Thu gọn sidebar bằng chuyển động `width` và `margin-left` 280ms, dựng lại bố cục cả trang mỗi khung hình | Chuyển động mượt, không cản trở thao tác | Dùng `transform`, hoặc đổi tức thì |
| Thấp | 21 file khai báo `@keyframes spin`; `fadeIn` ×4; `modalPopIn` ×3 · `styles/mixins.css:330–401` | **MO6** · Keyframes lặp lại ở từng module; bộ keyframes "dùng chung" trong `mixins.css` thực tế không dùng được từ CSS Modules (ghi chú tại `Modal.module.css:391`) | Một hệ motion dùng chung | Một module `motion.module.css` để `composes`, hoặc cấu hình giữ tên keyframes toàn cục |
| Thấp | 57 khai báo `animation … infinite` | **MO7** · **Cần xác nhận** cái nào là chỉ báo tải (hợp lệ), cái nào là trang trí lặp vô hạn | Không chuyển động để phô diễn | Rà danh sách, bỏ lặp vô hạn ở phần trang trí ngoài trang đăng nhập |

---

## Việc cần làm (xếp theo ưu tiên)

### Đợt 1 — chặn người dùng bàn phím và trình đọc màn hình

- [ ] `FormField` tự gắn nhãn với ô con (`useId` + `id`/`htmlFor`), tự đặt `aria-invalid`, `aria-describedby`, `aria-required`; sau đó rà 380 ô còn thiếu nhãn, ô lọc thêm `aria-label` (A2, F1, F7).
- [ ] Đổi 70 `div`/`span`/`tr` có `onClick` thành `<button>` hoặc link thật, bắt đầu từ `UserTable`, `Roles`, `RoundCard`, `Venues`, `CmeCreditCatalog` (A1).
- [ ] Thêm `aria-label` cho 21 nút icon không tên và 61 nút chỉ có `title`; sửa `Pagination` trước vì dùng ở mọi bảng (A3).
- [ ] Tách logic giữ focus của `Modal` thành hook, dùng cho `Drawer` và drawer mobile của hai layout; thêm `inert` cho sidebar đóng ở `UserLayout`; Esc đóng drawer ở `AdminLayout` (A5, L1).
- [ ] Chuyển 17 modal tự viết sang `<Modal>` (C2).
- [ ] Thay 47 lần `confirm` / `alert` / `prompt` bằng `ConfirmDeleteModal`, `<Modal>`, `notify.error` (C1).

### Đợt 2 — vùng chạm, tương phản, trạng thái

- [ ] Nâng vùng chạm lên 48px trong `@media (pointer: coarse)` cho Button, actionBtn, Pagination, nút đóng, checkbox, Toggle, chip; sửa luật 38px ở `global.css:251–260` (A4).
- [ ] Sửa các cặp màu không đạt 4.5:1: chữ trắng trên `--color-warning` / `--color-primary`, chữ dùng `--color-error` / `--color-info` / `#22c55e` / `#ef4444`; thêm token chữ cho lỗi và thông tin (M4).
- [ ] Viền ô nhập, mũi tên select, track công tắc đạt 3:1 (M6); bỏ vòng focus nhạt riêng của `Button` (A6).
- [ ] `Toggle` thành `role="switch"` (C4); toast lỗi dùng `role="alert"`, không tự tắt sau 3,2 giây (C5).
- [ ] Thêm `:active` cho kit và bọc hover trong `@media (hover: hover)` (F2); sửa spinner bị đứng khi bật giảm chuyển động (MO3).
- [ ] Thêm skip link cho 3 layout có đăng nhập; hoàn thiện role của menu tài khoản và breadcrumb (A8, A9).

### Đợt 3 — token và nền tảng theme

- [ ] Thêm lớp vai trò màu (`surface`, `on-surface`, `outline`, `on-primary`, `error-container`…) trỏ về token hiện có (M2).
- [ ] Đưa 378 mã hex trong `.ts/.tsx` về tên tông + `Badge` / biến CSS, bắt đầu từ `topicDetail.type.ts`, `myTopicsHelpers.ts`, `useUserHome.ts`, `course.type.ts`, `RoleSelectPill.tsx`, `Profile.tsx` (M3).
- [ ] Thay `#fff` và `rgba()` viết tay trong CSS bằng token; thêm token scrim/overlay (M5).
- [ ] Một nguồn giá trị cho cả `variables.css` và `AntdProvider` (M7).
- [ ] Quyết định có làm dark theme không; nếu có, thêm bộ giá trị tối trên lớp vai trò (M1).
- [ ] Token vai trò chữ (gộp cỡ + chiều cao dòng + độ đậm); thay 69 cỡ chữ cứng trong CSS và 127 `fontSize` inline; chữ lỗi/gợi ý lên 12px (T1–T3).
- [ ] Thang khoảng cách bổ sung 6/10px hoặc làm tròn; thay `border-radius`, `box-shadow`, `z-index` viết số bằng token; bỏ fallback mâu thuẫn (S1–S4).
- [ ] Motion token (thời lượng + easing); thay 166 `transition: all` bằng danh sách thuộc tính (MO1, MO2).

### Đợt 4 — dọn dẹp và nhất quán

- [ ] Cho các lớp nút riêng `composes` từ kit; chuyển 738 `style={{}}` inline và các chỗ hover bằng JS sang class (C3, S5).
- [ ] Mục điều hướng của `UserLayout` dùng `<Link>` (L2); thống nhất quy ước breakpoint (L3); thêm chỉ báo cho tab đáy đang chọn (L4).
- [ ] Component `Tabs` dùng chung có bàn phím và `tabpanel` (A7); `ErrorState` trong kit (F4); `EmptyState` cho trang bị tắt (F6).
- [ ] Nút `min-height` thay cho `height` cố định (T4); thống nhất trạng thái vô hiệu (F5).
- [ ] `PageLoading` bỏ phần trăm giả, thêm `role="status"` (C9, F8); hiệu ứng đóng cho Modal/Drawer (MO4).
- [ ] `type="button"` cho 400 thẻ `<button>` + luật ESLint; `scope` / `aria-sort` cho bảng; thay `title` bằng Tooltip ở nút icon (A10–A12).
- [ ] Gom `@keyframes` trùng lặp; xóa các lớp không dùng trong `mixins.css` sau khi xác nhận (C11, MO6).

### Cần xác nhận trước khi làm

- [ ] Sản phẩm có yêu cầu dark theme không (M1).
- [ ] Giữ antd hay bỏ hẳn (C8); nút QR nổi trên tab đáy là chủ đích (C10).
- [ ] Bo góc 12px đồng loạt và blur ở lớp phủ là lựa chọn nhận diện (S6, S7).
- [ ] Thử thật: phóng chữ 200%, ranh giới 640px / 1024px, iPhone có tai thỏ, trình đọc màn hình với bảng dạng thẻ, chế độ giảm chuyển động (T4, L3, L8, A13, MO3).
- [ ] Rà từng trang danh sách xem đã có đủ trạng thái tải / trống / lỗi + thử lại (F4).
- [ ] Có nhóm hành động nào đặt 2 nút filled cạnh nhau không (C7); 13 chỗ uppercase là mã hay nhãn (T6); 57 animation lặp vô hạn là tải hay trang trí (MO7).
