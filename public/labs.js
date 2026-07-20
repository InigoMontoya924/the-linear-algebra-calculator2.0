/**
 * Numerical helpers for The Linear Algebra Calculator 2.0's interactive teaching workspaces.
 *
 * These routines intentionally stay separate from the exact calculator engine:
 * projection comparisons and the SVD explorer are visual, floating-point labs.
 */

const DEFAULT_EPSILON = 1e-10;

function finiteNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
  return number;
}

function cleanNumber(value, epsilon = 0) {
  return Math.abs(value) <= epsilon || Object.is(value, -0) ? 0 : value;
}

function pair(value, name) {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new TypeError(`${name} must contain exactly two coordinates.`);
  }
  return [
    finiteNumber(value[0], `${name}[0]`),
    finiteNumber(value[1], `${name}[1]`),
  ];
}

function matrix2(value, name = "matrix") {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new TypeError(`${name} must be a 2 by 2 matrix.`);
  }
  return value.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== 2) {
      throw new TypeError(`${name} must be a 2 by 2 matrix.`);
    }
    return row.map((entry, columnIndex) =>
      finiteNumber(entry, `${name}[${rowIndex}][${columnIndex}]`),
    );
  });
}

function assertDirection(direction) {
  const normalized = pair(direction, "direction");
  const length = Math.hypot(...normalized);
  if (length === 0) {
    throw new RangeError("The spanning direction must be non-zero.");
  }
  return { direction: normalized, length };
}

function scaledPoint(direction, parameter) {
  return direction.map((value) => cleanNumber(value * parameter));
}

function residualFrom(target, projected) {
  return target.map((value, index) => cleanNumber(value - projected[index]));
}

/** Minimise ||b - ta||_2 over scalar t. */
export function projectOntoLineL2(directionInput, targetInput, options = {}) {
  const epsilon = Math.max(0, finiteNumber(options.epsilon ?? DEFAULT_EPSILON, "epsilon"));
  const { direction } = assertDirection(directionInput);
  const target = pair(targetInput, "target");
  const directionScale = Math.max(...direction.map(Math.abs));
  const scaledDirection = direction.map((value) => value / directionScale);
  const scaledLength = Math.hypot(...scaledDirection);
  const unitDirection = scaledDirection.map((value) => value / scaledLength);
  const targetScale = Math.max(...target.map(Math.abs));
  const scaledTarget = targetScale === 0
    ? [0, 0]
    : target.map((value) => value / targetScale);
  const scaledNormSquared =
    scaledDirection[0] * scaledDirection[0] + scaledDirection[1] * scaledDirection[1];
  const scaledDot =
    scaledDirection[0] * scaledTarget[0] + scaledDirection[1] * scaledTarget[1];
  const projectionFactor = scaledDot / scaledNormSquared;
  const scaledPointValue = scaledDirection.map((value) => value * projectionFactor);
  const point = scaledPointValue.map((value) => cleanNumber(value * targetScale));
  const dominantIndex = Math.abs(direction[0]) >= Math.abs(direction[1]) ? 0 : 1;
  const parameter = point[dominantIndex] / direction[dominantIndex];
  const residual = residualFrom(target, point);
  const distance = Math.hypot(...residual);
  const residualScale = Math.max(...residual.map(Math.abs));
  let orthogonality = 0;
  if (residualScale > 0) {
    const normalizedDot =
      (residual[0] / residualScale) * unitDirection[0] +
      (residual[1] / residualScale) * unitDirection[1];
    orthogonality = Math.abs(normalizedDot) <= Math.max(epsilon, 64 * Number.EPSILON)
      ? 0
      : normalizedDot * residualScale * directionScale * scaledLength;
  }

  return {
    norm: "L2",
    parameter: cleanNumber(parameter),
    point,
    residual,
    distance: cleanNumber(distance),
    squaredDistance: cleanNumber(distance * distance),
    orthogonality: cleanNumber(orthogonality),
  };
}

/**
 * Minimise ||b - ta||_1 over scalar t.
 *
 * The minimisers are the weighted medians of b_i / a_i with weights |a_i|.
 * In two dimensions this can be an interval; the midpoint is returned as the
 * displayed representative while intervalPoints exposes the complete answer.
 */
export function projectOntoLineL1(directionInput, targetInput, options = {}) {
  const epsilon = Math.max(0, finiteNumber(options.epsilon ?? DEFAULT_EPSILON, "epsilon"));
  const { direction } = assertDirection(directionInput);
  const target = pair(targetInput, "target");
  const largestWeight = Math.max(...direction.map(Math.abs));
  const relativeCutoff = Math.min(epsilon, 0.5) * largestWeight;
  const candidates = direction
    .map((coefficient, index) => {
      if (Math.abs(coefficient) <= relativeCutoff) return null;
      return {
        ratio: target[index] / coefficient,
        weight: Math.abs(coefficient) / largestWeight,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.ratio - right.ratio);

  const totalWeight = candidates.reduce((sum, item) => sum + item.weight, 0);
  const halfWeight = totalWeight / 2;
  let cumulative = 0;
  let lower = candidates.at(-1).ratio;
  for (const candidate of candidates) {
    cumulative += candidate.weight;
    if (cumulative >= halfWeight) {
      lower = candidate.ratio;
      break;
    }
  }

  cumulative = 0;
  let upper = candidates.at(-1).ratio;
  for (const candidate of candidates) {
    cumulative += candidate.weight;
    if (cumulative > halfWeight) {
      upper = candidate.ratio;
      break;
    }
  }

  if (lower > upper) [lower, upper] = [upper, lower];
  const parameter = lower / 2 + upper / 2;
  const point = scaledPoint(direction, parameter);
  const residual = residualFrom(target, point);
  const distance = Math.abs(residual[0]) + Math.abs(residual[1]);
  const intervalPoints = [scaledPoint(direction, lower), scaledPoint(direction, upper)];
  const nonUnique = lower !== upper;

  return {
    norm: "L1",
    parameter: cleanNumber(parameter),
    point,
    residual,
    distance: cleanNumber(distance),
    interval: [cleanNumber(lower), cleanNumber(upper)],
    intervalPoints,
    nonUnique,
  };
}

export function compareLineProjections(direction, target, options = {}) {
  return {
    direction: pair(direction, "direction"),
    target: pair(target, "target"),
    l2: projectOntoLineL2(direction, target, options),
    l1: projectOntoLineL1(direction, target, options),
  };
}

export function transposeMatrix2(matrixInput) {
  const matrix = matrix2(matrixInput);
  return [[matrix[0][0], matrix[1][0]], [matrix[0][1], matrix[1][1]]];
}

export function multiplyMatrix2(leftInput, rightInput) {
  const left = matrix2(leftInput, "left matrix");
  const right = matrix2(rightInput, "right matrix");
  return [
    [
      left[0][0] * right[0][0] + left[0][1] * right[1][0],
      left[0][0] * right[0][1] + left[0][1] * right[1][1],
    ],
    [
      left[1][0] * right[0][0] + left[1][1] * right[1][0],
      left[1][0] * right[0][1] + left[1][1] * right[1][1],
    ],
  ].map((row) => row.map((value) => cleanNumber(value)));
}

export function applyMatrix2(matrixInput, vectorInput) {
  const matrix = matrix2(matrixInput);
  const vector = pair(vectorInput, "vector");
  return [
    cleanNumber(matrix[0][0] * vector[0] + matrix[0][1] * vector[1]),
    cleanNumber(matrix[1][0] * vector[0] + matrix[1][1] * vector[1]),
  ];
}

export function determinantMatrix2(matrixInput) {
  const matrix = matrix2(matrixInput);
  return cleanNumber(matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0]);
}

function rotationMatrix(angle) {
  const snap = (value) => {
    const tolerance = 64 * Number.EPSILON;
    if (Math.abs(value) <= tolerance) return 0;
    if (Math.abs(value - 1) <= tolerance) return 1;
    if (Math.abs(value + 1) <= tolerance) return -1;
    return value;
  };
  const cosine = snap(Math.cos(angle));
  const sine = snap(Math.sin(angle));
  return [[cosine, -sine], [sine, cosine]];
}

/** Stable, deterministic numerical SVD for a real 2 by 2 matrix. */
export function svd2x2(matrixInput, options = {}) {
  const matrix = matrix2(matrixInput);
  const epsilon = Math.max(
    0,
    finiteNumber(options.epsilon ?? 64 * Number.EPSILON, "epsilon"),
  );
  const scale = Math.max(...matrix.flat().map(Math.abs));

  if (scale === 0) {
    const identity = [[1, 0], [0, 1]];
    return {
      matrix,
      U: identity.map((row) => row.slice()),
      singularValues: [0, 0],
      Sigma: [[0, 0], [0, 0]],
      V: identity.map((row) => row.slice()),
      VT: identity.map((row) => row.slice()),
      rank: 0,
      conditionNumber: Infinity,
      reconstruction: [[0, 0], [0, 0]],
      reconstructionError: 0,
      repeatedSingularValues: true,
      leftOrientation: "rotation",
    };
  }

  const normalized = matrix.map((row) => row.map((value) => value / scale));
  const [[a, b], [c, d]] = normalized;
  const p = a * a + c * c;
  const q = a * b + c * d;
  const r = b * b + d * d;
  const trace = p + r;
  const discriminant = Math.hypot(p - r, 2 * q);
  const signedNormalizedDeterminant = a * d - b * c;
  const normalizedDeterminant = Math.abs(signedNormalizedDeterminant);

  // The half-sum form stays finite near Number.MAX_VALUE and preserves the
  // separation between nearly repeated singular values at their original
  // scale. A determinant quotient replaces its cancellation-prone smaller
  // value when the matrix is genuinely ill-conditioned.
  const alpha = Math.hypot(
    matrix[0][0] / 2 + matrix[1][1] / 2,
    matrix[1][0] / 2 - matrix[0][1] / 2,
  );
  const beta = Math.hypot(
    matrix[0][0] / 2 - matrix[1][1] / 2,
    matrix[0][1] / 2 + matrix[1][0] / 2,
  );
  const normalizedLargest = (
    Math.hypot(a + d, c - b) + Math.hypot(a - d, b + c)
  ) / 2;
  const singularValue1 = alpha + beta || normalizedLargest * scale;
  const sigmaNormalized1 = singularValue1 / scale;
  const determinantValue2 = sigmaNormalized1 > 0
    ? (normalizedDeterminant / sigmaNormalized1) * scale
    : 0;
  const directValue2 = Math.abs(alpha - beta);
  const singularValue2 = directValue2 > singularValue1 * Math.sqrt(Number.EPSILON)
    ? directValue2
    : determinantValue2;
  const sigmaNormalized2 = singularValue2 / scale;
  const singularValues = [singularValue1, singularValue2];
  if (singularValues.some((value) => !Number.isFinite(value))) {
    throw new RangeError("The matrix values are too large for the SVD explorer.");
  }

  const repeatedSingularValues =
    discriminant <= epsilon * Math.max(1, trace);
  const differenceAngle = Math.atan2(c - b, a + d);
  const sumAngle = Math.atan2(b + c, a - d);
  const theta = (sumAngle - differenceAngle) / 2;
  const phi = (sumAngle + differenceAngle) / 2;
  const V = rotationMatrix(theta);
  const VT = transposeMatrix2(V);
  const rank = sigmaNormalized1 <= epsilon
    ? 0
    : sigmaNormalized2 <= epsilon * sigmaNormalized1
      ? 1
      : 2;
  const baseU = rotationMatrix(phi);
  const U = signedNormalizedDeterminant < 0
    ? [[baseU[0][0], -baseU[0][1]], [baseU[1][0], -baseU[1][1]]]
    : baseU;
  const Sigma = [[singularValues[0], 0], [0, singularValues[1]]];
  const reconstruction = multiplyMatrix2(multiplyMatrix2(U, Sigma), VT);
  const reconstructionError = Math.hypot(
    reconstruction[0][0] - matrix[0][0],
    reconstruction[0][1] - matrix[0][1],
    reconstruction[1][0] - matrix[1][0],
    reconstruction[1][1] - matrix[1][1],
  );

  return {
    matrix,
    U,
    singularValues,
    Sigma,
    V,
    VT,
    rank,
    conditionNumber: singularValues[1] === 0 ? Infinity : singularValues[0] / singularValues[1],
    reconstruction,
    reconstructionError: cleanNumber(reconstructionError),
    repeatedSingularValues,
    leftOrientation: determinantMatrix2(U) < 0 ? "reflection" : "rotation",
  };
}

/**
 * Return the matrix shown at progress 0..3:
 * I -> V^T -> Sigma V^T -> U Sigma V^T.
 */
export function svdStageMatrix(decomposition, progressInput) {
  if (!decomposition || typeof decomposition !== "object") {
    throw new TypeError("decomposition must come from svd2x2().");
  }
  const progress = Math.min(3, Math.max(0, finiteNumber(progressInput, "progress")));
  const VT = matrix2(decomposition.VT, "V transpose");
  const U = matrix2(decomposition.U, "U");
  const singularValues = pair(decomposition.singularValues, "singular values");

  if (progress <= 1) {
    const vAngle = Math.atan2(decomposition.V[1][0], decomposition.V[0][0]);
    return rotationMatrix(-vAngle * progress);
  }

  if (progress <= 2) {
    const amount = progress - 1;
    const scaling = [
      [1 + (singularValues[0] - 1) * amount, 0],
      [0, 1 + (singularValues[1] - 1) * amount],
    ];
    return multiplyMatrix2(scaling, VT);
  }

  const amount = progress - 2;
  const uAngle = Math.atan2(U[1][0], U[0][0]);
  let left = rotationMatrix(uAngle * amount);
  if (determinantMatrix2(U) < 0 && amount >= 1) {
    left = multiplyMatrix2(left, [[1, 0], [0, -1]]);
  }
  return multiplyMatrix2(multiplyMatrix2(left, decomposition.Sigma), VT);
}
