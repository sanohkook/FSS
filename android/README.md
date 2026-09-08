# 예약현황 — 안드로이드 앱

맥에서 도는 예약현황 웹서버(`npm start`)를 폰에서 앱처럼 여는 WebView 래퍼입니다.
스크레이핑·데이터는 서버가 담당하고, 앱은 그 화면을 보여주기만 합니다.

- 의존성 없음(순수 `android.webkit.WebView`), APK ≈ 0.8MB
- 패키지 `kr.co.fss.yeyak`, minSdk 24(안드로이드 7)+, targetSdk 36

## 준비

1. 맥과 폰이 **같은 와이파이**에 있어야 합니다.
2. 맥에서 서버 실행:
   ```bash
   npm start
   ```
   콘솔에 `폰에서:  http://192.168.x.x:3300` 이 찍힙니다 — 이 주소를 앱에 입력합니다.

## APK 빌드

### Android Studio
`android/` 폴더를 열고(File → Open) → Run ▶. 첫 실행 시 서버 주소를 물어봅니다.

### 명령줄
```bash
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```
폰에 설치:
```bash
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
```
또는 APK 파일을 폰으로 보내서 직접 설치(“출처를 알 수 없는 앱” 허용 필요).

## 사용

- 첫 실행: 서버 주소 입력 (예 `http://192.168.8.53:3300`)
- 메뉴(⋮) → **새로고침** / **서버 주소** 변경
- 예약 셀을 누르면 해당 배 예약 페이지가 기본 브라우저로 열립니다
- 뒤로가기 = 웹뷰 뒤로

## 한계 / 다음 단계

- 맥 서버가 꺼져 있으면 앱도 동작하지 않습니다(연결 오류 화면).
- 집 밖에서 쓰려면: 서버를 Tailscale/Cloudflare Tunnel 등으로 노출하고 그 주소를 앱에 입력.
- Play 스토어 배포(TWA)를 원하면 서버에 HTTPS 도메인이 필요합니다.
