# Phân quyền

Mô hình: mỗi tài khoản có **một vai trò**; vai trò có tập **lượt cấp quyền** `resource:action`, mỗi lượt cấp có thể kèm **phạm vi dữ liệu**.

| Khái niệm        | Ở đâu                                                   | Ghi chú                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Danh mục quyền   | `catalog.js`                                            | Nguồn duy nhất. Server đồng bộ vào bảng `permissions` lúc khởi động (`sync.js`).                                                                                                                                         |
| Phạm vi dữ liệu  | `scopes.js`, cột `role_permissions.scope`               | `topics`: own / department / all · `users`: department / all · `courses`: assigned / all · `staff_attendance`: department / all (lượt cấp có trước khi thêm phạm vi giữ `all` — `nullScopeFill`). Resource khác: `NULL`. |
| Superuser        | cột `roles.is_superuser`                                | Không phải quyền trong danh mục, không cấp được qua giao diện. Trong code hiện dưới dạng key `system:manage`.                                                                                                            |
| Vai trò hệ thống | `roles.is_system`, `roles.code`                         | 8 vai trò gốc, không xoá được. Code tham chiếu qua mã (`modules/access/roleCodes.js`), không dùng id `VT0x`.                                                                                                             |
| Chống leo thang  | `modules/access/privilegeGuard.js`                      | Chỉ cấp / gán / sửa được thứ không vượt quyền (và phạm vi) của chính mình.                                                                                                                                               |
| Phiên đăng nhập  | `users.token_version`, `modules/auth/sessionVersion.js` | Tăng version ⇒ mọi access token cũ bị từ chối ngay.                                                                                                                                                                      |

Quy tắc kiểm tra: **có đúng quyền mới được** (`manage` không phải wildcard), superuser được hết. Frontend dùng cùng quy tắc (`frontend/src/shared/utils/permissions.ts`), nhưng chỉ để ẩn/hiện; backend luôn tự kiểm tra.

## Việc thường gặp

**Thêm quyền mới**

1. Thêm `p('PERM-XXX-ACTION', 'action', 'Tên hiển thị', 'Mô tả')` vào đúng resource trong `catalog.js`. Id cố định, tên không trùng (cột `name` có UNIQUE).
2. Tách từ quyền cũ ⇒ thêm `seedFrom: ['resource:action']` để vai trò đang có quyền cũ được cấp sẵn quyền mới (chỉ ở lần tạo).
3. `npm run gen:perm-types` để sinh lại kiểu `PermissionKey` cho frontend.
4. Dùng ở route: `authorizePermission(['resource', 'action'])`.
5. `npm test`, rồi cập nhật bảng `EXPECT` trong `test/permissions/routeMatrix.test.js` nếu quyền đó đổi ai được làm gì.

**Thêm route**: gắn `authorizePermission(...)`. Route cố ý chỉ cần đăng nhập hoặc công khai thì khai báo kèm lý do trong `routePolicy.js`. Thiếu thì `npm run check:routes` và `npm test` đều báo lỗi.

**Lọc dữ liệu theo phạm vi**: `scopeOf(req.user, 'topics')` trả `'own' | 'department' | 'all'` (null = không có quyền trên resource). Xem cách dùng ở `topicService.getAll`, `userController.isDeptScoped`, `courseService` (`'assigned'`).

**Tham chiếu vai trò trong code**: `roleIdOf(ROLE.TRAINEE)` / `inputRoleId(request, 'trainee_role', ROLE.TRAINEE)` rồi dùng `@trainee_role` trong SQL.

**Thu hồi phiên của một tài khoản**: `bumpTokenVersion(userId)`.

## Kiểm tra

```bash
npm test                                  # danh mục, quy tắc quyền/phạm vi, chống leo thang, ma trận vai trò × route
npm run check:routes -- --list            # bảng mọi route và quyền của nó
npm run sync:permissions -- --dry-run     # xem trước đồng bộ catalog → bảng permissions
```

Vai trò mẫu cho test ma trận nằm ở `test/permissions/fixtures/role-templates.json`: ảnh chụp quyền của 8 vai trò hệ thống, không đọc DB. Khi đổi quyền của vai trò hệ thống có chủ đích, chụp lại fixture và sửa bảng `EXPECT` trong cùng commit.

## Nâng cấp CSDL

Schema đi qua migration chung của backend (`backend/database/`, xem README ở đó). Hai file của mô hình phân quyền:

1. `2026-09-28_00_permission_scopes.sql`: cột `scope`, quy đổi quyền kiểu cũ, 2 quyền tách riêng `exams:manage`, `cme_records:manage`.
2. `2026-09-28_01_token_version_role_codes.sql`: `users.token_version`, `roles.code` / `is_system` / `is_superuser`.

### Kiểm tra lúc khởi động

Code chỉ chạy với CSDL đã ở mô hình mới, không còn nhánh chạy theo dữ liệu kiểu cũ. Khi khởi động, `database/index.js` chạy migration (nếu `DB_AUTO_MIGRATE`), rồi `permissions/index.js`:

1. Kiểm tra đủ cột (`REQUIRED_COLUMNS`: `role_permissions.scope`, `users.token_version`, `roles.code` / `is_system` / `is_superuser`, cột 2FA / refresh token...) và không còn quyền kiểu cũ (`read_all`, `read_department`, `read_assigned`, `system:manage`). Tất cả trong 1 truy vấn. **Thiếu thì server dừng** (exit 1) và liệt kê từng mục kèm file SQL cần chạy.
2. Đồng bộ `catalog.js` vào bảng `permissions` (`sync.js`).
3. Không kết nối được CSDL (SQL Server chưa lên) thì chỉ cảnh báo, server vẫn chạy như trước.
