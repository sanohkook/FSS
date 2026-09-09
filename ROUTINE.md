# 인천 물때 예약판 — 운영 안내

정적 아티팩트에서 **맥 로컬 웹서버**로 전환됨. 예약 사이트는 서버가 직접 조회한다.

## 실행

```bash
npm install      # 최초 1회 (express)
npm start        # http://localhost:3300
```

- 물때·조류: `data/tide.json` — **국립해양조사원(KHOA) 인천 조석예보** 기반. 2026–2027 전량 번들.
  - 재생성: `npm run tide` → `server/importKhoa.js` 가 `khoa/incheon_*.xls` 24개월을 읽어
    날짜별 조석(고/저 시각·조위), 조류 세기 %(그날 조차를 ±14일 구간 최소~최대로 정규화),
    물때(음력일 `n=(음력일+6)%15`, 0→무시·14→조금)를 계산.
  - 새 xls 는 KHOA 조석예보 페이지에서 월별 다운로드해 `khoa/` 에 넣는다. (2028년 이후는 추산값)
  - 대안: `npm run tide:badatime` (바다타임 파싱, 비영리 개인용). `server/refreshTide.js` 에 KHOA OpenAPI(`--khoa`, `KHOA_KEY` 필요) 경로도 있음.
- 예약 현황: `data/avail.json` (스크레이프 캐시, git 무시).

## 예약 현황 갱신

**맥(스크레이핑) → git `avail` 브랜치 → 앱** 구조. 예약 사이트 접속은 맥에서만(클라우드 프록시 차단).

- **한 번 갱신**: `npm run sync` → 스크레이프 후 `data/avail.json` 하나만 담은 커밋을
  원격 **`avail` 브랜치**에 force-push (working tree/main 안 건드림, 히스토리 1커밋 고정).
- **1시간마다 자동** — 둘 중 하나:
  1. `FSS_SYNC=1 npm start` — 웹서버 + 1시간 갱신 루프를 한 프로세스로. **터미널/`tmux` 에서 실행 후 그대로 둠** (권장, git 자격증명이 확실히 붙음).
  2. `npm run sync:watch` — 갱신 루프만.
  3. `launchd/com.fss.avail.plist` 등록 (아래). 단, `git push` 가 headless 라
     `credential.helper` 설정이 되어 있어야 함 — 안 되면 즉시 실패하고 `sync.log` 에 기록.

  ```bash
  cp launchd/com.fss.avail.plist ~/Library/LaunchAgents/
  launchctl load   ~/Library/LaunchAgents/com.fss.avail.plist   # RunAtLoad 로 즉시 1회 + 1시간마다
  launchctl unload ~/Library/LaunchAgents/com.fss.avail.plist
  # 로그: sync.log
  ```

- **맥 웹서버**는 로컬 `data/avail.json` 을 직접 읽는다 — 그대로.
- **안드로이드 앱**: 실행 시 `https://raw.githubusercontent.com/sanohkook/FSS/avail/avail.json`
  을 받아온다(작은 JSON, 스크레이핑 아님). 실패하면 마지막 캐시 유지.
  화면의 **`Refresh` 버튼**은 앱이 직접 풀스크레이핑(`Scrape.refreshAll`) — 맥이 꺼져 있어도 최신.

## 사이트 추가 / 삭제

보드 → `설정 · 배 추가`. URL 을 넣으면 호스트로 종류를 판별한다.

| 종류 | 예 | 배별 인원 조회 |
|---|---|---|
| `xe` | 칸피싱·제일낚시·팀만수·아라호 등 XpressEngine `mid=bk` | O (코드) |
| `sunsang` | 동양낚시 등 `*.sunsang24.com` | O (코드) |
| `recipe` | 그 외 — 추가 시 AI가 파싱 규칙 1회 생성 | O (코드, 규칙은 저장) |
| `generic` | AI 실패 또는 `ANTHROPIC_API_KEY` 없음 | X (예약 현황 열에 링크만) |

**AI 파싱 레시피:** 알 수 없는 플랫폼을 추가하면 `server/scrape/ai.js` 가 Claude(`ANTHROPIC_API_KEY` 필요)로
페이지를 1회 분석해 정규식 레시피(`recipe`)를 만들어 `data/sites.json` 에 저장한다.
이후 모든 조회는 `server/scrape/recipe.js` 가 토큰 없이 처리한다.
키가 없으면 그 사이트는 링크 전용(X 표시)으로 추가된다.

설정은 `data/sites.json` 에 저장된다.

## 파싱 규칙 (참고)

- **xe**: 월 목록 페이지 + `_module.new.list.more.php` 페이지네이션.
  날짜 구간(`<a name="YYYYMMDD">`) 안 배마다
  `admin-right-YYYYMMDD-{PA_N_UID}-0` div 의 `<img alt>`:
  `예약완료`→마감 / `남은자리 N명`→잔여 N (≤3 임박) / `배정비일`→미운항.
- **sunsang**: `schedule_fleet/YYYYMM` 의 `ship_unit_ship_no_*` 블록.
  `예약마감`→마감, `남은자리 N명 … 예약/M명`→잔여 N·정원 N+M.
- 3개 사이트 모두 0건이면 기존 `avail.json` 유지.
