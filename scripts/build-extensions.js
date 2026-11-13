/* Builds MyMag as a browser extension for Chrome and Firefox.

   Run:  npm run build:extensions

   Output (in browser-extensions/):
     chrome/   firefox/            unpacked folders, ready to load
     mymag-chrome.zip  mymag-firefox.zip

   What it does differently from the normal web build:
   - relative asset paths (an extension has no /MyMag/ folder)
   - no inline <script> (extensions forbid it)
   - Font Awesome is copied in, so icons work offline
   - the unused html2pdf <script> from a CDN is removed (extensions block remote scripts)
*/
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "browser-extensions");
const tmpBuild = path.join(outDir, ".build");
const pkg = require(path.join(root, "package.json"));

const rm = (p) => fs.rmSync(p, { recursive: true, force: true });
const copyDir = (from, to) => fs.cpSync(from, to, { recursive: true });

/* ---------- 1. production build with extension-friendly settings ---------- */
rm(outDir);
fs.mkdirSync(outDir, { recursive: true });
console.log("Building the app...");
const build = spawnSync(
  process.execPath,
  [require.resolve("react-scripts/bin/react-scripts.js"), "build"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      PUBLIC_URL: ".",
      BUILD_PATH: tmpBuild,
      INLINE_RUNTIME_CHUNK: "false",
      GENERATE_SOURCEMAP: "false",
    },
  }
);
if (build.status !== 0) {
  console.error("Build failed.");
  process.exit(build.status || 1);
}

/* ---------- 2. adapt the build for an extension ---------- */
for (const f of ["manifest.json", "robots.txt", "asset-manifest.json"]) rm(path.join(tmpBuild, f));

// Font Awesome, local copy
const fa = path.join(root, "node_modules", "@fortawesome", "fontawesome-free");
fs.mkdirSync(path.join(tmpBuild, "fontawesome", "css"), { recursive: true });
fs.mkdirSync(path.join(tmpBuild, "fontawesome", "webfonts"), { recursive: true });
fs.copyFileSync(path.join(fa, "css", "all.min.css"), path.join(tmpBuild, "fontawesome", "css", "all.min.css"));
for (const f of fs.readdirSync(path.join(fa, "webfonts"))) {
  if (f.endsWith(".woff2")) {
    fs.copyFileSync(path.join(fa, "webfonts", f), path.join(tmpBuild, "fontawesome", "webfonts", f));
  }
}

// index.html: no remote script, local Font Awesome, no web-app manifest link
const htmlPath = path.join(tmpBuild, "index.html");
let html = fs.readFileSync(htmlPath, "utf8");
html = html
  .replace(/<script[^>]*src="https?:\/\/[^"]*"[^>]*>\s*<\/script>/gi, "")
  .replace(/<link[^>]*href="https?:\/\/[^"]*font-awesome[^"]*"[^>]*>/gi, '<link rel="stylesheet" href="fontawesome/css/all.min.css">')
  .replace(/<link[^>]*rel="manifest"[^>]*>/gi, "");
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) {
  console.error("index.html still contains an inline <script>; extensions do not allow that.");
  process.exit(1);
}
if (/(src|href)="https?:\/\//i.test(html)) {
  console.error("index.html still loads something from the web.");
  process.exit(1);
}
fs.writeFileSync(htmlPath, html);

/* ---------- 3. minimal ZIP writer (forward-slash paths, as browsers require) ---------- */
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const listFiles = (dir, base = dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p, base) : [path.relative(base, p).split(path.sep).join("/")];
  });
const zipDir = (dir, zipPath) => {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const rel of listFiles(dir).sort()) {
    const data = fs.readFileSync(path.join(dir, rel));
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const name = Buffer.from(rel, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12); // fixed date 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, comp);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0x21, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += local.length + name.length + comp.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(cenBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(zipPath, Buffer.concat([...chunks, cenBuf, end]));
};

/* ---------- 4. one folder + one zip per browser ---------- */
const extSrc = path.join(root, "extension");
for (const browser of ["chrome", "firefox"]) {
  const dest = path.join(outDir, browser);
  copyDir(tmpBuild, dest);
  copyDir(path.join(extSrc, "icons"), path.join(dest, "icons"));
  fs.copyFileSync(path.join(extSrc, "background.js"), path.join(dest, "background.js"));
  // browser-specific scripts are named  <name>.<browser>.js
  for (const f of fs.readdirSync(extSrc)) {
    if (f.endsWith(`.${browser}.js`)) fs.copyFileSync(path.join(extSrc, f), path.join(dest, f));
  }
  const manifest = fs
    .readFileSync(path.join(extSrc, `manifest.${browser}.json`), "utf8")
    .replace("__VERSION__", pkg.version);
  JSON.parse(manifest); // fail loudly if the manifest is not valid JSON
  fs.writeFileSync(path.join(dest, "manifest.json"), manifest);
  const zipPath = path.join(outDir, `mymag-${browser}.zip`);
  zipDir(dest, zipPath);
  console.log(`${browser}: ${path.relative(root, zipPath)} (${Math.round(fs.statSync(zipPath).size / 1024)} kB)`);
}
rm(tmpBuild);
console.log("Done. See browser-extensions/");
