// Snapshot: save what's on the surface as a picture. Only the scene canvas is captured, never the
// toolbar, menus or prompt bubble, because those are HTML laid over the canvas.
//
// Where the picture goes:
//   store app (iOS)  written to the app's cache with Capacitor's Filesystem plugin, then handed
//                    to the share sheet (Share plugin), where "Save Image" puts it in Photos.
//                    Both plugins are called through the native bridge, like voice.js and
//                    purchases.js, because the web code has no bundler for their JS wrappers.
//                    Saving to Photos needs NSPhotoLibraryAddUsageDescription in Info.plist.
//   phone / tablet   the browser's share sheet when it can share files (Save Image on iOS,
//   browser          Save to Photos / Files on Android), otherwise a download.
//   computer         a PNG download.
//
// saveSnapshot(canvas, name) resolves to 'saved' (downloaded or written), 'shared' (the share
// sheet closed after sharing), or 'cancelled' (the share sheet was dismissed). It rejects only
// when the picture couldn't be made at all.

const cap = window.Capacitor;
const NATIVE = !!cap?.isNativePlatform?.();
const hasPlugin = (name) => !!(cap?.nativePromise && (cap.PluginHeaders || []).some((h) => h.name === name));
const call = (plugin, method, options = {}) => cap.nativePromise(plugin, method, options);

export function snapshotName(sceneName, when = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const slug = String(sceneName || 'scene').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scene';
  const stamp = `${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())} ${p(when.getHours())}.${p(when.getMinutes())}.${p(when.getSeconds())}`;
  return `Noodlit ${slug} ${stamp}.png`;
}

function toBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('empty'))), 'image/png');
    } catch (err) { reject(err); }
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const isCancel = (err) => err?.name === 'AbortError' || /cancel/i.test(err?.message || err?.errorMessage || '');

async function saveNative(blob, name) {
  const data = await blobToBase64(blob);
  const { uri } = await call('Filesystem', 'writeFile', { path: name, data, directory: 'CACHE' });
  try {
    await call('Share', 'share', { files: [uri], dialogTitle: 'Save your Noodlit' });
    return 'shared';
  } catch (err) {
    if (isCancel(err)) return 'cancelled';
    throw err;
  } finally {
    call('Filesystem', 'deleteFile', { path: name, directory: 'CACHE' }).catch(() => {});
  }
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'saved';
}

// Touch-first devices get the share sheet (it's how a picture reaches Photos); computers download.
const touchFirst = () => window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(pointer: fine)').matches;

export async function saveSnapshot(canvas, sceneName) {
  const blob = await toBlob(canvas);
  const name = snapshotName(sceneName);
  if (NATIVE && hasPlugin('Filesystem') && hasPlugin('Share')) return saveNative(blob, name);
  const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
  if ((NATIVE || touchFirst()) && file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      if (isCancel(err)) return 'cancelled';
      // Some browsers refuse share() outside a fresh tap; fall back to a download.
    }
  }
  return download(blob, name);
}
