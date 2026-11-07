# 闲局 · 浏览器棋牌室

React + TypeScript + Vite + Mantine 静态网页，麻将游戏独立放在 `src/games/mahjong/`。规则为复式国标：136 张无花牌、8 番起和。当前通过 ONNX Runtime Web 使用 kdens3 ONNX 模型，优先 WebGPU，初始化失败回退 WASM。无账号或服务端数据库。

## 本地运行

在此目录执行：

```powershell
npm.cmd ci --cache ../../.npm-cache
npm.cmd run dev
```

访问命令输出的本地地址。生产构建 `npm.cmd run build`，预览 `npm.cmd run preview`。部署 GitHub Pages 时发布 `dist/` 内容；Vite 已设 `base: './'`，支持项目子路径。源码和构建使用 HTTP 服务，不支持双击 `index.html` 的 file 协议。

## 目录职责

```text
src/app/                大厅、页面切换与游戏注册 registry.ts
src/shared/             通用样式和主题令牌
src/games/mahjong/      麻将组件、牌面、交互状态、样式与类型
```

新增游戏在 `src/games/<game-id>/` 新建独立组件、类型和样式，通过 `src/app/registry.ts` 注册入口与预览组件。组件接收 `onBack`，页面离开时由 React 卸载；游戏专属状态和逻辑不得放入大厅或其他游戏目录。当前仅有麻将可进入，其他名称仅表示筹备方向。

## 玩法

自动对战：默认暂停，打开手牌旁的「自动对战」开关后，四家均由 kdens3 托管，包含本席东家，无需用户选牌或出牌。关闭开关即暂停；若已有一步正在计算，该步完成后不再继续。结束显示得分和番种。重新开局或切换模式会开始新牌局并关闭自动开关；点击当前模式不会重置牌局。

逐步观战：四家均由 AI 控制并显示手牌，只有点击「计算下一步」才推进一个引擎步骤；不会自动连续计算。一次步骤可能仅处理摸牌或等待响应，不一定产生弃牌。

手牌旁可选「轻松／标准／高手」，四席共用。默认高手，保留完整原版 kdens3 决策；中低档增加受控随机选择降低难度，没有额外搜索或超原版增强。设置保存在本机，切换后下一步生效，不重开牌局或重新下载模型。正在计算时暂不能更改；信息栏显示最近实际执行的档位。

音效通过 Howler 播放两段自制合成短 WAV，非真实麻将录音。默认关闭，可由用户开启。对局实际推进播放落牌提示，结算播放提示音；关闭音效或离开游戏停止声音，没有背景音乐。

## 本地数据

`localStorage` 保存 JSON 的牌墙种子、模式、动作序列以继续未完成牌局；保存最近 30 局战绩及速度、音效设置。数据仅在当前浏览器和站点来源内使用，不上传服务器；清除浏览器数据会移除记录。读取时校验格式。恢复错误会保留原存档并显示重试；只有明确点击「放弃存档新开局」才放弃旧进度。禁用存储或写入失败会提示，当前对局仍可继续，但关闭或刷新后可能无法恢复。

## 静态运行时与部署

Python 状态机在 Web Worker 中通过 Pyodide 运行，NumPy 及 Python 标准库均部署于 `public/runtime/pyodide/`。国标算番使用 `public/runtime/mcr/scorer.mjs` 与 `scorer.wasm`，源版本和编译命令见同目录 `sources.json`。构建时 Vite 将 `public/` 原样复制到 `dist/`，发布时必须包含整个运行时目录，不能只上传 JS/CSS。大厅不启动麻将 Worker 或加载模型；进入游戏后才加载游戏组件、运行时与模型。下载进度来自实际接收字节，未知总量或初始化阶段显示不定进度。界面展示实际推理后端、调用数和最近一次推理耗时。当前不是离线 PWA。

本地发布前执行项目根目录的 `scripts/vendor_arcade_runtime.py`（以该脚本当前参数为准）准备 Pyodide/NumPy，并保留已编译的 mcr 运行时与许可证。若移动站点路径，保持 Vite 相对 base 和 `runtime/` 相对位置。GitHub Pages 发布整个 `dist/`，使用 HTTPS 或 localhost。第三方来源与许可证见 `THIRD_PARTY_NOTICES.md`。

## 游戏接口

`engine/client.ts` 提供异步 start / advance / autoAdvance / restore / dispose；`engine/types.ts` 定义视图与 JSON replay。`LiveGame.tsx` 根据裁判输出渲染并请求 AI 推进一步。kdens3 通过麻将目录内的 ONNX 适配接入，仍由规则层校验各席合法动作并推进牌局。

按键与弹窗使用 Mantine；自制牌面与牌桌使用 CSS。支持键盘焦点、选中状态及 `prefers-reduced-motion`；移动端手牌区独立横向滚动。

牌桌的“全屏”按钮优先请求浏览器原生全屏，手机上尝试锁定横屏；不支持或被拒绝时使用页面内沉浸布局，浏览器地址栏可能仍保留，可手动横屏。横屏全屏将牌桌与操作区分栏，自己的手牌分两排，观战手牌可在区域内滚动。退出、浏览器退出全屏或返回大厅会清理方向锁及滚动限制，不重新创建牌局或加载模型。结算弹窗保留在全屏容器内。
