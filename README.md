# DeepSeek 思考过程折叠

> 让 DeepSeek 网页版的「已深度思考」推理过程默认收起，只看最终回答。

![前后对比](assets/before-after.png)

一个轻量的浏览器扩展：安装后，DeepSeek 对话里的思考过程**从出现的第一刻就是关闭的**，不用每次手动点。想看某一条推理时点一下标题即可展开，扩展不会把它再关回去。

适用于 [chat.deepseek.com](https://chat.deepseek.com)。支持 Microsoft Edge 与 Google Chrome。

---

## 解决什么问题

DeepSeek 开启「深度思考」后，每轮回答前会插入一大段推理过程，而且**默认完全展开**。这带来两个实际问题：

- 推理动辄几十行，把真正的回答挤到屏幕外，每次都要滚动
- 重新打开历史对话、刷新页面或切换对话后，所有推理块会**全部重新展开**

本扩展让这些推理块默认收起，只保留一行标题（如「已深度思考（用时 5 秒）」），回答直接出现在视野内。

| 场景 | DeepSeek 默认 | 安装本扩展后 |
| --- | --- | --- |
| 新回答生成 | 推理全部展开 | 推理收起 |
| 打开历史对话 | 推理全部展开 | 推理收起 |
| 刷新 / 切换对话 | 全部重新展开 | 收起，且无可见闪烁 |
| 想查看某条推理 | 已展开 | 点击标题展开 |

---

## 安装

本扩展没有上架应用商店，通过「加载已解压的扩展」方式安装。整个过程约 1 分钟。

**1. 下载**

点击页面右上角绿色 `Code` 按钮 → `Download ZIP`，解压到任意目录（例如 `D:\Extensions\deepseek-think-collapse`）。

也可以用 Git 克隆：

```bash
git clone https://github.com/<your-name>/deepseek-think-collapse.git
```

**2. 加载扩展**

- **Edge**：地址栏输入 `edge://extensions/`
- **Chrome**：地址栏输入 `chrome://extensions/`

然后：

1. 打开 **「开发人员模式」** 开关（Edge 在左侧栏，Chrome 在右上角）
2. 点击 **「加载解压缩的扩展」**
3. 选择解压出来的文件夹 —— 是**包含 `manifest.json` 的那一层**，不要选它的上级目录

**3. 刷新页面**

打开（或刷新）[chat.deepseek.com](https://chat.deepseek.com)，扩展栏出现蓝色图标即安装成功。

> 安装时浏览器会提示「读取和更改您在所有 deepseek.com 网站上的数据」，这是任何内容脚本类扩展的常规提示。本扩展只在你访问 DeepSeek 时运行，不做任何数据上传。

---

## 使用

<<<<<<< HEAD
安装后**无需任何配置**，默认生效。

- **查看某条推理**：点击「已深度思考（用时 N 秒）」这一行即可展开
- **临时关闭**：点击浏览器工具栏的扩展图标，关掉开关。设置立即生效，无需刷新
- **重新打开**：再次点击开关即可

被手动展开过的推理块，扩展不会再自动关回去。

---

## 关于「开发人员模式」

由于通过「加载已解压的扩展」安装，**需要保持开发人员模式开启**，否则浏览器会停用该扩展。这是此类安装方式的固有要求，与扩展本身无关。

可能出现的情况：

- 每次启动浏览器，Edge 会提示「停用开发人员模式扩展」—— 点击保留即可，属正常现象
- 更新扩展代码后，需回到扩展管理页点击该扩展的「刷新」按钮

如果介意这个提示，可将扩展打包后通过企业策略部署，或发布到浏览器扩展商店，此时不再需要开发人员模式。

---

## 隐私

- 不收集、不上传任何数据
- 不请求任何网络权限，扩展代码中没有网络请求
- 唯一权限是 `storage`，仅用于在本地保存开关状态
- 所有逻辑在本地运行，可在 `collapse.js` 中完整审阅
=======
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
>>>>>>> 4fcd599e8eea765a496e953b92c0194c4b47e0ba

---

## 已知限制

<<<<<<< HEAD
- **切换对话后仍会重新展开，但你看不到。** DeepSeek 每次进入对话都把推理块初始化为展开状态，扩展无法改变，只能在渲染的第一帧就把它收起。视觉上表现为「一直保持关闭」。
- 若 DeepSeek 大幅改版页面结构，扩展可能失效。此时需要更新 `collapse.js` 顶部的选择器常量，欢迎提交 Issue。
- 仅适用于 DeepSeek 网页版，不涉及 App、API 或其他站点。

---

## 工作原理

<details>
<summary>展开查看实现细节</summary>

### 为什么不能简单加 `display: none`

DeepSeek 的折叠由 React 状态控制，直接改 CSS 会导致状态不同步：用户点展开时界面无反应，或内容高度计算错乱。正确做法是**触发一次真实的点击**，让站点自己的状态机来完成折叠。

### 时序问题

最早的实现是「监听 DOM 变化 → 防抖 → 点击收起」，但这会让用户看到「先展开、再收起」的闪烁，因为折叠发生在渲染之后。

当前方案分三步消除闪烁：

1. `manifest.json` 中设置 `run_at: document_start`，让 `hide.css` **早于页面渲染**注入
2. CSS 让推理内容在挂载瞬间就 `visibility: hidden` 并压掉高度
3. JavaScript 用 `queueMicrotask` 调度（而非 `setTimeout`），在同一帧内完成折叠，随后移除遮挡

实测采样结果（真实浏览器）：

```
initial  t=0.4ms  vis=hidden  h=0     ← 第一帧即不可见
mutation t=0.7ms  vis=hidden  h=0
mutation t=9.0ms  vis=NONE    h=0     ← 内容节点已被卸载
```

内容从未在任何一帧以可见状态出现过。

### 选择器

DeepSeek 的 CSS 类名带哈希（如 `._74c0879`），每次发版都可能变化。当前版本对应：

| 元素 | 类名 |
| --- | --- |
| 思考块容器 | `._74c0879` |
| 折叠头（可点击） | `._5ab5d64` |
| 思考内容 | `._9ecc93a` / `.ds-think-content` |

折叠头是一个普通 `<div>`，**没有** `aria-expanded`、`aria-controls` 或 `role` 属性，因此无法依赖无障碍语义定位，只能依据类名与标题文案。若站点改版导致失效，修改 `collapse.js` 顶部的常量即可。

### 用户意图保护

扩展用 `event.isTrusted` 区分真人点击与脚本触发的 `click()`。否则扩展自己的折叠操作会被误判为「用户想展开」，导致该块永久不再折叠。

### 安全兜底

若某块因结构异常在 1.2 秒内仍无法处理，扩展会强制解除遮挡。**宁可露出推理内容，也绝不留下空白。**

</details>

---

## 开发

项目无构建步骤，源码即产物。

```
deepseek-think-collapse/
├── manifest.json   扩展清单（Manifest V3）
├── hide.css        首帧遮挡样式
├── collapse.js     折叠逻辑
├── popup.html      工具栏弹窗
├── popup.js        开关逻辑
├── icons/          图标 16 / 32 / 48 / 128
└── test-v2.mjs     自动化测试
```

### 运行测试

需要 Node.js 18+：

```bash
npm install jsdom
node test-v2.mjs
```

当前 17 项测试全部通过，覆盖真实页面结构折叠、多块处理、已折叠块不重复点击、用户展开保护、开关关闭、动态新增块、异常结构兜底、正文不受影响。

> 测试基于 jsdom。由于 jsdom 无渲染引擎且 `isTrusted` 恒为 `false`，测试通过重写 `addEventListener` 模拟真人点击；视觉与首帧表现已在真实浏览器中通过截图与逐帧采样验证。

### 贡献

欢迎提交 Issue 与 Pull Request。若 DeepSeek 改版导致失效，请在 Issue 中附上：
- 浏览器版本
- DeepSeek 页面上一个已折叠推理块的 HTML 结构（F12 检查元素后复制）

---

## 许可证

[MIT](LICENSE)

本项目为非官方工具，与 DeepSeek 无关联。
=======
- 若站点同时改掉 `_74c0879` / `_5ab5d64` / `.ds-think-content` 三者，需要更新
  `collapse.js` 中的选择器常量。
- 折叠头不是真正的按钮（无 `role`/`tabindex`），键盘操作行为以站点为准。
>>>>>>> 4fcd599e8eea765a496e953b92c0194c4b47e0ba
