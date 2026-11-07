# 每游戏模型保存

牌桌内的“保存 AI 模型”默认关闭，用户手动开启后才将该游戏模型保存到 IndexedDB。首次下载中开启会在完整校验后保存；加载完成后开启复用已下载的模型，不再次下载。重新进入游戏时先读取对应版本并检查大小及 SHA-256，失败则删除该版本并重新下载。普通 HTTP 缓存仍由浏览器管理。

关闭会取消该游戏的保存偏好，并删除该游戏所有版本模型；不会清理存档、其他游戏数据或中断当前推理。各游戏分别使用 gameId，麻将为 mahjong，当前版本 kdens3-14b4e03d。偏好和模型写入使用同一 IndexedDB 事务作用域，跨标签页关闭与迟到保存按事务序列执行，防止关闭后写回。

数据库 xianju.model-cache.v1，preferences 存储 gameId → boolean，models 存储 [gameId,version] → ArrayBuffer。没有将模型转成字符串，也没有自动申请持久存储权限。配额不足或存储不可用会显示提示，游戏仍使用已下载模型继续；浏览器或用户清理站点数据后需要重新下载。

为支持加载完成后再开启，worker 保留初次加载 Uint8Array 的一个引用，直到离开牌桌终止 worker，不额外复制一份 83.2 MiB 模型。关闭磁盘缓存不会释放这份当前游戏内存。模型初始化和 GPU 资源仍有各自的运行内存需求。

仅保存模型并不保证整站离线可玩，规则引擎和网页资源仍按原有方式加载。大厅不初始化此游戏模型。

事务实现参考 [MDN IDBDatabase.transaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction)。

## 验证

2026-11-08：独立代码评审及生产构建通过。真实 Edge 的 13 项缓存验收覆盖默认关闭、手动保存、模型地址不可访问时仍命中缓存并真实推理、其他游戏隔离、下载中关闭防迟到写、损坏/旧版本/显式 undefined 记录修复、新旧版本双标签页不反复写入、同版本不重复保存、存储被拒绝、无 BroadcastChannel，以及 320px 与短横屏布局。另强制 WASM 验证保存后再次进入零模型请求并真实推理。

既有自动对战/暂停/逐步观战、三档难度、实际音效、懒加载与取消、1440/390/320px 响应式，以及四种尺寸全屏进入/退出和四家明手回归通过。此轮为烟测，不重复声称完整对局结算已经重测；手机为桌面浏览器调整视口，存储拒绝为故障注入，未测试实体手机或实际填满磁盘。

报告：[缓存](verification/model-cache.json)、[WASM 缓存](verification/model-cache-wasm.json)、[对局控制回归](verification/model-cache-controls.json)、[全屏回归](verification/model-cache-fullscreen.json)。最终 worker 为 `worker-DfMp25DC.js`，SHA-256 `d8b75b28f96236e4f46577cd549d6071505bb32abb37c5f93928101dbf0d47e1`。
