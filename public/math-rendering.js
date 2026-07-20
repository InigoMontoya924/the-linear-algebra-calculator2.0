const mathRenderVersion = new WeakMap();
const pendingMath = new Set();
let mathRenderQueue = Promise.resolve();

const EXACT_FRAGMENT = /[+-]?(?:\d+(?:\/\d+)?\s+[+-]\s+)?(?:\d+(?:\/\d+)?\*)?sqrt\(\d+(?:\/\d+)?\)|[+-]?\d+\/\d+/g;

function texInteger(value) {
  return String(value).replace(/^\+/, "");
}

function rationalTextToTex(value) {
  const match = String(value).trim().match(/^([+-]?)(\d+)(?:\/(\d+))?$/);
  if (!match) return null;
  const [, sign, numerator, denominator] = match;
  const prefix = sign === "-" ? "-" : "";
  return denominator
    ? `${prefix}\\frac{${numerator}}{${denominator}}`
    : `${prefix}${texInteger(numerator)}`;
}

function surdTextToTex(value) {
  const input = String(value).trim();
  const match = input.match(/^(.*?)sqrt\(([^)]+)\)$/);
  if (!match) return null;

  let prefix = match[1];
  const radicand = scalarTextToTex(match[2]);
  let rationalPart = "";
  let join = "";
  let coefficient = prefix;

  const combined = prefix.match(/^(.+?)\s+([+-])\s*(.*)$/);
  if (combined) {
    rationalPart = scalarTextToTex(combined[1]);
    join = combined[2] === "-" ? " - " : " + ";
    coefficient = combined[3] || "1";
  }

  coefficient = coefficient.replace(/\*$/, "").trim();
  let coefficientTex;
  if (!coefficient || coefficient === "+") coefficientTex = "";
  else if (coefficient === "-") coefficientTex = "-";
  else {
    const parsedCoefficient = rationalTextToTex(coefficient);
    coefficientTex = parsedCoefficient === "1"
      ? ""
      : parsedCoefficient === "-1"
        ? "-"
        : parsedCoefficient ?? coefficient;
  }

  const radical = `${coefficientTex}\\sqrt{${radicand}}`;
  return rationalPart ? `${rationalPart}${join}${radical.replace(/^-/, "")}` : radical;
}

/** Convert the calculator's exact scalar notation into TeX. */
export function scalarTextToTex(value) {
  const input = String(value ?? "").trim();
  if (input === "∞" || input === "Infinity") return "\\infty";
  if (input === "-∞" || input === "-Infinity") return "-\\infty";

  const surd = surdTextToTex(input);
  if (surd) return surd;

  const rational = rationalTextToTex(input);
  if (rational) return rational;

  const scientific = input.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))[eE]([+-]?\d+)$/);
  if (scientific) {
    return `${scientific[1]}\\times 10^{${texInteger(scientific[2])}}`;
  }

  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(input)) return input;
  return input
    .replace(/\\/g, "\\backslash{}")
    .replace(/([{}#$%&_])/g, "\\$1")
    .replace(/\^/g, "\\hat{}")
    .replace(/~/g, "\\sim{} ");
}

/** Build a TeX bmatrix from already formatted scalar values. */
export function matrixToTex(matrix, formatter = scalarTextToTex) {
  const rows = matrix.map((row) => row.map((value) => formatter(value)).join(" & "));
  return `\\begin{bmatrix}${rows.join(" \\\\ ")}\\end{bmatrix}`;
}

/** Find exact fractions and quadratic surds embedded in explanatory prose. */
export function splitExactMathFragments(text) {
  const input = String(text ?? "");
  const fragments = [];
  let start = 0;
  for (const match of input.matchAll(EXACT_FRAGMENT)) {
    if (match.index > start) fragments.push({ type: "text", value: input.slice(start, match.index) });
    fragments.push({ type: "math", value: match[0], tex: scalarTextToTex(match[0]) });
    start = match.index + match[0].length;
  }
  if (start < input.length) fragments.push({ type: "text", value: input.slice(start) });
  return fragments;
}

function mathJax() {
  if (typeof window === "undefined") return null;
  return window.MathJax?.tex2svgPromise ? window.MathJax : null;
}

function queueMathElement(element) {
  const version = mathRenderVersion.get(element);
  const tex = element.dataset.tex;
  const display = element.dataset.texDisplay === "true";
  const renderer = mathJax();
  if (!renderer) {
    pendingMath.add(element);
    return;
  }

  pendingMath.delete(element);
  mathRenderQueue = mathRenderQueue
    .then(async () => {
      await renderer.startup?.promise;
      if (!element.isConnected || mathRenderVersion.get(element) !== version) return;
      const output = await renderer.tex2svgPromise(tex, { display });
      if (!element.isConnected || mathRenderVersion.get(element) !== version) return;
      output.setAttribute("aria-hidden", "true");
      element.replaceChildren(output);
      element.classList.add("is-typeset");
    })
    .catch(() => {
      // The readable source text remains in place when MathJax is unavailable.
    });
}

function flushPendingMath() {
  [...pendingMath].forEach((element) => queueMathElement(element));
}

/** Render a trusted, generated TeX expression with a readable fallback. */
export function renderTex(element, tex, fallbackText, options = {}) {
  const fallback = String(fallbackText);
  const ariaLabel = String(options.ariaLabel ?? fallbackText);
  if (
    element.dataset.tex === tex &&
    element.getAttribute("aria-label") === ariaLabel &&
    element.querySelector("mjx-container")
  ) {
    return element;
  }
  const version = (mathRenderVersion.get(element) ?? 0) + 1;
  mathRenderVersion.set(element, version);
  element.classList.add("math-rendered");
  element.classList.remove("is-typeset");
  element.dataset.tex = tex;
  element.dataset.texDisplay = String(Boolean(options.display));
  element.setAttribute("role", "math");
  element.setAttribute("aria-label", ariaLabel);
  element.textContent = fallback;
  queueMathElement(element);
  return element;
}

/** Render only the exact-number fragments in prose, leaving ordinary copy untouched. */
export function renderMathAwareText(element, text) {
  element.replaceChildren();
  splitExactMathFragments(text).forEach((fragment) => {
    if (fragment.type === "text") {
      element.append(document.createTextNode(fragment.value));
      return;
    }
    const math = document.createElement("span");
    math.className = "inline-math";
    renderTex(math, fragment.tex, fragment.value);
    element.append(math);
  });
  return element;
}

if (typeof window !== "undefined") {
  window.addEventListener("mathjax-ready", flushPendingMath);
  window.addEventListener("load", flushPendingMath, { once: true });
}
