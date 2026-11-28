#!/usr/bin/env bash
# Chạy TRƯỚC mỗi job trên runner tự host (staging/production) — biến
# ACTIONS_RUNNER_HOOK_JOB_STARTED trong file .env của runner trỏ tới bản cài của
# file này (xem infra/cai-dat-may-ao-ubuntu.md mục 15.1). Thoát khác 0 → GitHub
# KHÔNG chạy job và đánh dấu hỏng.
#
# Vì sao cần: ai có quyền ghi repo cũng có thể đẩy 1 nhánh chứa workflow mới với
# `runs-on: [self-hosted, rms-production]` rồi chạy lệnh tuỳ ý trên máy chủ
# production — không cần qua review, environment hay cổng deploy (OWASP CI/CD
# CICD-SEC-4 "Poisoned Pipeline Execution"). Runner group chỉ cho workflow chỉ định
# chỉ có ở tài khoản tổ chức; hook này là lớp chặn tương đương, nằm trên máy chủ
# nên workflow không sửa / bỏ qua được.
#
# Chỉ cho chạy job khi:
#   - đúng repo;
#   - workflow gốc là ci.yml hoặc deploy.yml TRÊN NHÁNH main (GITHUB_WORKFLOW_REF —
#     với workflow gọi lại (deploy.yml do ci.yml gọi) đây là workflow gọi);
#   - sự kiện là push (CI trên main) hoặc workflow_dispatch (deploy / rollback tay).
# Mã trên main đã qua PR + review + CI, nên đó là mã duy nhất được chạy ở đây.
#
# Cài (root sở hữu, user runner chỉ đọc + chạy được — job không sửa được hook):
#   sudo install -D -o root -g root -m 0755 infra/runner/job-started.sh /opt/rms-runner/job-started.sh
#   echo 'ACTIONS_RUNNER_HOOK_JOB_STARTED=/opt/rms-runner/job-started.sh' | sudo -u github-runner tee -a ~github-runner/actions-runner/.env
#   echo 'RMS_RUNNER_REPO=<owner>/Hospital_RMS' | sudo -u github-runner tee -a ~github-runner/actions-runner/.env
#   sudo ~github-runner/actions-runner/svc.sh stop && sudo ~github-runner/actions-runner/svc.sh start
set -euo pipefail

repo_expected="${RMS_RUNNER_REPO:-NguyenHung2381/Hospital_RMS}"
repo="${GITHUB_REPOSITORY:-}"
ref="${GITHUB_REF:-}"
workflow_ref="${GITHUB_WORKFLOW_REF:-}"
event="${GITHUB_EVENT_NAME:-}"

deny() {
	echo "::error::Runner $(hostname) từ chối job: $1"
	echo "  repo=$repo ref=$ref event=$event workflow=$workflow_ref actor=${GITHUB_ACTOR:-} run=${GITHUB_RUN_ID:-}"
	echo "  Runner này chỉ chạy deploy từ ci.yml / deploy.yml trên nhánh main (infra/runner/job-started.sh)."
	# Ghi nhật ký hệ thống để người quản trị thấy cả khi không xem log trên GitHub
	logger -t rms-runner-hook -p auth.warning \
		"DENY $1 repo=$repo ref=$ref event=$event workflow=$workflow_ref actor=${GITHUB_ACTOR:-} run=${GITHUB_RUN_ID:-}" 2>/dev/null || true
	exit 1
}

# Tên repo/owner trên GitHub không phân biệt hoa/thường
[ "${repo,,}" = "${repo_expected,,}" ] || deny "repo không đúng (cần $repo_expected)"
[ "$ref" = refs/heads/main ] || deny "không phải nhánh main"

case "$event" in
	push | workflow_dispatch) ;;
	*) deny "sự kiện $event không được phép" ;;
esac

case "${workflow_ref,,}" in
	"${repo_expected,,}/.github/workflows/ci.yml@refs/heads/main") ;;
	"${repo_expected,,}/.github/workflows/deploy.yml@refs/heads/main") ;;
	*) deny "workflow không được phép" ;;
esac

echo "Runner hook: cho phép $workflow_ref ($event, run ${GITHUB_RUN_ID:-?}, ${GITHUB_ACTOR:-?})"
