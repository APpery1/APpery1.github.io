const assetUrl = `${import.meta.env.BASE_URL}models/city.glb`;
let download: Promise<ArrayBuffer> | undefined;
let progress = 0;
const listeners = new Set<(value: number) => void>();

const report = (value: number) => {
  progress = value;
  for (const listener of listeners) listener(value);
};

async function fetchModel() {
  performance.mark("city-download-start");
  const response = await fetch(assetUrl, {
    signal: AbortSignal.timeout(45000),
    priority: "high",
  });
  if (!response.ok)
    throw new Error(`City download failed (${response.status}).`);
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    report(1);
    performance.mark("city-download-end");
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  const header = new Uint8Array(12);
  let received = 0;
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (received < header.length)
        header.set(value.subarray(0, header.length - received), received);
      chunks.push(value);
      received += value.byteLength;
      // The GLB header gives the decoded length even when gzip responses omit
      // Content-Length or report the smaller compressed size.
      if (!total && received >= header.length) {
        const view = new DataView(header.buffer);
        if (view.getUint32(0, true) !== 0x46546c67)
          throw new Error("The city response is not a GLB model.");
        total = view.getUint32(8, true);
        if (total < header.length)
          throw new Error("Invalid city model length.");
      }
      if (total) report(Math.min(1, received / total));
    }
    if (!total || received !== total)
      throw new Error("The city download is incomplete.");
    const buffer = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    report(1);
    performance.mark("city-download-end");
    return buffer.buffer;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function loadCityBytes(onProgress?: (value: number) => void) {
  if (!download) {
    progress = 0;
    download = fetchModel().catch((error: unknown) => {
      download = undefined;
      throw error;
    });
  }
  if (!onProgress) return download;
  listeners.add(onProgress);
  onProgress(progress);
  return download.finally(() => listeners.delete(onProgress));
}
