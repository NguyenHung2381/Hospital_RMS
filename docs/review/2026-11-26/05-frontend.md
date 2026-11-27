# 05 · Rà soát và rút gọn frontend (phiên `frontend-cleanup`)

- Ngày: 2026-11-26 · Nhánh: `claude/review-frontend-60051c` (71 commit trên `60d56a71`) · Phạm vi: `frontend/src/` (thêm `frontend/package.json`, `package-lock.json` để gỡ một gói).
- Mốc trước khi sửa: `npm run lint` 0 lỗi, `npm run build` xanh. Sau khi sửa: như cũ (lint 0 lỗi, `tsc -b` 0 lỗi, build xanh).
- **Chưa kiểm trên trình duyệt**: dev server trong Docker phục vụ checkout chính, không phải worktree này, và phiên không được tự bật server. Mọi thay đổi giao diện mới chỉ kiểm bằng đọc mã, lint, `tsc` và build.

## Kết quả

| Hạng mục | Số liệu |
|---|---|
| Dòng thay đổi trong `frontend/src` | 144 file, +739 / −2.821 (**giảm 2.082 dòng**; P5 thêm ~80 dòng nút Thử lại) |
| `package-lock.json` | −386 dòng (gỡ `recharts`, 37 gói con) |
| Class CSS Module không dùng đã xoá | ~210 rule ở 22 file (2 lượt quét, xem §2) |
| File xoá | `styles/mixins.css` (424 dòng), `assets/svg/settings.svg`, 2 bản `GrantedAccountsModal` (gộp thành 1) |
| Mã hex 6 chữ số trong `.ts/.tsx` | 351 → 134 (phần còn lại: màu biểu đồ/SVG/canvas/QR/Leaflet cần giá trị thật, xem đề xuất 6) |
| Chữ `text-transform: uppercase` | 16 → 0 |
| Gradient trang trí ngoài trang đăng nhập | đã bỏ 15 chỗ; còn lại là skeleton tải, lưới chấm, vạch lịch, vòng chọn màu (chức năng) |

## 1. Lỗi giao diện đã sửa

| # | File:dòng (trước khi sửa) | Mức | Mô tả | Đã sửa |
|---|---|---|---|---|
| 1 | `features/topics/components/RoleSelectPill.tsx:78` | Cao | `outline: 'none'` inline làm ô chọn vai trò mất vòng focus bàn phím; hover gán style bằng JS; 14 mã hex | Có — CSS Module mới `RoleSelectPill.module.css`, màu qua `--tone-*`, dùng vòng focus chung |
| 2 | `features/trainee/components/GrantedAccountsModal.tsx` (cả file) | Cao | Bản chép của hộp thoại cấp tài khoản: bấm nền là đóng mất mật khẩu tạm chỉ hiện một lần; nút chữ trắng trên `--color-primary` (3.6:1); nút sao chép không có tên | Có — gộp với bản ở topics thành `shared/components/GrantedAccountsModal` (`closeOnBackdrop={false}`, `Button` của kit, `aria-label`) |
| 3 | `features/portal/components/MemberFormFields.tsx:168` · `features/topics/components/AddMemberForm.tsx:127` | Cao | Gợi ý nhân viên là `div` chỉ bấm được bằng chuột (`onMouseDown`), hover bằng JS + `#f0fbf5` (MD3 A1, S5) | Có — `<button>` dùng `.suggestRow` có sẵn; Tab xuống gợi ý không làm đóng danh sách |
| 4 | `features/portal/hooks/useCouncilProgress.ts:153,191,243` | TB | Còn `alert()` / `confirm()` của trình duyệt (MD3 C1) | Có — `notify.error`, `confirmDialog` |
| 5 | 19 rule CSS (vd `form-config/pages/FormConfigs.module.css:79,360,476`, `portal/pages/TopicDetail.module.css:263,812`, `settings/pages/SystemSettings.module.css:30`, `shared/components/Input/DatePicker.module.css:372`) | TB | Chữ/icon trắng trên `--color-primary` (3.6:1), `--color-warning` (2.0:1), `--color-error` | Có — nền `--color-primary-dark` / `--tone-red-fg`; nhãn "Chưa lưu" đổi sang tông hồng (việc chờ bạn xử lý) |
| 6 | 26 khai báo `color:` trong CSS (vd `auth/pages/Login.module.css:152`, `topics/pages/Topic.module.css:814`, `trainee-portal/pages/TraineePortal.module.css:98`) | TB | Chữ dùng `--color-error` 3.9:1, `--color-primary` 3.6:1, `--color-info` 2.3:1, `--color-warning` 2.0:1 (MD3 M4) | Có — `--tone-red-fg`, `--color-primary-dark`, `--tone-blue-fg`, `--tone-amber-fg` |
| 7 | ~35 style inline `.tsx` (vd `course/components/ExamsTab.tsx:288`, `exam/components/ExamTaking.tsx`, `round/components/RoundModal.tsx:54`, `roles/components/RolePermissionModal.tsx`) | TB | Chữ `#e24b4a`, `#ef4444`, `#0a9b4a`, `#a32d2d` dưới 4.5:1 và hex viết cứng (MD3 M3, M4) | Có — token |
| 8 | `features/portal/pages/Profile.tsx:402` | TB | Huy hiệu màu tím `#e0e7ff/#4338ca` (hướng thiết kế: không tím); chữ `#22c55e`/`#ef4444` 2.3–3.8:1 | Có — tông xanh dương, `--color-primary-dark`, `--tone-red-fg` |
| 9 | `features/topics/components/ManualMemberForm.tsx:229–232` | TB | Nút vai trò đang chọn chữ trắng trên `--color-primary` | Có — `--color-primary-dark` |
| 10 | `features/round/pages/Round.module.css:706,719–731` | Thấp | Thẻ thống kê có sọc trái màu 3px + gradient tím nhạt | Có — bỏ sọc và gradient |
| 11 | 15 chỗ gradient (vd `portal/pages/Profile.module.css:21`, `UserLayout.module.css:481`, `TraineeLayout.module.css:630`, `SeminarQrPresentation.module.css:12`, `Schedule.module.css:503`) | Thấp | Gradient trang trí ngoài trang đăng nhập | Có — màu phẳng qua token |
| 12 | 16 khai báo `text-transform: uppercase` (MD3 T6) | Thấp | Chữ IN HOA | Có — bỏ |
| 13 | `styles/mixins.css` (cả file) | Thấp | `.card` (bóng + bo 24px), `.alert` (sọc trái), `.badge`, `.input-field`, ~50 class tiện ích không ai dùng (MD3 C11) | Có — xoá file; giữ `@keyframes spin` (style inline còn dùng) trong `global.css` |
| 14 | `07-ui-test.md` A1 · `auth/pages/Login.module.css:151` | Thấp | Dấu `*` bắt buộc 3.91:1 | Có |
| 15 | `07-ui-test.md` A2 · `auth/pages/Login.module.css:213` | Thấp | Ô đang lỗi gần như không đổi khi nhận focus | Có — `:focus-visible` có outline `--color-primary-dark` (không đụng hiệu ứng nền đăng nhập) |
| 16 | `07-ui-test.md` A3 · `public/components/courseRegister/FileSlot.tsx:200` | TB | 4 nút "Chọn file" cùng tên | Có — `aria-label="Chọn file {tên giấy tờ}"` |
| 17 | `07-ui-test.md` A4 · `public/components/courseRegister/StepConfirm.tsx:213` | Thấp | Ô ký họ tên có `*` nhưng thiếu `aria-required` | Có |
| 18 | `07-ui-test.md` A5 · `shared/pages/NotFound/NotFound.module.css:13,104` | Thấp | Trang 404: gradient xanh→hồng, quầng sáng, vòng nhấp nháy, đậm 800 | Có — nền phẳng, số 404 `--color-primary-dark`, đậm 700, phần trang trí `aria-hidden` |

Các mục MD3_AUDIT kiểm lại và **đã được sửa từ trước** (các nhánh `md3-a11y-*`): A1 (div bấm được — chỉ còn lớp phủ đóng popover và hàng bảng có nút thật bên trong), A2/F1/F7 (`FormField` tự gắn nhãn, `aria-invalid`, `aria-describedby`, `aria-required`), A3 (phân trang có `aria-label`, `aria-current`), A5/L1 (`useFocusTrap` cho `Drawer` và layout), A6 (vòng focus nút dùng luật chung), A8 (skip link), C2 (modal tự dựng đã có focus trap), C4 (`Toggle` `role="switch"`), F8 (`PageLoading` `role="status"`).

## 2. Code thừa đã xoá

| Vị trí | Nội dung | Ghi chú |
|---|---|---|
| 22 file `*.module.css` (dashboard −501, portal −476, topics −92, public −62, seminar −91, trainee-portal −49, trainee −21…) | Class không dùng | Lượt 1: tên class không xuất hiện ở bất kỳ `.ts/.tsx` nào. Lượt 2: chỉ xét file import đúng module; module nào bị truy cập `styles[biến]` thì quay về phép kiểm toàn cục. Luôn loại trừ tên ghép động (`prefix${…}`) và tên dùng trong `composes`. Xoá kèm chú thích đi liền và `@keyframes` mồ côi. Khớp và bao trùm §3.3 của `06-dead-code.md`; `Roles.module.css .permCount` trong danh sách đó **không xoá** vì được `composes` ở dòng 319 |
| `features/dashboard/utils/dashboardHelpers.ts` | `RealStatus`, `TabKey`, `TopicRow`, `TABS`, `ROWS_PER_PAGE`, `VISIBLE_ROWS` | Không tham chiếu |
| `features/exam/utils/examBuilder.ts:4` | `QUESTION_TYPE_LABEL` | Không tham chiếu |
| `features/roles/utils/permissionView.ts:11` | `PermissionEntry` (+ 2 import kiểu) | Không tham chiếu |
| `features/topics/types/topic.type.ts:14,97,106` | `ApvStatus`, `TopicProgress`, `Approval` | Không tham chiếu (bản `ApvStatus` thật ở `approval.type.ts`) |
| `features/user/types/user.type.ts:2` | `TabKey` | Không tham chiếu |
| `features/portal/types/topicDetail.type.ts`, `utils/myTopicsHelpers.ts` | Trường `bg`/`color`/`dot` không ai đọc trong `STATUS_CFG` | Giữ `label`/`tone` |
| `assets/icons/index.ts:54`, `assets/svg/settings.svg` | `SettingsSvg` | Không tham chiếu |
| `package.json` | `recharts` | Không import ở đâu (biểu đồ do `DashKit` tự vẽ) |
| `features/{topics,trainee}/components/GrantedAccountsModal.tsx` | 2 bản trùng | Gộp vào `shared/components/GrantedAccountsModal` |

**Giữ nguyên (an toàn, toàn vẹn dữ liệu):** không đổi bất kỳ lời gọi API, tham số hay đường dẫn nào; không đụng kiểm tra quyền (`Can`, `usePermission`), validate form, `DOMPurify`/`sanitizeHtml`; không thêm `dangerouslySetInnerHTML`; mật khẩu tạm trong hộp thoại cấp tài khoản vẫn chỉ nằm trong state, không ghi URL/localStorage; validate tiến độ 0–100 ở `useCouncilProgress` giữ nguyên, chỉ đổi cách báo lỗi.

## 3. Phát hiện chưa sửa

| # | File:dòng | Mức | Mô tả | Đề xuất |
|---|---|---|---|---|
| P1 | `features/public/api/publicApi.ts:477–479` (`lookupByNationalId`, `GET /public/lookup`) | Cao | CCCD + ngày sinh + họ tên đi trên query string (phiên security S-05): lọt vào log máy chủ/proxy, lịch sử trình duyệt | **Đã làm 27/11** (commit `2c9d845b`): `POST /public/lookup` body JSON; backend đổi validator `query`→`body`, `routePolicy`, `routes.snapshot.txt`, test kill-switch. Giữ nguyên công tắc module, `lookupLimiter` theo IP, giới hạn theo số CCCD, validator 3 trường, dạng phản hồi; `logRedact` vẫn che query cũ. Backend `npm test` 1080/1080 qua. **Frontend và backend phải triển khai cùng lúc** (GET đã bỏ) |
| P2 | Toàn `frontend/src` | TB | Chỉ **1** chỗ dùng `useQuery` (`['courses','pending-enrollments']`); còn lại gọi API trong `useEffect`. Danh mục bị tải lặp ở nhiều màn: `getRounds` 10 file, `getCategories` 5, `getRoles` 5, `getDepartments` 3, `getLevels` 3 | **Đánh giá lại 27/11: không chuyển.** `apiClient.get` (`shared/api/axios.ts`) đã gộp request trùng đang bay và giữ cache 60s cho các bảng danh mục (`departments`, `categories`, `levels`, `research-rounds`, `roles`…), xoá sạch khi có thao tác ghi hoặc sự kiện realtime — số file gọi `getRounds` không đồng nghĩa với số request. Thêm TanStack Query cho danh mục sẽ thành hai lớp cache phải vô hiệu hoá song song. Đã gom 10 chỗ tự gọi `/departments?limit=0` về `getDepartmentOptions` (commit `559a2d67`). TanStack Query vẫn hợp cho màn mới |
| P3 | `features/topics/components/MemberSearchBox.tsx`, `AddMemberForm.tsx`, `portal/components/MemberFormFields.tsx` | TB | 3 ô tìm nhân viên tự viết (debounce, danh sách gợi ý, đóng khi blur) gần giống nhau, chưa có điều hướng mũi tên / `role="listbox"` | Một component `UserSearchCombobox` trong kit (combobox ARIA đầy đủ) |
| P4 | `features/approval/components/ConfirmModal.tsx`, `BulkConfirmModal.tsx` | Thấp | Vẫn dựng bằng `modalBackdrop` thay vì `<Modal>` (đã có focus trap nên không chặn bàn phím) | Chuyển sang `<Modal>` khi chạm tới |
| P5 | `shared/components/ErrorState` | Thấp | Component của kit không ai dùng; trong khi MD3 F4 ghi nhiều trang danh sách thiếu trạng thái lỗi + "Thử lại" | **Đã làm 27/11** (commit `14e6ee24`): `ErrorState` + Thử lại ở Nhật ký hoạt động, danh sách Phê duyệt, Khảo sát, ExamBuilder, bảng điểm khóa học, 5 tab hồ sơ học viên, kết quả chương trình. Các banner lỗi của thao tác (lưu/gửi) giữ nguyên |
| P6 | `features/dashboard/utils/dashboardHelpers.ts:16–40`, `features/dashboard/pages/TrainingDashboard.tsx:23`, `features/schedule/types/schedule.type.ts`, `shared/components/BrandedQr/renderBrandedQr.ts`, `app/providers/AntdProvider.tsx`, `features/settings/components/RadiusMap.tsx` | Thấp | 134 mã hex còn lại: màu SVG/canvas/QR/Leaflet/antd phải là giá trị thật (thuộc tính SVG và canvas không đọc `var()`), và màu lịch được ghép độ trong suốt (`${color}20`) | Một file TS nguồn màu duy nhất, sinh cả `variables.css` và hằng TS (MD3 M7) |
| P7 | `features/course/api/registrationApi.ts:143` `getRegistrationDossier` · `features/public/api/publicApi.ts:461` `downloadDraftApplication` · `features/public/utils/courseRegisterFields.ts:257` `buildDraftPayload` · `features/seminar/api/cmeRecordApi.ts:47` `deleteCmeRecords` | Thấp | Hàm gọi API không ai dùng. 3 hàm đầu mới thêm 19–20/11 | **Đã xoá** (người dùng đồng ý 27/11), kèm 2 kiểu chỉ chúng dùng: `RegistrationDossier`, `DraftApplicationPayload`. Endpoint backend giữ nguyên |
| P8 | `shared/components/Badge/Badge.module.css:53` (`purple`), `features/trainee/components/TraineeProgressPanel.tsx:13` (`violet`) | Thấp | Tên tông "tím" vẫn còn dù hiển thị như xanh dương | Đổi tên thành `blue`/`teal` khi rảnh |
| P9 | Kit (`Button`, `Table`, `Pagination`, `Modal` đóng, chip) | TB | Vùng chạm vẫn < 48px trên cảm ứng (MD3 A4) | Nâng trong `@media (pointer: coarse)`; cần thử trên điện thoại thật |
| P10 | `features/portal/components/MemberFormFields.tsx`, `AddMemberForm.tsx` | Thấp | Chọn gợi ý bằng Enter làm danh sách đóng và focus rơi về `body` | Trả focus về ô tìm sau khi chọn (gộp vào P3) |

## 4. Đề xuất cần người dùng quyết

1. ~~**P1**~~ — đã làm 27/11.
2. ~~**P2**~~ — đánh giá lại 27/11: không cần (đã có cache danh mục trong `apiClient`).
3. ~~**P7**~~ — đã quyết 27/11: xoá.
4. ~~**P5**~~ — đã làm 27/11.
5. ~~Nhãn "Chưa lưu"~~ — đã quyết 27/11: giữ tông hồng ("việc đang chờ bạn xử lý") cho `navBadgeUnsaved`, `typeTagUnsaved`, `.tabBadge`.

## 5. Cách kiểm lại

```
cd frontend
npm run lint
npm run build
```

Đề nghị phiên điều phối (hoặc người dùng) mở các màn sau trên trình duyệt sau khi gộp: Hồ sơ cá nhân (`/user/profile`), Đề tài của tôi, chi tiết đề tài (tab thành viên — thêm thành viên, gợi ý nhân viên), Cấu hình form, Cấu hình hệ thống, đợt nghiên cứu (thẻ thống kê), cấp tài khoản cho thành viên đề tài và cho học viên, trang 404.
