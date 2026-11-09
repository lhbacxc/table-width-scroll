$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::InputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$PSDefaultParameterValues['*:Encoding'] = 'UTF8'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$distRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
$packageTarget = [IO.Path]::GetFullPath((Join-Path $distRoot 'table-width-scroll'))
$pluginManifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Encoding UTF8 | ConvertFrom-Json
$packageInfo = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Encoding UTF8 | ConvertFrom-Json
if ($pluginManifest.version -ne $packageInfo.version) { throw 'manifest 与 package 版本不一致' }
if ($pluginManifest.author -ne 'Lhbacxc' -or $pluginManifest.authorUrl -ne 'https://github.com/lhbacxc/table-width-scroll') {
    throw '作者必须为 Lhbacxc，链接必须指向本插件 GitHub 仓库'
}
$runtimeFiles = @('main.js', 'manifest.json', 'styles.css')
foreach ($file in $runtimeFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $file) -PathType Leaf)) { throw ('缺少运行文件：' + $file) }
}
# 先验证固定的绝对路径，再清理旧安装目录，避免旧文件混入新包。
if (-not $packageTarget.StartsWith($distRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw '安装目录超出 dist 范围'
}
if (Test-Path -LiteralPath $distRoot) {
    if ((Get-Item -LiteralPath $distRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'dist 不得是目录链接' }
}
if (Test-Path -LiteralPath $packageTarget) {
    if ((Get-Item -LiteralPath $packageTarget).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '安装目录不得是目录链接' }
    Remove-Item -LiteralPath $packageTarget -Recurse -Force
}
New-Item -ItemType Directory -Path $packageTarget -Force | Out-Null
foreach ($file in $runtimeFiles) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $packageTarget $file) -Force
}
$zipTarget = Join-Path $distRoot ('table-width-scroll-' + $pluginManifest.version + '.zip')
Compress-Archive -LiteralPath $packageTarget -DestinationPath $zipTarget -Force
# 当前版本成功打包后，删除 dist 中旧版本的 ZIP。
Get-ChildItem -LiteralPath $distRoot -Filter 'table-width-scroll-*.zip' -File | Where-Object { $_.FullName -ne $zipTarget } | ForEach-Object {
    $oldZipPath = [IO.Path]::GetFullPath($_.FullName)
    if (-not $oldZipPath.StartsWith($distRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw '旧压缩包路径超出 dist 范围'
    }
    Remove-Item -LiteralPath $oldZipPath -Force
}
Write-Output $zipTarget
