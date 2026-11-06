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

`createMahjongClient(progress)` → `start(seed?, mode?)`, `action(actionId)`, `advance()`, `restore(replay)`, `dispose()`。模式为 `play` 或 `spectate`。`advance()` 每次推进一个环境决策 tick，观战时由界面手动触发，不自动跑完整局。

`GameView.replay` 保存确定性种子、模式和动作序列，可写 localStorage；恢复时从起始牌墙重放，不反序列化 pickle。当前内置启发式策略复用上游向听数，选择只依赖当前 AI 的自身手牌与其观测，不读取对手暗手。人机模式视图不导出对手暗手；观战模式可显示四家手牌，但该透视不传给策略。

## 验证

本地 Python 使用真实 PyMahjongGB 检查：12 个固定种子全 AI 对局能在 400 tick 内结束、结算零和；正常玩家等待/动作 mask、无暗手泄露、非法动作拒绝、种子与动作恢复完全一致。浏览器 WASM scorer 的运行验证由主线程集成后执行，不能将 Python 结果冒充浏览器通过。

补充 10 项测试已通过：自摸和绝张将不足八番的手牌提升到合法胡牌，弃牌与抢杠绝张标志，吃碰明杠/暗杠/补杠 mask，副露组合龙，无番和真实终局，对手暗杠日志与视图遮蔽，计分桥故障注入。计分桥仅将原库预期的 -1/-2/-3 结果视为普通非法胡牌；未知结果与运行时异常以 BaseException 穿透上游宽泛捕获，界面必须显式报错。

运行：`.venv\python.exe web/arcade/src/games/mahjong/engine/python/test_browser_game.py`。
