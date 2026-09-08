#!/bin/bash
# 맥에서 에뮬레이터로 예약현황 앱 미리보기.
#   ./preview.sh          빌드 + 설치 + 실행 (에뮬레이터 없으면 자동 부팅)
#   ./preview.sh build    APK만 빌드
#   ./preview.sh stop     에뮬레이터 종료
set -e
cd "$(dirname "$0")"

SDK="$HOME/Library/Android/sdk"
export ANDROID_HOME="$SDK" ANDROID_AVD_HOME="$HOME/.android/avd"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
ADB="$SDK/platform-tools/adb"
AVD="fss_test"
APK="app/build/outputs/apk/debug/app-debug.apk"

case "${1:-run}" in
  stop) "$ADB" emu kill 2>/dev/null; echo "에뮬레이터 종료"; exit 0 ;;
  build) ./gradlew :app:assembleDebug; echo "→ $APK"; exit 0 ;;
esac

# 1) AVD 없으면 생성
if ! "$SDK/cmdline-tools/latest/bin/avdmanager" list avd 2>/dev/null | grep -q "Name: $AVD"; then
  echo "AVD 생성…"
  echo no | "$SDK/cmdline-tools/latest/bin/avdmanager" create avd -n "$AVD" \
    -k "system-images;android-34;google_apis;arm64-v8a" -d pixel_6 --force
fi

# 2) 에뮬레이터 부팅 (창 표시)
if ! "$ADB" devices | grep -q emulator; then
  echo "에뮬레이터 부팅…"
  ( cd "$SDK/emulator" && ./emulator -avd "$AVD" -no-audio -no-boot-anim -netdelay none -netspeed full >/dev/null 2>&1 & )
  "$ADB" wait-for-device
  echo -n "부팅 대기"
  until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do echo -n .; sleep 3; done
  echo " 완료"
fi

# 3) 빌드 + 설치 + 실행
./gradlew :app:assembleDebug -q
"$ADB" install -r "$APK"
"$ADB" shell am start -n kr.co.fss.yeyak/.MainActivity
echo
echo "앱 실행됨. 첫 조회는 와이파이에서 30초~1분(에뮬레이터는 더) 걸립니다."
echo "로그 보기:  $ADB logcat -s fss"
