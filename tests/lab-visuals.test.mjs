import assert from "node:assert/strict";
import test from "node:test";

import { drawProjectionComparison, drawSvdExplorer } from "../public/lab-visuals.js";
import { svd2x2 } from "../public/labs.js";

function createMockCanvas(cssWidth = 560, cssHeight = 360) {
  const operations = [];
  const attributes = new Map();
  const context = {
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    clip() {},
    fill() { operations.push(["fill"]); },
    stroke() { operations.push(["stroke"]); },
    moveTo(...values) { operations.push(["moveTo", ...values]); },
    lineTo(...values) { operations.push(["lineTo", ...values]); },
    rect(...values) { operations.push(["rect", ...values]); },
    arc(...values) { operations.push(["arc", ...values]); },
    fillRect(...values) { operations.push(["fillRect", ...values]); },
    clearRect(...values) { operations.push(["clearRect", ...values]); },
    setTransform(...values) { operations.push(["setTransform", ...values]); },
    setLineDash(values) { operations.push(["setLineDash", [...values]]); },
    fillText(...values) { operations.push(["fillText", ...values]); },
  };
  const canvas = {
    width: 960,
    height: 620,
    clientWidth: cssWidth,
    clientHeight: cssHeight,
    getBoundingClientRect() { return { width: cssWidth, height: cssHeight }; },
    getContext(kind) { return kind === "2d" ? context : null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
  };
  return { canvas, operations, attributes };
}

function assertPointClose(actual, expected, tolerance = 1e-9) {
  actual.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) <= tolerance * Math.max(1, Math.abs(expected[index])));
  });
}

function assertGridClose(actual, expected, tolerance = 1e-9) {
  assert.equal(actual.length, expected.length);
  actual.forEach((segment, index) => {
    assert.equal(segment.major, expected[index].major);
    segment.points.forEach((point, pointIndex) => {
      assertPointClose(point, expected[index].points[pointIndex], tolerance);
    });
  });
}

test("projection renderer distinguishes L₂, L₁, and a non-unique optimum", () => {
  const mock = createMockCanvas();
  const frame = drawProjectionComparison(mock.canvas, [1, 1], [2, 0], {
    dpr: 2,
    extent: 4,
  });

  assert.equal(frame.comparison.l1.nonUnique, true);
  assert.deepEqual(frame.comparison.l1.intervalPoints, [[0, 0], [2, 2]]);
  assert.deepEqual(frame.directionHandle.math, [1, 1]);
  assert.equal(frame.directionHandle.hitRadius, 22);
  assert.deepEqual(frame.targetHandle.math, [2, 0]);
  assert.equal(frame.targetHandle.hitRadius, 22);
  assert.equal(mock.canvas.width, 1120);
  assert.equal(mock.canvas.height, 720);
  assert.match(mock.attributes.get("aria-label"), /L two projection.*L one nearest point/);
  assert.ok(mock.operations.some((operation) => operation[0] === "setLineDash" && operation[1].join(",") === "7,5"));
  assert.ok(mock.operations.some((operation) => operation[0] === "setLineDash" && operation[1].join(",") === "3,4"));
  assert.ok(mock.operations.some((operation) =>
    operation[0] === "fillText" && operation[1] === "a = L₁ = L₂",
  ));
  assert.ok(!mock.operations.some(
    (operation) => operation[0] === "fillText" && operation[1] === "span(a)",
  ));
});

test("projection renderer auto-fits and exposes a draggable direction endpoint", () => {
  const mock = createMockCanvas();
  const frame = drawProjectionComparison(mock.canvas, [80, -40], [1, 1], { dpr: 1 });

  assert.deepEqual(frame.directionHandle.math, [80, -40]);
  assert.ok(frame.directionHandle.canvas.every(Number.isFinite));
  assert.ok(frame.viewport.bounds.maxX > 80);
  assert.ok(frame.directionHandle.canvas[0] >= frame.viewport.plot.x);
  assert.ok(frame.directionHandle.canvas[0] <= frame.viewport.plot.x + frame.viewport.plot.width);
  assert.ok(frame.directionHandle.canvas[1] >= frame.viewport.plot.y);
  assert.ok(frame.directionHandle.canvas[1] <= frame.viewport.plot.y + frame.viewport.plot.height);
});

test("projection renderer returns the same mathematical answers as its readout model", () => {
  const mock = createMockCanvas();
  const frame = drawProjectionComparison(mock.canvas, [2, 1], [2, 2], { dpr: 1 });
  assertPointClose(frame.comparison.l2.point, [2.4, 1.2]);
  assertPointClose(frame.comparison.l1.point, [2, 1]);
  assert.equal(frame.comparison.l1.nonUnique, false);
  assert.ok(frame.viewport.scale > 0);
});

test("projection renderer offsets nearby distinct answers without calling them equal", () => {
  const mock = createMockCanvas(276, 290);
  drawProjectionComparison(mock.canvas, [2, 1], [2, 2], { dpr: 1, extent: 5 });
  const labels = mock.operations
    .filter((operation) => operation[0] === "fillText")
    .map((operation) => operation[1]);
  assert.ok(labels.some((label) => label.split(" = ").includes("L₁")));
  assert.ok(labels.some((label) => label.split(" = ").includes("L₂")));
  assert.ok(!labels.some((label) => label.includes("L₁") && label.includes("L₂")));
});

test("SVD renderer follows exact factor endpoints and preserves a fixed viewport", () => {
  const decomposition = svd2x2([[1, 1], [0, 1]]);
  const mock = createMockCanvas();
  const frames = [0, 1, 2, 3].map((stage) =>
    drawSvdExplorer(mock.canvas, decomposition, stage, { dpr: 2 }),
  );

  assert.deepEqual(frames.map((frame) => frame.viewport.bounds), [
    frames[0].viewport.bounds,
    frames[0].viewport.bounds,
    frames[0].viewport.bounds,
    frames[0].viewport.bounds,
  ]);
  assertPointClose(frames[0].basisVectors[0], [1, 0]);
  assertPointClose(frames[0].basisVectors[1], [0, 1]);
  assertPointClose(frames[3].basisVectors[0], [
    decomposition.matrix[0][0],
    decomposition.matrix[1][0],
  ]);
  assertPointClose(frames[3].basisVectors[1], [
    decomposition.matrix[0][1],
    decomposition.matrix[1][1],
  ]);
  frames.slice(1).forEach((frame) => assert.deepEqual(frame.finalGrid, frames[0].finalGrid));
  assertGridClose(frames[3].stageGrid, frames[3].finalGrid);
  assert.match(mock.attributes.get("aria-label"), /SVD stage 3\.00/);
  assert.ok(mock.operations.some((operation) => operation[0] === "fillText" && operation[1] === "Ae₁"));
});

test("SVD renderer draws finite, deduplicated rank-one and zero grid collapses", () => {
  for (const matrix of [[[2, 4], [1, 2]], [[0, 0], [0, 0]]]) {
    const mock = createMockCanvas();
    const frame = drawSvdExplorer(mock.canvas, svd2x2(matrix), 3, { dpr: 1 });
    assert.ok(frame.stageMatrix.flat().every(Number.isFinite));
    assert.ok(frame.basisVectors.flat().every(Number.isFinite));
    assert.ok(frame.stageGrid.flatMap((segment) => segment.points).flat().every(Number.isFinite));
    assert.ok(frame.stageGrid.length <= 18);
    if (matrix[0][0] === 0) {
      assert.equal(frame.stageGrid.length, 1);
      assert.deepEqual(frame.stageGrid[0].points, [[0, 0], [0, 0]]);
    }
  }
});

test("SVD renderer labels the canonical basis at each exact factor endpoint", () => {
  const decomposition = svd2x2([[1, 1], [0, 1]]);
  const expected = [
    [0, ["e₁", "e₂"]],
    [1, ["Vᵀe₁", "Vᵀe₂"]],
    [2, ["ΣVᵀe₁", "ΣVᵀe₂"]],
    [3, ["Ae₁", "Ae₂"]],
  ];
  for (const [stage, labels] of expected) {
    const mock = createMockCanvas();
    drawSvdExplorer(mock.canvas, decomposition, stage, { dpr: 1 });
    const renderedLabels = mock.operations
      .filter((operation) => operation[0] === "fillText")
      .map((operation) => operation[1]);
    labels.forEach((label) => assert.ok(renderedLabels.includes(label)));
  }
});

test("SVD reflection labels reserve final-matrix semantics for the exact endpoint", () => {
  const decomposition = svd2x2([[-2, 0], [0, 1]]);
  const before = createMockCanvas();
  const beforeFrame = drawSvdExplorer(before.canvas, decomposition, 2.99, { dpr: 1 });
  const labels = before.operations
    .filter((operation) => operation[0] === "fillText")
    .map((operation) => operation[1]);
  assert.ok(labels.includes("image of e₁"));
  assert.ok(!labels.includes("Ae₁"));
  assert.throws(() => assertGridClose(beforeFrame.stageGrid, beforeFrame.finalGrid));

  const final = createMockCanvas();
  const finalFrame = drawSvdExplorer(final.canvas, decomposition, 3, { dpr: 1 });
  assertGridClose(finalFrame.stageGrid, finalFrame.finalGrid);
});

test("SVD renderer normalises extreme display geometry to a finite viewport", () => {
  const mock = createMockCanvas();
  const frame = drawSvdExplorer(
    mock.canvas,
    svd2x2([[1.7e308, 0], [0, 1]]),
    3,
    { dpr: 1 },
  );

  assert.ok(frame.displayScale > 1);
  assert.ok(Object.values(frame.viewport.bounds).every(Number.isFinite));
  assert.ok(frame.displayStageMatrix.flat().every(Number.isFinite));
  assert.ok(frame.stageGrid.flatMap((segment) => segment.points).flat().every(Number.isFinite));
  for (const operation of mock.operations) {
    assert.ok(operation.slice(1).flat().filter((value) => typeof value === "number").every(Number.isFinite));
  }
});
