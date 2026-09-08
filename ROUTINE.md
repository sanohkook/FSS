# 인천 물때 예약판 — 운영 안내

정적 아티팩트에서 **맥 로컬 웹서버**로 전환됨. 예약 사이트는 서버가 직접 조회한다.

## 실행

```bash
npm install      # 최초 1회 (express)
npm start        # http://localhost:3300
```

- 물때·조류: `data/tide.json` (2026–2027 번들). 갱신 없이 동작 — 바다타임도 2028년 자료 없음.
  - 근월만 새로 받기: `npm run tide` (바다타임, **비영리 개인용에 한함**).
  - 공식 소스: `npm run tide -- --khoa` — 국립해양조사원 조석예보 API. 무료 인증키 필요
    (`export KHOA_KEY=...`, https://www.khoa.go.kr/oceangrid/). 약관상 자유, 2028년 이후에도 사용 가능.
  - 물때(3물/조금/사리)는 음력일로 계산: `n=(음력일+6)%15`, 0→무시·14→조금.
- 예약 현황: `data/avail.json` (스크레이프 캐시, git 무시).

## 예약 현황 갱신

- **보드의 `갱신` 버튼** 또는 `npm run scrape` → 3개월치 배별 잔여석을 다시 긁어 `data/avail.json` 갱신.
- 서버는 요청마다 파일을 읽으므로 재시작 불필요.
- 자동화: `update_avail.sh` 를 launchd 로 6시간마다 실행 (기존 plist 재사용).

```bash
crontab 예시:  0 */6 * * *  /Users/sanoh/Documents/code/FSS/update_avail.sh
```

## 사이트 추가 / 삭제

보드 → `설정 · 배 추가`. URL 을 넣으면 호스트로 종류를 판별한다.

| 종류 | 예 | 배별 인원 조회 |
|---|---|---|
| `xe` | 칸피싱·제일낚시 등 XpressEngine `mid=bk` | O |
| `sunsang` | 동양낚시 등 `*.sunsang24.com` | O |
| `generic` | 그 외 | X (링크 열만) |

설정은 `data/sites.json` 에 저장된다.

## 파싱 규칙 (참고)

- **xe**: 월 목록 페이지 + `_module.new.list.more.php` 페이지네이션.
  날짜 구간(`<a name="YYYYMMDD">`) 안 배마다
  `admin-right-YYYYMMDD-{PA_N_UID}-0` div 의 `<img alt>`:
  `예약완료`→마감 / `남은자리 N명`→잔여 N (≤3 임박) / `배정비일`→미운항.
- **sunsang**: `schedule_fleet/YYYYMM` 의 `ship_unit_ship_no_*` 블록.
  `예약마감`→마감, `남은자리 N명 … 예약/M명`→잔여 N·정원 N+M.
- 3개 사이트 모두 0건이면 기존 `avail.json` 유지.
