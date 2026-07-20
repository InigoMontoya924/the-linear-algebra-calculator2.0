/**
 * Framework-free canvas drawing and geometry helpers for The Linear Algebra Calculator 2.0.
 *
 * Matrices use the row-major shape [[a, b], [c, d]]. Vectors may use the
 * canonical shape { start: [x, y], components: [dx, dy], label, color }.
 * A few common aliases are accepted by normalizeVector for easier reuse.
 */

const IDENTITY_2 = Object.freeze([
  Object.freeze([1, 0]),
  Object.freeze([0, 1]),
]);

const DEFAULT_COLORS = Object.freeze({
  background: "#fffdf8",
  grid: "#dce3e2",
  originalGrid: "#aab9b8",
  axes: "#617675",
  text: "#173b3c",
  mutedText: "#5f7473",
  transformedGrid: "#397f87",
  xBasis: "#257c84",
  yBasis: "#e56f57",
  collapse: "#c84f3a",
  vectorSeries: Object.freeze([
    "#257c84",
    "#e56f57",
    "#6b7f4e",
    "#7868a6",
    "#bc7a2c",
    "#3e78a8",
  ]),
});

const DEFAULT_TRANSFORMATION_LABELS = Object.freeze({
  xBasis: "x",
  yBasis: "y",
  determinant: "det",
  collapsed: "dimension collapsed",
  orientationPreserved: "orientation kept",
  orientationReversed: "orientation flipped",
});

const rememberedCanvasSizes = new WeakMap();

function finiteNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return number;
}

function pointPair(value, name) {
  if (Array.isArray(value) && value.length >= 2) {
    return [
      finiteNumber(value[0], `${name}[0]`),
      finiteNumber(value[1], `${name}[1]`),
    ];
  }

  if (value && typeof value === "object") {
    const x = value.x ?? value.dx;
    const y = value.y ?? value.dy;
    if (x !== undefined && y !== undefined) {
      return [finiteNumber(x, `${name}.x`), finiteNumber(y, `${name}.y`)];
    }
  }

  throw new TypeError(`${name} must contain two finite coordinates`);
}

export function normalizeMatrix2x2(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 2) {
    throw new TypeError("matrix must be a 2 by 2 array");
  }

  return matrix.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== 2) {
      throw new TypeError("matrix must be a 2 by 2 array");
    }
    return row.map((value, columnIndex) =>
      finiteNumber(value, `matrix[${rowIndex}][${columnIndex}]`),
    );
  });
}

export function transformPoint(point, matrix) {
  const [x, y] = pointPair(point, "point");
  const [[a, b], [c, d]] = normalizeMatrix2x2(matrix);
  return [a * x + b * y, c * x + d * y];
}

export function interpolateMatrix(matrix, progress) {
  const target = normalizeMatrix2x2(matrix);
  const amount = Math.min(1, Math.max(0, finiteNumber(progress, "progress")));

  return target.map((row, rowIndex) =>
    row.map(
      (value, columnIndex) =>
        IDENTITY_2[rowIndex][columnIndex] +
        amount * (value - IDENTITY_2[rowIndex][columnIndex]),
    ),
  );
}

export function determinant2x2(matrix) {
  const [[a, b], [c, d]] = normalizeMatrix2x2(matrix);
  return a * d - b * c;
}

function relativeDeterminant2x2(matrix) {
  const scale = Math.max(...matrix.flat().map(Math.abs));
  if (scale === 0) return 0;
  const [[a, b], [c, d]] = matrix;
  return (a / scale) * (d / scale) - (b / scale) * (c / scale);
}

export function isSingular2x2(matrix, epsilon = 1e-9) {
  const normalized = normalizeMatrix2x2(matrix);
  const tolerance = Math.max(0, finiteNumber(epsilon, "epsilon"));
  return Math.abs(relativeDeterminant2x2(normalized)) <= tolerance;
}

export function classifyTransformation(matrix, epsilon = 1e-9) {
  const normalized = normalizeMatrix2x2(matrix);
  const determinant = determinant2x2(normalized);
  if (!Number.isFinite(determinant)) {
    throw new RangeError("matrix values are too large to classify safely");
  }
  const singular = isSingular2x2(normalized, epsilon);
  const relativeDeterminant = relativeDeterminant2x2(normalized);
  return {
    determinant,
    areaScale: Math.abs(determinant),
    singular,
    orientation: singular
      ? "collapsed"
      : relativeDeterminant < 0
        ? "reversed"
        : "preserved",
    xBasis: [normalized[0][0], normalized[1][0]],
    yBasis: [normalized[0][1], normalized[1][1]],
  };
}

/**
 * Convert a vector into { start, components, end, label, color }.
 *
 * Accepted forms include [dx, dy], {x, y}, and records using start/origin plus
 * components/vector/value. startX/startY and dx/dy are also accepted.
 */
export function normalizeVector(vector, index = 0) {
  if (Array.isArray(vector)) {
    const components = pointPair(vector, `vectors[${index}]`);
    return {
      start: [0, 0],
      components,
      end: components.slice(),
      label: "",
      color: undefined,
    };
  }

  if (!vector || typeof vector !== "object") {
    throw new TypeError(`vectors[${index}] must be a vector record or pair`);
  }

  const startSource = vector.start ?? vector.origin ?? [
    vector.startX ?? vector.originX ?? 0,
    vector.startY ?? vector.originY ?? 0,
  ];
  const componentsSource =
    vector.components ??
    vector.vector ??
    vector.value ??
    (vector.dx !== undefined || vector.dy !== undefined
      ? [vector.dx ?? 0, vector.dy ?? 0]
      : [vector.x ?? 0, vector.y ?? 0]);

  const start = pointPair(startSource, `vectors[${index}].start`);
  const components = pointPair(
    componentsSource,
    `vectors[${index}].components`,
  );

  const normalized = {
    start,
    components,
    end: [start[0] + components[0], start[1] + components[1]],
    label: typeof vector.label === "string" ? vector.label : "",
    color: typeof vector.color === "string" ? vector.color : undefined,
  };
  if (vector.id !== undefined) normalized.id = vector.id;
  if (vector.hidden !== undefined) normalized.hidden = Boolean(vector.hidden);
  if (vector.resultant !== undefined) {
    normalized.resultant = Boolean(vector.resultant);
  }
  return normalized;
}

export function getVectorBounds(vectors, options = {}) {
  if (!Array.isArray(vectors)) {
    throw new TypeError("vectors must be an array");
  }

  const normalized = vectors
    .map(normalizeVector)
    .filter((vector) => options.includeHidden === true || !vector.hidden);
  const points = normalized.flatMap((vector) => [vector.start, vector.end]);
  if (options.includeOrigin !== false || points.length === 0) {
    points.push([0, 0]);
  }

  let minX = Math.min(...points.map(([x]) => x));
  let maxX = Math.max(...points.map(([x]) => x));
  let minY = Math.min(...points.map(([, y]) => y));
  let maxY = Math.max(...points.map(([, y]) => y));

  const minSpan = Math.max(0, finiteNumber(options.minSpan ?? 2, "minSpan"));
  const initialWidth = maxX - minX;
  const initialHeight = maxY - minY;

  if (initialWidth < minSpan) {
    const center = (minX + maxX) / 2;
    minX = center - minSpan / 2;
    maxX = center + minSpan / 2;
  }
  if (initialHeight < minSpan) {
    const center = (minY + maxY) / 2;
    minY = center - minSpan / 2;
    maxY = center + minSpan / 2;
  }

  const padding = Math.max(0, finiteNumber(options.padding ?? 0.12, "padding"));
  const padX = (maxX - minX) * padding;
  const padY = (maxY - minY) * padding;

  return {
    minX: minX - padX,
    maxX: maxX + padX,
    minY: minY - padY,
    maxY: maxY + padY,
  };
}

// A descriptive alias for consumers that prefer calculate* naming.
export const calculateVectorBounds = getVectorBounds;

export function calculateResultant(vectors, options = {}) {
  if (!Array.isArray(vectors)) {
    throw new TypeError("vectors must be an array");
  }
  const included = vectors
    .map(normalizeVector)
    .filter((vector) => options.includeHidden === true || !vector.hidden)
    .filter((vector) => !vector.resultant);
  const components = included.reduce(
    (sum, vector) => [
      sum[0] + vector.components[0],
      sum[1] + vector.components[1],
    ],
    [0, 0],
  );
  return normalizeVector({
    id: options.id ?? "resultant",
    label: options.label ?? "Σ",
    color: options.color,
    start: options.start ?? [0, 0],
    components,
    resultant: true,
  });
}

export function niceGridStep(span, targetLineCount = 8) {
  const safeSpan = Math.max(Number.EPSILON, Math.abs(finiteNumber(span, "span")));
  const safeTarget = Math.max(
    1,
    Math.round(finiteNumber(targetLineCount, "targetLineCount")),
  );
  const rough = safeSpan / safeTarget;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const multiplier =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
}

function mergeColors(colors = {}) {
  const vectorSeries =
    Array.isArray(colors.vectorSeries) && colors.vectorSeries.length
      ? colors.vectorSeries
      : DEFAULT_COLORS.vectorSeries;
  return {
    ...DEFAULT_COLORS,
    ...colors,
    vectorSeries,
  };
}

function positiveDimension(values, fallback) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return fallback;
}

function canvasMetrics(canvas, options) {
  if (!canvas || typeof canvas.getContext !== "function") {
    throw new TypeError("canvas must provide a 2D drawing context");
  }

  const previous = rememberedCanvasSizes.get(canvas);
  const rect =
    typeof canvas.getBoundingClientRect === "function"
      ? canvas.getBoundingClientRect()
      : null;
  const fallbackWidth = (previous?.width ?? Number(canvas.width)) || 640;
  const fallbackHeight = (previous?.height ?? Number(canvas.height)) || 420;
  const width = options.width === undefined
    ? positiveDimension(
      [rect?.width, canvas.clientWidth, previous?.width, canvas.width],
      fallbackWidth,
    )
    : Math.max(1, finiteNumber(options.width, "canvas width"));
  const height = options.height === undefined
    ? positiveDimension(
      [rect?.height, canvas.clientHeight, previous?.height, canvas.height],
      fallbackHeight,
    )
    : Math.max(1, finiteNumber(options.height, "canvas height"));
  const defaultDpr =
    typeof globalThis.devicePixelRatio === "number"
      ? globalThis.devicePixelRatio
      : 1;
  const dpr = Math.min(
    4,
    Math.max(1, finiteNumber(options.dpr ?? defaultDpr, "device pixel ratio")),
  );
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));

  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

  rememberedCanvasSizes.set(canvas, { width, height });
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  if (typeof options.accessibleText === "string" && options.accessibleText) {
    if (typeof canvas.setAttribute === "function") {
      canvas.setAttribute("role", options.accessibleRole ?? "img");
      canvas.setAttribute("aria-label", options.accessibleText);
    }
  }

  return { context, width, height, dpr };
}

function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== "object") {
    throw new TypeError("bounds must describe a finite rectangle");
  }
  const normalized = {
    minX: finiteNumber(bounds.minX, "bounds.minX"),
    maxX: finiteNumber(bounds.maxX, "bounds.maxX"),
    minY: finiteNumber(bounds.minY, "bounds.minY"),
    maxY: finiteNumber(bounds.maxY, "bounds.maxY"),
  };
  if (normalized.maxX <= normalized.minX || normalized.maxY <= normalized.minY) {
    throw new RangeError("bounds must have positive width and height");
  }
  return normalized;
}

export function createTransformationViewport(width, height, bounds, options = {}) {
  const canvasWidth = Math.max(1, finiteNumber(width, "viewport width"));
  const canvasHeight = Math.max(1, finiteNumber(height, "viewport height"));
  const normalizedBounds = normalizeBounds(bounds);
  const requestedPadding = Math.max(
    0,
    finiteNumber(options.plotPadding ?? 38, "plot padding"),
  );
  const padding = Math.min(
    requestedPadding,
    Math.max(0, Math.min(canvasWidth, canvasHeight) / 2 - 0.5),
  );
  const plot = {
    x: padding,
    y: padding,
    width: Math.max(1, canvasWidth - padding * 2),
    height: Math.max(1, canvasHeight - padding * 2),
  };
  const spanX = normalizedBounds.maxX - normalizedBounds.minX;
  const spanY = normalizedBounds.maxY - normalizedBounds.minY;
  const scale = Math.min(plot.width / spanX, plot.height / spanY);
  const contentWidth = spanX * scale;
  const contentHeight = spanY * scale;
  const offsetX = plot.x + (plot.width - contentWidth) / 2;
  const offsetY = plot.y + (plot.height - contentHeight) / 2;

  return {
    width: canvasWidth,
    height: canvasHeight,
    dpr: Math.max(1, finiteNumber(options.dpr ?? 1, "viewport dpr")),
    bounds: normalizedBounds,
    plot,
    scale,
    contentWidth,
    contentHeight,
    offsetX,
    offsetY,
  };
}

export function mathToCanvasPoint(point, viewport) {
  const [x, y] = pointPair(point, "mathematical point");
  if (!viewport || !Number.isFinite(viewport.scale) || viewport.scale <= 0) {
    throw new TypeError("viewport must come from createTransformationViewport");
  }
  return [
    viewport.offsetX + (x - viewport.bounds.minX) * viewport.scale,
    viewport.offsetY +
      viewport.contentHeight -
      (y - viewport.bounds.minY) * viewport.scale,
  ];
}

export function canvasToMathPoint(point, viewport) {
  const [x, y] = pointPair(point, "canvas point");
  if (!viewport || !Number.isFinite(viewport.scale) || viewport.scale <= 0) {
    throw new TypeError("viewport must come from createTransformationViewport");
  }
  return [
    viewport.bounds.minX + (x - viewport.offsetX) / viewport.scale,
    viewport.bounds.minY +
      (viewport.offsetY + viewport.contentHeight - y) / viewport.scale,
  ];
}

function clientPointPair(point) {
  if (Array.isArray(point)) return pointPair(point, "client point");
  if (point && typeof point === "object") {
    return [
      finiteNumber(point.clientX ?? point.x, "client point x"),
      finiteNumber(point.clientY ?? point.y, "client point y"),
    ];
  }
  throw new TypeError("client point must contain clientX and clientY");
}

export function clientToCanvasPoint(point, clientRect, viewport) {
  const [clientX, clientY] = clientPointPair(point);
  if (!clientRect || typeof clientRect !== "object") {
    throw new TypeError("clientRect must describe the canvas on screen");
  }
  const left = finiteNumber(clientRect.left ?? clientRect.x ?? 0, "clientRect.left");
  const top = finiteNumber(clientRect.top ?? clientRect.y ?? 0, "clientRect.top");
  const rectWidth = finiteNumber(clientRect.width, "clientRect.width");
  const rectHeight = finiteNumber(clientRect.height, "clientRect.height");
  if (rectWidth <= 0 || rectHeight <= 0) {
    throw new RangeError("clientRect must have positive width and height");
  }
  if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)) {
    throw new TypeError("viewport must come from createTransformationViewport");
  }
  return [
    ((clientX - left) * viewport.width) / rectWidth,
    ((clientY - top) * viewport.height) / rectHeight,
  ];
}

export function clientToMathPoint(point, clientRect, viewport) {
  return canvasToMathPoint(
    clientToCanvasPoint(point, clientRect, viewport),
    viewport,
  );
}

export function canvasToClientPoint(point, clientRect, viewport) {
  const [canvasX, canvasY] = pointPair(point, "canvas point");
  if (!clientRect || typeof clientRect !== "object") {
    throw new TypeError("clientRect must describe the canvas on screen");
  }
  const left = finiteNumber(clientRect.left ?? clientRect.x ?? 0, "clientRect.left");
  const top = finiteNumber(clientRect.top ?? clientRect.y ?? 0, "clientRect.top");
  const rectWidth = finiteNumber(clientRect.width, "clientRect.width");
  const rectHeight = finiteNumber(clientRect.height, "clientRect.height");
  if (rectWidth <= 0 || rectHeight <= 0) {
    throw new RangeError("clientRect must have positive width and height");
  }
  if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)) {
    throw new TypeError("viewport must come from createTransformationViewport");
  }
  return [
    left + (canvasX * rectWidth) / viewport.width,
    top + (canvasY * rectHeight) / viewport.height,
  ];
}

export function mathToClientPoint(point, clientRect, viewport) {
  return canvasToClientPoint(
    mathToCanvasPoint(point, viewport),
    clientRect,
    viewport,
  );
}

export function hitTestBasisEndpoint(point, basisEndpoints, options = {}) {
  const canvasPoint = pointPair(point, "hit-test point");
  const endpoints = Array.isArray(basisEndpoints)
    ? basisEndpoints
    : Object.values(basisEndpoints ?? {});
  const defaultRadius = Math.max(
    0,
    finiteNumber(options.hitRadius ?? 14, "hit radius"),
  );
  const preferredAxis = options.preferredAxis;
  const hits = endpoints
    .filter((endpoint) => endpoint && endpoint.canvas)
    .map((endpoint) => ({
      ...endpoint,
      distance: Math.hypot(
        canvasPoint[0] - endpoint.canvas[0],
        canvasPoint[1] - endpoint.canvas[1],
      ),
    }))
    .filter(
      (endpoint) =>
        endpoint.distance <= (endpoint.hitRadius ?? defaultRadius),
    )
    .sort((first, second) => {
      if (first.distance !== second.distance) return first.distance - second.distance;
      if (preferredAxis && first.axis === preferredAxis) return -1;
      if (preferredAxis && second.axis === preferredAxis) return 1;
      return String(first.axis).localeCompare(String(second.axis));
    });
  return hits[0] ?? null;
}

function makeSquareProjector(viewport) {
  return (point) => mathToCanvasPoint(point, viewport);
}

function canonicalDirection(direction, name) {
  const [x, y] = pointPair(direction, name);
  const length = Math.hypot(x, y);
  if (length <= Number.EPSILON) {
    throw new RangeError(`${name} must be non-zero`);
  }
  let normalized = [x / length, y / length];
  if (
    normalized[0] < -1e-12 ||
    (Math.abs(normalized[0]) <= 1e-12 && normalized[1] < 0)
  ) {
    normalized = [-normalized[0], -normalized[1]];
  }
  return normalized.map((value) => (Math.abs(value) <= 1e-14 ? 0 : value));
}

function normalizeEigenline(line, index) {
  const record = Array.isArray(line) ? { direction: line } : line;
  if (!record || typeof record !== "object") {
    throw new TypeError(`eigenOverlay.lines[${index}] must describe a direction`);
  }
  const direction = canonicalDirection(
    record.direction ?? record.vector,
    `eigenOverlay.lines[${index}].direction`,
  );
  const eigenvalue = record.eigenvalue;
  const eigenvalueLabel =
    record.eigenvalueLabel !== undefined
      ? String(record.eigenvalueLabel)
      : eigenvalue !== undefined && eigenvalue !== null
        ? String(eigenvalue)
        : "";
  const defaultLabel = `v${["₁", "₂", "₃", "₄"][index] ?? index + 1}`;
  return {
    id: record.id ?? `eigenline-${index + 1}`,
    label: typeof record.label === "string" ? record.label : defaultLabel,
    direction,
    eigenvalue,
    eigenvalueLabel,
    stretchCue:
      typeof record.stretchCue === "string"
        ? record.stretchCue
        : eigenvalueLabel
          ? `λ = ${eigenvalueLabel}`
          : "",
    color: typeof record.color === "string" ? record.color : undefined,
    accessibleText:
      typeof record.accessibleText === "string"
        ? record.accessibleText
        : undefined,
    representative: Boolean(record.representative),
    showLabel: record.showLabel !== false,
  };
}

function deduplicateEigenlines(lines, epsilon = 1e-8) {
  return lines.filter(
    (candidate, index) =>
      !lines.slice(0, index).some(
        (existing) =>
          Math.abs(
            existing.direction[0] * candidate.direction[1] -
              existing.direction[1] * candidate.direction[0],
          ) <= epsilon,
      ),
  );
}

export function normalizeEigenOverlay(input) {
  if (input === undefined || input === null || input === false) {
    return { state: "none", lines: [], summary: "" };
  }
  const overlay = Array.isArray(input) ? { lines: input } : input;
  if (!overlay || typeof overlay !== "object") {
    throw new TypeError("eigenOverlay must be an array or overlay record");
  }
  const rawLines = Array.isArray(overlay.lines)
    ? overlay.lines
    : Array.isArray(overlay.directions)
      ? overlay.directions
      : [];
  const inferredState =
    overlay.allDirectionsInvariant === true
      ? "all"
      : overlay.hasRealEigenlines === false
        ? "none"
        : rawLines.length === 0
          ? "none"
          : rawLines.length === 1
            ? "one"
            : "distinct";
  const requestedState = overlay.state ?? inferredState;
  if (!["none", "one", "distinct", "all"].includes(requestedState)) {
    throw new RangeError("eigenOverlay state must be none, one, distinct, or all");
  }
  if (requestedState === "none") {
    return {
      state: "none",
      lines: [],
      summary:
        typeof overlay.summary === "string"
          ? overlay.summary
          : typeof overlay.explanation === "string"
            ? overlay.explanation
            : "",
    };
  }

  let lines;
  if (requestedState === "all" && rawLines.length === 0) {
    const representativeDirections = [[1, 0], [0, 1]];
    lines = representativeDirections.map((direction, index) =>
      normalizeEigenline({
        id: `eigenline-all-${index + 1}`,
        label: `v${index === 0 ? "₁" : "₂"}`,
        direction,
        eigenvalue:
          overlay.eigenvalue ?? overlay.eigenvalueApprox ?? overlay.eigenvalues?.[0],
        eigenvalueLabel:
          overlay.eigenvalueLabel ?? overlay.eigenvalueLabels?.[0],
        stretchCue: overlay.stretchCue,
        representative: true,
        showLabel: true,
      }, index),
    );
  } else {
    lines = deduplicateEigenlines(rawLines.map(normalizeEigenline));
  }

  if (requestedState === "one") lines = lines.slice(0, 1);
  const state =
    requestedState === "all"
      ? "all"
      : lines.length === 0
        ? "none"
        : lines.length === 1
          ? "one"
          : "distinct";
  const defaultSummary =
    state === "all"
      ? `${overlay.label ?? "every direction"}${lines[0]?.stretchCue ? `; ${lines[0].stretchCue}` : ""}`
      : lines
        .map((line) =>
          [line.label, line.stretchCue].filter(Boolean).join("; "),
        )
        .join(". ");
  return {
    state,
    lines,
    summary:
      typeof overlay.summary === "string"
        ? overlay.summary
        : typeof overlay.explanation === "string"
          ? overlay.explanation
          : defaultSummary,
  };
}

export function invariantLineSegment(direction, bounds) {
  const normalizedDirection = canonicalDirection(direction, "invariant direction");
  const normalizedBounds = normalizeBounds(bounds);
  let minimum = Number.NEGATIVE_INFINITY;
  let maximum = Number.POSITIVE_INFINITY;
  const axes = [
    [normalizedDirection[0], normalizedBounds.minX, normalizedBounds.maxX],
    [normalizedDirection[1], normalizedBounds.minY, normalizedBounds.maxY],
  ];
  for (const [component, lower, upper] of axes) {
    if (Math.abs(component) <= Number.EPSILON) {
      if (0 < lower || 0 > upper) return null;
      continue;
    }
    const first = lower / component;
    const second = upper / component;
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) {
    return null;
  }
  const cleanCoordinate = (value) => (Math.abs(value) <= 1e-14 ? 0 : value);
  return [
    [
      cleanCoordinate(normalizedDirection[0] * minimum),
      cleanCoordinate(normalizedDirection[1] * minimum),
    ],
    [
      cleanCoordinate(normalizedDirection[0] * maximum),
      cleanCoordinate(normalizedDirection[1] * maximum),
    ],
  ];
}

function strokePolyline(context, points, color, width = 1, dash = []) {
  if (points.length < 2) return;
  context.save();
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) context.lineTo(x, y);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.setLineDash(dash);
  context.stroke();
  context.restore();
}

function drawArrow(context, start, end, color, options = {}) {
  const width = options.width ?? 2.5;
  const headLength = options.headLength ?? 10;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);

  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.setLineDash(options.dash ?? []);

  if (length < 0.75) {
    context.beginPath();
    context.arc(start[0], start[1], Math.max(3, width + 1), 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }

  const angle = Math.atan2(dy, dx);
  const actualHead = Math.min(headLength, Math.max(4, length * 0.35));
  context.beginPath();
  context.moveTo(start[0], start[1]);
  context.lineTo(end[0], end[1]);
  context.stroke();

  context.beginPath();
  context.moveTo(end[0], end[1]);
  context.lineTo(
    end[0] - actualHead * Math.cos(angle - Math.PI / 7),
    end[1] - actualHead * Math.sin(angle - Math.PI / 7),
  );
  context.lineTo(
    end[0] - actualHead * Math.cos(angle + Math.PI / 7),
    end[1] - actualHead * Math.sin(angle + Math.PI / 7),
  );
  context.closePath();
  context.fill();
  context.restore();
}

function drawText(context, text, position, color, options = {}) {
  if (!text) return;
  context.save();
  context.fillStyle = color;
  context.font = options.font ?? "500 12px system-ui, sans-serif";
  context.textAlign = options.align ?? "left";
  context.textBaseline = options.baseline ?? "middle";
  context.fillText(String(text), position[0], position[1]);
  context.restore();
}

function formatNumber(value, precision = 3) {
  if (Math.abs(value) < 10 ** -(precision + 1)) return "0";
  return Number(value.toFixed(precision)).toString();
}

export function getTransformationBounds(matrix, extent = 4, options = {}) {
  const normalized = normalizeMatrix2x2(matrix);
  const viewportExtent = Math.max(
    1,
    finiteNumber(extent, "transformation extent"),
  );
  if (options.autoFit !== true) {
    return {
      minX: -viewportExtent,
      maxX: viewportExtent,
      minY: -viewportExtent,
      maxY: viewportExtent,
    };
  }

  const originalCorners = [
    [-viewportExtent, -viewportExtent],
    [-viewportExtent, viewportExtent],
    [viewportExtent, -viewportExtent],
    [viewportExtent, viewportExtent],
  ];
  const points = originalCorners.flatMap((point) => [
    point,
    transformPoint(point, normalized),
  ]);
  const maxMagnitude = Math.max(
    viewportExtent,
    ...points.flat().map((value) => Math.abs(value)),
  );
  if (!Number.isFinite(maxMagnitude)) {
    throw new RangeError("matrix values are too large to fit on the canvas");
  }
  const fitPadding = Math.max(
    0,
    finiteNumber(options.fitPadding ?? 0.1, "fit padding"),
  );
  const radius = maxMagnitude * (1 + fitPadding);
  return { minX: -radius, maxX: radius, minY: -radius, maxY: radius };
}

function sourceBoundsForViewport(matrix, bounds, epsilon) {
  const [[a, b], [c, d]] = matrix;
  const state = classifyTransformation(matrix, epsilon);
  if (state.singular) return null;
  const inverse = [
    [d / state.determinant, -b / state.determinant],
    [-c / state.determinant, a / state.determinant],
  ];
  const corners = [
    [bounds.minX, bounds.minY],
    [bounds.minX, bounds.maxY],
    [bounds.maxX, bounds.minY],
    [bounds.maxX, bounds.maxY],
  ].map((point) => transformPoint(point, inverse));
  if (corners.flat().some((value) => !Number.isFinite(value))) return null;
  return {
    minX: Math.min(...corners.map(([x]) => x)),
    maxX: Math.max(...corners.map(([x]) => x)),
    minY: Math.min(...corners.map(([, y]) => y)),
    maxY: Math.max(...corners.map(([, y]) => y)),
  };
}

function integerCoordinates(minimum, maximum, maxCount = 81) {
  const start = Math.ceil(minimum - 1e-10);
  const end = Math.floor(maximum + 1e-10);
  if (end < start) return [];
  const count = end - start + 1;
  const stride = Math.max(1, Math.ceil(count / Math.max(1, maxCount)));
  const coordinates = [];
  for (let coordinate = start; coordinate <= end; coordinate += stride) {
    coordinates.push(coordinate);
  }
  if (start <= 0 && end >= 0 && !coordinates.includes(0)) coordinates.push(0);
  if (!coordinates.includes(end)) coordinates.push(end);
  return coordinates.sort((first, second) => first - second);
}

function drawBaseAxes(context, project, bounds, colors) {
  const xStart = project([bounds.minX, 0]);
  const xEnd = project([bounds.maxX, 0]);
  const yStart = project([0, bounds.minY]);
  const yEnd = project([0, bounds.maxY]);
  strokePolyline(context, [xStart, xEnd], colors.axes, 1.25);
  strokePolyline(context, [yStart, yEnd], colors.axes, 1.25);
}

function normalizeBasisHandleOptions(input) {
  const record = input && typeof input === "object" ? input : {};
  const radius = Math.max(
    3,
    finiteNumber(record.radius ?? 6, "basis handle radius"),
  );
  return {
    visible: input === true || (record.visible ?? false) === true,
    active: record.active === "x" || record.active === "y" ? record.active : null,
    radius,
    hitRadius: Math.max(
      radius,
      finiteNumber(record.hitRadius ?? 14, "basis handle hit radius"),
    ),
    accessibleText:
      record.accessibleText && typeof record.accessibleText === "object"
        ? record.accessibleText
        : {},
  };
}

function drawBasisHandle(context, endpoint, color, colors, active) {
  context.save();
  context.setLineDash([]);
  context.fillStyle = colors.background;
  context.strokeStyle = color;
  context.lineWidth = active ? 3 : 2;
  context.beginPath();
  context.arc(
    endpoint.canvas[0],
    endpoint.canvas[1],
    endpoint.radius,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.stroke();
  if (active) {
    context.strokeStyle = colors.text;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(
      endpoint.canvas[0],
      endpoint.canvas[1],
      endpoint.radius + 3,
      0,
      Math.PI * 2,
    );
    context.stroke();
  }
  context.restore();
}

function drawEigenOverlay(context, overlayInput, viewport, colors) {
  const overlay = normalizeEigenOverlay(overlayInput);
  const project = makeSquareProjector(viewport);
  const series =
    Array.isArray(colors.eigenSeries) && colors.eigenSeries.length
      ? colors.eigenSeries
      : [colors.xBasis, colors.yBasis, colors.transformedGrid];
  const origin = project([0, 0]);
  const lines = overlay.lines.map((line, index) => {
    const numericScale = Number(line.eigenvalue);
    const currentScale = Number.isFinite(numericScale)
      ? Math.abs(numericScale) <= 1e-14 ? 0 : numericScale
      : 1;
    const unitVector = [...line.direction];
    const transformedVector = unitVector.map((component) => {
      const value = component * currentScale;
      return Math.abs(value) <= 1e-14 ? 0 : value;
    });
    const viewportSegment = invariantLineSegment(unitVector, viewport.bounds);
    const minimumVisibleScale = viewportSegment
      ? viewportSegment[0][0] * unitVector[0] + viewportSegment[0][1] * unitVector[1]
      : currentScale;
    const maximumVisibleScale = viewportSegment
      ? viewportSegment[1][0] * unitVector[0] + viewportSegment[1][1] * unitVector[1]
      : currentScale;
    const visibleScale = Math.min(
      maximumVisibleScale,
      Math.max(minimumVisibleScale, currentScale),
    );
    const visibleVector = unitVector.map((component) => {
      const value = component * visibleScale;
      return Math.abs(value) <= 1e-14 ? 0 : value;
    });
    const isClipped = Math.abs(visibleScale - currentScale) > 1e-9;
    const unitCanvas = project(unitVector);
    const transformedCanvas = project(visibleVector);
    const color = line.color ?? series[index % series.length];

    context.save();
    context.globalAlpha = 0.24;
    drawArrow(context, origin, unitCanvas, color, {
      width: 0.9,
      headLength: 5.5,
      dash: [1, 4],
    });
    context.restore();

    drawArrow(context, origin, transformedCanvas, color, {
      width: 1.8,
      headLength: 6.5,
      dash: [1, 5],
    });

    const labelPosition = eigenvectorLabelPosition(
      origin,
      transformedCanvas,
      viewport.plot,
      index,
    );
    const labelText = line.showLabel
      ? [line.label, line.stretchCue, isClipped ? "outside view" : ""]
        .filter(Boolean)
        .join(" · ")
      : "";
    const labelDx = transformedCanvas[0] - origin[0];
    drawText(context, labelText, labelPosition, colors.text, {
      align: Math.abs(labelDx) < 8 ? "left" : labelDx > 0 ? "right" : "left",
      font: "500 11px system-ui, sans-serif",
    });
    return {
      ...line,
      color,
      currentScale,
      visibleScale,
      isClipped,
      unitVector,
      transformedVector,
      visibleVector,
      unitCanvas,
      transformedCanvas,
      labelText,
      labelCanvas: labelPosition,
    };
  });
  return { ...overlay, lines };
}

export function drawTransformation(canvas, matrix2x2, progress = 1, options = {}) {
  const target = normalizeMatrix2x2(matrix2x2);
  const interpolated = interpolateMatrix(target, progress);
  const metrics = canvasMetrics(canvas, options);
  if (!metrics) return null;

  const { context, width, height } = metrics;
  const colors = mergeColors(options.colors);
  const labels = { ...DEFAULT_TRANSFORMATION_LABELS, ...options.labels };
  const padding = Math.max(24, options.plotPadding ?? 38);
  const extent = Math.max(
    1,
    finiteNumber(options.gridExtent ?? 4, "grid extent"),
  );
  const bounds = getTransformationBounds(target, extent, {
    autoFit: options.autoFit,
    fitPadding: options.fitPadding,
  });
  const viewport = createTransformationViewport(width, height, bounds, {
    plotPadding: padding,
    dpr: metrics.dpr,
  });
  const { plot } = viewport;
  const project = makeSquareProjector(viewport);

  context.fillStyle = colors.background;
  context.fillRect(0, 0, width, height);
  context.save();
  context.beginPath();
  context.rect(plot.x, plot.y, plot.width, plot.height);
  context.clip();

  const originalCoordinates = integerCoordinates(-extent, extent);
  for (const coordinate of originalCoordinates) {
    strokePolyline(
      context,
      [project([coordinate, -extent]), project([coordinate, extent])],
      colors.originalGrid,
      coordinate === 0 ? 1 : 0.7,
    );
    strokePolyline(
      context,
      [project([-extent, coordinate]), project([extent, coordinate])],
      colors.originalGrid,
      coordinate === 0 ? 1 : 0.7,
    );
  }

  drawBaseAxes(context, project, bounds, colors);

  const epsilon = options.singularityEpsilon ?? 1e-9;
  const sourceBounds = sourceBoundsForViewport(interpolated, bounds, epsilon);
  const fallbackSourceExtent = extent * 2;
  const sourceGrid = sourceBounds ?? {
    minX: -extent,
    maxX: extent,
    minY: -fallbackSourceExtent,
    maxY: fallbackSourceExtent,
  };
  const maxGridLines = Math.max(
    3,
    Math.round(finiteNumber(options.maxGridLines ?? 81, "max grid lines")),
  );
  const verticalCoordinates = integerCoordinates(
    sourceGrid.minX,
    sourceGrid.maxX,
    maxGridLines,
  );
  const horizontalCoordinates = integerCoordinates(
    sourceBounds?.minY ?? -extent,
    sourceBounds?.maxY ?? extent,
    maxGridLines,
  );
  for (const coordinate of verticalCoordinates) {
    const vertical = [
      transformPoint([coordinate, sourceGrid.minY], interpolated),
      transformPoint([coordinate, sourceGrid.maxY], interpolated),
    ];
    strokePolyline(
      context,
      vertical.map(project),
      colors.transformedGrid,
      coordinate === 0 ? 1.8 : 1.15,
    );
  }
  for (const coordinate of horizontalCoordinates) {
    const horizontal = [
      transformPoint([sourceGrid.minX, coordinate], interpolated),
      transformPoint([sourceGrid.maxX, coordinate], interpolated),
    ];
    strokePolyline(
      context,
      horizontal.map(project),
      colors.transformedGrid,
      coordinate === 0 ? 1.8 : 1.15,
    );
  }

  const origin = project([0, 0]);
  const xBasisMath = transformPoint([1, 0], interpolated);
  const yBasisMath = transformPoint([0, 1], interpolated);
  const xBasis = project(xBasisMath);
  const yBasis = project(yBasisMath);
  drawArrow(context, origin, xBasis, colors.xBasis, { width: 3 });
  drawArrow(context, origin, yBasis, colors.yBasis, { width: 3 });
  const eigenOverlay = drawEigenOverlay(
    context,
    options.eigenOverlay,
    viewport,
    colors,
  );
  const handleOptions = normalizeBasisHandleOptions(options.basisHandles);
  const basisEndpoints = {
    x: {
      id: "basis-x",
      axis: "x",
      label: labels.xBasis,
      math: xBasisMath,
      canvas: xBasis,
      radius: handleOptions.radius,
      hitRadius: handleOptions.hitRadius,
      accessibleText: handleOptions.accessibleText.x,
    },
    y: {
      id: "basis-y",
      axis: "y",
      label: labels.yBasis,
      math: yBasisMath,
      canvas: yBasis,
      radius: handleOptions.radius,
      hitRadius: handleOptions.hitRadius,
      accessibleText: handleOptions.accessibleText.y,
    },
  };
  if (handleOptions.visible) {
    drawBasisHandle(
      context,
      basisEndpoints.x,
      colors.xBasis,
      colors,
      handleOptions.active === "x",
    );
    drawBasisHandle(
      context,
      basisEndpoints.y,
      colors.yBasis,
      colors,
      handleOptions.active === "y",
    );
  }
  context.restore();

  const labelOffset = options.labelOffset ?? 10;
  drawText(
    context,
    labels.xBasis,
    basisLabelPosition(origin, xBasis, plot, labelOffset, -1),
    colors.text,
  );
  drawText(
    context,
    labels.yBasis,
    basisLabelPosition(origin, yBasis, plot, labelOffset, 1),
    colors.text,
  );

  const transformation = classifyTransformation(interpolated, epsilon);
  const { determinant, singular } = transformation;
  const determinantLabel =
    typeof options.formatDeterminant === "function"
      ? options.formatDeterminant(determinant, singular, interpolated)
      : `${labels.determinant} = ${formatNumber(determinant)}`;
  drawText(
    context,
    determinantLabel,
    [padding, 18],
    singular ? colors.collapse : colors.mutedText,
  );
  const orientationLabel =
    typeof options.formatOrientation === "function"
      ? options.formatOrientation(transformation)
      : transformation.orientation === "collapsed"
        ? labels.collapsed
        : transformation.orientation === "reversed"
          ? labels.orientationReversed
          : labels.orientationPreserved;
  drawText(
    context,
    orientationLabel,
    [width - padding, 18],
    singular ? colors.collapse : colors.mutedText,
    { align: "right" },
  );

  return {
    matrix: interpolated,
    determinant,
    singular,
    areaScale: transformation.areaScale,
    orientation: transformation.orientation,
    xBasis: transformation.xBasis,
    yBasis: transformation.yBasis,
    bounds,
    viewport,
    basisEndpoints,
    eigenOverlay,
    size: { width, height, dpr: metrics.dpr },
  };
}

function labelPosition(start, end, plot) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.max(1, Math.hypot(dx, dy));
  const x = end[0] + (8 * dx) / length;
  const y = end[1] + (8 * dy) / length;
  return [
    Math.min(plot.x + plot.width - 4, Math.max(plot.x + 4, x)),
    Math.min(plot.y + plot.height - 4, Math.max(plot.y + 4, y)),
  ];
}

function eigenvectorLabelPosition(origin, end, plot, index) {
  const dx = end[0] - origin[0];
  const dy = end[1] - origin[1];
  const length = Math.hypot(dx, dy);
  const side = index % 2 === 0 ? -1 : 1;
  if (length < 0.75) {
    return [
      Math.min(plot.x + plot.width - 8, origin[0] + 13),
      Math.min(
        plot.y + plot.height - 8,
        Math.max(plot.y + 8, origin[1] + side * 15),
      ),
    ];
  }
  const radialOffset = 9;
  const perpendicularOffset = 8 * side;
  const x = end[0] + (radialOffset * dx - perpendicularOffset * dy) / length;
  const y = end[1] + (radialOffset * dy + perpendicularOffset * dx) / length;
  return [
    Math.min(plot.x + plot.width - 6, Math.max(plot.x + 6, x)),
    Math.min(plot.y + plot.height - 8, Math.max(plot.y + 8, y)),
  ];
}

function basisLabelPosition(origin, end, plot, offset, zeroDirection) {
  if (Math.hypot(end[0] - origin[0], end[1] - origin[1]) < 0.75) {
    return [
      Math.min(plot.x + plot.width - 8, origin[0] + offset),
      Math.min(
        plot.y + plot.height - 8,
        Math.max(plot.y + 8, origin[1] + zeroDirection * offset),
      ),
    ];
  }
  return labelPosition(origin, end, plot);
}

function gridLabelPrecision(step) {
  if (step >= 1) return 0;
  return Math.min(6, Math.max(0, Math.ceil(-Math.log10(step))));
}

function drawVectorTickLabels(context, project, bounds, step, plot, colors) {
  const precision = gridLabelPrecision(step);
  const origin = project([0, 0]);
  const xLabelY = Math.min(
    plot.y + plot.height - 9,
    Math.max(plot.y + 11, origin[1] + 13),
  );
  const yLabelX = Math.min(
    plot.x + plot.width - 8,
    Math.max(plot.x + 7, origin[0] + 7),
  );
  const xStart = Math.ceil(bounds.minX / step) * step;
  const yStart = Math.ceil(bounds.minY / step) * step;

  for (let x = xStart; x <= bounds.maxX + step * 1e-8; x += step) {
    drawText(
      context,
      formatNumber(x, precision),
      [project([x, 0])[0], xLabelY],
      colors.mutedText,
      { align: "center", font: "500 11px system-ui, sans-serif" },
    );
  }
  for (let y = yStart; y <= bounds.maxY + step * 1e-8; y += step) {
    if (Math.abs(y) <= step * 1e-8) continue;
    drawText(
      context,
      formatNumber(y, precision),
      [yLabelX, project([0, y])[1]],
      colors.mutedText,
      { font: "500 11px system-ui, sans-serif" },
    );
  }
}

export function drawVectors(canvas, vectors, options = {}) {
  if (!Array.isArray(vectors)) {
    throw new TypeError("vectors must be an array");
  }
  const normalized = vectors
    .map(normalizeVector)
    .filter((vector) => options.includeHidden === true || !vector.hidden);
  const metrics = canvasMetrics(canvas, options);
  if (!metrics) return null;

  const { context, width, height } = metrics;
  const colors = mergeColors(options.colors);
  const padding = Math.max(26, options.plotPadding ?? 42);
  const bounds = getVectorBounds(normalized, options.bounds);
  const viewport = createTransformationViewport(width, height, bounds, {
    plotPadding: padding,
    dpr: metrics.dpr,
  });
  const { plot } = viewport;
  const project = makeSquareProjector(viewport);
  const step = niceGridStep(
    Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY),
    options.targetGridLines ?? 10,
  );

  context.fillStyle = colors.background;
  context.fillRect(0, 0, width, height);
  context.save();
  context.beginPath();
  context.rect(plot.x, plot.y, plot.width, plot.height);
  context.clip();

  const xStart = Math.ceil(bounds.minX / step) * step;
  const yStart = Math.ceil(bounds.minY / step) * step;
  for (let x = xStart; x <= bounds.maxX + step * 1e-8; x += step) {
    strokePolyline(
      context,
      [project([x, bounds.minY]), project([x, bounds.maxY])],
      colors.grid,
      0.8,
    );
  }
  for (let y = yStart; y <= bounds.maxY + step * 1e-8; y += step) {
    strokePolyline(
      context,
      [project([bounds.minX, y]), project([bounds.maxX, y])],
      colors.grid,
      0.8,
    );
  }
  drawBaseAxes(context, project, bounds, colors);
  if (options.showTickLabels !== false) {
    drawVectorTickLabels(context, project, bounds, step, plot, colors);
  }

  normalized.forEach((vector, index) => {
    const start = project(vector.start);
    const end = project(vector.end);
    const color =
      vector.color ?? colors.vectorSeries[index % colors.vectorSeries.length];
    drawArrow(context, start, end, color, {
      width: vector.resultant ? 4 : 3,
      dash: vector.resultant ? [8, 5] : [],
    });
    context.save();
    context.fillStyle = color;
    context.beginPath();
    context.arc(start[0], start[1], 2.75, 0, Math.PI * 2);
    context.fill();
    context.restore();
  });
  context.restore();

  normalized.forEach((vector, index) => {
    const start = project(vector.start);
    const end = project(vector.end);
    const defaultLabel = vector.label;
    const label =
      typeof options.formatVectorLabel === "function"
        ? options.formatVectorLabel(vector, index)
        : defaultLabel;
    drawText(
      context,
      label,
      labelPosition(start, end, plot),
      colors.text,
      vector.resultant
        ? { font: "500 13px system-ui, sans-serif" }
        : undefined,
    );
  });

  if (options.axisLabels) {
    drawText(
      context,
      options.axisLabels.x,
      [plot.x + plot.width, project([0, 0])[1] - 12],
      colors.mutedText,
      { align: "right" },
    );
    drawText(
      context,
      options.axisLabels.y,
      [project([0, 0])[0] + 10, plot.y],
      colors.mutedText,
    );
  }

  return {
    vectors: normalized,
    bounds,
    gridStep: step,
    size: { width, height, dpr: metrics.dpr },
  };
}
