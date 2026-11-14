// onnxruntime-web sans son moteur WebAssembly embarqué (alias de vite.config.ts) : mêmes types que le paquet.
declare module "ort-webgpu-extern" {
  export * from "onnxruntime-web";
}
