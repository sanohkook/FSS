# 예약현황 — 안드로이드 앱 (맥 없이 단독 동작)

앱 하나로 끝. 맥/서버 필요 없습니다.

앱이 내부에서 작은 HTTP 서버(NanoHTTPD)를 띄우고, 웹 프런트엔드를 WebView 로 엽니다.
예약 사이트 조회·물때 계산·저장은 전부 앱이 처리합니다 (`server/` 로직을 Kotlin 으로 포팅).

- 패키지 `kr.co.fss.yeyak`, minSdk 24(안드로이드 7)+, APK ≈ 1MB
- 인터넷 권한만 사용. 개인정보 수집·전송 없음.
- 물때·조류: `data/tide.json`(국립해양조사원, 2026–2027)을 에셋으로 번들
- 예약 현황: 앱이 칸피싱·제일낚시·동양낚시 등을 직접 조회 (같은 규칙, 토큰 0)
- 설정(사이트 추가/삭제)·나의 예약: 앱 내부 저장소

## 빌드

### Android Studio
`android/` 열고(File → Open) → Run ▶.

### 명령줄
```bash
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```
설치:
```bash
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
```
또는 APK 를 폰으로 보내 직접 설치("출처를 알 수 없는 앱" 허용).

## 사용

- 앱을 열면 바로 이번 달~12월 예약현황이 뜹니다.
- **갱신** 버튼 → 예약 사이트 재조회 (30초~2분, 셀 개수만큼).
- 예약 셀 클릭 → 해당 배 예약 페이지가 기본 브라우저로.
- ☆ → 나의 예약 저장. **설정·배 추가** → 사이트 관리.
- 메뉴(⋮) → 다시 불러오기.

## 구조 (server/ ↔ android/)

| 서버(Node) | 앱(Kotlin) |
|---|---|
| `server/scrape/http.js` | `Http.kt` · `Fish.kt` |
| `server/scrape/xe.js` · `sunsang.js` | `Scrape.kt` |
| `server/tide.js` (+ 공휴일) | `Tide.kt` |
| `server/index.js` `/api/board` | `Board.kt` |
| `server/index.js` 라우트 | `LocalServer.kt` (NanoHTTPD) |
| `server/store.js`, `data/*.json` | `Store.kt` (앱 내부 저장소) |
| `public/` | 에셋으로 그대로 번들 (빌드 시 `syncAssets` 태스크가 복사) |

## 안 되는 것

- **AI 파싱 레시피**: 앱에는 없음. 칸피싱·제일낚시 계열(XE)·`sunsang24` 계열이 아닌 사이트는
  링크 전용(X 표시)으로만 추가됩니다.
- **바다타임/KHOA 물때 재조회**: 앱은 번들 데이터(2027년 12월까지)만 사용.
