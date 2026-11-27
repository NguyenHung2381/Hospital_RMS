## Thay đổi gì, vì sao

<!-- 1–3 câu: vấn đề / yêu cầu, cách giải quyết. Link issue nếu có. -->

## Kiểm tra

<!-- Đánh dấu việc đã làm; bỏ dòng không liên quan. CI tự chạy các lệnh có (CI). -->

- [ ] `npm run lint`, `npm run format:check`, `npm run typecheck` (CI)
- [ ] `npm test` (CI): có test mới cho quy tắc nghiệp vụ mới/sửa
- [ ] `npm run test:contract` (CI): đổi route/quyền có chủ đích thì đã cập nhật `routes.snapshot.txt`
- [ ] `npm run check:routes`, `check:requires`, `check:deps` (CI)
- [ ] `npm run test:smoke` trên DB dev (so với baseline ghi trước khi sửa): bắt buộc khi refactor/di chuyển code backend
- [ ] Đã thử trên giao diện (thao tác ghi: tạo/sửa/xoá, import/export…)

## Tuân thủ · bảo mật (bản PR này là hồ sơ duyệt thay đổi — điền thật)

<!-- Ghi "Không" nếu không liên quan. CI tự kiểm phần có (CI). -->

- **Dữ liệu cá nhân**: có thêm/đổi trường, màn hình, file xuất, log, email… chứa dữ liệu cá nhân (họ tên, CCCD, SĐT, email, sức khoẻ, chứng chỉ hành nghề) không? Ai được xem, giữ bao lâu?
- **Phân quyền / xác thực**: có đổi quyền, route công khai, phiên đăng nhập, 2FA, captcha/OTP không?
- **Rủi ro + cách quay lại**: hỏng thì rollback được không (migration tương thích ngược?), ảnh hưởng ai?
- [ ] Không log / trả về API / xuất file dữ liệu cá nhân hoặc bí mật quá mức cần (mật khẩu, token, CCCD đầy đủ…)
- [ ] Thư viện mới: đã xem giấy phép (CI chặn AGPL/GPL… — `.github/license-policy.json`) và mức bảo trì
- [ ] Migration không sửa file cũ, không xoá/đổi tên cột/bảng đang dùng (CI) — lệnh phá huỷ có chủ đích đã ghi `-- ci:cho-phep-pha-huy: <lý do>`

## Backend: theo khuôn module (`backend/README.md`)

- [ ] Route không có logic/SQL. Controller không SQL/ExcelJS. Service không `require` `middlewares/`.
- [ ] Đổi schema bằng file mới trong `backend/database/migrations/` (`npm run migrate -- new <mô tả>`), không sửa file đã chạy. Không dùng stored procedure — viết logic bằng JS.
- [ ] Biến môi trường mới: khai báo ở `config/env.js` (hạ tầng) hoặc đọc tại chỗ, và thêm vào `.env.example`.
- [ ] Không thêm `// @ts-nocheck` cho file mới.
