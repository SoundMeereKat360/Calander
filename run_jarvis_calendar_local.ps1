$env:PORT = "5000"
$env:NODE_ENV = "development"

if (-not $env:AI_LOCAL_LLM_API_KEY) { $env:AI_LOCAL_LLM_API_KEY = "EMPTY" }
if (-not $env:AI_LOCAL_LLM_API_BASE) { $env:AI_LOCAL_LLM_API_BASE = "http://127.0.0.1:11434/v1" }
if (-not $env:AI_LOCAL_LLM_MODEL) { $env:AI_LOCAL_LLM_MODEL = "qwen3:32b" }
if (-not $env:AI_LOCAL_LLM_TIMEOUT_SECONDS) { $env:AI_LOCAL_LLM_TIMEOUT_SECONDS = "240" }
if (-not $env:CALENDAR_FEED_TOKEN) { $env:CALENDAR_FEED_TOKEN = "local-dev-feed-token" }

Write-Host "Jarvis Calendar local model=$($env:AI_LOCAL_LLM_MODEL)"
Write-Host "Jarvis Calendar local base=$($env:AI_LOCAL_LLM_API_BASE)"
Write-Host "Jarvis Calendar local timeout=$($env:AI_LOCAL_LLM_TIMEOUT_SECONDS)s"
Write-Host "Jarvis Calendar port=$($env:PORT)"

npm run build
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

npm start
