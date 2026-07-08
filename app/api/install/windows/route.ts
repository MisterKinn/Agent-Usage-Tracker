import { headers } from "next/headers";

async function absoluteBaseUrl(requestUrl: string) {
  const headerStore = await headers();
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const forwardedHost = headerStore.get("x-forwarded-host");
  const host = forwardedHost ?? headerStore.get("host");

  if (host) {
    return `${forwardedProto ?? "https"}://${host}`;
  }

  const url = new URL(requestUrl);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: Request) {
  const baseUrl = await absoluteBaseUrl(request.url);
  const script = `$ErrorActionPreference = "Stop"
$BaseUrl = ${JSON.stringify(baseUrl)}
$InstallDir = Join-Path (Get-Location) ".agent-usage-tracker"

function Fail($Message) {
  Write-Host "[agent-usage-tracker] $Message" -ForegroundColor Red
  exit 1
}

function Find-Python {
  if (Get-Command py -ErrorAction SilentlyContinue) {
    return @("py", "-3")
  }
  if (Get-Command python -ErrorAction SilentlyContinue) {
    return @("python")
  }
  if (Get-Command python3 -ErrorAction SilentlyContinue) {
    return @("python3")
  }
  return $null
}

function Run-Python($PythonCommand, $ScriptPath, $ExtraArgs) {
  $exe = $PythonCommand[0]
  $prefixArgs = @()
  if ($PythonCommand.Length -gt 1) {
    $prefixArgs = $PythonCommand[1..($PythonCommand.Length - 1)]
  }
  & $exe @prefixArgs $ScriptPath @ExtraArgs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$TrackerPath = Join-Path $InstallDir "track_agent_usage.py"
$EnvPath = Join-Path $InstallDir ".env.local"
$GitignorePath = Join-Path $InstallDir ".gitignore"

Invoke-WebRequest -UseBasicParsing "$BaseUrl/tracker/track_agent_usage.py" -OutFile $TrackerPath
Invoke-WebRequest -UseBasicParsing "$BaseUrl/api/tracker-env" -OutFile $EnvPath
Set-Content -Path $GitignorePath -Encoding UTF8 -Value @(".env.local", ".tracker-config.json", ".tracker-state.json", "")

Write-Host "[agent-usage-tracker] installed minimal Python tracker to $InstallDir"

$PythonCommand = Find-Python
if ($null -eq $PythonCommand) {
  Fail "Python을 찾지 못했습니다. Python 설치 후 이 명령을 다시 실행해주세요: https://www.python.org/downloads/"
}

$ScriptArgs = @()
foreach ($arg in $args) {
  if ($arg -ne "--install-only") {
    $ScriptArgs += $arg
  }
}

if ($args -contains "--install-only") {
  Write-Host "[agent-usage-tracker] install complete. Start with:"
  Write-Host ('cd "' + $InstallDir + '"; ' + ($PythonCommand -join " ") + ' track_agent_usage.py')
  exit 0
}

Push-Location $InstallDir
try {
  Run-Python $PythonCommand $TrackerPath $ScriptArgs
}
finally {
  Pop-Location
}
`;

  return new Response(script, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
