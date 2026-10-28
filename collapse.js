/**
 * DeepSeek 思考过程默认折叠 —— content script（v2.0）
 *
 * ── 真实页面契约（从 main.d1d163b7e4.js / main.cc59a63cb5.css 反查确认）──
 *
 *   思考块容器   ._74c0879            （CSS: position:relative）
 *   折叠头       ._5ab5d64            （CSS: 内含 _245c867，cursor:pointer）
 *   思考内容     ._9ecc93a.ds-think-content
 *
 *   React 侧的折叠状态：mL 组件 useState(!0) → 默认展开；
 *   `...(l ? i : []).map(...)` → **折叠时内容节点不挂载**（会被卸载）。
 *
 *   重要：折叠头是一个裸 <div onClick>，**没有 aria-expanded / aria-controls /
 *   role="button"**。所以任何基于 ARIA 的识别在真实页面上都不可靠，
 *   必须以类名 + 标题文案为准。
 *
 * ── 闪烁的成因与解法 ──
 *
 *   渲染(展开) → MutationObserver → 防抖(200ms) → click(收起)
 *   用户看到「先展开、再收起」。
 *
 *   v2 用 hide.css 在 document_start 就让 .ds-think-content 不可见，
 *   JS 完成折叠后打 data-dstc-done 放行。首帧即是关闭态。
 */
(() => {
  "use strict";

  if (window.__dsThinkCollapseLoaded) return;
  window.__dsThinkCollapseLoaded = true;

  /* ------------------------------------------------------------------ */
  /* 真实选择器（已对照线上 bundle 核实）                                */
  /* ------------------------------------------------------------------ */

  const BLOCK_SEL = "._74c0879";
  const HEADER_SEL = "._5ab5d64";
  const CONTENT_SEL = "._9ecc93a, .ds-think-content";

  // 兜底：类名改版时，用「文案 + 结构」识别折叠头。
  const THINK_LABEL_RE =
    /已深度思考|深度思考中|思考中|思考了|思考用时|已思考|Thought for|Thinking|Stopped/i;

  const DONE_ATTR = "data-dstc-done";
  const OPEN_ATTR = "data-dstc-user-open";

  // 节点级去重：同一生命周期内不重复处理同一个折叠头。
  const handled = new WeakSet();
  // 用户手动操作过的折叠头：永不自动收起。
  const userOwned = new WeakSet();

  /* ------------------------------------------------------------------ */
  /* 总开关                                                              */
  /* ------------------------------------------------------------------ */

  let enabled = true;

  function applyEnabled(on) {
    enabled = on !== false;
    const html = document.documentElement;
    if (!html) return;
    if (enabled) html.removeAttribute("data-dstc-off");
    else {
      // 关闭时必须撤掉 CSS 遮挡，否则内容会一直不可见。
      html.setAttribute("data-dstc-off", "1");
    }
  }

  try {
    if (window.chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get({ enabled: true }, (res) => {
        try { applyEnabled(res && res.enabled); } catch { /* 忽略 */ }
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.enabled) {
          applyEnabled(changes.enabled.newValue);
          if (enabled) scan();
        }
      });
    }
  } catch {
    /* 扩展上下文失效 / 非扩展环境（如file://测试页）：保持默认开启 */
  }

  /* ------------------------------------------------------------------ */
  /* 状态判定                                                            */
  /* ------------------------------------------------------------------ */

  /** 内容区是否存在且有实际内容 → 视为「展开」。 */
  function isExpanded(block) {
    const content = block.querySelector(CONTENT_SEL);
    if (!content) return false; // 节点都被卸载了，说明已折叠
    // 有节点但被撑成 0 高度也算折叠
    return true;
  }

  /** 找到折叠头。 */
  function findHeader(block) {
    const direct = block.querySelector(HEADER_SEL);
    if (direct) return direct;

    // 兜底：容器内第一个「有思考文案」的可点击元素。
    for (const el of block.querySelectorAll("div[class], span[class], button")) {
      const text = (el.textContent || "").slice(0, 60);
      if (!THINK_LABEL_RE.test(text)) continue;
      // 取最内层（避免拿到整个消息容器）
      if (el.querySelector(CONTENT_SEL)) continue;
      const cs = getComputedStyle(el);
      if (cs.cursor === "pointer" || el.getAttribute("role") === "button") return el;
    }
    return null;
  }

  /** 给内容区打完成标记，放行 CSS。 */
  function markDone(block) {
    block.setAttribute(DONE_ATTR, "1");
    const content = block.querySelector(CONTENT_SEL);
    if (content) content.setAttribute(DONE_ATTR, "1");
  }

  /* ------------------------------------------------------------------ */
  /* 折叠                                                                */
  /* ------------------------------------------------------------------ */

  function collapseBlock(block) {
    if (!enabled) {
      markDone(block);
      return;
    }

    const header = findHeader(block);
    if (!header) {
      // 找不到折叠头：不能点，但必须放行，否则内容永远不可见。
      markDone(block);
      return;
    }

    // 用户主动展开过 → 放行，不再干预。
    if (userOwned.has(header)) {
      block.setAttribute(OPEN_ATTR, "1");
      markDone(block);
      return;
    }

    if (handled.has(header)) {
      // 已处理过：确保标记仍在（React 重渲染可能重建块）。
      markDone(block);
      return;
    }

    // 已经折叠（内容未挂载）：直接放行。
    if (!isExpanded(block)) {
      handled.add(header);
      markDone(block);
      return;
    }

    handled.add(header);

    try {
      header.click();
    } catch {
      /* 下一轮扫描会重试 */
      handled.delete(header);
      return;
    }

    // 点击后内容应被卸载。同步标完成，避免这一帧内出现空窗。
    markDone(block);
  }

  /* ------------------------------------------------------------------ */
  /* 扫描                                                                */
  /* ------------------------------------------------------------------ */

  let scheduled = false;

  function scan() {
    if (!enabled) return;
    for (const block of document.querySelectorAll(BLOCK_SEL)) {
      collapseBlock(block);
    }
  }

  /**
   * 用微任务而非 setTimeout 调度：不跳帧，抢在浏览器绘制之前完成折叠，
   * 这是「首帧就是关闭态」的关键。
   */
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      scan();
    });
  }

  /* ------------------------------------------------------------------ */
  /* 监听                                                                */
  /* ------------------------------------------------------------------ */

  // 记录用户点击，区分「展开」与「收起」。
  document.addEventListener(
    "click",
    (event) => {
      /*
       * 关键：只认真实用户点击。
       * 脚本自己调用的 header.click() 合成的 MouseEvent 其 isTrusted === false，
       * 若不排除，扩展的自动折叠会被误判成「用户手动展开」，从而永久放行，
       * 块就再也折叠不了了。
       */
      if (!event.isTrusted) return;

      const t = event.target;
      if (!(t instanceof Element)) return;

      // 必须点在折叠头上（或其子元素），范围要精确。
      const header = t.closest(HEADER_SEL);
      if (!header) return;

      const block = header.closest(BLOCK_SEL);
      if (!block) return;

      const wasExpanded = isExpanded(block);

      setTimeout(() => {
        const nowExpanded = isExpanded(block);
        userOwned.add(header);
        if (wasExpanded && !nowExpanded) {
          // 用户主动收起：维持折叠，撤掉用户展开标记。
          block.removeAttribute(OPEN_ATTR);
        } else if (!wasExpanded && nowExpanded) {
          // 用户主动展开：永久放行。
          block.setAttribute(OPEN_ATTR, "1");
        }
        markDone(block);
      }, 0);
    },
    true,
  );

  new MutationObserver(() => schedule()).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  /* ------------------------------------------------------------------ */
  /* 启动                                                                */
  /* ------------------------------------------------------------------ */

  // document_start 时 body 可能还没生成，用 documentElement 兜底。
  const boot = () => {
    scan();
    schedule();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  // 首屏与懒加载兜底（次数很少，且此时通常已折叠完毕）。
  for (const d of [50, 200, 600, 1500, 3000]) setTimeout(scan, d);

  /*
   * 安全阀：无论发生什么（选择器失效、React 结构变化、点击被拦截），
   * 都必须保证内容最终可见。宁可露出思考过程，也不能让它永久不可见。
   *
   * 1.2 秒后对所有仍未打标记的块强制放行。
   */
  setTimeout(() => {
    for (const block of document.querySelectorAll(BLOCK_SEL)) {
      if (!block.hasAttribute(DONE_ATTR)) markDone(block);
    }
    // 极端情况：连 BLOCK_SEL 都失效，则直接解除全局遮挡。
    if (!enabled) {
      document.documentElement.setAttribute("data-dstc-off", "1");
    } else if (document.querySelectorAll(BLOCK_SEL).length === 0) {
      const anyContent = document.querySelector(CONTENT_SEL);
      if (anyContent && !anyContent.closest(`[${DONE_ATTR}]`)) {
        // 有内容但没有可识别容器：全局放行，避免白屏。
        document.documentElement.setAttribute("data-dstc-off", "1");
      }
    }
  }, 1200);
})();
