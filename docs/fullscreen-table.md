# 全屏牌桌

牌桌上方提供全屏/退出按钮，加载期间也可使用。优先调用浏览器原生全屏；手机环境尝试锁定横屏。不支持或拒绝时保留页面内沉浸布局，可手动旋转手机，浏览器地址栏可能仍在。切换不重载模型或重开牌局。

横屏时牌桌与操作区分栏，完整手牌分两排；观战手牌区域可滚动，下一步按钮固定可达。退出按钮保持可达。结算弹窗位于全屏目标内部。退出、浏览器结束全屏、返回大厅或卸载会释放本次方向锁和滚动限制。

实现依据：[Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)、[方向锁](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock)。

验证报告：

- [全屏验收](verification/fullscreen.json)：真实桌面 Edge 原生全屏，844×390、667×375、568×320、320×568，真实 AI 单步及整局结算、全屏退出/外部退出、无模型或 Worker 重建；能力缺失和请求拒绝的沉浸降级、初始化取消也通过。
- [普通模式回归](verification/fullscreen-regression.json)：1440/390/320px，自动开关、暂停、单步、难度、音效、按需加载通过。

这些是桌面浏览器调整视口的验证，方向 API 成功/失败分支使用能力模拟；没有声称手机真机认证。构建、TypeScript 和独立源码评审通过。
