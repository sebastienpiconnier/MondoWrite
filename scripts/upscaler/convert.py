#!/usr/bin/env python3
# Agrandisseur de la couverture complète (#78, lot 4) : convertit le modèle compact de Real-ESRGAN
# (realesr-general-x4v3.pth, licence BSD 3 clauses, https://github.com/xinntao/Real-ESRGAN) en ONNX,
# sans PyTorch : les poids sont lus dans l'archive .pth (pickle de torch) et le réseau, SRVGGNetCompact
# (convolution 3×3, PReLU, 32 couches, PixelShuffle ×4, plus l'image agrandie au plus proche), est écrit
# nœud par nœud avec le paquet `onnx`. Usage :
#   pip install onnx numpy onnxruntime
#   python3 scripts/upscaler/convert.py realesr-general-x4v3.pth realesr-general-x4v3.onnx
# Puis `node scripts/upscaler/build.mjs realesr-general-x4v3.onnx` prépare dist-upscaler/ (voir README.md).

import hashlib, io, json, os, pickle, sys, zipfile
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

DTYPES = {"FloatStorage": np.float32, "HalfStorage": np.float16}


def load_pth(path):
    """Dictionnaire nom → tableau numpy, lu dans le format zip de torch.save."""
    z = zipfile.ZipFile(path)
    root = z.namelist()[0].split("/")[0]

    class Storage:
        def __init__(self, kind, key):
            self.kind, self.key = kind, key

    def rebuild(storage, offset, size, stride, *_):
        data = np.frombuffer(z.read(f"{root}/data/{storage.key}"), dtype=DTYPES[storage.kind])
        n = int(np.prod(size)) if size else 1
        flat = data[offset : offset + n] if all(stride[i] >= stride[i + 1] for i in range(len(stride) - 1)) else None
        if flat is None:
            raise ValueError("tenseur non contigu")
        return flat.reshape(size).astype(np.float32)

    class Unpickler(pickle.Unpickler):
        def find_class(self, module, name):
            if module == "torch._utils" and name == "_rebuild_tensor_v2":
                return rebuild
            if module == "torch" and name in DTYPES:
                return name
            if module == "collections" and name == "OrderedDict":
                import collections
                return collections.OrderedDict
            raise pickle.UnpicklingError(f"refusé : {module}.{name}")

        def persistent_load(self, pid):
            _, kind, key, *_ = pid
            return Storage(kind if isinstance(kind, str) else kind.__name__, key)

    obj = Unpickler(io.BytesIO(z.read(f"{root}/data.pkl"))).load()
    return obj.get("params_ema") or obj.get("params") or obj


def build(weights, upscale=4):
    convs = sorted({int(k.split(".")[1]) for k in weights if k.endswith(".weight") and weights[k].ndim == 4})
    nodes, inits = [], []
    x = "input"
    for i, idx in enumerate(convs):
        w, b = weights[f"body.{idx}.weight"], weights[f"body.{idx}.bias"]
        inits += [numpy_helper.from_array(w, f"w{idx}"), numpy_helper.from_array(b, f"b{idx}")]
        out = f"c{idx}"
        nodes.append(helper.make_node("Conv", [x, f"w{idx}", f"b{idx}"], [out], pads=[1, 1, 1, 1], kernel_shape=[3, 3]))
        x = out
        act = weights.get(f"body.{idx + 1}.weight")
        if i < len(convs) - 1:
            slope = act.reshape(-1, 1, 1).astype(np.float32)
            inits.append(numpy_helper.from_array(slope, f"a{idx + 1}"))
            nodes.append(helper.make_node("PRelu", [x, f"a{idx + 1}"], [f"p{idx + 1}"]))
            x = f"p{idx + 1}"
    nodes.append(helper.make_node("DepthToSpace", [x], ["up"], blocksize=upscale, mode="CRD"))
    inits.append(numpy_helper.from_array(np.array([1, 1, upscale, upscale], dtype=np.float32), "scales"))
    nodes.append(helper.make_node("Resize", ["input", "", "scales"], ["base"], mode="nearest"))
    nodes.append(helper.make_node("Add", ["up", "base"], ["output"]))
    graph = helper.make_graph(
        nodes,
        "realesr-general-x4v3",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 3, "h", "w"])],
        [helper.make_tensor_value_info("output", TensorProto.FLOAT, [1, 3, "H", "W"])],
        inits,
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)], producer_name="mondowrite")
    model.ir_version = 8
    onnx.checker.check_model(model)
    return model


def main(src, dest):
    model = build(load_pth(src))
    onnx.save(model, dest)
    data = open(dest, "rb").read()
    print(dest, len(data), hashlib.sha256(data).hexdigest())


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
