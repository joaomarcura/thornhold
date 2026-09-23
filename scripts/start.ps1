param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$gameRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $gameRoot
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw 'Instale Node.js 22 ou superior para iniciar Thornhold.' }
if (-not (Test-Path -LiteralPath (Join-Path $gameRoot 'node_modules\ws\package.json'))) {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'A instalação não concluiu. Verifique a conexão e execute npm ci.' }
}
$gamePort = if ($env:PORT) { [int]$env:PORT } else { 3000 }
$gameUrl = "http://localhost:$gamePort"
$probeUrl = "http://127.0.0.1:$gamePort/health"
$running = $false
try { $status = Invoke-RestMethod -Uri $probeUrl -TimeoutSec 2; $running = $status.game -eq 'thornhold' } catch { }
if (-not $running) {
  $artifactDir = Join-Path $gameRoot 'artifacts'
  New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
  $serverScript = Join-Path $gameRoot 'server\index.js'
  $gameProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList @(('"' + $serverScript + '"')) -WorkingDirectory $gameRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $artifactDir 'server.log') -RedirectStandardError (Join-Path $artifactDir 'server-error.log') -PassThru
  Set-Content -LiteralPath (Join-Path $artifactDir 'server.pid') -Value $gameProcess.Id
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 200
    try { $status = Invoke-RestMethod -Uri $probeUrl -TimeoutSec 1; if ($status.game -eq 'thornhold') { $running = $true; break } } catch { }
    if ($gameProcess.HasExited) { break }
  }
  if (-not $running) { throw 'Servidor não iniciou. Consulte artifacts\server-error.log; a porta pode estar ocupada.' }
}
Write-Host "Thornhold pronto em $gameUrl" -ForegroundColor Green
Write-Host 'Para jogar em rede, os amigos acessam o IP desta máquina e o mesmo código de sala.'
if (-not $NoBrowser) { Start-Process $gameUrl }
