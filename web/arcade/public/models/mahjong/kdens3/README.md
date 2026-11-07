# kdens3 · FP16 存储 / FP32 计算

来源：https://huggingface.co/Dannibal/ijcai-mahjong-ckpts-2026

上游固定提交：`6964d80b9f8a6670dda44f14b664c61112f61009`。发布页标注 `license: mit`，原模型卡保存在 `UPSTREAM_MODEL_CARD.md`。请再分发时保留上游许可和来源记录。

`model.onnx` 为三个学生网络的 masked-softmax 概率平均，87,210,216 字节（83.17 MiB），小于 GitHub 普通 Git 的 100 MiB 单文件限制。SHA-256：`14b4e03d29f4ef21789842681e90930f69b2d96b970e64572900b629b8eceb94`。

压缩方式为可精确还原的权重转 FP16，加常量 Cast 恢复 FP32；630 个原计算节点保持不变，保留完整三网集成。逐参数 roundtrip 逐位一致，无重训、量化舍入、剪枝或删减学生网络。详见 `export-report.json`。此为存储压缩，运行时计算内存不会相应减半。

当前麻将游戏已通过 ONNX Runtime Web 接入此模型，进入游戏后才下载与初始化。优先使用 WebGPU，初始化失败时回退 WASM；界面展示实际后端与推理统计。
