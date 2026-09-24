<#
.SYNOPSIS
  Đổi JWT_SECRET + JWT_REFRESH_SECRET rồi tạo lại container server (Docker).

.DESCRIPTION
  Secret nằm ở 1 trong 2 nơi (giống docker-entrypoint.sh):
    - backend/.env đã có JWT_SECRET thật  → ghi đè trong backend/.env (backup .env.bak)
    - ngược lại                           → ghi đè trong volume server_secrets (/app/secrets/jwt.env)
  Sau đó tạo lại container server để nạp secret mới.

  LƯU Ý: mỗi lần đổi, mọi phiên đăng nhập bị đăng xuất; link upload cũ mất hiệu
  lực nếu không set UPLOAD_URL_SECRET. Vì vậy lịch mặc định là 4 tuần/lần, 02:30
  sáng Chủ nhật.

.EXAMPLE
  .\scripts\rotate-jwt-secrets.ps1                                  # đổi ngay (compose prod)
  .\scripts\rotate-jwt-secrets.ps1 -ComposeFile docker-compose.yml  # đổi ngay (compose dev)
  .\scripts\rotate-jwt-secrets.ps1 -Register                        # đăng ký lịch mặc định
  .\scripts\rotate-jwt-secrets.ps1 -Register -EveryWeeks 1 -DayOfWeek Saturday -At 03:00
  .\scripts\rotate-jwt-secrets.ps1 -Unregister                      # gỡ lịch
#>
param(
	[string]$ComposeFile = 'docker-compose.prod.yml',
	[switch]$Register,
	[switch]$Unregister,
	[ValidateRange(1, 52)][int]$EveryWeeks = 4,
	[System.DayOfWeek]$DayOfWeek = 'Sunday',
	[string]$At = '02:30'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$taskName = 'Hospital_RMS - Rotate JWT secrets'
$composePath = if ([System.IO.Path]::IsPathRooted($ComposeFile)) { $ComposeFile } else { Join-Path $root $ComposeFile }
$logDir = Join-Path $root 'logs'
$logFile = Join-Path $logDir 'jwt-rotate.log'

function Write-Log([string]$msg) {
	if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force $logDir | Out-Null }
	$line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
	Write-Host $line
	Add-Content -Path $logFile -Value $line -Encoding utf8
}

# Gọi docker compose, dừng nếu lỗi theo exit code. EAP=Continue cục bộ: PS 5.1
# coi mọi dòng stderr của lệnh native (docker in tiến trình ra stderr) là lỗi.
function Invoke-Compose([string[]]$composeArgs) {
	$ErrorActionPreference = 'Continue'
	$all = @('compose', '--project-directory', $root, '-f', $composePath) + $composeArgs
	$out = & docker @all 2>&1
	$out | ForEach-Object { Write-Log "  $_" }
	if ($LASTEXITCODE -ne 0) { throw "docker $($composeArgs[0]) lỗi (exit $LASTEXITCODE)" }
}

function Get-EnvValue([string]$file, [string]$key) {
	if (-not (Test-Path $file)) { return '' }
	$m = Select-String -Path $file -Pattern "^\s*$key\s*=(.*)$" | Select-Object -Last 1
	if (-not $m) { return '' }
	return $m.Matches[0].Groups[1].Value.Trim().Trim('"', "'")
}

# ── Gỡ / đăng ký lịch (Windows Task Scheduler) ─────────────────────────────
if ($Unregister) {
	Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
	Write-Host "Đã gỡ lịch '$taskName'."
	return
}

if ($Register) {
	$argStr = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -ComposeFile `"$ComposeFile`""
	$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argStr -WorkingDirectory $root
	$trigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval $EveryWeeks -DaysOfWeek $DayOfWeek -At $At
	# StartWhenAvailable: máy tắt đúng giờ hẹn → chạy bù khi bật lại
	$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
	Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
		-Description "Đổi JWT secret của Hospital_RMS ($ComposeFile) rồi tạo lại container server. Log: $logFile" `
		-Force | Out-Null
	Write-Host "Đã đăng ký '$taskName': $EveryWeeks tuần/lần, $DayOfWeek lúc $At ($ComposeFile)."
	Write-Host "Log: $logFile"
	return
}

# ── Đổi secret ─────────────────────────────────────────────────────────────
try {
	Write-Log "Bắt đầu đổi JWT secret ($ComposeFile)"
	if (-not (Test-Path $composePath)) { throw "Không thấy $composePath" }

	$ErrorActionPreference = 'Continue'
	& docker info --format '{{.ServerVersion}}' *> $null
	$ErrorActionPreference = 'Stop'
	if ($LASTEXITCODE -ne 0) { throw 'Docker chưa chạy (mở Docker Desktop rồi thử lại).' }

	$envFile = Join-Path $root 'backend\.env'
	$current = Get-EnvValue $envFile 'JWT_SECRET'
	$hostMode = $current -and ($current -notlike 'change-me*')

	# Chạy script trong image server (không cần Node trên máy host)
	$genArgs = @('run', '--rm', '--no-deps', '--entrypoint', 'node')
	if ($hostMode) {
		Write-Log 'Secret nằm trong backend/.env → ghi đè file này (backup backend/.env.bak)'
		$genArgs += @('-v', "$(Join-Path $root 'backend'):/w", 'server',
			'/app/scripts/gen-jwt-secrets.js', '--env', '/w/.env', '--force')
	} else {
		Write-Log 'Secret nằm trong volume server_secrets → ghi đè /app/secrets/jwt.env'
		$genArgs += @('server', '/app/scripts/gen-jwt-secrets.js',
			'--env', '/app/secrets/jwt.env', '--force')
	}
	Invoke-Compose $genArgs

	# Tạo lại container: env_file được đọc lại, entrypoint nạp secret mới
	Invoke-Compose @('up', '-d', '--force-recreate', '--no-deps', 'server')
	Write-Log 'Hoàn tất — mọi phiên đăng nhập cũ đã hết hiệu lực.'
} catch {
	Write-Log "LỖI: $($_.Exception.Message)"
	exit 1
}
