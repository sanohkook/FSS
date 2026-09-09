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

- 앱을 열면 git `avail` 브랜치(맥이 1시간마다 갱신)에서 예약현황을 받아옵니다. 실패 시 마지막 캐시.
- **Refresh** 버튼 → 앱이 직접 예약 사이트 재조회 (30초~2분). 맥이 꺼져 있어도 최신. 좌→우 진행 막대.
- 예약 셀 한 번 탭 → 나의 예약(형광초록) 토글, 두 번 탭 → 해당 배 예약 페이지.
- **사이트 추가** → 사이트 관리. **검색 조건** → 예약가능·조류·요일/공휴일·선박 필터.

## 앱 업데이트 (GitHub Releases)

앱의 **업그레이드** 버튼이 `github.com/sanohkook/FSS` 의 최신 릴리스를 확인해
새 버전이면 APK 를 내려받아 설치 화면을 띄운다. (최초 1회 "이 출처의 앱 설치 허용" 필요)

새 버전 배포 (권장 — 맥에서):

```bash
brew install gh && gh auth login   # 최초 1회
cd android
./release.sh 2.9                    # 버전 올림 + 커밋/태그 push + 맥에서 서명 빌드 + 릴리스 발행
```

맥이 없을 때 (예비) — **GitHub Actions 수동 실행**:
`./release.sh 2.9` 로 태그만 올린 뒤 → 저장소 **Actions → Release APK → Run workflow → tag: v2.9**.
Actions 를 쓰려면 **Settings → Secrets and variables → Actions** 에 4개 등록:

| Secret | 값 |
|---|---|
| `KEYSTORE_B64` | `base64 -i android/fss-release.jks \| pbcopy` 결과 (한 줄, 전체 붙여넣기) |
| `KEYSTORE_PASSWORD` | `keystore.properties` 의 `storePassword` |
| `KEY_ALIAS` | `fss` |
| `KEY_PASSWORD` | `keystore.properties` 의 `keyPassword` |

- 서명 키: `android/fss-release.jks` + `android/keystore.properties` (git 제외).
  **분실하면 이후 업데이트 영구 불가** — 별도 안전한 곳에 백업할 것.
- 릴리스 규칙: 태그 `vX.Y`, 자산으로 `app-release.apk` 하나.
- 첫 배포 APK 부터 이 키로 서명해야 이후 인앱 업데이트가 됨(디버그 설치본 위에는 덮어쓰기 불가 → 재설치).
- 로컬 빌드만: `./release.sh 2.4 --build`

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
