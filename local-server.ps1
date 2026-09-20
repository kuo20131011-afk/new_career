# JobSight v3.3.80 - Windows local server + Agnes AI proxy
# 不需要 Node.js / Python / npm；Windows PowerShell 5.1+ 即可。

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Prefix = 'http://127.0.0.1:8787/'
# Agnes 國際主線若在本機發生 DNS/TLS/連線問題，官方提供的替代國際路由。
$AgnesDefaultBase = 'https://apihub.agnes-ai.com/v1'
$AgnesFallbackBase = 'https://apihub.agnes-ai.cn/v1'
$AgnesAllowedHosts = @('apihub.agnes-ai.com','apihub.agnes-ai.cn','api.agnes-ai.cn')
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$mime = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8'
  '.js'='application/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'
  '.json'='application/json; charset=utf-8'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'
  '.svg'='image/svg+xml'; '.ico'='image/x-icon'; '.txt'='text/plain; charset=utf-8'; '.md'='text/markdown; charset=utf-8'
}

function Send-Text($response, [int]$status, [string]$contentType, [string]$body) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $response.StatusCode = $status
  $response.ContentType = $contentType
  $response.ContentLength64 = $bytes.Length
  $response.Headers['Cache-Control'] = 'no-store'
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
  $response.OutputStream.Close()
}

function Send-Bytes($response, [int]$status, [string]$contentType, [byte[]]$bytes) {
  $response.StatusCode = $status
  $response.ContentType = $contentType
  $response.ContentLength64 = $bytes.Length
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
  $response.OutputStream.Close()
}

function Send-Json($response, [int]$status, $obj) {
  Send-Text $response $status 'application/json; charset=utf-8' ($obj | ConvertTo-Json -Depth 20 -Compress)
}

function Get-AgnesBaseFromRequest($request) {
  $candidate = [string]$request.Headers['X-Agnes-Base-Url']
  if ([string]::IsNullOrWhiteSpace($candidate)) { $candidate = $AgnesDefaultBase }
  $candidate = $candidate.Trim().TrimEnd('/')
  try {
    $u = New-Object System.Uri($candidate)
    if ($u.Scheme -ne 'https' -or $AgnesAllowedHosts -notcontains $u.Host) { return $AgnesDefaultBase }
    return $candidate
  } catch { return $AgnesDefaultBase }
}

function Send-AgnesModels($request, $response) {
  if ($request.HttpMethod -eq 'OPTIONS') {
    $response.StatusCode = 204
    $response.Headers['Access-Control-Allow-Origin'] = '*'
    $response.Headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    $response.Headers['Access-Control-Allow-Headers'] = 'X-Agnes-Api-Key, X-Agnes-Base-Url, Content-Type'
    $response.OutputStream.Close(); return
  }
  if ($request.HttpMethod -ne 'GET') { Send-Json $response 405 @{ error=@{ message='Method not allowed' } }; return }
  $key = [string]$request.Headers['X-Agnes-Api-Key']
  if ([string]::IsNullOrWhiteSpace($key)) { Send-Json $response 401 @{ error=@{ message='缺少 Agnes API Key' } }; return }
  $base = Get-AgnesBaseFromRequest $request
  $targets = @($base + '/models')
  if ($base -eq $AgnesDefaultBase) { $targets += $AgnesFallbackBase + '/models' }
  try {
    Add-Type -AssemblyName System.Net.Http
    foreach ($target in $targets) {
      $client=$null; $httpReq=$null; $httpResp=$null
      try {
        $client=New-Object System.Net.Http.HttpClient
        $client.Timeout=[TimeSpan]::FromSeconds(30)
        $httpReq=New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get,$target)
        $httpReq.Headers.Authorization=New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer',$key)
        $httpResp=$client.SendAsync($httpReq).GetAwaiter().GetResult()
        $out=$httpResp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if ($httpResp.IsSuccessStatusCode -or $target -eq $targets[-1]) {
          Send-Text $response ([int]$httpResp.StatusCode) 'application/json; charset=utf-8' $out; return
        }
      } catch {
        if ($target -eq $targets[-1]) { throw }
      } finally {
        if($httpReq){$httpReq.Dispose()}; if($httpResp){$httpResp.Dispose()}; if($client){$client.Dispose()}
      }
    }
  } catch { Send-Json $response 502 @{ error=@{ message=('Agnes models 本機 Proxy 連線失敗：' + $_.Exception.Message); type='upstream_network_error' } } }
}

function Handle-Agnes($request, $response) {
  if ($request.HttpMethod -eq 'OPTIONS') {
    $response.StatusCode = 204
    $response.Headers['Access-Control-Allow-Origin'] = '*'
    $response.Headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    $response.Headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Agnes-Api-Key, X-Agnes-Base-Url'
    $response.OutputStream.Close(); return
  }
  if ($request.HttpMethod -ne 'POST') { Send-Json $response 405 @{ error=@{ message='Method not allowed' } }; return }
  $key=[string]$request.Headers['X-Agnes-Api-Key']
  if([string]::IsNullOrWhiteSpace($key)){ Send-Json $response 401 @{ error=@{message='缺少 Agnes API Key'} }; return }
  $reader=New-Object System.IO.StreamReader($request.InputStream,[System.Text.Encoding]::UTF8)
  $body=$reader.ReadToEnd(); $reader.Dispose()
  if([string]::IsNullOrWhiteSpace($body)){ Send-Json $response 400 @{error=@{message='Agnes proxy 收到空的 JSON'}}; return }
  $base=Get-AgnesBaseFromRequest $request
  $targets=@($base + '/chat/completions')
  if($base -eq $AgnesDefaultBase){ $targets += $AgnesFallbackBase + '/chat/completions' }
  try {
    Add-Type -AssemblyName System.Net.Http
    foreach($target in $targets){
      $client=$null; $httpReq=$null; $httpResp=$null
      try {
        $client=New-Object System.Net.Http.HttpClient
        $client.Timeout=[TimeSpan]::FromSeconds(60)
        $httpReq=New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post,$target)
        $httpReq.Headers.Authorization=New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer',$key)
        $httpReq.Content=New-Object System.Net.Http.StringContent($body,[System.Text.Encoding]::UTF8,'application/json')
        $httpResp=$client.SendAsync($httpReq).GetAwaiter().GetResult()
        $out=$httpResp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $status=[int]$httpResp.StatusCode
        # 只有網路/DNS/TLS 類失敗才換替代路由；401/403/429/400 等 API 回應不切路由。
        if($httpResp.IsSuccessStatusCode -or $status -in @(400,401,403,404,422,429,500,501,502,503,504) -or $target -eq $targets[-1]) {
          Send-Text $response $status 'application/json; charset=utf-8' $out; return
        }
      } catch {
        if($target -eq $targets[-1]) { throw }
      } finally {
        if($httpReq){$httpReq.Dispose()}; if($httpResp){$httpResp.Dispose()}; if($client){$client.Dispose()}
      }
    }
  } catch {
    Send-Json $response 502 @{error=@{message=('Agnes API 本機 Proxy 連線失敗：'+$_.Exception.Message);type='upstream_network_error';baseUrl=$base}}
  }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($Prefix)
try { $listener.Start() } catch {
  Write-Host '無法啟動本機伺服器。請確認 8787 埠沒有被其他程式使用。' -ForegroundColor Red
  Read-Host '按 Enter 結束'
  exit 1
}

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ' JobSight v3.3.81 本機模式已啟動' -ForegroundColor Cyan
Write-Host ' 網址：http://127.0.0.1:8787/' -ForegroundColor Green
Write-Host ' Agnes：本機 Proxy -> Agnes API' -ForegroundColor Green
Write-Host ' 關閉視窗即可停止伺服器' -ForegroundColor Yellow
Write-Host '============================================' -ForegroundColor Cyan
Start-Process 'http://127.0.0.1:8787/'

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $req = $ctx.Request; $resp = $ctx.Response
      $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
      if ($path -eq '/api/agnes') { Handle-Agnes $req $resp; continue }
      if ($path -eq '/api/agnes/models') { Send-AgnesModels $req $resp; continue }
      if ($req.HttpMethod -eq 'OPTIONS') {
        $resp.StatusCode=204; $resp.Headers['Access-Control-Allow-Origin']='*'; $resp.Headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS'; $resp.OutputStream.Close(); continue
      }
      if ($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD') { Send-Text $resp 405 'text/plain; charset=utf-8' 'Method not allowed'; continue }
      if ($path -eq '/') { $path='/index.html' }
      $relative = $path.TrimStart('/').Replace('/', '\\')
      $full = [System.IO.Path]::GetFullPath((Join-Path $Root $relative))
      $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\\') + '\\'
      if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
        Send-Text $resp 404 'text/plain; charset=utf-8' 'Not Found'; continue
      }
      $ext=[System.IO.Path]::GetExtension($full).ToLowerInvariant(); $ct=$mime[$ext]; if (-not $ct){$ct='application/octet-stream'}
      $bytes=[System.IO.File]::ReadAllBytes($full)
      if ($req.HttpMethod -eq 'HEAD') { $resp.StatusCode=200; $resp.ContentType=$ct; $resp.ContentLength64=$bytes.Length; $resp.OutputStream.Close() }
      else { Send-Bytes $resp 200 $ct $bytes }
    } catch {
      try { Send-Text $ctx.Response 500 'text/plain; charset=utf-8' ('Local server error: ' + $_.Exception.Message) } catch {}
    }
  }
} finally { $listener.Stop(); $listener.Close() }
