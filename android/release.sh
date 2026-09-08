#!/bin/bash
# 배포용 서명 APK 빌드 + GitHub Release 생성.
#   ./release.sh 2.3            버전 2.3 으로 올리고 빌드 + 릴리스
#   ./release.sh 2.3 --build    빌드만 (릴리스 생성 안 함)
#
# 전제: android/keystore.properties + android/fss-release.jks (git 제외, 별도 백업 필수).
# 릴리스 규칙: 태그 vX.Y, 자산으로 app-release.apk 하나. 앱의 "업그레이드" 버튼이 이걸 읽는다.
set -e
cd "$(dirname "$0")"

VER="${1:?사용법: ./release.sh <버전> [--build]}"
MODE="${2:-}"
GRADLE_FILE="app/build.gradle.kts"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"

[ -f keystore.properties ] || { echo "keystore.properties 없음 — 서명 키가 필요합니다"; exit 1; }

CUR_CODE=$(grep -oE 'versionCode = [0-9]+' "$GRADLE_FILE" | grep -oE '[0-9]+')
NEW_CODE=$((CUR_CODE + 1))
/usr/bin/sed -i '' -E "s/versionCode = [0-9]+/versionCode = $NEW_CODE/" "$GRADLE_FILE"
/usr/bin/sed -i '' -E "s/versionName = \"[^\"]*\"/versionName = \"$VER\"/" "$GRADLE_FILE"
echo "→ versionCode $CUR_CODE→$NEW_CODE, versionName $VER"

./gradlew :app:assembleRelease -q
APK="app/build/outputs/apk/release/app-release.apk"
echo "→ $APK ($(du -h "$APK" | cut -f1))"

if [ "$MODE" = "--build" ]; then exit 0; fi

git add "$GRADLE_FILE"
git commit -q -m "release v$VER (versionCode $NEW_CODE)"
git tag "v$VER"
git push origin main "v$VER"

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh release create "v$VER" "$APK" --title "v$VER" --generate-notes
  echo "릴리스 v$VER 생성 완료"
else
  echo
  echo "gh CLI 미인증 — 수동으로 릴리스를 만드세요:"
  echo "  1) https://github.com/sanohkook/FSS/releases/new"
  echo "  2) 태그: v$VER (이미 push 됨)"
  echo "  3) 자산 업로드: $(pwd)/$APK"
  echo "  4) Publish release"
fi
