# DeepSeek 思考过程默认折叠（Edge 扩展）v2.0

让 [chat.deepseek.com](https://chat.deepseek.com) 的「已深度思考 / 思考了 N 秒」推理块**默认收起**，
并且**视觉上从第一帧就是关闭状态**，不再「先展开闪一下再收起」。

纯 Manifest V3 扩展，无需油猴，无需联网权限，不收集任何数据。

---

## 安装（Edge）

1. 打开 Edge，地址栏输入 `edge://extensions/`。
2. 开启 **「开发人员模式」**。
3. 点击 **「加载解压缩的扩展」**，选择本文件夹（含 `manifest.json` 的那一层）。
4. 刷新已打开的 DeepSeek 页面。

> 更新代码后，需在 `edge://extensions/` 点该扩展的刷新按钮，再刷新页面。

---

## 使用

- 默认开启，无需配置。
- 点扩展图标可开关。关闭后思考过程恢复官网默认展开。
- 手动展开某条推理后，扩展**不会**再把它合上。

---

## 真实页面契约（从线上 bundle 反查确认）

以下不是猜测，是从 `main.d1d163b7e4.js` 与 `main.cc59a63cb5.css` 中反查得到的：

| 元素 | 真实类名 | 说明 |
| --- | --- | --- |
| 思考块容器 | `._74c0879` | `position:relative` |
| 折叠头 | `._5ab5d64` | 内含 `._245c867`，`cursor:pointer` |
| 思考内容 | `._9ecc93a` + `.ds-think-content` | 折叠时**被卸载** |

React 侧：

```js
// mL 组件
const [l, d] = useState(true);   // 默认展开
...(l ? i : []).map(...)         // 折叠时内容节点不挂载
```

**关键发现**：折叠头是一个裸 `<div onClick>`，**没有 `aria-expanded` / `aria-controls` / `role="button"`**。
因此任何基于 ARIA 的识别在本站都不可靠，必须以类名 + 标题文案为准。

---

## 闪烁是怎么消除的

旧方案（v1.x）的时序：

```
渲染(展开) → MutationObserver → 防抖 200ms → click(收起)
```

用户会看到「先展开、再收起」。

v2 的做法：

1. `manifest.json` 中 `run_at: document_start`，让 `hide.css` **早于页面渲染**注入。
2. `hide.css` 让 `.ds-think-content` 在挂载瞬间 `visibility:hidden` + `max-height:0`。
3. JS 用 `queueMicrotask` 调度（不是 `setTimeout`），在同一帧内完成折叠。
4. 折叠完成后打 `data-dstc-done="1"`，CSS 交还控制权。

实测（Edge 真实渲染，逐次 DOM 采样）：

```
initial  t=0.4ms  vis=hidden  h=0     ← 第一帧就不可见
mutation t=0.7ms  vis=hidden  h=0
mutation t=9.0ms  vis=NONE    h=0     ← 已被彻底卸载
```

**内容从未在任何一帧以可见状态出现过。**

---

## 关键保证

- **首帧即关闭**：CSS 遮挡 + 微任务折叠，无可见闪烁。
- **只折叠一次**：`WeakSet` 记录已处理的折叠头。
- **不误伤用户操作**：用 `event.isTrusted` 区分真人点击与脚本的 `click()`
  （否则扩展自己的折叠会被当成「用户展开」而永久放行）。
- **不影响最终回答**：只操作思考块，正文 `.ds-markdown` 不动。
- **安全阀**：若 1.2 秒内仍无法处理某块（选择器失效等），强制解除遮挡。
  **宁可露出推理，也绝不永久白屏。**

---

## 关于「切换对话后重新展开」

**这一条无法避免**，属于站点行为。

DeepSeek 每次进入对话都把思考块初始化为展开（`useState(true)`），扩展只能在它渲染后
再折一次。区别在于：有了 CSS 遮挡，你**看不到**那个展开过程。

---

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `manifest.json` | 扩展清单（MV3，`document_start` + CSS） |
| `hide.css` | 首帧遮挡样式 |
| `collapse.js` | 折叠逻辑与用户意图识别 |
| `popup.html` / `popup.js` | 总开关 |
| `icons/` | 图标 16/32/48/128 |
| `test-v2.mjs` | 基于真实 DOM 结构的测试（17 项） |

---

## 运行测试

需要 Node.js 与 `jsdom`：

```bash
cd deepseek-think-collapse
npm init -y
npm install jsdom
node test-v2.mjs
```

当前结果：**17 项全部通过**。

测试用例覆盖：真实结构折叠、多块折叠、已折叠不重复点击、用户展开保护、
开关关闭、流式动态新增、安全阀、正文不受影响。

> 说明：jsdom 无渲染引擎，`isTrusted` 恒为 false，测试通过重写 `addEventListener`
> 模拟真人点击；视觉与首帧表现已在真实 Edge（headless）中通过截图与逐帧采样验证。

---

## 已知限制

- 若站点同时改掉 `_74c0879` / `_5ab5d64` / `.ds-think-content` 三者，需要更新
  `collapse.js` 中的选择器常量。
- 折叠头不是真正的按钮（无 `role`/`tabindex`），键盘操作行为以站点为准。
