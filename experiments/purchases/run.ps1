param(
    [ValidateSet('2','3','4')][string]$Round = '2',
    [ValidateSet('development','holdout','all')][string]$Split = 'holdout',
    [ValidateRange(1,5)][int]$Repeats = 2
)
$ErrorActionPreference = 'Stop'
$experimentRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$modelDirectory = Join-Path $experimentRoot 'tmp\ocr-research\models'
$resultDirectory = Join-Path $experimentRoot 'tmp\ocr-battery'
$experimentScript = 'battery.py'
$variants = @('baseline','upscale','cells')
if ($Round -ne '2') {
    if ($Split -eq 'all') { throw 'Esta batería exige elegir desarrollo o holdout por separado.' }
    $resultFolder = if ($Split -eq 'development') { "tmp\ocr-round$Round-dev" } else { "tmp\ocr-round$Round" }
    $resultDirectory = Join-Path $experimentRoot $resultFolder
    $experimentScript = "round$Round.py"
    $variants = if ($Round -eq '3') { @('baseline','tight','consensus') } else { @('baseline','structured','verified') }
}
if (-not (Test-Path -LiteralPath $modelDirectory -PathType Container)) {
    throw 'Faltan pesos locales. Ejecuta la preparación explícita de Docs/INVESTIGACION-EXTRACCION-COMPRAS.md.'
}
New-Item -ItemType Directory -Force -Path $resultDirectory | Out-Null
$experimentImage = "localhost/cenit-ocr-research:battery$Round"
podman build -f "$PSScriptRoot\Containerfile" -t $experimentImage $PSScriptRoot
if ($LASTEXITCODE -ne 0) { throw 'Falló la construcción del entorno experimental.' }
foreach ($variant in $variants) {
    podman run --rm --network none --cpus 1 --memory 1g `
      -v "${resultDirectory}:/results" `
      -v "${modelDirectory}:/opt/research/lib/python3.11/site-packages/rapidocr/models:ro" `
      $experimentImage python $experimentScript --variant $variant --split $Split --repeats $Repeats --output /results
    if ($LASTEXITCODE -ne 0) { throw "Falló el ensayo $variant." }
}
Write-Output "Reportes completos: $resultDirectory"
