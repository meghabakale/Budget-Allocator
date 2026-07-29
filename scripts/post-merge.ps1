# post-merge.ps1 — Windows PowerShell equivalent of post-merge.sh
# Run after pulling/merging changes that may include dependency or schema updates.
$ErrorActionPreference = "Stop"

Write-Host "Installing dependencies..."
pnpm install --frozen-lockfile

Write-Host "Pushing database schema..."
pnpm --filter db push

Write-Host "Post-merge setup complete."
