# 闲局 · 浏览器棋牌室

React + TypeScript + Vite + Mantine 构建的静态棋牌室。当前游戏为国标麻将：136 张无花的复式国标、8 番起和，复用开源裁判、合法动作与算番实现。

## 本地启动

需要 Node.js 26 和 npm。

```sh
cd web/arcade
npm ci
npm run dev
```

打开终端显示的本地地址。生产构建使用 `npm run build`，预览使用 `npm run preview`，不支持直接双击 HTML。运行资源已随仓库提供，通常不必重新下载。

## 玩法与数据

- 自动对战：打开手牌旁的开关即可开始，四家均由 kdens3 AI 托管，无需手动出牌；关闭开关暂停，支持完整吃碰杠胡与结算。
- 逐步观战：四个 AI 对战，显示四家手牌，仅手动点击“计算下一步”推进。
- AI 难度：轻松／标准／高手，默认高手，四席共用；切换下一步生效并保存在本机。高手保留完整原版 kdens3，中低档增加受控随机选择；不增加搜索，也不提高原版强度上限。
- 设置、未完成牌局和最近 30 局结果保存在浏览器 localStorage，无账号或云端数据库。
- 桌面与手机响应式；默认静音，可开启 Howler 播放的自制合成提示音。

## 目录

```text
web/arcade/src/app/                大厅与游戏注册
web/arcade/src/shared/             公共 UI、样式与音效
web/arcade/src/games/mahjong/      麻将界面、规则桥和独立状态
web/arcade/public/runtime/         本地 Pyodide、NumPy 和 C++ WASM 算番器
web/arcade/public/models/mahjong/  麻将模型及来源说明
scripts/                         运行资源准备脚本
.github/workflows/pages.yml       GitHub Pages 构建与发布
```

新增游戏使用独立的 `src/games/<id>/` 目录，并在大厅注册。训练语料、虚拟环境和编译工具链不属于此发布仓库。

## 模型

kdens3 压缩版 ONNX 与前端同仓库，位于 `web/arcade/public/models/mahjong/kdens3/`。权重使用 FP16 存储，恢复为 FP32 计算，保留三模型概率集成；原始参数还原逐位一致，未重训或剪枝。压缩包体不代表推理内存减半。

对局通过 ONNX Runtime Web 使用该模型，优先 WebGPU，无法初始化时回退 WASM；界面显示实际后端、累计推理次数和最近一次推理耗时。模型发布卡与转换记录见模型目录。

大厅只加载界面与牌桌预览。进入麻将后才加载游戏组件、Worker、运行时和模型；下载进度使用实际接收字节，初始化阶段使用不定进度。

## 发布

GitHub 仓库 Settings → Pages 选择 GitHub Actions。推送 `main` 或手动启动工作流后，构建并发布 `web/arcade/dist/`。Vite 使用相对资源路径，适配 `/xianju/` 子路径。部署权限由 GitHub 提供，不需要第三方密钥。

Python 标准库和 NumPy 使用 Base64 JSON 静态传输，避免下载管理器拦截 ZIP/WHL 请求；解析后仍由原运行时加载与验证。不需要关闭 IDM。首次进入需要加载本网站运行包，当前不是离线 PWA。

## 已验证范围

Edge 157 桌面浏览器中，1440px 桌面及 390px / 320px 手机视口通过响应式与操作检查；这是浏览器视口模拟，尚非手机真机验证。既有版本已验证完整自动对局和逐步观战至结算，12 项 Python 专项回归覆盖规则、存档、隐私与计分故障。这些既有结果不代表本次 kdens3 接入已完成浏览器验收；本次证据以后续验收记录为准。浏览器测试未请求外网或直接 ZIP / WHL 下载地址。

验收记录见 [docs/verification](docs/verification/)，引擎接入说明见 [docs/browser-mahjong-engine.md](docs/browser-mahjong-engine.md)。

Pyodide 固定 0.27.7，采用 MPL-2.0；随附 NumPy 为 2.0.2，遵循其 BSD 及所包含组件的许可。其他运行时分别保留原许可证，不将整套第三方代码统一改为 MIT。

## 来源与许可

保留 [第三方说明](web/arcade/THIRD_PARTY_NOTICES.md)、运行时许可证及 [模型说明](web/arcade/public/models/mahjong/kdens3/README.md)。第三方组件分别遵循其原许可证；模型发布页标注 MIT。此仓库未替维护者选择新增项目代码的统一许可证。

其他游戏、云端功能与更丰富大厅功能暂未实现。
