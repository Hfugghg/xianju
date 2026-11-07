# 浏览器国标麻将引擎

此实现采用 136 张无花、四家独立牌墙的复式国标单局，与本项目已验证的比赛环境保持一致。八番起和；吃碰杠胡、抢杠、海底与结算由开源比赛环境和原版算番器负责，不以手牌形状代替合法和牌判断。

## 复用来源

- `engine/python/env.py`, `agent.py`, `env_fixed.py`, `feature_v1.py`, `shanten_py.py`：复制自本项目已经用于 GPU 对战的 `src/battle/`；上游 [LegendXct/Chinese-Standard-Mahjong-AI](https://github.com/LegendXct/Chinese-Standard-Mahjong-AI)，MIT，原许可保存在 `engine/python/LICENSE-LegendXct`。
- `shanten_table.py`：同一上游的邻近本地项目文件；查表文件不存在时使用其原有递归路径，不生成或伪造表。
- `feature.py`：本项目已固定下载的 Dannibal 作者 38 通道观测与 235 动作编码器，来自 `data/provenance/model-availability/feature.py`；模型来源和许可详见 `docs/open-model-availability.md`。
- 原版 C++ 国标算番器由主线程编译为 WASM，通过 `MahjongGB` 兼容模块向 Python 提供原 API。
- Python、NumPy 由本地 Pyodide runtime 加载。牌局在 Worker 运行，不需要 Python 服务或数据库。

## 本地资源传输与下载器兼容

为避免 IDM 等浏览器下载扩展接管标准库 ZIP 或 NumPy wheel 请求，运行资源使用本地 JSON Base64 传输。Python 标准库解码为临时 Blob URL，显式传给 Pyodide 的 `stdLibURL`，初始化后释放。仅麻将 Worker 中、同源且位于 `runtime/pyodide/` 下的 `.whl` fetch 请求会改取相应 `.whl.json`，解码为原始字节响应；其余网络请求、Blob 和页面 fetch 不变。原始 Request 选项和显式 init 会保留。Pyodide 官方 loader 仍负责 wheel 解析、链接和完整性校验，未修改运行库本身。

Pyodide 0.27.7 的 loader 使用 fetch SRI SHA-256；该哈希属于 wheel 原始字节而不是 JSON。因此 JSON HTTP 请求不携带 wheel 的 integrity，适配器在解码后使用 Web Crypto 按原始 integrity 校验字节，失败显式报错。loadPackage 后还实际执行 `import numpy`，防止 loader 只记录错误而未 reject 时继续初始化空环境。

新增代码只承担浏览器消息、界面安全视图、回放及 AI 策略编排。`BrowserAgent` 使公开动作 mask 的绝张/抢杠语义与修复裁判一致，并在非法动作时显式失败。

## API

`createMahjongClient(progress)` → `start(seed?, mode?)`, `advance()`, `restore(replay)`, `dispose()`。模式为 `play` 或 `spectate`。`advance()` 每次推进一个环境决策 tick，观战时由界面手动触发，不自动跑完整局。

`GameView.replay` 保存种子、模式、`policy: 'kdens3-v1'` 和每一步各席实际动作，恢复时重放已记录动作，不重新推理。旧启发式存档明确拒绝，用户可保留重试或明确放弃。动作需符合当时各席合法 mask，最多 1000 步。

当前四席均使用已发布的 kdens3 三学生集成 ONNX。Worker 向 Python 请求各席独立的 38×4×9 观测和 235 动作 mask，异步调用 ONNX Runtime 后，提交经过合法性校验的动作。观战透视只用于界面，不传给模型。上游编码器文件与已验证模型来源的编码器 SHA-256 完全相同。

进入麻将后才下载模型，stream 字节累积进度以已知 87,210,216 字节为分母，完成后校验固定 SHA-256。优先 WebGPU，不可用时使用单线程 WASM；模型失败不会改用启发式。`GameView.ai` 提供真实后端、推理调用数及最近耗时。恢复动作不计作推理。ORT 的 MJS/WASM 全部同源。初始化可由 `createMahjongClient` 的第三参数 AbortSignal 终止。

## 验证

### 页面难度

四席共用轻松、标准、高手设置，默认高手；下一步生效，设置保存本机，不改已有回放动作、不重开或重载模型。高手保持原版合法动作 argmax（同分取较小动作编号）；标准以 85% 概率保留首选，否则在第 2–3 候选按模型概率采样；轻松以 45% 概率保留首选，否则在第 2–5 候选采样。低档只选合法动作，合法胡牌直接胡；单合法动作直接返回。随机数由牌局种子、步数、席位和档位独立派生，不消耗牌墙随机流。模型本身未改变，不增加推理或搜索；档位没有经过胜率标定，不代表高手超过原版。

策略测试：`node scripts/test_difficulty.mjs`；可选附加原版 golden fixtures 路径。此次 100 个 golden 动作完全一致，10000 个种子下标准首选 8516 次、轻松 4442 次；这是选择规则验证，不是对战胜率。浏览器证据：`verification/difficulty-webgpu.json`、`verification/difficulty-wasm.json`，包含三个档位实际步进、存储、历史不变与模型不重复加载；WebGPU 覆盖 1440/390/320px 和整局结算。

本次实际浏览器集成验收记录：`verification/kdens3-integration.json`（WebGPU、1440/390/320px、大厅无 AI 请求、退出取消、完整自动结算、实际步进音效），`verification/kdens3-wasm-integration.json`（模拟 WebGPU 不可用，WASM 实际推理、真实下载字节及音效完整播放）。音效默认关闭，开启后才播放。14 项原生测试和 TypeScript/生产构建通过。以下段落保留最初规则引擎验收背景。

本地 Python 使用真实 PyMahjongGB 检查：12 个固定种子全 AI 对局能在 400 tick 内结束、结算零和；正常玩家等待/动作 mask、无暗手泄露、非法动作拒绝、种子与动作恢复完全一致。浏览器 WASM scorer 的运行验证由主线程集成后执行，不能将 Python 结果冒充浏览器通过。

补充 10 项测试已通过：自摸和绝张将不足八番的手牌提升到合法胡牌，弃牌与抢杠绝张标志，吃碰明杠/暗杠/补杠 mask，副露组合龙，无番和真实终局，对手暗杠日志与视图遮蔽，计分桥故障注入。计分桥仅将原库预期的 -1/-2/-3 结果视为普通非法胡牌；未知结果与运行时异常以 BaseException 穿透上游宽泛捕获，界面必须显式报错。

运行：`.venv\python.exe web/arcade/src/games/mahjong/engine/python/test_browser_game.py`。
