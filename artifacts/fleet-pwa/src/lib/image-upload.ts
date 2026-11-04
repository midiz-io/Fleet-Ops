import { supabase } from "@/lib/supabase";

/**
 * Resizes and compresses an image file or blob to a lightweight JPEG (typically 30-60 KB).
 * This prevents mobile browser memory spikes / crashes and ensures ultra-fast uploads.
 */
export async function compressImage(
  fileOrBlob: File | Blob,
  quality = 0.5,
  maxDim = 1000
): Promise<Blob> {
  // If already a tiny blob (under 80KB) and is JPEG, can return directly
  if (fileOrBlob.size < 80 * 1024 && (fileOrBlob.type === "image/jpeg" || fileOrBlob.type === "image/webp")) {
    return fileOrBlob;
  }

  let width: number;
  let height: number;
  let imageSource: CanvasImageSource;

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(fileOrBlob);
      imageSource = bitmap;
      width = bitmap.width;
      height = bitmap.height;
    } catch {
      return compressImageFallback(fileOrBlob, quality, maxDim);
    }
  } else {
    return compressImageFallback(fileOrBlob, quality, maxDim);
  }

  if (width > height) {
    if (width > maxDim) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    }
  } else {
    if (height > maxDim) {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    if ("close" in imageSource && typeof (imageSource as ImageBitmap).close === "function") {
      (imageSource as ImageBitmap).close();
    }
    return compressImageFallback(fileOrBlob, quality, maxDim);
  }

  ctx.drawImage(imageSource, 0, 0, width, height);

  if ("close" in imageSource && typeof (imageSource as ImageBitmap).close === "function") {
    (imageSource as ImageBitmap).close();
  }

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        // Free canvas reference
        canvas.width = 0;
        canvas.height = 0;
        if (blob) {
          resolve(blob);
        } else {
          // Fallback to original if canvas fails
          resolve(fileOrBlob);
        }
      },
      "image/jpeg",
      quality
    );
  });
}

function compressImageFallback(fileOrBlob: File | Blob, quality: number, maxDim: number): Promise<Blob> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);

        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) {
          return resolve(fileOrBlob);
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            canvas.width = 0;
            canvas.height = 0;
            if (blob) resolve(blob);
            else resolve(fileOrBlob);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(fileOrBlob);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(fileOrBlob);
    reader.readAsDataURL(fileOrBlob);
  });
}

/**
 * Converts a Blob to a base64 data URL.
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(blob);
  });
}

/**
 * Converts a base64 Data URL to a Blob so restored draft photos can be uploaded cleanly.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  try {
    const parts = dataUrl.split(",");
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const bstr = atob(parts[1] || "");
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (e) {
    console.error("Failed to convert dataUrl to Blob:", e);
    return new Blob([], { type: "image/jpeg" });
  }
}

/**
 * Uploads an image to Supabase Storage with high speed.
 * If Supabase Storage is slow, offline, or returns an error, it seamlessly falls
 * back to an inlined lightweight compressed base64 Data URL (~35KB).
 * This ensures the app NEVER crashes or fails to save proof photos!
 */
export async function uploadImage(
  fileOrBlob: File | Blob,
  options?: { timeoutMs?: number; label?: string; bucket?: string }
): Promise<string> {
  const timeoutMs = options?.timeoutMs || 8000;
  const bucket = options?.bucket || "checklist-photos";

  // Pre-compress to ensure minimal payload (around 30-50KB)
  const compressedBlob = await compressImage(fileOrBlob, 0.5, 1000);

  // Attempt 1: Upload directly to Supabase Storage bucket
  try {
    const fileName = `fuel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;

    const storageUploadPromise = supabase.storage
      .from(bucket)
      .upload(fileName, compressedBlob, {
        contentType: "image/jpeg",
        upsert: true,
      });

    const timeoutPromise = new Promise<{ error: Error }>((_, reject) =>
      setTimeout(() => reject(new Error("Storage upload timed out")), timeoutMs)
    );

    const result = (await Promise.race([storageUploadPromise, timeoutPromise])) as any;

    if (!result?.error) {
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
      if (urlData?.publicUrl) {
        return urlData.publicUrl;
      }
    } else {
      console.warn(`Supabase storage upload failed for ${options?.label || "photo"}:`, result.error?.message);
    }
  } catch (storageErr: any) {
    console.warn(`Supabase storage threw for ${options?.label || "photo"}:`, storageErr?.message || storageErr);
  }

  // Attempt 2: Crash-proof instant fallback - inline compressed base64 data URL
  // The compressed image is ~35KB, which Postgres text columns easily store.
  try {
    const dataUrl = await blobToDataUrl(compressedBlob);
    return dataUrl;
  } catch (dataUrlErr) {
    console.error("Base64 fallback failed:", dataUrlErr);
    throw new Error(`Failed to process ${options?.label || "photo"}. Please try again.`);
  }
}

/**
 * Uploads multiple images in parallel with real-time aggregate progress reporting.
 */
export async function uploadMultipleImagesParallel(
  items: { fileOrBlob: File | Blob; label: string }[],
  onProgress?: (completed: number, total: number, currentLabel: string) => void
): Promise<string[]> {
  const total = items.length;
  let completed = 0;

  const uploadPromises = items.map(async (item) => {
    try {
      const url = await uploadImage(item.fileOrBlob, { label: item.label, timeoutMs: 8000 });
      completed++;
      if (onProgress) {
        onProgress(completed, total, item.label);
      }
      return url;
    } catch (err) {
      // Fallback: convert directly to data URL so parallel batch doesn't fail
      try {
        const compressed = await compressImage(item.fileOrBlob, 0.4, 800);
        const dataUrl = await blobToDataUrl(compressed);
        completed++;
        if (onProgress) {
          onProgress(completed, total, item.label);
        }
        return dataUrl;
      } catch {
        throw err;
      }
    }
  });

  return Promise.all(uploadPromises);
}
