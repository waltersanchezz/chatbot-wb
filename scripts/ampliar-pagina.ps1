<#
.SYNOPSIS
Recorta y amplia una region de una pagina del catalogo Willard para poder cotejarla.

.DESCRIPTION
Las fotografias del catalogo llegan a resoluciones bajas (575x1024 a 899x1599) para tablas
de hasta 40 filas y 5 columnas. Leerlas completas no alcanza para distinguir la letra de
polaridad (48D contra 48I) ni para decidir a que fila pertenece cada valor, porque el texto
esta impreso desfasado respecto a las lineas de la tabla.

Este script recorta un bloque y lo amplia con interpolacion bicubica, que es lo que permitio
cotejar la pagina 12 y cerrar el 80 % de sus filas. No modifica la imagen original: escribe
los recortes en una carpeta temporal.

Requiere Windows (usa System.Drawing de .NET).

.PARAMETER Pagina
Numero de pagina del lote 1, de 1 a 29. Resuelve a data/catalogo-willard/lote1/lote1-img-NN.jpeg.

.PARAMETER Y
Coordenada vertical donde empieza el recorte, en pixeles de la imagen original.

.PARAMETER Alto
Alto del recorte en pixeles. Un bloque de marca suele medir entre 60 y 250.

.PARAMETER X
Coordenada horizontal donde empieza el recorte. Por defecto 0, el borde izquierdo.

.PARAMETER Ancho
Ancho del recorte. Por defecto 0, que significa hasta el borde derecho.

.PARAMETER Zoom
Factor de ampliacion. 4 sirve para ubicar un bloque, 8 a 12 para leer la polaridad.

.PARAMETER Nombre
Sufijo del archivo de salida, para no sobrescribir recortes anteriores.

.EXAMPLE
./scripts/ampliar-pagina.ps1 -Pagina 19 -Y 200 -Alto 250 -Zoom 4 -Nombre toyota
Amplia el bloque TOYOTA de la pagina 19 a 4x.

.EXAMPLE
./scripts/ampliar-pagina.ps1 -Pagina 19 -Y 400 -Alto 120 -X 450 -Ancho 300 -Zoom 10 -Nombre polaridad
Amplia solo las columnas Willard y Extrema a 10x para distinguir D de I.

.OUTPUTS
La ruta del PNG generado y sus dimensiones. Tambien imprime el tamano de la imagen original,
que es el sistema de coordenadas al que se refieren -X, -Y, -Ancho y -Alto.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateRange(1, 29)][int]$Pagina,
  [Parameter(Mandatory = $true)][int]$Y,
  [Parameter(Mandatory = $true)][int]$Alto,
  [int]$X = 0,
  [int]$Ancho = 0,
  [ValidateRange(1, 20)][double]$Zoom = 6,
  [string]$Nombre = 'recorte'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
$origen = Join-Path $raiz ('data/catalogo-willard/lote1/lote1-img-{0:d2}.jpeg' -f $Pagina)

if (-not (Test-Path $origen)) {
  throw "No existe la imagen de la pagina $Pagina en $origen"
}

$salidaDir = Join-Path $env:TEMP 'willard-cotejo'
New-Item -ItemType Directory -Force -Path $salidaDir | Out-Null
$salida = Join-Path $salidaDir ('p{0:d2}-{1}.png' -f $Pagina, $Nombre)

$img = [System.Drawing.Image]::FromFile($origen)
try {
  Write-Output ('original: {0}x{1}' -f $img.Width, $img.Height)

  # Recortar sin salirse de la imagen: es mas util devolver el bloque disponible que fallar.
  $x0 = [Math]::Max(0, [Math]::Min($X, $img.Width - 1))
  $y0 = [Math]::Max(0, [Math]::Min($Y, $img.Height - 1))
  $w = if ($Ancho -le 0) { $img.Width - $x0 } else { [Math]::Min($Ancho, $img.Width - $x0) }
  $h = [Math]::Min($Alto, $img.Height - $y0)

  $recorte = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($recorte)
  try {
    $destino = New-Object System.Drawing.Rectangle 0, 0, $w, $h
    $fuente = New-Object System.Drawing.Rectangle $x0, $y0, $w, $h
    $g.DrawImage($img, $destino, $fuente, [System.Drawing.GraphicsUnit]::Pixel)
  }
  finally { $g.Dispose() }

  $ampliada = New-Object System.Drawing.Bitmap ([int]($w * $Zoom)), ([int]($h * $Zoom))
  $g2 = [System.Drawing.Graphics]::FromImage($ampliada)
  try {
    $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g2.DrawImage($recorte, 0, 0, $ampliada.Width, $ampliada.Height)
  }
  finally { $g2.Dispose() }

  $ampliada.Save($salida, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output ('recorte: x={0} y={1} w={2} h={3} zoom={4}' -f $x0, $y0, $w, $h, $Zoom)
  Write-Output ('salida: {0} ({1}x{2})' -f $salida, $ampliada.Width, $ampliada.Height)

  $recorte.Dispose()
  $ampliada.Dispose()
}
finally { $img.Dispose() }
