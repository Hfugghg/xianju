# kdens3 · FP16 存储 / FP32 计算

来源：https://huggingface.co/Dannibal/ijcai-mahjong-ckpts-2026

上游固定提交：`6964d80b9f8a6670dda44f14b664c61112f61009`。发布页标注 `license: mit`，原模型卡保存在 `UPSTREAM_MODEL_CARD.md`。请再分发时保留上游许可和来源记录。

`model.onnx` 为三个学生网络的 masked-softmax 概率平均，87,210,216 字节（83.17 MiB），小于 GitHub 普通 Git 的 100 MiB 单文件限制。SHA-256：`14b4e03d29f4ef21789842681e90930f69b2d96b970e64572900b629b8eceb94`。

压缩方式为可精确还原的权重转 FP16，加常量 Cast 恢复 FP32；630 个原计算节点保持不变，保留完整三网集成。逐参数 roundtrip 逐位一致，无重训、量化舍入、剪枝或删减学生网络。详见 `export-report.json`。此为存储压缩，运行时计算内存不会相应减半。

当前大厅中的麻将游戏默认使用基础启发式 AI，尚未接入此 ONNX。不要将基础 AI 的表现视为 kdens3 表现。
