/** Canvas renderers for the projection comparison and SVD explorer. */

import {
  applyMatrix2,
  compareLineProjections,
  svdStageMatrix,
} from "./labs.js";
import {
  createTransformationViewport,
  invariantLineSegment,
  mathToCanvasPoint,
  niceGridStep,
} from "./visuals.js";

const rememberedSizes = new WeakMap();
const DEFAULT_COLORS = Object.freeze({
  background: "#ffffff",
  grid: "#d9e1e9",
  axes: "#607086",
  text: "#10243b",
  mutedText: "#607086",
  line: "#164c7c",
  target: "#002147",
  l2: "#e56352",
  l1: "#377bb8",
  highlight: "#f1b434",
  reference: "#bcc9d6",
  curve: "#164c7c",
  axisOne: "#e56352",
  axisTwo: "#377bb8",
});

function finiteNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${name} must be finite.`);
  return number;
}

function mergeColors(colors = {}) {
  return { ...DEFAULT_COLORS, ...colors };
}

function canvasMetrics(canvas, options = {}) {
  if (!canvas || typeof canvas.getContext !== "function") {
    throw new TypeError("canvas must provide a 2D drawing context.");
  }
  const remembered = rememberedSizes.get(canvas);
  const rect = typeof canvas.getBoundingClientRect === "function"
    ? canvas.getBoundingClientRect()
    : null;
  const width = Math.max(
    1,
    finiteNumber(
      options.width ?? rect?.width ?? canvas.clientWidth ?? remembered?.width ?? canvas.width ?? 640,
      "canvas width",
    ),
  );
  const height = Math.max(
    1,
    finiteNumber(
      options.height ?? rect?.height ?? canvas.clientHeight ?? remembered?.height ?? canvas.height ?? 420,
      "canvas height",
    ),
  );
  const dpr = Math.min(
    4,
    Math.max(1, finiteNumber(options.dpr ?? globalThis.devicePixelRatio ?? 1, "device pixel ratio")),
  );
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  rememberedSizes.set(canvas, { width, height });
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  if (typeof canvas.setAttribute === "function" && options.accessibleText) {
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", options.accessibleText);
  }
  return { context, width, height, dpr };
}

function strokePath(context, points, color, width = 1, dash = []) {
  if (points.length < 2) return;
  context.save();
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.setLineDash(dash);
  context.stroke();
  context.restore();
}

function drawArrow(context, start, end, color, options = {}) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  const width = options.width ?? 2.5;
  strokePath(context, [start, end], color, width, options.dash ?? []);
  if (length < 1) return;
  const angle = Math.atan2(dy, dx);
  const head = Math.min(options.headLength ?? 10, Math.max(5, length * 0.3));
  context.save();
  context.beginPath();
  context.moveTo(end[0], end[1]);
  context.lineTo(
    end[0] - head * Math.cos(angle - Math.PI / 7),
    end[1] - head * Math.sin(angle - Math.PI / 7),
  );
  context.lineTo(
    end[0] - head * Math.cos(angle + Math.PI / 7),
    end[1] - head * Math.sin(angle + Math.PI / 7),
  );
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.restore();
}

function drawPoint(context, point, color, options = {}) {
  context.save();
  context.beginPath();
  context.arc(point[0], point[1], options.radius ?? 5, 0, Math.PI * 2);
  context.fillStyle = options.fill ?? color;
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = options.width ?? 2;
  context.stroke();
  context.restore();
}

function drawRightAngle(context, vertex, lineVector, residualVector, color) {
  const lineLength = Math.hypot(...lineVector);
  const residualLength = Math.hypot(...residualVector);
  if (lineLength < 1 || residualLength < 18) return;
  const size = Math.min(10, residualLength * 0.28);
  const along = lineVector.map((value) => (value / lineLength) * size);
  const away = residualVector.map((value) => (value / residualLength) * size);
  strokePath(context, [
    [vertex[0] + along[0], vertex[1] + along[1]],
    [vertex[0] + along[0] + away[0], vertex[1] + along[1] + away[1]],
    [vertex[0] + away[0], vertex[1] + away[1]],
  ], color, 1.5);
}

function drawText(context, text, point, color, options = {}) {
  context.save();
  context.fillStyle = color;
  context.font = options.font ?? "600 12px system-ui, sans-serif";
  context.textAlign = options.align ?? "left";
  context.textBaseline = options.baseline ?? "middle";
  context.fillText(String(text), point[0], point[1]);
  context.restore();
}

function canvasPointsAreNear(left, right, distance = 13) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]) <= distance;
}

function mathPointsAreEqual(left, right) {
  if (!left?.every(Number.isFinite) || !right?.every(Number.isFinite)) return false;
  const scale = Math.max(1, ...left.map(Math.abs), ...right.map(Math.abs));
  return Math.hypot(left[0] - right[0], left[1] - right[1]) <=
    4 * Number.EPSILON * scale;
}

function drawCollisionAwareLabels(context, entries, options = {}) {
  const groups = [];
  for (const entry of entries) {
    const group = groups.find((candidate) =>
      candidate.entries.some((member) => mathPointsAreEqual(member.mathPoint, entry.mathPoint)),
    );
    if (group) group.entries.push(entry);
    else groups.push({ entries: [entry] });
  }

  const occupied = [];
  for (const group of groups) {
    const anchor = group.entries.reduce(
      (sum, entry) => [sum[0] + entry.point[0], sum[1] + entry.point[1]],
      [0, 0],
    ).map((value) => value / group.entries.length);
    const primary = group.entries.find((entry) => entry.primary) ?? group.entries[0];
    const shifts = [0, 16, -16, 32, -32, 48, -48];
    const shift = shifts.find((candidate) => !occupied.some((point) =>
      canvasPointsAreNear(
        [anchor[0] + (options.offsetX ?? 9), anchor[1] + (options.offsetY ?? -12) + candidate],
        point,
        options.distance ?? 14,
      ))) ?? shifts.at(-1);
    const labelPoint = [
      anchor[0] + (options.offsetX ?? 9),
      anchor[1] + (options.offsetY ?? -12) + shift,
    ];
    drawText(
      context,
      [...new Set(group.entries.map((entry) => entry.label))].join(" = "),
      labelPoint,
      primary.color,
    );
    occupied.push(labelPoint);
  }
}

function createSquareViewport(metrics, extent, padding = 38) {
  const radius = Math.max(1, finiteNumber(extent, "extent"));
  return createTransformationViewport(
    metrics.width,
    metrics.height,
    { minX: -radius, maxX: radius, minY: -radius, maxY: radius },
    { plotPadding: padding, dpr: metrics.dpr },
  );
}

function drawGrid(context, viewport, colors) {
  const { bounds, plot } = viewport;
  const project = (point) => mathToCanvasPoint(point, viewport);
  const step = niceGridStep(bounds.maxX - bounds.minX, 10);
  const start = Math.ceil(bounds.minX / step) * step;
  const limit = Math.floor(bounds.maxX / step) * step;

  context.save();
  context.beginPath();
  context.rect(plot.x, plot.y, plot.width, plot.height);
  context.clip();
  for (let coordinate = start; coordinate <= limit + step * 0.25; coordinate += step) {
    const vertical = coordinate === 0 ? colors.axes : colors.grid;
    const width = coordinate === 0 ? 1.35 : 0.75;
    strokePath(context, [project([coordinate, bounds.minY]), project([coordinate, bounds.maxY])], vertical, width);
    strokePath(context, [project([bounds.minX, coordinate]), project([bounds.maxX, coordinate])], vertical, width);
  }
  context.restore();
}

function drawCoordinateAxes(context, viewport, colors) {
  const { bounds, plot } = viewport;
  const project = (point) => mathToCanvasPoint(point, viewport);
  context.save();
  context.beginPath();
  context.rect(plot.x, plot.y, plot.width, plot.height);
  context.clip();
  strokePath(context, [project([bounds.minX, 0]), project([bounds.maxX, 0])], colors.axes, 1.15);
  strokePath(context, [project([0, bounds.minY]), project([0, bounds.maxY])], colors.axes, 1.15);
  context.restore();
}

function coordinateLabel(point) {
  return `(${point.map((value) => {
    const rounded = Math.abs(value) < 0.005 ? 0 : value;
    return rounded.toFixed(2);
  }).join(", ")})`;
}

export function drawProjectionComparison(canvas, direction, target, options = {}) {
  const comparison = compareLineProjections(direction, target, options);
  const metrics = canvasMetrics(canvas, options);
  if (!metrics) return null;
  const colors = mergeColors(options.colors);
  const extent = Math.max(
    3,
    finiteNumber(
      options.extent ?? Math.max(5, ...[
        ...comparison.direction,
        ...comparison.target,
        ...comparison.l1.intervalPoints.flat(),
        ...comparison.l2.point,
      ].map((value) => Math.abs(value))) * 1.18,
      "projection extent",
    ),
  );
  const viewport = createSquareViewport(metrics, extent, options.plotPadding ?? 42);
  const project = (point) => mathToCanvasPoint(point, viewport);
  const { context, width, height } = metrics;
  const { plot } = viewport;

  context.fillStyle = colors.background;
  context.fillRect(0, 0, width, height);
  drawGrid(context, viewport, colors);

  context.save();
  context.beginPath();
  context.rect(plot.x, plot.y, plot.width, plot.height);
  context.clip();
  const line = invariantLineSegment(comparison.direction, viewport.bounds).map(project);
  strokePath(context, line, colors.line, 2.2);

  if (comparison.l1.nonUnique) {
    strokePath(
      context,
      comparison.l1.intervalPoints.map(project),
      colors.l1,
      8,
    );
  }

  const targetCanvas = project(comparison.target);
  const l2Canvas = project(comparison.l2.point);
  const l1Canvas = project(comparison.l1.point);
  strokePath(context, [l2Canvas, targetCanvas], colors.l2, 2.2, [7, 5]);
  const directionCanvas = project(comparison.direction);
  const originCanvas = project([0, 0]);
  drawRightAngle(
    context,
    l2Canvas,
    [directionCanvas[0] - originCanvas[0], directionCanvas[1] - originCanvas[1]],
    [targetCanvas[0] - l2Canvas[0], targetCanvas[1] - l2Canvas[1]],
    colors.l2,
  );
  const l1Corner = project([comparison.target[0], comparison.l1.point[1]]);
  strokePath(context, [l1Canvas, l1Corner, targetCanvas], colors.l1, 2.2, [3, 4]);
  drawArrow(context, originCanvas, directionCanvas, colors.line, { width: 2.6 });
  drawArrow(context, originCanvas, targetCanvas, colors.target, { width: 2.4 });
  drawPoint(context, l2Canvas, colors.l2, { radius: 5, fill: colors.background });
  drawPoint(context, l1Canvas, colors.l1, { radius: 6, fill: colors.background });
  drawPoint(context, directionCanvas, colors.line, { radius: 6, fill: colors.background, width: 2.4 });
  drawPoint(context, targetCanvas, colors.target, { radius: 7, fill: colors.highlight, width: 2.5 });
  context.restore();

  drawCollisionAwareLabels(context, [
    { label: "a", point: directionCanvas, mathPoint: comparison.direction, color: colors.line },
    { label: "b", point: targetCanvas, mathPoint: comparison.target, color: colors.text, primary: true },
    { label: "L₁", point: l1Canvas, mathPoint: comparison.l1.point, color: colors.l1 },
    { label: "L₂", point: l2Canvas, mathPoint: comparison.l2.point, color: colors.l2 },
  ]);

  const accessibleText = options.accessibleText ??
    `Target b ${coordinateLabel(comparison.target)} projected onto the line spanned by direction a ${coordinateLabel(comparison.direction)}. ` +
    `The L two projection is ${coordinateLabel(comparison.l2.point)} and the L one nearest point is ${coordinateLabel(comparison.l1.point)}.`;
  if (typeof canvas.setAttribute === "function") canvas.setAttribute("aria-label", accessibleText);

  return {
    comparison,
    viewport,
    directionHandle: {
      math: comparison.direction.slice(),
      canvas: directionCanvas,
      radius: 6,
      hitRadius: 22,
    },
    targetHandle: {
      math: comparison.target.slice(),
      canvas: targetCanvas,
      radius: 7,
      hitRadius: 22,
    },
    size: { width, height, dpr: metrics.dpr },
  };
}

function squareCorners(extent) {
  return [
    [-extent, -extent],
    [-extent, extent],
    [extent, -extent],
    [extent, extent],
  ];
}

function displayMatrix(matrix, scale) {
  return matrix.map((row) => row.map((value) => value / scale));
}

function gridSegmentKey(points) {
  return points
    .flat()
    .map((value) => Math.abs(value) < 1e-12 ? 0 : Number(value.toPrecision(11)))
    .join(",");
}

function transformedGridSegments(matrix, extent) {
  const coordinates = Array.from({ length: extent * 2 + 1 }, (_, index) => index - extent);
  const segments = [];
  const seen = new Set();
  const add = (start, end, major) => {
    const points = [applyMatrix2(matrix, start), applyMatrix2(matrix, end)];
    if (points.flat().some((value) => !Number.isFinite(value))) return;
    const key = gridSegmentKey(points);
    if (seen.has(key)) return;
    seen.add(key);
    segments.push({ points, major });
  };
  for (const coordinate of coordinates) {
    add([coordinate, -extent], [coordinate, extent], coordinate === 0);
    add([-extent, coordinate], [extent, coordinate], coordinate === 0);
  }
  return segments;
}

function drawTransformedGrid(context, segments, project, color, options = {}) {
  context.save();
  context.globalAlpha = options.alpha ?? 1;
  for (const segment of segments) {
    strokePath(
      context,
      segment.points.map(project),
      color,
      segment.major ? options.axisWidth ?? 1.9 : options.width ?? 1.05,
      options.dash ?? [],
    );
  }
  context.restore();
}

function drawOrientedBasisCell(context, matrix, project, color) {
  const triangle = [[0, 0], [0.68, 0], [0.68, 0.68]]
    .map((point) => project(applyMatrix2(matrix, point)));
  context.save();
  context.globalAlpha = 0.14;
  context.beginPath();
  context.moveTo(triangle[0][0], triangle[0][1]);
  triangle.slice(1).forEach((point) => context.lineTo(point[0], point[1]));
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.restore();
  strokePath(context, [...triangle, triangle[0]], color, 1.35);
}

function stageBasisLabels(progress) {
  if (progress < 0.02) return ["e₁", "e₂"];
  if (Math.abs(progress - 1) < 0.02) return ["Vᵀe₁", "Vᵀe₂"];
  if (Math.abs(progress - 2) < 0.02) return ["ΣVᵀe₁", "ΣVᵀe₂"];
  if (progress >= 3) return ["Ae₁", "Ae₂"];
  return ["image of e₁", "image of e₂"];
}

export function drawSvdExplorer(canvas, decomposition, progressInput, options = {}) {
  const progress = Math.min(3, Math.max(0, finiteNumber(progressInput, "progress")));
  const stageMatrix = svdStageMatrix(decomposition, progress);
  const metrics = canvasMetrics(canvas, options);
  if (!metrics) return null;
  const colors = mergeColors(options.colors);
  const gridExtent = Math.max(2, Math.min(6, Math.round(finiteNumber(options.gridExtent ?? 4, "grid extent"))));
  const largestSingularValue = finiteNumber(
    decomposition.singularValues[0],
    "largest singular value",
  );
  const displayScale = largestSingularValue > 1e150 ? largestSingularValue : 1;
  const finalMatrix = decomposition.matrix.map((row) => row.map((value) => finiteNumber(value, "matrix value")));
  const displayFinalMatrix = displayMatrix(finalMatrix, displayScale);
  const displayStageMatrix = displayMatrix(stageMatrix, displayScale);
  const radius = Math.max(
    1.45,
    ...squareCorners(gridExtent)
      .flatMap((point) => [point, applyMatrix2(displayFinalMatrix, point)])
      .flat()
      .map(Math.abs),
  ) * 1.1;
  const viewport = createSquareViewport(metrics, radius, options.plotPadding ?? 42);
  const project = (point) => mathToCanvasPoint(point, viewport);
  const { context, width, height } = metrics;
  const { plot } = viewport;
  context.fillStyle = colors.background;
  context.fillRect(0, 0, width, height);
  drawCoordinateAxes(context, viewport, colors);

  context.save();
  context.beginPath();
  context.rect(plot.x, plot.y, plot.width, plot.height);
  context.clip();
  const sourceGridSegments = transformedGridSegments([[1, 0], [0, 1]], gridExtent);
  const finalGridSegments = transformedGridSegments(displayFinalMatrix, gridExtent);
  const currentGridSegments = transformedGridSegments(displayStageMatrix, gridExtent);
  drawTransformedGrid(context, finalGridSegments, project, colors.reference, {
    alpha: progress >= 2.98 ? 0.24 : 0.52,
    width: 0.95,
    axisWidth: 1.35,
    dash: [5, 5],
  });
  drawTransformedGrid(context, currentGridSegments, project, colors.curve, {
    alpha: 0.88,
    width: 1.15,
    axisWidth: 2,
  });
  drawOrientedBasisCell(context, displayStageMatrix, project, colors.highlight);

  const basisOne = [stageMatrix[0][0], stageMatrix[1][0]];
  const basisTwo = [stageMatrix[0][1], stageMatrix[1][1]];
  const finalBasisOne = [finalMatrix[0][0], finalMatrix[1][0]];
  const finalBasisTwo = [finalMatrix[0][1], finalMatrix[1][1]];
  const displayedBasisOne = [displayStageMatrix[0][0], displayStageMatrix[1][0]];
  const displayedBasisTwo = [displayStageMatrix[0][1], displayStageMatrix[1][1]];
  const displayedFinalBasisOne = [displayFinalMatrix[0][0], displayFinalMatrix[1][0]];
  const displayedFinalBasisTwo = [displayFinalMatrix[0][1], displayFinalMatrix[1][1]];
  const origin = project([0, 0]);
  const basisOneCanvas = project(displayedBasisOne);
  const basisTwoCanvas = project(displayedBasisTwo);
  drawArrow(context, origin, project(displayedFinalBasisOne), colors.reference, { width: 1.3, dash: [4, 4] });
  drawArrow(context, origin, project(displayedFinalBasisTwo), colors.reference, { width: 1.3, dash: [4, 4] });
  drawArrow(context, origin, basisOneCanvas, colors.axisOne, { width: 3 });
  drawArrow(context, origin, basisTwoCanvas, colors.axisTwo, { width: 3 });
  if (Math.hypot(...displayedBasisOne) < 1e-12 && Math.hypot(...displayedBasisTwo) < 1e-12) {
    drawPoint(context, origin, colors.highlight, { radius: 5, fill: colors.background, width: 2 });
  }
  context.restore();

  const labels = stageBasisLabels(progress);
  drawCollisionAwareLabels(context, [
    { label: labels[0], point: basisOneCanvas, mathPoint: basisOne, color: colors.axisOne, primary: true },
    { label: labels[1], point: basisTwoCanvas, mathPoint: basisTwo, color: colors.axisTwo },
  ]);

  const accessibleText = options.accessibleText ??
    `SVD stage ${progress.toFixed(2)} of 3. Singular values ${decomposition.singularValues.map((value) => value.toFixed(2)).join(" and ")}. ` +
    `The moving canonical basis vectors land at ${coordinateLabel(basisOne)} and ${coordinateLabel(basisTwo)}. ` +
    `A faint reference grid shows the final transformation.`;
  if (typeof canvas.setAttribute === "function") canvas.setAttribute("aria-label", accessibleText);

  return {
    progress,
    stageMatrix,
    displayScale,
    displayStageMatrix,
    viewport,
    basisVectors: [basisOne, basisTwo],
    finalBasisVectors: [finalBasisOne, finalBasisTwo],
    axes: [basisOne, basisTwo],
    sourceGrid: sourceGridSegments,
    stageGrid: currentGridSegments,
    finalGrid: finalGridSegments,
    finalStageMatrix: finalMatrix,
    gridSegments: {
      current: currentGridSegments,
      final: finalGridSegments,
    },
    size: { width, height, dpr: metrics.dpr },
  };
}
