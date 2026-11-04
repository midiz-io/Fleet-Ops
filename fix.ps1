$dir = "c:\Github projects\Vehicle Maintance\artifacts\fleet-pwa\src"
$files = Get-ChildItem -Path $dir -Recurse -Include *.tsx,*.ts,*.tsx
$utf8NoBom = New-Object System.Text.UTF8Encoding $False

foreach ($file in $files) {
    $content = [System.IO.File]::ReadAllText($file.FullName)
    $original = $content
    $content = $content.Replace("â€”", "-")
    $content = $content.Replace("â€¢", "•")
    $content = $content.Replace("âš ", "⚠️")
    $content = $content.Replace("âœ“", "✓")
    $content = $content.Replace("â†’", "→")
    $content = $content.Replace("â °", "⏰")
    $content = $content.Replace("Â·", "·")
    $content = $content.Replace("â”€", "-")
    $content = $content.Replace("âœ•", "✕")
    $content = $content.Replace("Â", "")
    $content = $content.Replace("â€“", "-")
    $content = $content.Replace("NestlÃ©", "Nestlé")
    
    if ($original -ne $content) {
        [System.IO.File]::WriteAllText($file.FullName, $content, $utf8NoBom)
        Write-Host "Fixed $($file.FullName)"
    }
}
