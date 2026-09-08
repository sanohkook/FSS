#!/bin/bash
# 인천 물때 예약판 — 예약현황 자동 갱신 (맥 로컬, launchd 6시간마다 권장)
#   npm run scrape 로 예약 사이트를 직접 조회해 data/avail.json 갱신.
#   로컬 웹서버(npm start)는 매 요청 시 data/avail.json 을 읽으므로 재시작 불필요.
# 로그: update_avail.log

set -u
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

LOG="update_avail.log"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

log "=== 시작 ==="
if npm run --silent scrape >> "$LOG" 2>&1; then
  log "완료"
else
  log "실패 (rc=$?)"
fi
log "=== 끝 ==="
