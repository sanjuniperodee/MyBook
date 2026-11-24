#!/usr/bin/env bash
# iPhone-версия CRM без TestFlight (Ad Hoc): сборка, подписанная для зарегистрированных телефонов, и выкладка в CRM.
#   bash scripts/mobile/ios-adhoc.sh           — забрать новые телефоны из CRM, зарегистрировать в Apple, собрать, выложить
#   bash scripts/mobile/ios-adhoc.sh --no-upload  — только собрать (mobile/build/ios/adhoc/out/*.ipa)
# Ключ App Store Connect, команда и идентификатор — ~/.appstoreconnect/mybooks-ios.env (в репозитории их нет).
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT=$(pwd)
set -a; source "$HOME/.appstoreconnect/mybooks-ios.env"; set +a
HOST="${MOBILE_APK_HOST:-srv@185.102.75.191}"
UPLOAD=1; [ "${1:-}" = "--no-upload" ] && UPLOAD=0
OUT="$ROOT/mobile/build/ios/adhoc"
AUTH=(-allowProvisioningUpdates -authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")

if [ $UPLOAD = 1 ]; then
  echo "→ телефоны, которые сотрудники зарегистрировали в CRM"
  ssh "$HOST" 'cd ~/mybook && npx tsx --env-file-if-exists=.env --import ./scripts/preload.mjs scripts/mobile/ios-devices.ts list' > /tmp/ios-devices.json
  node scripts/mobile/asc.mjs register /tmp/ios-devices.json
fi
node scripts/mobile/asc.mjs devices > /tmp/ios-registered.json

echo "→ сборка"
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
rm -rf "$OUT"; mkdir -p "$OUT"
(cd mobile && flutter build ios --release --config-only >/dev/null)
xcodebuild -quiet -workspace mobile/ios/Runner.xcworkspace -scheme Runner -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$OUT/Runner.xcarchive" archive DEVELOPMENT_TEAM="$IOS_TEAM_ID" PRODUCT_BUNDLE_IDENTIFIER="$IOS_BUNDLE_ID" CODE_SIGN_STYLE=Automatic "${AUTH[@]}"
cat > "$OUT/export.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>release-testing</string>
  <key>teamID</key><string>$IOS_TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>thinning</key><string>&lt;none&gt;</string>
</dict></plist>
PLIST
xcodebuild -quiet -exportArchive -archivePath "$OUT/Runner.xcarchive" -exportPath "$OUT/out" -exportOptionsPlist "$OUT/export.plist" "${AUTH[@]}"
IPA=$(ls "$OUT"/out/*.ipa | head -1)
VERSION=$(/usr/libexec/PlistBuddy -c "Print :ApplicationProperties:CFBundleShortVersionString" "$OUT/Runner.xcarchive/Info.plist")
BUILD=$(/usr/libexec/PlistBuddy -c "Print :ApplicationProperties:CFBundleVersion" "$OUT/Runner.xcarchive/Info.plist")
# Какие телефоны вошли в сборку: профиль Ad Hoc внутри приложения.
unzip -o -q "$IPA" 'Payload/*.app/embedded.mobileprovision' -d "$OUT/check"
security cms -D -i "$OUT"/check/Payload/*.app/embedded.mobileprovision > "$OUT/profile.plist"
node -e '
const fs=require("fs");const x=fs.readFileSync(process.argv[1],"utf8");
const devs=[...(x.split("<key>ProvisionedDevices</key>")[1]||"").split("</array>")[0].matchAll(/<string>([^<]+)<\/string>/g)].map(m=>m[1]);
fs.writeFileSync(process.argv[2],JSON.stringify({version:process.argv[3],build:process.argv[4],bundleId:process.argv[5],udids:devs,builtAt:new Date().toISOString()}));
console.log("телефонов в сборке:",devs.length)' "$OUT/profile.plist" "$OUT/build.json" "$VERSION" "$BUILD" "$IOS_BUNDLE_ID"
echo "✓ $IPA ($VERSION+$BUILD)"

if [ $UPLOAD = 1 ]; then
  echo "→ выкладка в CRM"
  scp -q "$IPA" "$HOST:/tmp/MyBooks-CRM.ipa"
  scp -q "$OUT/build.json" "$HOST:/tmp/MyBooks-CRM-ios.json"
  ssh "$HOST" 'cd ~/mybook && npx tsx --env-file-if-exists=.env --import ./scripts/preload.mjs scripts/mobile/ios-devices.ts publish /tmp/MyBooks-CRM.ipa /tmp/MyBooks-CRM-ios.json && rm -f /tmp/MyBooks-CRM.ipa /tmp/MyBooks-CRM-ios.json'
fi
