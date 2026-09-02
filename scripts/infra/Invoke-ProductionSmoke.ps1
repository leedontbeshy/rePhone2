<#
.SYNOPSIS
Builds and probes the exact production API, operations and standalone web images.

.DESCRIPTION
Uses a random Compose project, an internal-only network and ephemeral secrets.
It refuses dirty worktrees and non-local Docker contexts, never reads env files,
and validates project/nonce labels before deleting any Docker resource.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$composeFile = (Resolve-Path (Join-Path $PSScriptRoot 'production-smoke.compose.yaml')).Path
$project = 'rephone-smoke-' + ([guid]::NewGuid().ToString('N').Substring(0, 12))
$nonce = [guid]::NewGuid().ToString('N')
$smokeConfigured = $false
$secretNames = @(
  'SMOKE_PROJECT', 'SMOKE_NONCE', 'SMOKE_OPS_IMAGE', 'SMOKE_API_IMAGE', 'SMOKE_WEB_IMAGE',
  'SMOKE_DB_PASSWORD', 'SMOKE_RUNTIME_DB_PASSWORD', 'SMOKE_DIRECT_URL', 'SMOKE_RUNTIME_URL',
  'SMOKE_JWT_SECRET', 'SMOKE_IDENTIFIER_ENCRYPTION_KEY', 'SMOKE_IDENTIFIER_HMAC_KEY',
  'SMOKE_STORAGE_KEY', 'SMOKE_ADMIN_EMAIL', 'SMOKE_ADMIN_PASSWORD',
  'SMOKE_CUSTOMER_EMAIL', 'SMOKE_CUSTOMER_PASSWORD'
)

function New-HexSecret([int]$Bytes = 32) {
  return [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes($Bytes)).ToLowerInvariant()
}

function New-Base64Secret([int]$Bytes = 32) {
  return [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes($Bytes))
}

function Invoke-Docker([string[]]$Arguments) {
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Docker command failed with exit code $LASTEXITCODE." }
}

function Assert-SafeHost {
  if ($env:OS -ne 'Windows_NT') { throw 'Production smoke requires Windows PowerShell/PowerShell 7 on Windows.' }
  if (@(git -C $repoRoot status --porcelain).Count -ne 0) {
    throw 'Production smoke requires a clean Git worktree.'
  }
  $dockerHost = (& docker context inspect --format '{{.Endpoints.docker.Host}}' 2>$null | Select-Object -First 1)
  if ($LASTEXITCODE -ne 0 -or $dockerHost -notmatch '^npipe://') {
    throw 'Production smoke only permits the local Windows Docker Desktop named-pipe context.'
  }
  $source = Get-Content -LiteralPath $composeFile -Raw
  foreach ($requiredText in @('postgres:17.6-alpine', 'POSTGRES_DB: rephone_smoke_test', 'target: api-runtime', 'target: api-operations', 'target: web-runtime', 'internal: true', 'SCHEDULER_ENABLED: ''false''', 'example.invalid')) {
    if (-not $source.Contains($requiredText)) { throw "Smoke Compose contract is missing: $requiredText" }
  }
  if ($source -match '(?m)^\s*ports\s*:') { throw 'Smoke Compose must not publish host ports.' }
  if ($source -match '(?i)supabase\.co|\.env(?:\.docker)?') {
    throw 'Smoke Compose must not reference Supabase or environment files.'
  }
}

function Assert-CleanupTargets {
  $filters = @('container', 'network', 'volume')
  foreach ($kind in $filters) {
    $listArguments = @($kind, 'ls', '-q', '--filter', "label=com.docker.compose.project=$project")
    if ($kind -eq 'container') { $listArguments = @($kind, 'ls', '--all', '-q', '--filter', "label=com.docker.compose.project=$project") }
    $ids = @(& docker @listArguments)
    if ($LASTEXITCODE -ne 0) { throw "Could not enumerate smoke $kind targets." }
    foreach ($id in $ids) {
      if ([string]::IsNullOrWhiteSpace($id)) { continue }
      $labels = & docker $kind inspect $id --format '{{json .Labels}}'
      if ($LASTEXITCODE -ne 0) { throw "Could not inspect smoke $kind target." }
      $parsed = $labels | ConvertFrom-Json
      if ($parsed.'com.docker.compose.project' -ne $project -or $parsed.'com.rephone.production-smoke' -ne $nonce) {
        throw "Refusing cleanup: a $kind target failed the project/nonce label check."
      }
    }
  }
  foreach ($image in @($env:SMOKE_OPS_IMAGE, $env:SMOKE_API_IMAGE, $env:SMOKE_WEB_IMAGE)) {
    $id = & docker image ls -q $image
    if ($LASTEXITCODE -ne 0) { throw 'Could not enumerate a smoke image target.' }
    if ([string]::IsNullOrWhiteSpace($id)) { continue }
    $label = & docker image inspect $image --format '{{index .Config.Labels "com.rephone.production-smoke"}}'
    if ($LASTEXITCODE -ne 0 -or $label -ne $nonce) {
      throw 'Refusing cleanup: a smoke image failed the nonce label check.'
    }
  }
}

function Remove-SmokeResources {
  Assert-CleanupTargets
  Invoke-Docker @('compose', '--project-name', $project, '--file', $composeFile, 'down', '--volumes', '--remove-orphans', '--timeout', '20')
  foreach ($image in @($env:SMOKE_OPS_IMAGE, $env:SMOKE_API_IMAGE, $env:SMOKE_WEB_IMAGE)) {
    if (-not [string]::IsNullOrWhiteSpace((& docker image ls -q $image))) {
      Invoke-Docker @('image', 'rm', $image)
    }
  }
}

Push-Location $repoRoot
try {
  Assert-SafeHost

  $dbPassword = New-HexSecret
  $runtimePassword = New-HexSecret
  $env:SMOKE_PROJECT = $project
  $env:SMOKE_NONCE = $nonce
  $env:SMOKE_OPS_IMAGE = "$project-api-operations"
  $env:SMOKE_API_IMAGE = "$project-api-runtime"
  $env:SMOKE_WEB_IMAGE = "$project-web-runtime"
  $env:SMOKE_DB_PASSWORD = $dbPassword
  $env:SMOKE_RUNTIME_DB_PASSWORD = $runtimePassword
  $env:SMOKE_DIRECT_URL = "postgresql://smoke_owner:$dbPassword@database:5432/rephone_smoke_test?sslmode=verify-full&sslrootcert=/certs/ca.crt"
  $env:SMOKE_RUNTIME_URL = "postgresql://rephone_runtime:$runtimePassword@database:5432/rephone_smoke_test?sslmode=verify-full&sslrootcert=/certs/ca.crt"
  $env:SMOKE_JWT_SECRET = New-HexSecret 48
  $env:SMOKE_IDENTIFIER_ENCRYPTION_KEY = New-Base64Secret
  $env:SMOKE_IDENTIFIER_HMAC_KEY = New-Base64Secret
  $env:SMOKE_STORAGE_KEY = New-HexSecret 48
  $env:SMOKE_ADMIN_EMAIL = "admin-$($nonce.Substring(0, 8))@example.invalid"
  $env:SMOKE_ADMIN_PASSWORD = "A9!$(New-HexSecret 16)"
  $env:SMOKE_CUSTOMER_EMAIL = "customer-$($nonce.Substring(0, 8))@example.invalid"
  $env:SMOKE_CUSTOMER_PASSWORD = "C9!$(New-HexSecret 16)"
  $smokeConfigured = $true

  Invoke-Docker @('compose', '--project-name', $project, '--file', $composeFile, 'config', '--quiet')
  Invoke-Docker @('compose', '--project-name', $project, '--file', $composeFile, 'build', 'migrate', 'api', 'web')
  Invoke-Docker @('compose', '--project-name', $project, '--file', $composeFile, 'up', '--detach', '--wait', '--wait-timeout', '180', 'api', 'web')
  Invoke-Docker @('compose', '--project-name', $project, '--file', $composeFile, '--profile', 'probe', 'run', '--rm', '--no-deps', 'probe')
  Write-Host 'Production container smoke passed.'
}
finally {
  $cleanupError = $null
  if ($smokeConfigured) {
    try { Remove-SmokeResources } catch { $cleanupError = $_.Exception }
  }
  foreach ($name in $secretNames) { Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue }
  Pop-Location
  if ($null -ne $cleanupError) { throw "Smoke cleanup was refused or failed: $($cleanupError.Message)" }
}
