import assert from "node:assert/strict";
import test from "node:test";

import {
  matrixToTex,
  scalarTextToTex,
  splitExactMathFragments,
} from "../public/math-rendering.js";

test("exact fractions become TeX fractions", () => {
  assert.equal(scalarTextToTex("1/2"), "\\frac{1}{2}");
  assert.equal(scalarTextToTex("-3/4"), "-\\frac{3}{4}");
});

test("quadratic surds become TeX radicals without plain-text multiplication", () => {
  assert.equal(scalarTextToTex("sqrt(5)"), "\\sqrt{5}");
  assert.equal(
    scalarTextToTex("1/2 + 1/2*sqrt(5)"),
    "\\frac{1}{2} + \\frac{1}{2}\\sqrt{5}",
  );
  assert.equal(
    scalarTextToTex("1/2 - 1/2*sqrt(5)"),
    "\\frac{1}{2} - \\frac{1}{2}\\sqrt{5}",
  );
  assert.equal(
    scalarTextToTex("-1/2 + sqrt(5)"),
    "-\\frac{1}{2} + \\sqrt{5}",
  );
});

test("matrices use TeX bmatrix notation", () => {
  assert.equal(
    matrixToTex([["1/2", "sqrt(5)"], ["0", "-3/4"]]),
    "\\begin{bmatrix}\\frac{1}{2} & \\sqrt{5} \\\\ 0 & -\\frac{3}{4}\\end{bmatrix}",
  );
});

test("explanatory prose isolates exact values for inline MathJax rendering", () => {
  assert.deepEqual(
    splitExactMathFragments("The eigenvalues are 1/2 + 1/2*sqrt(5) and -3/4."),
    [
      { type: "text", value: "The eigenvalues are " },
      {
        type: "math",
        value: "1/2 + 1/2*sqrt(5)",
        tex: "\\frac{1}{2} + \\frac{1}{2}\\sqrt{5}",
      },
      { type: "text", value: " and " },
      { type: "math", value: "-3/4", tex: "-\\frac{3}{4}" },
      { type: "text", value: "." },
    ],
  );
});
