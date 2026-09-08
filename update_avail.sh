#!/bin/bash
# 인천 물때 예약판 — 예약현황 자동 갱신 (맥 로컬, launchd 6시간마다)
#   1) scrape_avail.py 로 3개 예약 사이트 조회 → 인천물때예약판.html / avail.js 갱신
#   2) 변경 있으면 git commit & push
#   3) claude -p 로 아티팩트 재게시
# 로그: update_avail.log

set -u
cd "$(dirname "$0")" || exit 1
export PATH="/Users/sanoh/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

ART_URL="https://claude.ai/code/artifact/e2193037-3780-4640-a0b2-04388715595a"
HTML="인천물때예약판.html"
LOG="update_avail.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

log "=== 시작 ==="

# 1) 스크레이프
if ! python3 scrape_avail.py >> "$LOG" 2>&1; then
  log "scrape_avail.py 실패(수집 0건 등) — 종료"
  log "=== 끝 (변경 없음) ==="
  exit 0
fi

# 2) 변경 확인
if [ -z "$(git status --porcelain)" ]; then
  log "변경 없음 — 종료"
  log "=== 끝 ==="
  exit 0
fi

log "변경 감지 → 커밋/푸시"
git add -A
git commit -q -m "예약현황 자동 갱신 $(date '+%Y-%m-%d %H:%M')" >> "$LOG" 2>&1
if git push origin main >> "$LOG" 2>&1; then
  log "push 완료"
else
  log "push 실패 (계속 진행)"
fi

# 3) 아티팩트 재게시
log "아티팩트 재게시 시도"
PROMPT="Artifact 도구로 다음을 수행: (1) action=read, url=${ART_URL} 로 현재 아티팩트를 읽는다. (2) action=publish, file_path=\"$(pwd)/${HTML}\", url=${ART_URL}, label=\"예약현황 자동 갱신\" 로 로컬 파일을 그대로 재게시한다. 파일 내용은 수정하지 말 것. 결과는 성공/실패 한 줄로만 보고."
if claude -p "$PROMPT" --dangerously-skip-permissions >> "$LOG" 2>&1; then
  log "재게시 완료"
else
  log "재게시 실패 (rc=$?)"
fi

log "=== 끝 ==="
