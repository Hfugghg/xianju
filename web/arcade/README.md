# 闲局 · 浏览器棋牌室

React + TypeScript + Vite + Mantine 静态网页，麻将游戏独立放在 `src/games/mahjong/`。规则为复式国标：136 张无花牌、8 番起和。当前使用基础启发式 AI，尚未接入 kdens3 / ONNX 模型。无账号或服务端数据库。

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

人机对战：你控制东家，其他三家由基础 AI 控制。选择手牌后点击出牌；合法吃、碰、杠、补杠、胡、过会按局面提供，吃与杠按钮显示关联牌。结束显示得分和番种。重新开局与切换模式会开始新牌局。

逐步观战：四家均由 AI 控制并显示手牌，只有点击「计算下一步」才推进一个引擎步骤；不会自动连续计算。一次步骤可能仅处理摸牌或等待响应，不一定产生弃牌。

音效通过 Howler 播放两段自制合成短 WAV，非真实麻将录音。默认关闭，可由用户开启，没有背景音乐。

## 本地数据

`localStorage` 保存 JSON 的牌墙种子、模式、动作序列以继续未完成牌局；保存最近 30 局战绩及速度、音效设置。数据仅在当前浏览器和站点来源内使用，不上传服务器；清除浏览器数据会移除记录。读取时校验格式。恢复错误会保留原存档并显示重试；只有明确点击「放弃存档新开局」才放弃旧进度。禁用存储或写入失败会提示，当前对局仍可继续，但关闭或刷新后可能无法恢复。

## 静态运行时与部署

Python 状态机在 Web Worker 中通过 Pyodide 运行，NumPy 及 Python 标准库均部署于 `public/runtime/pyodide/`。国标算番使用 `public/runtime/mcr/scorer.mjs` 与 `scorer.wasm`，源版本和编译命令见同目录 `sources.json`。构建时 Vite 将 `public/` 原样复制到 `dist/`，发布时必须包含整个运行时目录，不能只上传 JS/CSS。首次打开会下载本网站提供的运行时，当前不是离线 PWA。

本地发布前执行项目根目录的 `scripts/vendor_arcade_runtime.py`（以该脚本当前参数为准）准备 Pyodide/NumPy，并保留已编译的 mcr 运行时与许可证。若移动站点路径，保持 Vite 相对 base 和 `runtime/` 相对位置。GitHub Pages 发布整个 `dist/`，使用 HTTPS 或 localhost。第三方来源与许可证见 `THIRD_PARTY_NOTICES.md`。

## 后续接入

`engine/client.ts` 提供异步 start / action / advance / restore / dispose；`engine/types.ts` 定义视图与 JSON replay。`LiveGame.tsx` 根据裁判输出渲染并仅发送合法 action id。新 AI 应通过麻将目录内独立适配接入，不能绕过规则层直接更新手牌。

按键与弹窗使用 Mantine；自制牌面与牌桌使用 CSS。支持键盘焦点、选中状态及 `prefers-reduced-motion`；移动端手牌区独立横向滚动。
