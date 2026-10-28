/**
 * v2.0 测试：基于从线上 bundle 反查确认的**真实 DOM 结构**。
 *
 * 真实结构（已核实）：
 *   <div class="_74c0879">                     ← 思考块容器
 *     <div class="_245c867 _5ab5d64">          ← 折叠头（裸 div + onClick，无 aria）
 *       <span>已深度思考（用时 5 秒）</span>
 *     </div>
 *     <div class="_9ecc93a ds-think-content">  ← 内容（折叠时卸载）
 *       ...
 *     </div>
 *   </div>
 *
 * 关键站点行为：点击折叠头 → 内容节点被**卸载**（不是隐藏）。
 *
 * 运行： node test-v2.mjs
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const SCRIPT = readFileSync(new URL("./collapse.js", import.meta.url), "utf8");

let passed = 0;
let failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.log(`  ✗ ${name} ${extra}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 真实结构：未折叠（内容挂载）。 */
const collapsedBlock = (id, title) => `
  <div class="_74c0879">
    <div class="_245c867 _5ab5d64">
      <span>${title}</span>
    </div>
  </div>`;

/** 真实结构：已展开（内容挂载）。 */
const expandedBlock = (id, title, body) => `
  <div class="_74c0879">
    <div class="_245c867 _5ab5d64">
      <span>${title}</span>
    </div>
    <div class="_9ecc93a ds-think-content" data-for="${id}">
      <div class="ds-markdown"><p>${body}</p></div>
    </div>
  </div>`;

function mount(html, opts = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, {
    url: "https://chat.deepseek.com/a/chat/s/x",
    pretendToBeVisual: true,
    runScripts: "outside-only",
  });
  const { window } = dom;
  const d = window.document;

  const stats = { clicks: 0 };

  // 站点真实行为：点折叠头 → 内容节点卸载/挂载（React 条件渲染）。
  // 用闭包保存原文，模拟 React 卸载。
  d.addEventListener("click", (e) => {
    const header = e.target instanceof window.Element ? e.target.closest("._5ab5d64") : null;
    if (!header) return;
    const block = header.closest("._74c0879");
    if (!block) return;
    stats.clicks += 1;
    const content = block.querySelector("._9ecc93a, .ds-think-content");
    if (content) {
      // 折叠：彻底移除节点（与 React `...(l ? i : [])` 一致）
      content.remove();
    } else {
      // 展开：重新挂载
      const div = d.createElement("div");
      div.className = "_9ecc93a ds-think-content";
      div.innerHTML = `<div class="ds-markdown"><p>重新挂载的推理</p></div>`;
      block.appendChild(div);
    }
  });

  // 模拟「真实用户点击」。
  //
  // 扩展用 event.isTrusted 区分「真人点击」和「脚本自己调用的 click()」。
  // jsdom 中 isTrusted 恒为 false 且只读，无法构造真事件。
  // 因此在测试环境里重写 document 的 addEventListener：扩展注册的 click
  // 监听器拿到的是「被标记为可信」的包装事件，而站点的监听器不受影响。
  const realListeners = [];
  const origDocAdd = window.document.addEventListener.bind(window.document);
  window.document.addEventListener = function (type, fn, opts) {
    if (type === "click") {
      const wrapped = (ev) => {
        if (ev.__fakeTrusted) {
          // 透传一份 isTrusted=true 的代理
          const proxy = new Proxy(ev, {
            get(target, prop) {
              if (prop === "isTrusted") return true;
              const v = target[prop];
              return typeof v === "function" ? v.bind(target) : v;
            },
          });
          return fn(proxy);
        }
        return fn(ev);
      };
      realListeners.push({ fn, wrapped });
      return origDocAdd(type, wrapped, opts);
    }
    return origDocAdd(type, fn, opts);
  };

  const userClick = (el) => {
    const ev = new window.MouseEvent("click", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "__fakeTrusted", { value: true });
    el.dispatchEvent(ev);
  };

  window.chrome = {
    storage: {
      local: { get: (def, cb) => cb({ ...def, enabled: opts.enabled !== false }), set: () => {} },
      onChanged: { addListener: () => {} },
    },
  };

  window.eval(SCRIPT);
  return { dom, window, document: d, stats, userClick, close: () => dom.window.close() };
}

const isOpen = (d) => !!d.querySelector("._9ecc93a, .ds-think-content");
const hasDone = (d) => !!d.querySelector("[data-dstc-done='1']");

// ============================================================
console.log("\n▶ 用例1 真实结构：展开态思考块被折叠（内容被卸载）");
{
  const p = mount(expandedBlock("a", "已深度思考（用时 5 秒）", "推理内容A"));
  await sleep(150);
  check("内容节点已被卸载（折叠成功）", !isOpen(p.document));
  check("已打完成标记（CSS 遮挡解除）", hasDone(p.document));
  check("点击了一次", p.stats.clicks === 1, `clicks=${p.stats.clicks}`);
  p.close();
}

// ============================================================
console.log("\n▶ 用例2 多个思考块全部折叠");
{
  const p = mount(
    expandedBlock("1", "已深度思考（用时 5 秒）", "A") +
    expandedBlock("2", "已深度思考（用时 8 秒）", "B") +
    expandedBlock("3", "已深度思考（用时 3 秒）", "C"),
  );
  await sleep(150);
  check("三块内容全部卸载", p.document.querySelectorAll("._9ecc93a").length === 0);
  check("三块都打了完成标记", p.document.querySelectorAll("[data-dstc-done='1']").length === 3);
  p.close();
}

// ============================================================
console.log("\n▶ 用例3 已经是折叠态：不点击，但解除遮挡");
{
  const p = mount(collapsedBlock("x", "已深度思考（用时 6 秒）"));
  await sleep(150);
  check("没有多余点击", p.stats.clicks === 0, `clicks=${p.stats.clicks}`);
  check("已打完成标记", hasDone(p.document));
  p.close();
}

// ============================================================
console.log("\n▶ 用例4 用户手动展开后，不被再次折叠");
{
  const p = mount(expandedBlock("u", "已深度思考（用时 4 秒）", "用户想看"));
  await sleep(150);
  check("初始被折叠", !isOpen(p.document), "应已折叠");

  const header = p.document.querySelector("._5ab5d64");
  p.userClick(header); // 用户展开（isTrusted=true）
  check("用户点击后内容重新挂载", isOpen(p.document));
  await sleep(50); // 等 setTimeout(0) 记账
  check("已标记用户展开", !!p.document.querySelector("[data-dstc-user-open='1']"));

  // 触发多次重扫
  await sleep(400);
  check("重扫后仍保持展开", isOpen(p.document));
  p.close();
}

// ============================================================
console.log("\n▶ 用例5 总开关关闭时不折叠");
{
  const p = mount(expandedBlock("o", "已深度思考（用时 2 秒）", "保持展开"), { enabled: false });
  await sleep(150);
  check("内容仍在（未折叠）", isOpen(p.document));
  check("全局遮挡已关闭", p.document.documentElement.getAttribute("data-dstc-off") === "1");
  p.close();
}

// ============================================================
console.log("\n▶ 用例6 动态新增的思考块（流式输出）");
{
  const p = mount("");
  await sleep(100);
  p.document.body.insertAdjacentHTML(
    "beforeend",
    expandedBlock("n", "已深度思考（用时 9 秒）", "新来的推理"),
  );
  await sleep(200);
  check("动态插入的块被折叠", !isOpen(p.document));
  p.close();
}

// ============================================================
console.log("\n▶ 用例7 安全阀：找不到折叠头时内容仍然可见");
{
  // 只有内容、没有折叠头的异常结构
  const p = mount(`
    <div class="_74c0879">
      <div class="_9ecc93a ds-think-content" data-for="orphan">
        <div class="ds-markdown"><p>孤立内容</p></div>
      </div>
    </div>`);
  await sleep(1400);
  check("异常结构被强制放行（有完成标记）", hasDone(p.document));
  p.close();
}

// ============================================================
console.log("\n▶ 用例8 正常回答正文不受影响");
{
  const p = mount(`
    <div class="_74c0879">
      <div class="_245c867 _5ab5d64"><span>已深度思考（用时 5 秒）</span></div>
      <div class="_9ecc93a ds-think-content"><div class="ds-markdown"><p>推理</p></div></div>
    </div>
    <div class="ds-markdown ds-assistant-message-main-content"><p>最终回答</p></div>`);
  await sleep(150);
  const answer = p.document.querySelector(".ds-assistant-message-main-content");
  check("最终回答完好", answer && answer.textContent.includes("最终回答"));
  check("思考内容已折叠", !isOpen(p.document));
  p.close();
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
