param([string]$ModelsPath = 'tmp/ocr-research/models')
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$sourceModels = (Resolve-Path $ModelsPath).Path
$targetModels = Join-Path $repoRoot 'apps/ocr/models'
$expected = @{
  'ch_PP-OCRv5_det_mobile.onnx' = '4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae'
  'latin_PP-OCRv5_rec_mobile.onnx' = 'b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a'
}
foreach ($name in $expected.Keys) {
  if ((Get-FileHash -LiteralPath (Join-Path $sourceModels $name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected[$name]) { throw "Hash de modelo incompatible: $name" }
}
New-Item -ItemType Directory -Force -Path $targetModels | Out-Null
foreach ($name in $expected.Keys) { Copy-Item -LiteralPath (Join-Path $sourceModels $name) -Destination (Join-Path $targetModels $name) }
Push-Location $repoRoot
try {
  # Preserve an existing key: changing it invalidates pending capture receipts.
  @'
import {mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
mkdirSync('.local/secrets',{recursive:true,mode:448});
const file='.local/secrets/capture-receipt-key';
if(!existsSync(file))writeFileSync(file,randomBytes(32),{flag:'wx',mode:384});
'@ | node --input-type=module
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar el secreto privado.' }
  podman build --platform linux/amd64 -f apps/ocr/Containerfile -t localhost/cenit-ocr:adapter1 apps/ocr
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo construir OCR.' }
} finally { Pop-Location }
Write-Output 'OCR preparado. Inicio explicito: podman compose --profile ocr up -d ocr'
