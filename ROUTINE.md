# 예약현황 자동 갱신 루틴 지침

`인천물때예약판.html` 의 예약현황(AVAIL) 을 최신으로 유지한다.
클라우드 샌드박스는 예약 사이트 직접 접속(curl/python)이 프록시에서 403으로 막히므로
**반드시 WebFetch 도구**로 가져온다. (`scrape_avail.py` 는 로컬 실행용, 루틴에서 쓰지 말 것.)

## 1. 대상 URL (오늘이 속한 달 M, 다음 달 M+1 기준)

- 칸피싱: `https://khanfishing.com/index.php?mid=bk&year=YYYY&month=MM&mode=list`  (M, M+1)
- 제일낚시: `https://jnaksi.com/index.php?mid=bk&year=YYYY&month=MM&mode=list`  (M, M+1)
- 동양낚시: `https://dyfishing.sunsang24.com/ship/schedule_fleet/YYYYMM`  (M, M+1, M+2)

각 URL 에 WebFetch, 프롬프트는 "각 날짜별 배들의 예약 상태를 화면 그대로 옮겨라.
배마다 `예약완료`/`예약마감` 인지 `남은자리 N명` 인지 `배정비일` 인지. 날짜별 한 줄:
`YYYY-MM-DD: 배이름=남은자리 N명, 배이름=예약완료, ...`. 해석 금지, 가능한 모든 날짜." 로.

## 2. 날짜별 상태 판정

그 날짜의 모든 배 중 **남은자리 최댓값** 기준:
- ≥ 4 → `{"s":"open","n":"N석"}`  (N = 최댓값)
- 1~3 → `{"s":"few","n":"N석"}`
- 배가 전부 예약완료/예약마감/배정비일 → `{"s":"full"}`
- 그 날짜 정보가 아예 없으면 생략

`배정비일` 인 배는 계산에서 제외. 오늘 이전 날짜는 넣어도 되고 빼도 된다.

## 3. HTML 갱신

`인천물때예약판.html` 에서 아래 두 주석 사이 한 줄을 통째로 교체:

```
<!-- AVAIL:START (scrape_avail.py 가 이 블록을 자동 갱신) -->
<script>window.AVAIL={...};window.AVAIL_UPDATED="ISO8601Z";if(window.__renderAvail)window.__renderAvail();</script>
<!-- AVAIL:END -->
```

- `window.AVAIL` 형식: `{"khan":{"2026-10-09":{"s":"few","n":"3석"},...},"jeil":{...},"dy":{...}}`
  (사이트 id 는 반드시 `khan` / `jeil` / `dy`)
- `window.AVAIL_UPDATED` 는 지금 UTC 시각 `2026-01-01T00:00:00Z` 형식
- `avail.js` 도 같은 내용으로 갱신(선택)

## 4. 커밋 & 게시

수집 데이터가 0건이면 아무것도 하지 말고 종료.
`git status --porcelain` 에 변경이 있으면:

1. `git add -A && git commit -m "예약현황 자동 갱신" && git push origin main`
2. Artifact 재게시: `action=publish`, `file_path="인천물때예약판.html"`,
   `url="https://claude.ai/code/artifact/e2193037-3780-4640-a0b2-04388715595a"`,
   `label="예약현황 자동 갱신"`

변경이 없으면 "변경 없음" 으로만 보고.

## 5. 보고

사이트별 수집 날짜 수, 갱신 시각, (있으면) 실패한 URL 을 요약.
