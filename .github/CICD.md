# CI/CD — Hospital RMS

```
push / PR ──► CI (ci.yml) ─ test theo nhóm · typecheck · lint · coverage · npm audit
                           ─ gitleaks · Semgrep (SAST) · phân quyền route
   (main, tất cả xanh) ──► Image: build 1 lần, tag = commit SHA, Trivy, SBOM + provenance → GHCR
                       ──► Deploy staging (nếu bật) ──► Deploy production (duyệt / chạy tay)
Deploy (deploy.yml → scripts/deploy.ps1, chạy trên runner đặt tại server):
   pull image SHA → backup DB + migration → up --no-build → smoke test + theo dõi → hỏng thì tự rollback
```

| File | Vai trò |
|---|---|
| `.github/workflows/ci.yml` | Kiểm tra, build image, gọi deploy, báo lỗi |
| `.github/workflows/deploy.yml` | Deploy 1 SHA lên 1 môi trường. Chạy tay = **rollback** |
| `scripts/deploy.ps1` | Logic deploy/smoke test/rollback. GitHub sự cố vẫn chạy tay được trên server |
| `backend/scripts/migrate.js` | Chạy migration mới theo thứ tự, ghi bảng `schema_migrations` (xem `backend/database/README.md`) |
| `.github/dependabot.yml`, `.github/CODEOWNERS`, `.gitleaksignore` | Cập nhật thư viện, người review, báo nhầm của gitleaks |

## Cài đặt 1 lần

1. **Branch protection cho `main`** (Settings → Branches, hoặc lệnh dưới). Repo private cần gói GitHub Pro/Team trở lên.
   ```bash
   gh api -X PUT repos/NguyenHung2381/Hospital_RMS/branches/main/protection --input - <<'EOF'
   {"required_status_checks":{"strict":true,"contexts":["Backend · kiểm tra tĩnh + coverage","Frontend · kiểm tra tĩnh + build","Không commit bí mật","SAST (Semgrep)"]},
    "enforce_admins":false,"required_pull_request_reviews":{"required_approving_review_count":1,"require_code_owner_reviews":true,"dismiss_stale_reviews":true},
    "restrictions":null,"allow_force_pushes":false,"allow_deletions":false}
   EOF
   ```
2. **Runner trên server** (Settings → Actions → Runners → New self-hosted runner, Windows). Lúc cài, thêm nhãn `rms-production` (staging: `rms-staging`) và chạy dưới dạng service bằng user có quyền dùng Docker. Server tự kết nối ra GitHub, không cần mở cổng vào.
   Settings → Actions → General → *Fork pull request workflows*: **không** chạy workflow từ fork. Runner chỉ nhận job deploy, PR không bao giờ chạy trên runner này.
3. **Environments** (Settings → Environments) `production` (và `staging` nếu dùng):
   - *Deployment branches*: chỉ `main`.
   - *Required reviewers*: chỉ có ở repo public hoặc gói Enterprise. Có thì bật, rồi đặt biến repo `AUTO_DEPLOY_PRODUCTION=true`.
     Không có thì production luôn deploy **bằng tay** (bước "Deploy production" bên dưới). Đây là bước duyệt.
   - Biến (*Variables*): `DEPLOY_DIR` (thư mục source trên server, chứa `backend/.env*` và `.env`), `APP_URL`, `MIGRATION_BACKUP_DIR` (thư mục **trên máy SQL Server** để backup trước migration).
     Staging cùng máy thì thêm `COMPOSE_PROJECT=hospital_rms_staging`, `BACKEND_URL`/`FRONTEND_URL` với cổng khác, và đặt `BACKEND_BIND`/`FRONTEND_BIND` + `DB_DATABASE` riêng trong `.env`/`backend/.env.production` của thư mục staging.
   - Secret (*Secrets*): `MIGRATION_DB_USER`, `MIGRATION_DB_PASSWORD`. Đây là login có quyền ALTER/BACKUP, chỉ dùng cho bước migration. App vẫn chạy bằng login quyền hẹp trong `.env.production`.
4. Staging: đặt biến repo `ENABLE_STAGING=true` khi đã có runner `rms-staging`.
5. **Baseline migration** (chỉ 1 lần, vì DB hiện tại đã nâng cấp tay). Trên server, sau khi deploy bản có script này:
   ```bash
   docker compose -f docker-compose.prod.yml run --rm --no-deps -T backend node scripts/migrate.js --baseline
   ```
   Từ đó mỗi lần deploy chỉ chạy file mới trong `backend/database/migrations/`. Script chạy tay nằm riêng ở `backend/database/manual/`, không tự chạy.

## Vận hành

- **Deploy production (bằng tay)**: Actions → *Deploy* → Run workflow → `production` + commit SHA (SHA lấy ở trang tóm tắt lần chạy CI, mục Image).
- **Rollback**: giống hệt, nhập SHA của bản cũ. Image cũ còn nguyên trên GHCR (Packages) và trong Docker của server. Không có GitHub thì chạy trên server:
  `.\scripts\deploy.ps1 -Tag <sha> -Registry ghcr.io/nguyenhung2381` (cần `docker login ghcr.io` bằng PAT có quyền `read:packages`).
- **Tự rollback**: smoke test (`/health` đúng version, `/health/db`, trang chủ, không restart trong 60s) hỏng thì script tự quay lại image trước đó, và job báo đỏ.
- **Migration**: rollback ứng dụng **không** hoàn tác schema. Vì vậy:
  - Migration phải tương thích ngược: thêm cột/bảng thì được; xoá hoặc đổi tên thì để 1 bản phát hành sau, khi code cũ không còn dùng.
  - Viết idempotent như các file hiện có.
  - Migration hỏng thì deploy dừng **trước** khi đổi container (bản cũ vẫn chạy). Cần khôi phục thì restore file `.bak` trong `MIGRATION_BACKUP_DIR`.
- **Lịch sử deploy**: tab *Environments* trên GitHub (ai, SHA, lúc nào, link lần chạy) và `logs/deploy-history.log` trên server.
- **Truy vết**: production → `GET /health` trả `version` = commit SHA → image `ghcr.io/…:<sha>` (label `org.opencontainers.image.url` trỏ về lần chạy CI có kết quả test, coverage, quét) → commit.

## Trách nhiệm

| Sự cố | Người xử lý |
|---|---|
| CI hỏng trên PR | Tác giả PR |
| CI/deploy hỏng trên `main` | Người push / người chạy deploy. Workflow tự mở issue giao cho người đó |
| Deploy production, rollback, restore DB | Người quản trị hệ thống (Code Owner `@NguyenHung2381`) |

## Đối chiếu checklist

| Mục | Trạng thái |
|---|---|
| **1. Source & Trigger** | Push/PR vào `main` + lịch tuần · branch protection + CODEOWNERS (cài ở bước 1) · ESLint frontend, `tsc` cả hai phía · gitleaks + chặn file `.env`/khoá · PR huỷ lần chạy cũ, `main` không huỷ, deploy xếp hàng theo môi trường, deploy lại SHA cũ được |
| **2. Build & Dependencies** | `npm ci` trên runner sạch · lockfile + `npm audit` + Dependabot · build hỏng thì dừng · image tag = commit SHA · 1 image dùng cho mọi môi trường (`up --no-build`) |
| **3. Testing & Quality Gate** | `node --test` theo nhóm, kết quả vào Summary · coverage tối thiểu 45% dòng (nâng dần) · Semgrep · mọi kiểm tra phải xanh mới build/deploy. *Chưa có integration test với SQL Server thật; smoke test sau deploy bù một phần* |
| **4. Security** | SAST Semgrep · SCA `npm audit` + Dependabot · gitleaks · Trivy quét image (chặn CRITICAL) · `permissions` tối thiểu từng job, secret theo environment, PR từ fork không có secret và không chạy trên runner · SBOM + provenance gắn vào image. *Chưa ký image (cosign)* |
| **5. Deployment** | staging / production theo environment · duyệt (required reviewers hoặc chạy tay) · biến/secret theo environment + file `.env` riêng trên từng server · migration có theo dõi + backup · smoke test · *rolling/blue-green: chưa, 1 server nên có downtime vài giây lúc tạo lại container* |
| **6. Rollback & Recovery** | Tự rollback + rollback tay theo SHA · image cũ còn trên GHCR · migration tương thích ngược + backup · `timeout-minutes` mọi job, pull có retry · bảng trách nhiệm ở trên |
| **7. Monitoring & Audit** | Log Actions tự che secret · issue + email khi hỏng · lịch sử deploy (Environments + `deploy-history.log`) · truy vết SHA ↔ image ↔ lần chạy CI. *Error rate/latency sau deploy: chỉ có theo dõi restart 60s; dashboard cần Loki/Grafana ở prod (hiện chỉ có ở dev)* |
