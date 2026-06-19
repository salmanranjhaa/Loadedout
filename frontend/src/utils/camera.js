// I capture meal/barcode images reliably on BOTH native (Capacitor) and web.
//
// Why this exists: the food Photo/Barcode features used raw web APIs
// (`<input type=file capture>`, `getUserMedia`, `BarcodeDetector`) that the
// Android WebView does not reliably support — the camera wouldn't open and
// picked images often never came back. On native we go through the official
// `@capacitor/camera` plugin (handles runtime permissions + returns base64
// directly); on web we fall back to a file input + canvas downscale.
import { isNativePlatform } from "./api";

// ── Web helpers ───────────────────────────────────────────────────────────────

// I downscale a File to a jpeg data URL so uploads stay small and the backend's
// 8MB limit is never hit. Returns the full `data:image/jpeg;base64,...` string.
function fileToDownscaledDataUrl(file, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    img.src = url;
  });
}

// I open the OS file chooser from a transient <input>. `capture` hints the
// camera on mobile browsers; omitting it lets the user pick from the gallery.
function pickFileViaInput(capture) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (capture) input.capture = "environment";
    input.style.display = "none";
    // `onchange` never fires if the user cancels; we resolve null on focus-back
    // so callers don't hang forever waiting on a dismissed picker.
    let settled = false;
    const done = (val) => { if (!settled) { settled = true; cleanup(); resolve(val); } };
    const onChange = () => done(input.files?.[0] || null);
    const onFocus = () => setTimeout(() => done(input.files?.[0] || null), 500);
    function cleanup() {
      input.removeEventListener("change", onChange);
      window.removeEventListener("focus", onFocus);
      input.remove();
    }
    input.addEventListener("change", onChange);
    window.addEventListener("focus", onFocus, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * I return a meal/product image as `{ base64, dataUrl }` where `base64` is the
 * raw jpeg payload (no `data:` prefix) ready for the backend, and `dataUrl` is
 * the full data URL for <img>/ZXing. Returns null if the user cancelled.
 *
 * @param {Object} opts
 * @param {"prompt"|"camera"|"photos"} [opts.source] capture source on native
 */
export async function pickImage({ source = "prompt" } = {}) {
  if (isNativePlatform()) {
    // Lazy-import so the web bundle never pulls native-only code paths.
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const sourceMap = {
      prompt: CameraSource.Prompt,
      camera: CameraSource.Camera,
      photos: CameraSource.Photos,
    };
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: sourceMap[source] || CameraSource.Prompt,
        quality: 80,
        width: 1280,
        correctOrientation: true,
        promptLabelHeader: "Add photo",
        promptLabelPhoto: "Choose from Gallery",
        promptLabelPicture: "Take Photo",
      });
      if (!photo?.base64String) return null;
      const fmt = photo.format || "jpeg";
      return {
        base64: photo.base64String,
        dataUrl: `data:image/${fmt};base64,${photo.base64String}`,
      };
    } catch (err) {
      // The plugin throws a "User cancelled photos app" error on dismissal —
      // treat that as a no-op rather than a failure the caller must handle.
      const msg = String(err?.message || err || "").toLowerCase();
      if (msg.includes("cancel")) return null;
      throw err;
    }
  }

  // Web: file input + downscale. "camera" hints the rear camera capture UI.
  const file = await pickFileViaInput(source === "camera");
  if (!file) return null;
  const dataUrl = await fileToDownscaledDataUrl(file);
  return { base64: dataUrl.split(",")[1], dataUrl };
}

/**
 * I run a live, native barcode scan on Android using ML Kit (Google's on-device
 * scanner). This is far more reliable than snapshotting a still photo and
 * decoding it with ZXing — ML Kit does continuous multi-frame autofocus scanning
 * and handles glare/skew. Returns the raw barcode string, or null if cancelled.
 *
 * Only call on native; on web use `startLiveBarcodeScan` instead.
 */
export async function scanBarcodeNative() {
  const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");

  const perm = await BarcodeScanner.requestPermissions();
  if (perm.camera !== "granted" && perm.camera !== "limited") {
    throw new Error("Camera permission denied — enable it in app settings");
  }

  // Product barcodes only — restricting formats makes the scan lock on faster.
  const formats = ["Ean13", "Ean8", "UpcA", "UpcE", "Code128", "Code39", "Itf"];
  try {
    const { barcodes } = await BarcodeScanner.scan({ formats });
    return barcodes?.[0]?.rawValue || null; // empty array = user dismissed
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (msg.includes("cancel")) return null;
    throw err;
  }
}

/**
 * I decode a single barcode from a still image data URL using ZXing's pure-JS
 * decoder (works inside the Android WebView, unlike `BarcodeDetector`).
 * Returns the raw barcode string, or null if none was found.
 */
export async function decodeBarcodeFromImage(dataUrl) {
  const { BrowserMultiFormatReader } = await import("@zxing/library");
  const reader = new BrowserMultiFormatReader();
  try {
    const result = await reader.decodeFromImageUrl(dataUrl);
    return result?.getText?.() || null;
  } catch {
    return null; // NotFoundException etc. — no barcode in frame
  } finally {
    reader.reset?.();
  }
}

/**
 * I start a live barcode scan from the rear camera into the given <video>
 * element (web/PWA only — uses getUserMedia). Calls `onResult(text)` on the
 * first decode. Returns a `stop()` function that releases the camera.
 */
export async function startLiveBarcodeScan(videoEl, onResult, onError) {
  const { BrowserMultiFormatReader } = await import("@zxing/library");
  const reader = new BrowserMultiFormatReader();
  let stopped = false;
  const stop = () => {
    stopped = true;
    try { reader.reset(); } catch {}
  };
  try {
    await reader.decodeFromVideoDevice(undefined, videoEl, (result) => {
      if (stopped || !result) return;
      stop();
      onResult(result.getText());
    });
  } catch (err) {
    if (!stopped) onError?.(err);
  }
  return stop;
}
