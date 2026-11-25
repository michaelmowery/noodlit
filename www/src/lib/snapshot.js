// Snapshot: a picture of the scene for the Share panel (share.js). Only the scene canvas is
// captured, never the toolbar, menus or prompt bubble, because those are HTML laid over it.
//
// What each action does where:
//                  iOS / Android app                         website
//   Share…         Apple's share sheet (Instagram, WhatsApp,  the browser's share sheet when it can
//                  Messages, Threads, Mail, AirDrop…)         share files (Safari, Chrome on phones,
//                  via the Filesystem + Share plugins         Mac and Windows); hidden otherwise
//   Save           straight into Photos (Media plugin,        a PNG download
//                  add-only permission)
//   Copy           the clipboard (Clipboard plugin)           the clipboard, where the browser allows
//                                                             images; hidden otherwise
//
// The plugins are called through Capacitor's native bridge, like voice.js and purchases.js,
// because the web code has no bundler for their JS wrappers. Saving to Photos needs
// NSPhotoLibraryAddUsageDescription in Info.plist. On Android, Save goes to a Noodlit album
// (see androidAlbum below) and Share uses Android's share sheet.

const cap = window.Capacitor;
const NATIVE = !!cap?.isNativePlatform?.();
const hasPlugin = (name) => !!(cap?.nativePromise && (cap.PluginHeaders || []).some((h) => h.name === name));
const call = (plugin, method, options = {}) => cap.nativePromise(plugin, method, options);

const nativeFiles = () => NATIVE && hasPlugin('Filesystem');
const probe = typeof File === 'function' ? new File([new Uint8Array(1)], 'x.png', { type: 'image/png' }) : null;
const webCanShareFiles = () => !!(probe && navigator.canShare?.({ files: [probe] }));

export const can = {
  share: () => (nativeFiles() && hasPlugin('Share')) || (!NATIVE && webCanShareFiles()),
  save: () => !NATIVE || (nativeFiles() && hasPlugin('Media')),
  copy: () => (NATIVE ? hasPlugin('Clipboard') : !!(window.ClipboardItem && navigator.clipboard?.write)),
};

export function snapshotName(sceneName, when = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const slug = String(sceneName || 'scene').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scene';
  const stamp = `${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())} ${p(when.getHours())}.${p(when.getMinutes())}.${p(when.getSeconds())}`;
  return `Noodlit ${slug} ${stamp}.png`;
}

// A still copy of the canvas, taken the moment Share is tapped (the scene keeps fading behind).
export function freeze(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  c.getContext('2d').drawImage(canvas, 0, 0);
  return c;
}

// The picture as shared: the still, optionally with a small "noodlit.app" tag in the corner.
export function compose(still, { tag = false, logo = null } = {}) {
  if (!tag) return still;
  const c = freeze(still);
  const g = c.getContext('2d');
  const s = Math.max(1, Math.min(c.width, c.height) / 390); // scale with the picture
  const pad = 14 * s, h = 30 * s, icon = 18 * s;
  g.font = `600 ${13 * s}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  const text = 'noodlit.app';
  const w = (logo ? icon + 6 * s : 0) + g.measureText(text).width + 22 * s;
  const x = c.width - pad - w, y = c.height - pad - h;
  g.fillStyle = 'rgba(16, 22, 28, 0.55)';
  g.beginPath();
  g.roundRect ? g.roundRect(x, y, w, h, h / 2) : g.rect(x, y, w, h);
  g.fill();
  let tx = x + 11 * s;
  if (logo) { try { g.drawImage(logo, tx, y + (h - icon) / 2, icon, icon); } catch { /* no logo, just words */ } tx += icon + 6 * s; }
  g.fillStyle = 'rgba(238, 243, 246, 0.92)';
  g.textBaseline = 'middle';
  g.fillText(text, tx, y + h / 2 + 0.5 * s);
  return c;
}

export function toBlob(canvas) {
  return new Promise((resolve, reject) => {
    try { canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('empty'))), 'image/png'); } catch (err) { reject(err); }
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export const isCancel = (err) => err?.name === 'AbortError' || /cancel/i.test(err?.message || err?.errorMessage || '');

// Writes the picture to the app's cache, runs fn(uri), then tidies up.
async function withCacheFile(blob, name, fn) {
  const data = (await blobToDataUrl(blob)).split(',')[1] || '';
  const { uri } = await call('Filesystem', 'writeFile', { path: name, data, directory: 'CACHE' });
  try { return await fn(uri); } finally { call('Filesystem', 'deleteFile', { path: name, directory: 'CACHE' }).catch(() => {}); }
}

// Resolves 'shared' or 'cancelled'. text rides along where the app takes it (Messages, Mail,
// WhatsApp); Instagram and some others keep just the picture.
export async function shareImage(blob, name, text = '') {
  try {
    if (NATIVE) await withCacheFile(blob, name, (uri) => call('Share', 'share', { files: [uri], text, dialogTitle: 'Share your Noodlit' }));
    else await navigator.share({ files: [new File([blob], name, { type: 'image/png' })], text });
    return 'shared';
  } catch (err) {
    if (isCancel(err)) return 'cancelled';
    throw err;
  }
}

// On Android the Media plugin saves into a named album, a folder in the app's own media
// directory that the Gallery and Google Photos pick up. That needs no storage permission.
// The folder is made the first time (createAlbum fails harmlessly once it exists).
async function androidAlbum() {
  const { path } = await call('Media', 'getAlbumsPath');
  await call('Media', 'createAlbum', { name: 'Noodlit' }).catch(() => {});
  return { albumIdentifier: `${path}/Noodlit` };
}

// Resolves 'photos' (iOS and Android apps) or 'downloaded' (website).
export async function saveImage(blob, name) {
  if (NATIVE) {
    const options = cap.getPlatform?.() === 'android' ? await androidAlbum() : {};
    await withCacheFile(blob, name, (uri) => call('Media', 'savePhoto', { path: uri, ...options }));
    return 'photos';
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}

export async function copyImage(blob) {
  if (NATIVE) await call('Clipboard', 'write', { image: await blobToDataUrl(blob) });
  else await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  return 'copied';
}

// Share the app itself: a link, no picture. Falls back to copying the link.
export async function shareLink({ title, text, url }) {
  try {
    if (NATIVE && hasPlugin('Share')) { await call('Share', 'share', { title, text, url, dialogTitle: title }); return 'shared'; }
    if (navigator.share) { await navigator.share({ title, text, url }); return 'shared'; }
  } catch (err) {
    if (isCancel(err)) return 'cancelled';
  }
  if (NATIVE && hasPlugin('Clipboard')) await call('Clipboard', 'write', { string: `${text} ${url}` });
  else await navigator.clipboard.writeText(`${text} ${url}`);
  return 'copied';
}
