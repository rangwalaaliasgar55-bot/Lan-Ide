param(
    [string]$OutDir = "dist/windows",
    [string]$ReleaseRef = ""
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
if (-not $ReleaseRef) {
    if ($env:GITHUB_REF_TYPE -eq 'tag') { $ReleaseRef = $env:GITHUB_REF_NAME }
    elseif ($env:GITHUB_REF_NAME) { $ReleaseRef = $env:GITHUB_REF_NAME }
}

$Version = (Get-Content (Join-Path $RepoRoot 'VERSION') -Raw).Trim()
$AssemblyVersion = if ($Version -match '^\d+\.\d+\.\d+$') { "$Version.0" } else { '1.0.0.0' }
$RepoUrl = 'https://github.com/rangwalaaliasgar55-bot/Lan-Ide.git'
$ReleaseRefPs = $ReleaseRef -replace "'", "''"
$RepoUrlPs = $RepoUrl -replace "'", "''"

$InstallSource = Get-Content (Join-Path $RepoRoot 'install.ps1') -Raw
$Prelude = @"
# Embedded by LanIdeSetup.exe. Pin installs to the release that built this EXE.
`$env:LAN_IDE_REPO_URL = '$RepoUrlPs'
`$env:LAN_IDE_REF = '$ReleaseRefPs'

"@
$InstallScript = $Prelude + $InstallSource
$InstallScriptBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($InstallScript))

$Template = Get-Content (Join-Path $PSScriptRoot 'LanIdeSetup.cs.in') -Raw
$Generated = $Template.Replace('{{INSTALL_SCRIPT_BASE64}}', $InstallScriptBase64)
$Generated = $Generated.Replace('{{VERSION}}', $Version)
$Generated = $Generated.Replace('{{ASSEMBLY_VERSION}}', $AssemblyVersion)
$Generated = $Generated.Replace('{{RELEASE_REF}}', $ReleaseRef)

$OutPath = Join-Path $RepoRoot $OutDir
New-Item -ItemType Directory -Force -Path $OutPath | Out-Null
$GeneratedPath = Join-Path $OutPath 'LanIdeSetup.generated.cs'
$ExePath = Join-Path $OutPath 'LanIdeSetup.exe'
Set-Content -Path $GeneratedPath -Value $Generated -Encoding UTF8

$CscCandidates = @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$Csc = $CscCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Csc) {
    $cmd = Get-Command csc.exe -ErrorAction SilentlyContinue
    if ($cmd) { $Csc = $cmd.Source }
}
if (-not $Csc) { throw 'Could not find csc.exe. Run this on windows-latest or a Windows machine with .NET Framework.' }

$Args = @(
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    '/optimize+',
    '/r:System.dll',
    '/r:System.Drawing.dll',
    '/r:System.Windows.Forms.dll',
    "/out:$ExePath"
)
$Icon = Join-Path $RepoRoot 'scripts\lanide.ico'
if (Test-Path $Icon) { $Args += "/win32icon:$Icon" }
$Args += $GeneratedPath

& $Csc @Args
if ($LASTEXITCODE -ne 0) { throw "csc.exe failed with exit code $LASTEXITCODE" }

$Hash = Get-FileHash -Algorithm SHA256 -Path $ExePath
$ShaPath = "$ExePath.sha256"
"$($Hash.Hash.ToLowerInvariant())  LanIdeSetup.exe" | Set-Content -Path $ShaPath -Encoding ASCII

Write-Host "Built $ExePath"
Write-Host "SHA256 $($Hash.Hash)"
