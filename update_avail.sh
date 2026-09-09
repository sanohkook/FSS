#!/bin/bash
# 예약현황 자동 갱신 (맥 로컬). launchd 가 1시간마다 실행.
#   1) npm run scrape → data/avail.json 갱신
#   2) 그 파일 하나만 담은 커밋을 만들어 원격 'avail' 브랜치에 force-push
#      (working tree / main 브랜치는 건드리지 않음, 히스토리는 항상 1커밋)
# 앱은 https://raw.githubusercontent.com/sanohkook/FSS/avail/avail.json 를 로딩 시 받아온다.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

LOG="update_avail.log"
exec >>"$LOG" 2>&1
echo "=== $(date '+%F %T') 시작 ==="

npm run --silent scrape

BLOB=$(git hash-object -w data/avail.json)
TREE=$(printf '100644 blob %s\tavail.json\n' "$BLOB" | git mktree)
COMMIT=$(git commit-tree "$TREE" -m "avail $(date -u +%FT%TZ)")
git push -f origin "$COMMIT:refs/heads/avail"

echo "=== 완료: avail=$COMMIT ==="
