#!/bin/bash
# 새 버전 배포.
#   ./release.sh 2.4          버전 올리고 커밋 + 태그 push → 릴리스 발행
#   ./release.sh 2.4 --build  로컬에서 서명 APK 만 빌드
#
# 릴리스 발행 방법 (둘 중 아무거나):
#   A) gh CLI 로그인돼 있으면 → 이 스크립트가 로컬에서 서명 빌드 + 릴리스 생성 (시크릿 불필요)
#   B) 아니면 → 태그만 push, GitHub Actions 가 빌드 (저장소 시크릿 4개 필요, README 참고)
set -e
cd "$(dirname "$0")"

VER="${1:?사용법: ./release.sh <버전> [--build]}"
MODE="${2:-}"
GRADLE_FILE="app/build.gradle.kts"
APK="app/build/outputs/apk/release/app-release.apk"
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

build() {
  [ -f keystore.properties ] || { echo "❌ keystore.properties 없음 — 서명 키가 필요합니다"; exit 1; }
  ./gradlew :app:assembleRelease -x lintVitalRelease -q
  echo "→ $APK ($(du -h "$APK" | cut -f1))"
}

if [ "$MODE" = "--build" ]; then build; exit 0; fi

# 1) 버전 올리기
CUR_CODE=$(grep -oE 'versionCode = [0-9]+' "$GRADLE_FILE" | grep -oE '[0-9]+')
NEW_CODE=$((CUR_CODE + 1))
/usr/bin/sed -i '' -E "s/versionCode = [0-9]+/versionCode = $NEW_CODE/" "$GRADLE_FILE"
/usr/bin/sed -i '' -E "s/versionName = \"[^\"]*\"/versionName = \"$VER\"/" "$GRADLE_FILE"
echo "→ versionCode $CUR_CODE→$NEW_CODE, versionName $VER"

# 2) 커밋 + 태그 push
git add "$GRADLE_FILE"
git commit -q -m "release v$VER (versionCode $NEW_CODE)"
git tag "v$VER"
git push origin main "v$VER"
echo "→ 태그 v$VER push 완료"

# latest.json 을 'release' 브랜치에 올린다 — 앱이 raw.githubusercontent(무제한)로 버전 확인
publish_latest_json() {
  local url="https://github.com/sanohkook/FSS/releases/download/v$VER/app-release.apk"
  local json; json=$(printf '{"version":"%s","apk":"%s"}\n' "$VER" "$url")
  local blob; blob=$(printf '%s' "$json" | git hash-object -w --stdin)
  local tree; tree=$(printf '100644 blob %s\tlatest.json\n' "$blob" | git mktree)
  local commit; commit=$(git commit-tree "$tree" -m "release v$VER")
  git push -f origin "$commit:refs/heads/release"
  echo "→ latest.json → release 브랜치 (v$VER)"
}

# 3) 릴리스 발행
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "→ gh 로그인됨 — 로컬에서 서명 빌드 후 릴리스 생성"
  build
  gh release create "v$VER" "$APK" --title "v$VER" --generate-notes
  publish_latest_json
  echo "✅ 릴리스 v$VER 발행 완료 — 앱의 '업그레이드' 버튼에 곧 표시됩니다"
else
  echo
  echo "⚠️  gh 미로그인 — 릴리스가 발행되지 않았습니다. 태그만 push 됨."
  echo "   방법 1) gh auth login  후  ./release.sh $VER  다시 실행 (맥에서 빌드+발행)"
  echo "   방법 2) 맥 없이: GitHub → Actions → 'Release APK' → Run workflow → tag: v$VER"
  echo "           (시크릿 KEYSTORE_B64/PASSWORD/ALIAS/KEY_PASSWORD 등록돼 있어야 함)"
fi
