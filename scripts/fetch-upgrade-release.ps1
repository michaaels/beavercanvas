param([string]$Destination = '.dev/published-upgrade-baseline')
$ErrorActionPreference = 'Stop'
$baseline = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot '../dev/ci/published-upgrade-baseline.json') | ConvertFrom-Json
$directory = [IO.Path]::GetFullPath($Destination)
[IO.Directory]::CreateDirectory($directory) | Out-Null
$archive = Join-Path $directory ([IO.Path]::GetFileName(([Uri]$baseline.url).AbsolutePath))
if (!(Test-Path -LiteralPath $archive)) {
    Invoke-WebRequest -Uri $baseline.url -OutFile $archive
}
$actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $baseline.sha256) { throw "Published baseline checksum mismatch: $actual" }
Write-Output $archive
