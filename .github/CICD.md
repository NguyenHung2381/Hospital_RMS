# CI/CD — Hospital RMS

```
push / PR ──► CI (ci.yml, chỉ điều phối) ─┬─ Phụ thuộc   chỉ bản chính thức · nguồn gói · npm audit · chữ ký gói
                                          ├─ Bí mật      file nhạy cảm · chuỗi bí mật · gitleaks
                                          ├─ SAST        Semgrep
                                          ├─ Hạ tầng     actionlint · zizmor · hadolint · shellcheck · compose
                                          ├─ Backend     lint/kiểu · kiến trúc · test theo nhóm · coverage · PostgreSQL   (PR: chỉ khi đổi backend/)
                                          └─ Frontend    lint/kiểu · build                                                (PR: chỉ khi đổi frontend/)
                                                 ▼
                                          CI · kết quả  (check bắt buộc duy nhất)
   (main, xanh) ──► Image: app đổi → build + Trivy + SBOM/provenance; app không đổi → gắn tag SHA mới cho image cũ → GHCR
                ──► Deploy staging (nếu bật) ──► Deploy production (duyệt / chạy tay)
Deploy (deploy.yml → scripts/deploy.sh, chạy trên runner đặt tại server Ubuntu):
   pull image SHA → backup DB + migration → up --no-build → smoke test + theo dõi → hỏng thì tự rollback
```

| File | Vai trò |
|---|---|
| `.github/workflows/ci.yml` | Điều phối: trigger, xác định phần đổi, gọi các workflow con, gom kết quả, build image, gọi deploy, báo lỗi. Không chứa logic kiểm tra |
| `.github/workflows/check-dependencies.yml` | Chỉ bản chính thức (`scripts/ci/check-stable-versions.mjs`), `npm audit` (prod chặn high, dev chặn critical), `npm audit signatures` — mỗi thư mục 1 check |
| `.github/workflows/check-secrets.yml` | Không commit `.env`/khoá/bản dump, chuỗi bí mật, gitleaks |
| `.github/workflows/check-sast.yml` | Semgrep |
| `.github/workflows/check-infra.yml` | actionlint, zizmor (bảo mật workflow), hadolint (`.hadolint.yaml`), shellcheck, `docker compose config` |
| `.github/workflows/check-backend.yml` | Lint · Prettier · tsc / kiến trúc + phân quyền route / test theo nhóm / coverage / PostgreSQL thật |
| `.github/workflows/check-frontend.yml` | Lint + tsc / build production (chặn source map) |
| `.github/workflows/build-image.yml` | Chỉ build app có thay đổi (so với commit trước của lần push); app không đổi thì gắn tag SHA mới cho image cũ trên registry (vài giây). Vẫn build lại khi đổi workflow này, commit trước không có image, push đè lịch sử, hoặc image gốc quá 7 ngày (lấy bản vá base image). Chỉ ci.yml gọi được, không chạy tay |
| `.github/workflows/deploy.yml` | Deploy 1 SHA lên 1 môi trường. Chạy tay = **rollback** |
| `.github/prerelease-allowlist.json` | Gói **gián tiếp** là bản tiền phát hành tạm chấp nhận, kèm lý do. Phụ thuộc trực tiếp không bao giờ được vào đây |
| `scripts/deploy.sh` | Logic deploy/backup/smoke test/rollback (bash). GitHub sự cố vẫn chạy tay được trên server |
| `backend/scripts/migrate.js` | Chạy migration mới theo thứ tự, ghi bảng `schema_migrations` (xem `backend/database/README.md`) |
| `.github/dependabot.yml`, `.github/CODEOWNERS`, `.gitleaksignore` | Cập nhật thư viện, người review, báo nhầm của gitleaks |

## Cài đặt 1 lần

1. **Branch protection cho `main`** (Settings → Branches, hoặc lệnh dưới). Repo private cần gói GitHub Pro/Team trở lên.
   ```bash
   gh api -X PUT repos/NguyenHung2381/Hospital_RMS/branches/main/protection --input - <<'EOF'
   {"required_status_checks":{"strict":true,"contexts":["CI · kết quả"]},
    "enforce_admins":false,"required_pull_request_reviews":{"required_approving_review_count":1,"require_code_owner_reviews":true,"dismiss_stale_reviews":true},
    "restrictions":null,"allow_force_pushes":false,"allow_deletions":false}
   EOF
   ```
2. **Runner trên server** (Settings → Actions → Runners → New self-hosted runner, **Linux**). Lúc cài, thêm nhãn `rms-production` (staging: `rms-staging`) và chạy dưới dạng service (`svc.sh install`) bằng user thuộc nhóm `docker`. Server tự kết nối ra GitHub, không cần mở cổng vào. Từng bước: `infra/cai-dat-may-ao-ubuntu.md` mục 15.
   Settings → Actions → General → *Fork pull request workflows*: **không** chạy workflow từ fork. Runner chỉ nhận job deploy, PR không bao giờ chạy trên runner này.
3. **Environments** (Settings → Environments) `production` (và `staging` nếu dùng):
   - *Deployment branches*: chỉ `main`.
   - *Required reviewers*: chỉ có ở repo public hoặc gói Enterprise. Có thì bật, rồi đặt biến repo `AUTO_DEPLOY_PRODUCTION=true`.
     Không có thì production luôn deploy **bằng tay** (bước "Deploy production" bên dưới). Đây là bước duyệt.
   - Biến (*Variables*): `DEPLOY_DIR` (thư mục source trên server, chứa `backend/.env*` và `.env`), `APP_URL`, `MIGRATION_BACKUP_DIR` (thư mục trên server để `pg_dump` trước migration; user runner phải ghi được, máy cần `pg_dump` — cài cùng PostgreSQL).
     Staging cùng máy thì thêm `COMPOSE_PROJECT=hospital_rms_staging`, `BACKEND_URL`/`FRONTEND_URL` với cổng khác, và đặt `BACKEND_BIND`/`FRONTEND_BIND` + `DB_DATABASE` riêng trong `.env`/`backend/.env.production` của thư mục staging.
   - Secret (*Secrets*): `MIGRATION_DB_USER` (`rms_migrate`), `MIGRATION_DB_PASSWORD`. Role chủ DB, chỉ dùng cho bước backup + migration. App vẫn chạy bằng role quyền hẹp `rms_app` trong `.env.production`. Backup kết nối `127.0.0.1:5432/rms_hospital`; khác thì đặt `MIGRATION_DB_HOST` / `MIGRATION_DB_PORT` / `MIGRATION_DB_NAME`.
4. Staging: đặt biến repo `ENABLE_STAGING=true` khi đã có runner `rms-staging`.
5. **Database lần đầu**: dựng schema (`migrate init`) hoặc chuyển dữ liệu từ file backup SQL Server — `infra/cai-dat-may-ao-ubuntu.md` mục 12.2. Từ đó mỗi lần deploy chỉ chạy file mới trong `backend/database/migrations/`.

## Vận hành

- **Deploy production (bằng tay)**: Actions → *Deploy* → Run workflow → `production` + commit SHA (SHA lấy ở trang tóm tắt lần chạy CI, mục Image).
- **Rollback**: giống hệt, nhập SHA của bản cũ. Image cũ còn nguyên trên GHCR (Packages) và trong Docker của server. Không có GitHub thì chạy trên server:
  `scripts/deploy.sh <sha> ghcr.io/nguyenhung2381` (cần `docker login ghcr.io` bằng PAT có quyền `read:packages`; đặt `DEPLOY_DIR`, `MIGRATION_*` như trên).
- **Tự rollback**: smoke test (`/health` đúng version, `/health/db`, trang chủ, không restart trong 60s) hỏng thì script tự quay lại image trước đó, và job báo đỏ.
- **Migration**: rollback ứng dụng **không** hoàn tác schema. Vì vậy:
  - Migration phải tương thích ngược: thêm cột/bảng thì được; xoá hoặc đổi tên thì để 1 bản phát hành sau, khi code cũ không còn dùng.
  - Viết idempotent như các file hiện có.
  - Migration hỏng thì deploy dừng **trước** khi đổi container (bản cũ vẫn chạy). Cần khôi phục thì `pg_restore` file `.dump` mới nhất trong `MIGRATION_BACKUP_DIR` (tên có 8 ký tự đầu của SHA).
- **Lịch sử deploy**: tab *Environments* trên GitHub (ai, SHA, lúc nào, link lần chạy) và `logs/deploy-history.log` trên server.
- **Truy vết**: production → `GET /health` trả `version` = commit SHA đã build image backend (bằng SHA deploy, hoặc commit gần nhất đổi `backend/` nếu image được gắn lại tag) → image `ghcr.io/…:<sha>` (label `org.opencontainers.image.url` trỏ về lần chạy CI có kết quả test, coverage, quét) → commit.

## Quy tắc phiên bản (check-dependencies.yml)

Chạy local trước khi push: `npm run check:versions` (ở thư mục gốc, không cần cài gì).

- **package.json**: chỉ khoảng semver của bản chính thức (`^1.2.3`, `~6.0.3`). Cấm `1.0.0-beta.1`/`-rc`/`-alpha`/`-next`..., dist-tag (`latest`, `next`, `beta`), `*`, cài từ git/URL/thư mục. Áp dụng cả `overrides`.
- **package-lock.json**: mọi gói (kể cả gián tiếp) phải là bản chính thức, tải từ `registry.npmjs.org`, có integrity `sha512`. Gói gián tiếp bị thư viện cha khoá cứng vào bản tiền phát hành: thử nâng thư viện cha hoặc ép bằng `overrides` trước; bất khả kháng mới thêm vào `.github/prerelease-allowlist.json` (tên, phiên bản, đi qua đâu, lý do + cách gỡ) — file này có Code Owner review.
- **Docker image**: phải có tag phiên bản; cấm `latest` và tag `beta`/`rc`/`nightly`/`edge`/`dev`. Tag không có số (`alpine`, `stable`) chỉ cảnh báo.
- **GitHub Actions**: action bên ngoài ghim theo commit SHA kèm chú thích bản chính thức (`@<sha> # v5.1.0`). Image công cụ chạy bằng `docker run` (gitleaks, semgrep, trivy, actionlint, zizmor, hadolint, shellcheck) ghim `tag@sha256:digest`. Dependabot cập nhật SHA cho action; image công cụ trong workflow thì nâng tay (lấy digest: `docker buildx imagetools inspect <image:tag>`).
- **Dependabot** chỉ đề xuất bản đã phát hành ≥ 7 ngày (major ≥ 14 ngày) để tránh gói bị chiếm tài khoản vừa đẩy lên.

## Thêm / sửa kiểm tra

- Mỗi phần là 1 file `check-*.yml` (có `workflow_call` + `workflow_dispatch` → chạy tay riêng được ở tab Actions). Sửa 1 phần không đụng phần khác.
- Thêm phần mới: tạo `check-<tên>.yml`, gọi trong `ci.yml` và thêm vào `needs` của job `result` (**CI · kết quả**). Không cần đổi branch protection.
- Workflow mới phải qua `check-infra.yml`: actionlint + zizmor (không `${{ }}` trong `run:` — đưa qua `env:`; `persist-credentials: false`; `permissions` tối thiểu).

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
| **2. Build & Dependencies** | `npm ci` trên runner sạch, Node 24 = bản trong Dockerfile · lockfile + `npm audit` + `npm audit signatures` + Dependabot (cooldown 7 ngày) · chỉ bản chính thức, chỉ từ registry npm · build hỏng thì dừng · image tag = commit SHA · 1 image dùng cho mọi môi trường (`up --no-build`) |
| **3. Testing & Quality Gate** | `node --test` theo nhóm, kết quả vào Summary · coverage tối thiểu 45% dòng (nâng dần) · Semgrep · mọi kiểm tra phải xanh mới build/deploy. *Job `PostgreSQL` (check-backend.yml) chạy test tích hợp với PostgreSQL thật; smoke test sau deploy bù phần còn lại* |
| **4. Security** | SAST Semgrep · SCA `npm audit` + chữ ký registry + Dependabot · gitleaks · Trivy quét image (chặn CRITICAL) · action ghim SHA, image công cụ ghim digest · zizmor + actionlint cho workflow, hadolint, shellcheck · `permissions` tối thiểu từng job, secret theo environment, PR từ fork không có secret và không chạy trên runner · SBOM + provenance gắn vào image. *Chưa ký image (cosign)* |
| **5. Deployment** | staging / production theo environment · duyệt (required reviewers hoặc chạy tay) · biến/secret theo environment + file `.env` riêng trên từng server · migration có theo dõi + backup · smoke test · *rolling/blue-green: chưa, 1 server nên có downtime vài giây lúc tạo lại container* |
| **6. Rollback & Recovery** | Tự rollback + rollback tay theo SHA · image cũ còn trên GHCR · migration tương thích ngược + backup · `timeout-minutes` mọi job, pull có retry · bảng trách nhiệm ở trên |
| **7. Monitoring & Audit** | Log Actions tự che secret · issue + email khi hỏng · lịch sử deploy (Environments + `deploy-history.log`) · truy vết SHA ↔ image ↔ lần chạy CI. *Error rate/latency sau deploy: chỉ có theo dõi restart 60s; dashboard cần Loki/Grafana ở prod (hiện chỉ có ở dev)* |
