import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasToClientPoint,
  canvasToMathPoint,
  calculateResultant,
  classifyTransformation,
  clientToCanvasPoint,
  clientToMathPoint,
  createTransformationViewport,
  determinant2x2,
  drawTransformation,
  drawVectors,
  getTransformationBounds,
  getVectorBounds,
  hitTestBasisEndpoint,
  invariantLineSegment,
  interpolateMatrix,
  isSingular2x2,
  mathToCanvasPoint,
  mathToClientPoint,
  normalizeEigenOverlay,
  normalizeVector,
  transformPoint,
} from "../public/visuals.js";

function assertPointClose(actual, expected, epsilon = 1e-9) {
  assert.equal(actual.length, 2);
  actual.forEach((value, index) =>
    assert.ok(
      Math.abs(value - expected[index]) <= epsilon,
      `expected coordinate ${index} to be ${expected[index]}, received ${value}`,
    ),
  );
}

function createMockCanvas(cssWidth = 480, cssHeight = 320) {
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
  return { canvas, context, operations, attributes };
}

test("transformPoint applies a row-major 2 by 2 transform", () => {
  assert.deepEqual(transformPoint([3, -2], [[2, 1], [-1, 4]]), [4, -11]);
  assert.deepEqual(transformPoint({ x: 0.5, y: -1.25 }, [[0, -1], [1, 0]]), [
    1.25,
    0.5,
  ]);
});

test("interpolateMatrix moves from identity to the target and clamps progress", () => {
  const target = [[3, -2], [4, 0]];
  assert.deepEqual(interpolateMatrix(target, 0), [[1, 0], [0, 1]]);
  assert.deepEqual(interpolateMatrix(target, 0.25), [[1.5, -0.5], [1, 0.75]]);
  assert.deepEqual(interpolateMatrix(target, 1), target);
  assert.deepEqual(interpolateMatrix(target, -10), [[1, 0], [0, 1]]);
  assert.deepEqual(interpolateMatrix(target, 10), target);
});

test("zero and singular transforms collapse points and report determinant zero", () => {
  const zero = [[0, 0], [0, 0]];
  const projection = [[1, 2], [2, 4]];

  assert.deepEqual(transformPoint([-7.5, 2 / 3], zero), [0, 0]);
  assert.equal(determinant2x2(zero), 0);
  assert.equal(isSingular2x2(zero), true);

  assert.deepEqual(transformPoint([2, -1], projection), [0, 0]);
  assert.equal(determinant2x2(projection), 0);
  assert.equal(isSingular2x2(projection), true);
  assert.equal(isSingular2x2([[1, 0], [0, 1]]), false);
});

test("common transformations map basis columns and classify orientation", () => {
  const transformations = [
    {
      name: "rotation",
      matrix: [[0, -1], [1, 0]],
      xBasis: [0, 1],
      yBasis: [-1, 0],
      orientation: "preserved",
    },
    {
      name: "shear",
      matrix: [[1, 1], [0, 1]],
      xBasis: [1, 0],
      yBasis: [1, 1],
      orientation: "preserved",
    },
    {
      name: "reflection",
      matrix: [[-1, 0], [0, 1]],
      xBasis: [-1, 0],
      yBasis: [0, 1],
      orientation: "reversed",
    },
    {
      name: "projection",
      matrix: [[1, 0], [0, 0]],
      xBasis: [1, 0],
      yBasis: [0, 0],
      orientation: "collapsed",
    },
  ];

  for (const transformation of transformations) {
    const state = classifyTransformation(transformation.matrix);
    assert.deepEqual(state.xBasis, transformation.xBasis, `${transformation.name} x basis`);
    assert.deepEqual(state.yBasis, transformation.yBasis, `${transformation.name} y basis`);
    assert.equal(state.orientation, transformation.orientation, transformation.name);
    assert.deepEqual(transformPoint([1, 0], transformation.matrix), transformation.xBasis);
    assert.deepEqual(transformPoint([0, 1], transformation.matrix), transformation.yBasis);
  }
});

test("singularity uses matrix-relative tolerance for very small transforms", () => {
  const tinyScale = [[1e-12, 0], [0, 1e-12]];
  assert.equal(isSingular2x2(tinyScale), false);
  assert.deepEqual(classifyTransformation(tinyScale), {
    determinant: 1e-24,
    areaScale: 1e-24,
    singular: false,
    orientation: "preserved",
    xBasis: [1e-12, 0],
    yBasis: [0, 1e-12],
  });
  assert.equal(isSingular2x2([[1, 1], [1, 1 + 1e-12]]), true);
  assert.equal(isSingular2x2([[1e-200, 0], [0, 1e-200]]), false);
  assert.equal(
    classifyTransformation([[-1e-200, 0], [0, 1e-200]]).orientation,
    "reversed",
  );
});

test("zoom creates a fixed viewport while optional auto-fit remains stable", () => {
  const expansion = [[5, 0], [0, 5]];
  assert.deepEqual(getTransformationBounds(expansion, 2), {
    minX: -2,
    maxX: 2,
    minY: -2,
    maxY: 2,
  });
  assert.deepEqual(getTransformationBounds(expansion, 8), {
    minX: -8,
    maxX: 8,
    minY: -8,
    maxY: 8,
  });
  assert.equal(getTransformationBounds(expansion, 2, { autoFit: true }).maxX, 11);
});

test("fixed viewport converts mathematical, canvas, and client coordinates", () => {
  const bounds = getTransformationBounds([[1, 0], [0, 1]], 4);
  const viewport = createTransformationViewport(600, 400, bounds, {
    plotPadding: 40,
    dpr: 3,
  });
  const clientRect = { left: 10, top: 20, width: 300, height: 200 };

  assert.equal(viewport.scale, 40);
  assert.equal(viewport.dpr, 3);
  assert.deepEqual(viewport.plot, { x: 40, y: 40, width: 520, height: 320 });
  assert.deepEqual(mathToCanvasPoint([0, 0], viewport), [300, 200]);
  assert.deepEqual(mathToCanvasPoint([4, 4], viewport), [460, 40]);
  assert.deepEqual(canvasToMathPoint([140, 360], viewport), [-4, -4]);

  const canvasPoint = clientToCanvasPoint(
    { clientX: 200, clientY: 140 },
    clientRect,
    viewport,
  );
  assert.deepEqual(canvasPoint, [380, 240]);
  assert.deepEqual(canvasToClientPoint(canvasPoint, clientRect, viewport), [200, 140]);
  assertPointClose(clientToMathPoint([200, 140], clientRect, viewport), [2, -1]);
  assertPointClose(mathToClientPoint([2, -1], clientRect, viewport), [200, 140]);
});

test("basis endpoint hit-testing selects the nearest handle with overlap control", () => {
  const endpoints = {
    x: { axis: "x", canvas: [100, 80], hitRadius: 12 },
    y: { axis: "y", canvas: [130, 80], hitRadius: 12 },
  };
  assert.equal(hitTestBasisEndpoint([108, 80], endpoints).axis, "x");
  assert.equal(hitTestBasisEndpoint([115, 80], endpoints), null);

  const overlapping = {
    x: { axis: "x", canvas: [50, 50], hitRadius: 14 },
    y: { axis: "y", canvas: [50, 50], hitRadius: 14 },
  };
  assert.equal(hitTestBasisEndpoint([50, 50], overlapping).axis, "x");
  assert.equal(
    hitTestBasisEndpoint([50, 50], overlapping, { preferredAxis: "y" }).axis,
    "y",
  );
  assert.equal(hitTestBasisEndpoint([100, 100], overlapping), null);
});

test("eigen overlays normalize distinct, one, all, and no-line states", () => {
  const distinct = normalizeEigenOverlay({
    state: "distinct",
    lines: [
      { id: "lambda-2", label: "v₁", direction: [2, 0], eigenvalue: 2 },
      { id: "lambda-neg", label: "v₂", direction: [0, -3], eigenvalue: -1 },
    ],
  });
  assert.equal(distinct.state, "distinct");
  assert.deepEqual(distinct.lines.map((line) => line.direction), [[1, 0], [0, 1]]);
  assert.deepEqual(distinct.lines.map((line) => line.stretchCue), [
    "λ = 2",
    "λ = -1",
  ]);

  const one = normalizeEigenOverlay({
    state: "distinct",
    lines: [
      { direction: [1, 2], eigenvalue: 3 },
      { direction: [-2, -4], eigenvalue: 3 },
    ],
  });
  assert.equal(one.state, "one");
  assert.equal(one.lines.length, 1);

  const all = normalizeEigenOverlay({
    state: "all",
    eigenvalue: 4,
    label: "every direction",
  });
  assert.equal(all.state, "all");
  assert.equal(all.lines.length, 2);
  assert.ok(all.lines.every((line) => line.representative));
  assert.deepEqual(all.lines.map((line) => line.direction), [[1, 0], [0, 1]]);
  assert.deepEqual(all.lines.map((line) => line.label), ["v₁", "v₂"]);
  assert.equal(all.lines.filter((line) => line.showLabel).length, 2);
  assert.match(all.summary, /every direction.*λ = 4/);

  assert.deepEqual(normalizeEigenOverlay(false), {
    state: "none",
    lines: [],
    summary: "",
  });
  assert.deepEqual(
    normalizeEigenOverlay({ state: "none", summary: "No real invariant lines" }),
    { state: "none", lines: [], summary: "No real invariant lines" },
  );

  const analysisShape = normalizeEigenOverlay({
    kind: "distinct-real",
    hasRealEigenlines: true,
    allDirectionsInvariant: false,
    directions: [
      { vector: [1, 1], eigenvalue: 5, eigenvalueLabel: "5" },
      { vector: [1, -2], eigenvalue: 2, eigenvalueLabel: "2" },
    ],
    explanation: "Two real invariant directions.",
  });
  assert.equal(analysisShape.state, "distinct");
  assert.equal(analysisShape.lines.length, 2);
  assert.equal(analysisShape.summary, "Two real invariant directions.");
});

test("invariant overlays span the full viewport through the origin", () => {
  assert.deepEqual(
    invariantLineSegment([1, 2], { minX: -4, maxX: 4, minY: -4, maxY: 4 }),
    [[-2, -4], [2, 4]],
  );
  assert.deepEqual(
    invariantLineSegment([0, -3], { minX: -2, maxX: 2, minY: -5, maxY: 5 }),
    [[0, -5], [0, 5]],
  );
});

test("transformation renderer draws labeled unit eigenvectors and their signed images", () => {
  const mock = createMockCanvas();
  const rendered = drawTransformation(mock.canvas, [[2, 0], [0, -1]], 1, {
    dpr: 2,
    gridExtent: 4,
    basisHandles: {
      visible: true,
      active: "x",
      radius: 7,
      hitRadius: 16,
      accessibleText: {
        x: "Drag the horizontal basis endpoint",
        y: "Drag the vertical basis endpoint",
      },
    },
    colors: { eigenSeries: ["theme-line-one", "theme-line-two"] },
    eigenOverlay: {
      state: "distinct",
      lines: [
        {
          id: "horizontal-eigenvector",
          label: "v₁",
          direction: [1, 0],
          eigenvalue: 2,
          accessibleText: "Horizontal unit eigenvector, stretched by two",
        },
        {
          id: "vertical-eigenvector",
          label: "v₂",
          direction: [0, 1],
          eigenvalue: -1,
        },
      ],
    },
  });

  assert.equal(rendered.viewport.dpr, 2);
  assert.deepEqual(rendered.basisEndpoints.x.math, [2, 0]);
  assert.deepEqual(rendered.basisEndpoints.y.math, [0, -1]);
  assert.equal(rendered.basisEndpoints.x.radius, 7);
  assert.equal(rendered.basisEndpoints.x.hitRadius, 16);
  assert.equal(
    rendered.basisEndpoints.x.accessibleText,
    "Drag the horizontal basis endpoint",
  );
  assert.equal(rendered.eigenOverlay.state, "distinct");
  assert.deepEqual(
    rendered.eigenOverlay.lines.map((line) => line.color),
    ["theme-line-one", "theme-line-two"],
  );
  assert.deepEqual(rendered.eigenOverlay.lines[0].unitVector, [1, 0]);
  assert.deepEqual(rendered.eigenOverlay.lines[0].transformedVector, [2, 0]);
  assert.deepEqual(rendered.eigenOverlay.lines[1].unitVector, [0, 1]);
  assert.deepEqual(rendered.eigenOverlay.lines[1].transformedVector, [0, -1]);
  assert.equal(rendered.eigenOverlay.lines[0].currentScale, 2);
  assert.equal(rendered.eigenOverlay.lines[1].currentScale, -1);
  assert.equal(rendered.eigenOverlay.lines[0].isClipped, false);
  assert.match(rendered.eigenOverlay.lines[0].labelText, /v₁.*λ = 2/);
  assert.equal(
    rendered.eigenOverlay.lines[0].accessibleText,
    "Horizontal unit eigenvector, stretched by two",
  );
  assert.equal(
    hitTestBasisEndpoint(
      [rendered.basisEndpoints.x.canvas[0] + 15, rendered.basisEndpoints.x.canvas[1]],
      rendered.basisEndpoints,
    ).axis,
    "x",
  );
  assert.ok(
    mock.operations.filter((operation) => operation[0] === "arc").length >= 2,
  );
  assert.deepEqual(
    mock.operations
      .filter(
        (operation) => operation[0] === "setLineDash" && operation[1].length > 0,
      )
      .map((operation) => operation[1]),
    [[1, 4], [1, 5], [1, 4], [1, 5]],
  );
});

test("eigenvector arrows stretch, collapse, reverse, and expose offscreen values", () => {
  const renderScales = (first, second, extent = 4) => {
    const mock = createMockCanvas();
    return drawTransformation(mock.canvas, [[1, 0], [0, 1]], 1, {
      gridExtent: extent,
      eigenOverlay: {
        state: "distinct",
        lines: [
          { label: "v₁", direction: [1, 0], eigenvalue: first },
          { label: "v₂", direction: [0, 1], eigenvalue: second },
        ],
      },
    }).eigenOverlay;
  };

  const start = renderScales(1, 1);
  assert.deepEqual(start.lines.map((line) => line.transformedVector), [[1, 0], [0, 1]]);

  const crossing = renderScales(0, 2 / 3);
  assert.deepEqual(crossing.lines[0].transformedVector, [0, 0]);
  assertPointClose(crossing.lines[1].transformedVector, [0, 2 / 3]);

  const finish = renderScales(-2, 0);
  assert.deepEqual(finish.lines.map((line) => line.transformedVector), [[-2, 0], [0, 0]]);

  const bothCollapsed = renderScales(0, 0);
  assert.notDeepEqual(bothCollapsed.lines[0].labelCanvas, bothCollapsed.lines[1].labelCanvas);

  const clipped = renderScales(8, 1);
  assert.deepEqual(clipped.lines[0].transformedVector, [8, 0]);
  assert.deepEqual(clipped.lines[0].visibleVector, [4, 0]);
  assert.equal(clipped.lines[0].isClipped, true);
  assert.match(clipped.lines[0].labelText, /outside view/);
});

test("new transformation metadata is available without enabling optional drawing", () => {
  const mock = createMockCanvas();
  const rendered = drawTransformation(mock.canvas, [[1, 0], [0, 1]], 1);
  assert.deepEqual(rendered.basisEndpoints.x.math, [1, 0]);
  assert.deepEqual(rendered.basisEndpoints.y.math, [0, 1]);
  assert.equal(rendered.eigenOverlay.state, "none");
  assert.equal(rendered.eigenOverlay.lines.length, 0);
  assert.equal(
    mock.operations.filter((operation) => operation[0] === "arc").length,
    0,
  );
});

test("zoom and DPR preserve pointer mathematics while changing visual scale", () => {
  const mock = createMockCanvas(480, 320);
  const zoomedIn = drawTransformation(mock.canvas, [[1, 0], [0, 1]], 1, {
    dpr: 3,
    gridExtent: 2,
    basisHandles: true,
  });
  const zoomedOut = drawTransformation(mock.canvas, [[1, 0], [0, 1]], 1, {
    dpr: 3,
    gridExtent: 8,
    basisHandles: true,
  });
  const inOrigin = mathToCanvasPoint([0, 0], zoomedIn.viewport);
  const outOrigin = mathToCanvasPoint([0, 0], zoomedOut.viewport);
  const inLength = Math.hypot(
    zoomedIn.basisEndpoints.x.canvas[0] - inOrigin[0],
    zoomedIn.basisEndpoints.x.canvas[1] - inOrigin[1],
  );
  const outLength = Math.hypot(
    zoomedOut.basisEndpoints.x.canvas[0] - outOrigin[0],
    zoomedOut.basisEndpoints.x.canvas[1] - outOrigin[1],
  );

  assert.ok(inLength > outLength);
  assert.equal(mock.canvas.width, 1440);
  assert.equal(mock.canvas.height, 960);
  assertPointClose(
    canvasToMathPoint(zoomedOut.basisEndpoints.x.canvas, zoomedOut.viewport),
    [1, 0],
  );
});

test("transformation animation keeps its viewport and exposes transient collapse", () => {
  const mock = createMockCanvas();
  const reflection = [[-1, 0], [0, 1]];
  const start = drawTransformation(mock.canvas, reflection, 0, {
    dpr: 2,
    gridExtent: 4,
    accessibleText: "Animated reflection of the coordinate plane",
  });
  const middle = drawTransformation(mock.canvas, reflection, 0.5, {
    dpr: 2,
    gridExtent: 4,
  });
  const finish = drawTransformation(mock.canvas, reflection, 1, {
    dpr: 2,
    gridExtent: 4,
  });

  assert.deepEqual(start.bounds, finish.bounds);
  assert.deepEqual(middle.bounds, finish.bounds);
  assert.equal(start.orientation, "preserved");
  assert.equal(middle.orientation, "collapsed");
  assert.equal(middle.determinant, 0);
  assert.equal(finish.orientation, "reversed");
  assert.equal(mock.canvas.width, 960);
  assert.equal(mock.canvas.height, 640);
  assert.deepEqual(
    mock.operations.find((operation) => operation[0] === "setTransform"),
    ["setTransform", 2, 0, 0, 2, 0, 0],
  );
  assert.equal(mock.attributes.get("role"), "img");
  assert.equal(
    mock.attributes.get("aria-label"),
    "Animated reflection of the coordinate plane",
  );
  assert.ok(
    mock.operations.some(
      (operation) => operation[0] === "fillText" && operation[1] === "dimension collapsed",
    ),
  );
});

test("normalizeVector retains fractional starts and derives endpoints", () => {
  assert.deepEqual(
    normalizeVector({
      start: [-2.5, 1 / 2],
      components: [3 / 4, -2.25],
      label: "v",
      color: "tomato",
    }),
    {
      start: [-2.5, 0.5],
      components: [0.75, -2.25],
      end: [-1.75, -1.75],
      label: "v",
      color: "tomato",
    },
  );
});

test("resultant sums visible movements and preserves sketchbook metadata", () => {
  const resultant = calculateResultant([
    { id: "u", start: [10, -4], components: [0.5, -1.25] },
    { id: "v", start: [-2, 3], components: [-2.25, 4.5] },
    { id: "hidden", components: [100, 100], hidden: true },
    { id: "old-resultant", components: [50, 50], resultant: true },
  ]);

  assert.deepEqual(resultant, {
    id: "resultant",
    start: [0, 0],
    components: [-1.75, 3.25],
    end: [-1.75, 3.25],
    label: "Σ",
    color: undefined,
    resultant: true,
  });
});

test("vector bounds include negative and fractional starts and endpoints", () => {
  const bounds = getVectorBounds(
    [
      { start: [-2.5, 1], components: [0.5, -3.25] },
      { start: [0.5, -0.5], components: [1.25, 2.75] },
    ],
    { padding: 0, minSpan: 0 },
  );

  assert.deepEqual(bounds, {
    minX: -2.5,
    maxX: 1.75,
    minY: -2.25,
    maxY: 2.25,
  });
});

test("vector bounds remain drawable for empty and zero-length vectors", () => {
  assert.deepEqual(getVectorBounds([], { padding: 0 }), {
    minX: -1,
    maxX: 1,
    minY: -1,
    maxY: 1,
  });
  assert.deepEqual(getVectorBounds([[0, 0]], { padding: 0 }), {
    minX: -1,
    maxX: 1,
    minY: -1,
    maxY: 1,
  });
});

test("hidden vectors do not distort automatic bounds", () => {
  const bounds = getVectorBounds(
    [
      { start: [-0.5, 0.25], components: [1.25, -0.5] },
      { start: [1000, -1000], components: [500, 500], hidden: true },
    ],
    { padding: 0, minSpan: 0 },
  );
  assert.deepEqual(bounds, {
    minX: -0.5,
    maxX: 0.75,
    minY: -0.25,
    maxY: 0.25,
  });
});

test("vector renderer is stateless across add, edit, hide, delete, and resultant", () => {
  const mock = createMockCanvas(600, 360);
  const first = { id: "u", label: "u", start: [0, 0], components: [2, 1] };
  const second = { id: "v", label: "v", start: [-1, 0.5], components: [1, 3] };

  const added = drawVectors(mock.canvas, [first, second], { dpr: 1 });
  assert.equal(added.vectors.length, 2);

  const edited = drawVectors(
    mock.canvas,
    [first, { ...second, components: [-0.5, -1.25] }],
    { dpr: 1 },
  );
  assert.deepEqual(edited.vectors[1].end, [-1.5, -0.75]);

  const hidden = drawVectors(
    mock.canvas,
    [first, { ...second, hidden: true }],
    { dpr: 1 },
  );
  assert.equal(hidden.vectors.length, 1);

  const deleted = drawVectors(mock.canvas, [first], { dpr: 1 });
  assert.equal(deleted.vectors.length, 1);

  const resultant = calculateResultant([first, second]);
  const withResultant = drawVectors(mock.canvas, [first, second, resultant], {
    dpr: 1,
  });
  assert.equal(withResultant.vectors.length, 3);
  assert.equal(withResultant.vectors.at(-1).resultant, true);
  assert.ok(
    mock.operations.some(
      (operation) =>
        operation[0] === "setLineDash" &&
        operation[1][0] === 8 &&
        operation[1][1] === 5,
    ),
  );
  assert.ok(
    mock.operations.some(
      (operation) => operation[0] === "fillText" && operation[1] === "Σ",
    ),
  );
});

test("geometry helpers reject malformed and non-finite input", () => {
  assert.throws(() => transformPoint([1, 2], [[1, 0, 0], [0, 1, 0]]));
  assert.throws(() => interpolateMatrix([[1, 0], [0, Number.NaN]], 0.5));
  assert.throws(() => getVectorBounds([{ x: Number.POSITIVE_INFINITY, y: 1 }]));
});
