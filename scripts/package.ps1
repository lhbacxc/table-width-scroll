$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::InputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$PSDefaultParameterValues['*:Encoding'] = 'UTF8'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$packageTarget = Join-Path $projectRoot 'dist\table-width-scroll'
$pluginManifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Encoding UTF8 | ConvertFrom-Json
$packageInfo = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Encoding UTF8 | ConvertFrom-Json
if ($pluginManifest.version -ne $packageInfo.version) { throw 'manifest 与 package 版本不一致' }
New-Item -ItemType Directory -Path $packageTarget -Force | Out-Null
foreach ($file in @('main.js', 'manifest.json', 'styles.css', 'LICENSE', 'THIRD_PARTY_NOTICES.md')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $packageTarget $file) -Force
}
$zipTarget = Join-Path $projectRoot ('dist\table-width-scroll-' + $pluginManifest.version + '.zip')
Compress-Archive -LiteralPath $packageTarget -DestinationPath $zipTarget -Force
Write-Output $zipTarget
