<#
.SYNOPSIS
    One-click multi-IDE installer for Enfusion Engine SDK MCP server.

.DESCRIPTION
    Configures the Enfusion MCP server across all supported AI coding agents,
    IDEs, and extensions on Windows, macOS, or Linux.
    Supports interactive console checklist, GUI dialog (-Gui), and automated flags.

.PARAMETER All
    Install into all supported clients without prompting.

.PARAMETER Detected
    Install into all automatically detected clients without prompting.

.PARAMETER Gui
    Open a graphical Windows Forms multi-select dialog.

.PARAMETER DryRun
    Preview configuration changes without modifying files.

.PARAMETER Select
    Comma-separated list of client IDs to install into.

.EXAMPLE
    .\install.ps1
    Interactive console checklist.

.EXAMPLE
    .\install.ps1 -Gui
    Graphical checkbox selection dialog.

.EXAMPLE
    .\install.ps1 -Detected
    Install into all detected IDEs silently.
#>

[CmdletBinding()]
param(
    [switch]$All,
    [switch]$Detected,
    [switch]$Gui,
    [switch]$DryRun,
    [string[]]$Select
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

# Verify Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "[ERROR] Node.js is required. Please install Node.js v22+ from https://nodejs.org/"
    return
}

# Ensure dist/server.cjs exists
if (-not (Test-Path "$PSScriptRoot\dist\server.cjs")) {
    Write-Host "[INFO] Building Enfusion MCP server..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[ERROR] Build failed."
        return
    }
}

# Check if GUI mode requested
if ($Gui -and ($IsWindows -or $env:OS -like "*Windows*")) {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing

        $homeDir = [Environment]::GetFolderPath('UserProfile')
        $appData = $env:APPDATA
        if (-not $appData) { $appData = "$homeDir\AppData\Roaming" }

        # Query client list from Node script
        $clientsJson = node -e "import('./scripts/installer.mjs').then(m => { console.log(JSON.stringify(m.CLIENT_REGISTRY)); })"
        $clients = ConvertFrom-Json $clientsJson

        # Create Form
        $form = New-Object System.Windows.Forms.Form
        $form.Text = "Enfusion Engine SDK MCP - Multi-IDE Installer"
        $form.Size = New-Object System.Drawing.Size(620, 520)
        $form.StartPosition = "CenterScreen"
        $form.FormBorderStyle = "FixedDialog"
        $form.MaximizeBox = $false

        # Header Label
        $header = New-Object System.Windows.Forms.Label
        $header.Location = New-Object System.Drawing.Point(20, 15)
        $header.Size = New-Object System.Drawing.Size(560, 40)
        $header.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
        $header.Text = "Select the IDEs and AI coding agents where you want to install Enfusion MCP:`n(Detected tools are pre-selected by default)"
        $form.Controls.Add($header)

        # CheckedListBox
        $listBox = New-Object System.Windows.Forms.CheckedListBox
        $listBox.Location = New-Object System.Drawing.Point(20, 65)
        $listBox.Size = New-Object System.Drawing.Size(560, 310)
        $listBox.CheckOnClick = $true
        $listBox.Font = New-Object System.Drawing.Font("Segoe UI", 9)

        $clientMap = @{}
        $i = 0
        foreach ($c in $clients) {
            # Check detection
            $isDet = $false
            if ($c.id -eq 'claude-code') { $isDet = Test-Path "$homeDir\.claude" }
            elseif ($c.id -eq 'codex') { $isDet = Test-Path "$homeDir\.codex" }
            elseif ($c.id -eq 'claude-desktop') { $isDet = Test-Path "$appData\Claude" }
            elseif ($c.id -eq 'cursor') { $isDet = (Test-Path "$homeDir\.cursor") -or (Test-Path "$appData\Cursor") }
            elseif ($c.id -eq 'windsurf') { $isDet = Test-Path "$homeDir\.codeium\windsurf" }
            elseif ($c.id -eq 'vscode-cline') { $isDet = Test-Path "$appData\Code\User\globalStorage\saoudrizwan.claude-dev" }
            elseif ($c.id -eq 'vscode-roo') { $isDet = Test-Path "$appData\Code\User\globalStorage\rooveterinaryinc.roo-cline" }
            elseif ($c.id -eq 'continue') { $isDet = Test-Path "$homeDir\.continue" }
            elseif ($c.id -eq 'antigravity') { $isDet = Test-Path "$homeDir\.gemini\antigravity" }
            elseif ($c.id -eq 'zed') { $isDet = (Test-Path "$appData\Zed") -or (Test-Path "$homeDir\.config\zed") }
            elseif ($c.id -eq 'enfusion-config') { $isDet = Test-Path "$homeDir\.config\enfusion-mcp" }

            $tag = if ($isDet) { " [DETECTED]" } else { "" }
            $displayText = "$($c.name)$tag - $($c.description)"
            [void]$listBox.Items.Add($displayText)
            $clientMap[$i] = $c.id
            if ($isDet) {
                $listBox.SetItemChecked($i, $true)
            }
            $i++
        }
        $form.Controls.Add($listBox)

        # Select All Button
        $btnAll = New-Object System.Windows.Forms.Button
        $btnAll.Location = New-Object System.Drawing.Point(20, 390)
        $btnAll.Size = New-Object System.Drawing.Size(100, 30)
        $btnAll.Text = "Select All"
        $btnAll.Add_Click({
            for ($k = 0; $k -lt $listBox.Items.Count; $k++) { $listBox.SetItemChecked($k, $true) }
        })
        $form.Controls.Add($btnAll)

        # Select Detected Button
        $btnDet = New-Object System.Windows.Forms.Button
        $btnDet.Location = New-Object System.Drawing.Point(130, 390)
        $btnDet.Size = New-Object System.Drawing.Size(120, 30)
        $btnDet.Text = "Select Detected"
        $btnDet.Add_Click({
            for ($k = 0; $k -lt $listBox.Items.Count; $k++) {
                $itemText = $listBox.Items[$k].ToString()
                $listBox.SetItemChecked($k, $itemText.Contains("[DETECTED]"))
            }
        })
        $form.Controls.Add($btnDet)

        # Clear All Button
        $btnClear = New-Object System.Windows.Forms.Button
        $btnClear.Location = New-Object System.Drawing.Point(260, 390)
        $btnClear.Size = New-Object System.Drawing.Size(100, 30)
        $btnClear.Text = "Clear All"
        $btnClear.Add_Click({
            for ($k = 0; $k -lt $listBox.Items.Count; $k++) { $listBox.SetItemChecked($k, $false) }
        })
        $form.Controls.Add($btnClear)

        # Install Button
        $btnInstall = New-Object System.Windows.Forms.Button
        $btnInstall.Location = New-Object System.Drawing.Point(380, 430)
        $btnInstall.Size = New-Object System.Drawing.Size(110, 35)
        $btnInstall.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
        $btnInstall.Text = "Install"
        $btnInstall.DialogResult = [System.Windows.Forms.DialogResult]::OK
        $form.Controls.Add($btnInstall)

        # Cancel Button
        $btnCancel = New-Object System.Windows.Forms.Button
        $btnCancel.Location = New-Object System.Drawing.Point(500, 430)
        $btnCancel.Size = New-Object System.Drawing.Size(80, 35)
        $btnCancel.Text = "Cancel"
        $btnCancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
        $form.Controls.Add($btnCancel)

        $form.AcceptButton = $btnInstall
        $form.CancelButton = $btnCancel

        $dialogResult = $form.ShowDialog()
        if ($dialogResult -eq [System.Windows.Forms.DialogResult]::OK) {
            $selectedIds = @()
            for ($k = 0; $k -lt $listBox.Items.Count; $k++) {
                if ($listBox.GetItemChecked($k)) {
                    $selectedIds += $clientMap[$k]
                }
            }

            if ($selectedIds.Count -eq 0) {
                Write-Host "No clients selected. Exiting." -ForegroundColor Yellow
                return
            }

            $selectArg = $selectedIds -join ','
            $nodeArgs = @("scripts/installer.mjs", "--select", $selectArg)
            if ($DryRun) { $nodeArgs += "--dry-run" }
            & node @nodeArgs
            return
        } else {
            Write-Host "Installation cancelled." -ForegroundColor Yellow
            return
        }
    } catch {
        Write-Warning "Could not launch GUI ($($_.Exception.Message)). Falling back to console installer..."
    }
}

# Console Mode
$nodeArgs = @("scripts/installer.mjs")
if ($All) { $nodeArgs += "--all" }
elseif ($Detected) { $nodeArgs += "--detected" }
elseif ($Select -and $Select.Count -gt 0) {
    $nodeArgs += @("--select", ($Select -join ','))
}

if ($DryRun) { $nodeArgs += "--dry-run" }

& node @nodeArgs
