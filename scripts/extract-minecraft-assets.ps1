$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$jarPath = Join-Path $projectRoot ".minecraft\versions\1.21.11\1.21.11.jar"
$outputRoot = Join-Path $projectRoot "public\minecraft"

if (-not (Test-Path -LiteralPath $jarPath)) {
    throw "Minecraft 1.21.11 client jar not found: $jarPath"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

$archive = [System.IO.Compression.ZipFile]::OpenRead($jarPath)
try {
    $entries = $archive.Entries | Where-Object {
        $_.FullName.StartsWith("assets/minecraft/") -and -not $_.FullName.EndsWith("/")
    }

    foreach ($entry in $entries) {
        $relativePath = $entry.FullName.Replace("/", [IO.Path]::DirectorySeparatorChar)
        $targetPath = Join-Path $outputRoot $relativePath
        $targetDirectory = Split-Path -Parent $targetPath
        New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $targetPath, $true)
    }

    Write-Host "Extracted $($entries.Count) Minecraft assets to $outputRoot"
}
finally {
    $archive.Dispose()
}
