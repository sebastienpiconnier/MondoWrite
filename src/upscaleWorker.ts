// Worker de l'agrandisseur (upscaler.ts) : onnxruntime-web, WebGPU si l'appareil l'a, sinon WebAssembly sur un
// seul fil (l'app n'est pas « cross-origin isolated »). Le moteur WebAssembly et le modèle arrivent en octets
// (téléchargés et vérifiés par upscaler.ts) : rien n'est lu ailleurs.

import * as ort from "ort-webgpu-extern";
// Petit module de liaison du moteur (53 Ko) : servi par l'app, chargé par onnxruntime-web à la place du sien.
import glueUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";

type Request = { type: "init"; model: ArrayBuffer; runtime: ArrayBuffer } | { type: "run"; id: number; data: Float32Array; width: number; height: number };

let session: ort.InferenceSession | null = null;

type GpuAdapter = { isFallbackAdapter?: boolean; info?: { isFallbackAdapter?: boolean } };
/** Une vraie carte graphique : un adaptateur WebGPU qui n'est pas l'émulation logicielle (plus lente que WebAssembly). */
async function realGpu(): Promise<boolean> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<GpuAdapter | null> } }).gpu;
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter();
    return !!adapter && !adapter.isFallbackAdapter && !adapter.info?.isFallbackAdapter;
  } catch {
    return false;
  }
}

async function init(model: ArrayBuffer, runtime: ArrayBuffer): Promise<string> {
  ort.env.wasm.wasmBinary = runtime;
  ort.env.wasm.wasmPaths = { mjs: new URL(glueUrl, self.location.href).href };
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  if (await realGpu()) {
    try {
      session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ["webgpu"] });
      return "webgpu";
    } catch {
      session = null;
    }
  }
  session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ["wasm"] });
  return "wasm";
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      const backend = await init(m.model, m.runtime);
      self.postMessage({ type: "ready", backend });
      return;
    }
    if (!session) throw new Error("pas de session");
    const input = new ort.Tensor("float32", m.data, [1, 3, m.height, m.width]);
    const result = await session.run({ input });
    const output = result.output;
    const data = (await output.getData()) as Float32Array;
    const [, , h, w] = output.dims;
    const copy = new Float32Array(data);
    output.dispose?.();
    self.postMessage({ type: "done", id: m.id, data: copy, width: w, height: h }, { transfer: [copy.buffer] });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err) });
  }
};
