# kdens3 无损权重存储

2026-11-07。本次仅压缩存储，不训练、不剪枝、不减少学生网络，不改变三模型 masked-softmax 概率平均。

## 产物

`artifacts/kdens3-packed/export/model.onnx`：87,210,216 bytes（83.17 MiB）。原文件 173,118,078 bytes，减少 49.62%，低于普通 Git 单文件 100 MiB 限制。

原文件 SHA256：`8aeb71c41d3d94b95825a4ce124619c5eb1613292979eb781673b12514e1e883`。

新文件 SHA256：`14b4e03d29f4ef21789842681e90930f69b2d96b970e64572900b629b8eceb94`。

## 方法与精确性

仅考虑 `students.*` 学习参数。逐个检查 FP32 → FP16 → FP32 的原始字节完全相等后，才转为 FP16 initializer，并在图首增加 Cast 到原 FP32 名称。不能精确还原的参数保留 FP32，非参数常量（例如 mask 的 -1e9）始终保留原样。

498 个参数全部精确还原；原 630 个计算节点的序列化内容逐字节保持，输入输出与三网集成算法不变。所有 initializer 从新图独立重建后与原图逐字节比较通过，ONNX full checker 通过，原文件哈希未变。每个张量的形状、原值/存储/还原哈希见 `export/export-report.json`。

Cast 属于常量还原，运行时可折叠；计算仍为 FP32。包体减少不代表运行内存减半，也不保证所有浏览器或硬件的延迟不变。

## 浏览器验证

Edge 157.0.4341.42，ONNX Runtime Web 1.31.1，RX 9060 XT。`browser/report.json` 中 WASM 和真实 WebGPU 各验证 100 个真实局面，动作均 100/100 一致。与原 PyTorch golden 的最大概率误差分别 4.768e-7、5.364e-7，均通过原容差。WebGPU 输出确认为 GPU buffer，没有软件适配器。没有外部请求或 ZIP/WHL 请求。

同一时段依次测原版和打包版，各预热 5 次、测量 50 次（3 个 golden 验证样本，耗时重复使用同一基准输入）：

| 后端 | 原版 p50 / p95 ms | 打包版 p50 / p95 ms |
|---|---:|---:|
| WASM | 81.8 / 83.8 | 82.3 / 88.2 |
| WebGPU | 28.4 / 30.6 | 28.0 / 29.7 |

证据位于 `comparison-original/`、`comparison-packed/`。中位延迟接近，WASM 此次尾延迟略高；本机同时进行前端工作，不能据此宣称所有设备绝不变慢。没有新增完整对战胜率评估；精确还原与计算节点不变是保持策略的主要证据。

## 复现

```powershell
.\.venv\python.exe scripts\pack_kdens3_lossless.py --output artifacts/kdens3-packed/export-recheck
node web\browser-smoke\run.mjs --export-dir artifacts/kdens3-packed/export-recheck --output-dir artifacts/kdens3-packed/browser-recheck --cases 100 --repeats 20
```

脚本拒绝覆盖已有输出目录。浏览器服务增加 Content-Length，仅提供模型、fixtures 和 ONNX runtime。

模型来源：[Dannibal/ijcai-mahjong-ckpts-2026](https://huggingface.co/Dannibal/ijcai-mahjong-ckpts-2026)，固定 revision `6964d80b9f8a6670dda44f14b664c61112f61009`，发布页标注 MIT。发布时保留原模型来源和许可记录。棋牌室已接入此打包模型，进入麻将后按需加载，优先 WebGPU、初始化失败回退 WASM，界面显示实际推理后端与统计。
