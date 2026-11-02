# Lance « Form Travail (direct) » : l'appli complète, avec ses données de Form Travail, qui se met à jour toute seule à chaque
# modification du code (interface : en une seconde ; partie Windows : recompilation de quelques minutes).
# Ne pas lancer en même temps que la Form Travail installée : elles partagent la même base de données.
#
# La compilation se range sur le disque D: (elle pèse plusieurs dizaines de Go).

$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$env:CARGO_TARGET_DIR = 'D:\form-build\target'
$env:CARGO_HOME = 'D:\form-build\cargo'
New-Item -ItemType Directory -Force $env:CARGO_TARGET_DIR, $env:CARGO_HOME | Out-Null

Set-Location (Split-Path -Parent $PSScriptRoot)
npm run tauri dev -- --config dev.conf.json
