// iOS projects are generated and ignored. Apply the version-controlled icon
// set and launch appearance after `tauri ios init` and before every iOS build.
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri");
const source = join(root, "icons", "ios");
const target = join(root, "gen", "apple", "Assets.xcassets", "AppIcon.appiconset");
if (!existsSync(target)) throw new Error("Run bun --bun tauri ios init --ci --skip-targets-install first");
for (const file of readdirSync(source)) if (file.endsWith(".png")) copyFileSync(join(source, file), join(target, file));
const storyboard = join(root, "gen", "apple", "LaunchScreen.storyboard");
const original = readFileSync(storyboard, "utf8");
const system = '<color key="backgroundColor" systemColor="systemBackgroundColor"/>';
const branded = '<color key="backgroundColor" red="0.1608" green="0.1843" blue="0.1961" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>';
if (!original.includes(system) && !original.includes(branded)) throw new Error("Unrecognized iOS launch storyboard");
writeFileSync(storyboard, original.replace(system, branded));
console.log("Prepared OpenDazz iOS icons and launch appearance");
