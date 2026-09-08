# 바다타임 물때 → 구독 캘린더 (.ics)

[바다타임](https://www.badatime.com)의 지역별 "날짜별 물때" 페이지를 긁어
네이버·구글·애플 캘린더에서 **구독**할 수 있는 iCal 피드(`.ics`)를 만든다.
GitHub Actions가 매일 새로 크롤링해 `docs/*.ics` 를 갱신하고,
GitHub Pages가 그 파일을 고정 URL로 제공한다.

- 하루에 **종일 일정 1개**
- 제목: `4물 69%` (물때 + 물흐름 %)
- 설명: 만조/간조 시각·조위, 일출몰, 월출몰
- 범위: 오늘 ~ 약 +90일 (매일 갱신되며 계속 앞으로 밀림)

## 배포 (한 번만)

1. GitHub에서 새 저장소 생성 (예: `badatime-calendar`) — **Public**
2. 이 폴더를 그 저장소로 push
   ```bash
   cd badatime-calendar
   git init
   git add .
   git commit -m "init: 바다타임 물때 구독 캘린더"
   git branch -M main
   git remote add origin https://github.com/<사용자명>/badatime-calendar.git
   git push -u origin main
   ```
3. 저장소 **Settings → Pages** → Source: `Deploy from a branch`,
   Branch: `main` / `/docs` → Save
4. 저장소 **Settings → Actions → General** →
   "Workflow permissions" 를 **Read and write permissions** 로 변경
5. **Actions** 탭 → `update-ics` → **Run workflow** 로 첫 갱신 1회 실행

몇 분 뒤 아래 주소가 열리면 성공:

```
https://<사용자명>.github.io/badatime-calendar/badatime-158.ics
```

## 네이버 캘린더에 구독 추가

1. PC 네이버 캘린더 → 왼쪽 아래 **구독 캘린더** 옆 **+** → **캘린더 만들기**
2. **URL 추가** 칸에 위 `.ics` 주소를 붙여넣기
3. 캘린더명·색상 지정 후 **저장**

> 네이버는 구독 캘린더를 보통 하루 1회 정도 동기화한다. 즉시 반영되지 않을 수 있음.
> 구글 캘린더: "기타 캘린더 → URL로 추가". 애플 캘린더: `webcal://` 로 바꿔서 열기.

## 다른 지역 / 여러 지역

지역 코드는 바다타임 URL의 숫자다. 예: `badatime.com/158/...` → `158`(인천).

- 임시로 한 번 만들기:
  ```bash
  BADATIME_LOC=1 BADATIME_NAME=부산 python build_ics.py docs/badatime-1.ics
  ```
- 자동 갱신에 추가: `.github/workflows/update-ics.yml` 의 `Build .ics` 단계에 줄 추가.

## 로컬 실행

```bash
python3 build_ics.py docs/badatime-158.ics
```

의존성 없음(표준 라이브러리만). 회사망 등에서 SSL 검증이 막히면 자동으로 미검증 재시도한다.

## 주의

- 개인용도 스크래퍼다. 바다타임에 부담 주지 않도록 갱신 주기는 하루 1회로 둔다.
- 물때 정보는 참고용. 실제 조업/입출항은 국립해양조사원 등 공식 자료를 확인할 것.
