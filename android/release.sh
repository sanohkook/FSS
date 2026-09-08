#!/bin/bash
# 새 버전 배포. 버전 올리고 태그를 push 하면 GitHub Actions 가 서명 빌드 + 릴리스 발행.
#   ./release.sh 2.4          버전 2.4 로 올리고 커밋 + 태그 push  → Actions 가 릴리스 생성
#   ./release.sh 2.4 --build  로컬에서 서명 APK 만 빌드 (릴리스/푸시 안 함)
#
# Actions 가 빌드하려면 저장소 Secrets 필요: KEYSTORE_B64 / KEYSTORE_PASSWORD / KEY_ALIAS / KEY_PASSWORD
#   KEYSTORE_B64 = base64 -i android/fss-release.jks   (한 줄)
set -e
cd "$(dirname "$0")"

VER="${1:?사용법: ./release.sh <버전> [--build]}"
MODE="${2:-}"
GRADLE_FILE="app/build.gradle.kts"

if [ "$MODE" = "--build" ]; then
  [ -f keystore.properties ] || { echo "keystore.properties 없음 — 서명 키 필요"; exit 1; }
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  ./gradlew :app:assembleRelease -q
  echo "→ app/build/outputs/apk/release/app-release.apk"
  exit 0
fi

CUR_CODE=$(grep -oE 'versionCode = [0-9]+' "$GRADLE_FILE" | grep -oE '[0-9]+')
NEW_CODE=$((CUR_CODE + 1))
/usr/bin/sed -i '' -E "s/versionCode = [0-9]+/versionCode = $NEW_CODE/" "$GRADLE_FILE"
/usr/bin/sed -i '' -E "s/versionName = \"[^\"]*\"/versionName = \"$VER\"/" "$GRADLE_FILE"
echo "→ versionCode $CUR_CODE→$NEW_CODE, versionName $VER"

git add "$GRADLE_FILE"
git commit -q -m "release v$VER (versionCode $NEW_CODE)"
git tag "v$VER"
git push origin main "v$VER"

echo
echo "태그 v$VER push 완료. GitHub Actions 가 서명 APK 빌드 + 릴리스를 생성합니다:"
echo "  https://github.com/sanohkook/FSS/actions"
echo "완료되면 앱의 '업그레이드' 버튼에 새 버전이 뜹니다."
