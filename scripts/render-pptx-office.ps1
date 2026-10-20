param(
  [Parameter(Mandatory=$true)][string]$InputPptx,
  [Parameter(Mandatory=$true)][string]$OutputPng,
  [int]$Width=2752,
  [int]$Height=1536
)
$ErrorActionPreference='Stop'
$sourcePath=(Resolve-Path -LiteralPath $InputPptx).Path
$targetPath=[IO.Path]::GetFullPath($OutputPng)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($targetPath)) | Out-Null
$officeApp=$null
$presentation=$null
try {
  $officeApp=New-Object -ComObject PowerPoint.Application
  $presentation=$officeApp.Presentations.Open($sourcePath,$true,$false,$false)
  $presentation.Slides.Item(1).Export($targetPath,'PNG',$Width,$Height)
  if(!(Test-Path -LiteralPath $targetPath)){throw 'PowerPoint did not produce the render'}
  Write-Output "PowerPoint rendered: $targetPath"
} finally {
  if($presentation){$presentation.Close();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation)}
  if($officeApp){$officeApp.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($officeApp)}
}
