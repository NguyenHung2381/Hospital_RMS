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

## Backend: theo khuôn module (`backend/README.md`)

- [ ] Route không có logic/SQL. Controller không SQL/ExcelJS. Service không `require` `middlewares/`.
- [ ] Đổi schema bằng file mới trong `database/migrations/` (idempotent), không sửa file đã chạy. Sửa proc/trigger thì chạy `npm run dump:db-objects`.
- [ ] Biến môi trường mới: khai báo ở `config/env.js` (hạ tầng) hoặc đọc tại chỗ, và thêm vào `.env.example`.
- [ ] Không thêm `// @ts-nocheck` cho file mới.
