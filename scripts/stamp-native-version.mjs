// Runs after every `cap copy` / `cap sync` (the capacitor:copy:after hook in package.json).
// The web build gets its version stamped by the GitHub Pages deploy; the iOS copy of www/
// never goes through that, so stamp it here with the Xcode version and build number,
// e.g. "1.0 (3)". Only the copy in ios/App/App/public is touched, never www/ itself.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const platform = process.env.CAPACITOR_PLATFORM_NAME;
if (platform && platform !== 'ios') process.exit(0);

const pbx = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
const pick = (key) => pbx.match(new RegExp(`${key} = ([^;]+);`))?.[1].trim();
const version = `${pick('MARKETING_VERSION')} (${pick('CURRENT_PROJECT_VERSION')})`;

const about = 'ios/App/App/public/src/about.js';
if (!existsSync(about)) process.exit(0);
const src = readFileSync(about, 'utf8');
const out = src.replace(/^const STAMP = '[^']*';/m, `const STAMP = '${version}';`);
if (out === src) throw new Error(`Couldn't find the STAMP line in ${about}`);
writeFileSync(about, out);
console.log(`Stamped iOS web copy with version ${version}`);
