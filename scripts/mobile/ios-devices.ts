/**
 * Сервер: телефоны для сборки iPhone-версии и выкладка готовой сборки (по ssh её вызывает scripts/ios-adhoc.sh из репозитория mybook-mobile).
 *   … scripts/mobile/ios-devices.ts list                       — JSON [{udid, name}] всех зарегистрированных iPhone
 *   … scripts/mobile/ios-devices.ts publish <ipa> <build.json>  — положить сборку туда, откуда её ставит страница CRM
 */
import { readFile } from "node:fs/promises";
import { allIosDevices, publishIosBuild, type IosBuild } from "@/server/ios-app";
import { iosSignConfig, resignIosBuild } from "@/server/ios-sign";

const [cmd, ipaPath, buildPath] = process.argv.slice(2);
if (cmd === "list") {
  console.log(JSON.stringify(await allIosDevices()));
} else if (cmd === "resign") {
  console.log(`Переподписана: новых телефонов ${(await resignIosBuild({ force: true })).length}`);
} else if (cmd === "publish" && ipaPath && buildPath) {
  const ipa = new Uint8Array(await readFile(ipaPath));
  if (ipa[0] !== 0x50 || ipa[1] !== 0x4b) throw new Error("Это не IPA");
  const build = JSON.parse(await readFile(buildPath, "utf8")) as IosBuild;
  await publishIosBuild(ipa, build);
  console.log(`Сборка ${build.version}+${build.build} выложена: телефонов ${build.udids.length}, ${(ipa.length / 1048576).toFixed(1)} МБ`);
  // Новая версия — сразу переподписать сертификатом сервера под все зарегистрированные телефоны.
  if (iosSignConfig()) {
    await resignIosBuild({ force: true });
    console.log("Переподписана на сервере под все телефоны из CRM");
  }
} else {
  console.error("list | publish <ipa> <build.json>");
  process.exit(1);
}
process.exit(0);
