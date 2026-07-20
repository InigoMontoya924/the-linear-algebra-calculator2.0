import assert from "node:assert/strict";
import test from "node:test";

import {
  compareLineProjections,
  determinantMatrix2,
  multiplyMatrix2,
  projectOntoLineL1,
  projectOntoLineL2,
  svd2x2,
  svdStageMatrix,
  transposeMatrix2,
} from "../public/labs.js";

function assertClose(actual, expected, tolerance = 1e-10) {
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= tolerance * scale,
    `expected ${actual} to be close to ${expected}`,
  );
}

function assertPointClose(actual, expected, tolerance = 1e-10) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => assertClose(value, expected[index], tolerance));
}

function assertMatrixClose(actual, expected, tolerance = 1e-10) {
  assert.equal(actual.length, expected.length);
  actual.forEach((row, rowIndex) => assertPointClose(row, expected[rowIndex], tolerance));
}

function assertOrthogonal(matrix, tolerance = 1e-10) {
  assertMatrixClose(
    multiplyMatrix2(transposeMatrix2(matrix), matrix),
    [[1, 0], [0, 1]],
    tolerance,
  );
}

test("L2 projection gives the perpendicular least-squares residual", () => {
  const result = projectOntoLineL2([2, 1], [2, 2]);
  assertClose(result.parameter, 6 / 5);
  assertPointClose(result.point, [12 / 5, 6 / 5]);
  assertPointClose(result.residual, [-2 / 5, 4 / 5]);
  assertClose(result.squaredDistance, 4 / 5);
  assertClose(result.orthogonality, 0);
});

test("L1 projection uses the weighted median and can differ from L2", () => {
  const comparison = compareLineProjections([2, 1], [2, 2]);
  assert.equal(comparison.l1.nonUnique, false);
  assertClose(comparison.l1.parameter, 1);
  assertPointClose(comparison.l1.point, [2, 1]);
  assertPointClose(comparison.l1.residual, [0, 1]);
  assertClose(comparison.l1.distance, 1);
  assert.notDeepEqual(comparison.l1.point, comparison.l2.point);
});

test("equal L1 weights expose the complete non-unique minimizer segment", () => {
  const result = projectOntoLineL1([1, 1], [2, 0]);
  assert.equal(result.nonUnique, true);
  assertPointClose(result.interval, [0, 2]);
  assert.deepEqual(result.intervalPoints, [[0, 0], [2, 2]]);
  assertPointClose(result.point, [1, 1]);
  assertClose(result.distance, 2);
});

test("L1 non-uniqueness is invariant when the spanning direction is rescaled", () => {
  const base = projectOntoLineL1([1, 1], [2, 0]);
  const enlarged = projectOntoLineL1([1e12, 1e12], [2, 0]);

  assert.equal(base.nonUnique, true);
  assert.equal(enlarged.nonUnique, true);
  assertMatrixClose(enlarged.intervalPoints, base.intervalPoints);
  assertPointClose(enlarged.point, base.point);
});

test("L1 distinguishes close unequal weights and preserves far-away minimizer intervals", () => {
  const unique = projectOntoLineL1([1e14, 1e14 + 1], [0, 1e14 + 1]);
  assert.equal(unique.nonUnique, false);
  assertClose(unique.parameter, 1);

  const translated = projectOntoLineL1([1, 1], [1e14, 1e14 + 1]);
  assert.equal(translated.nonUnique, true);
  assertPointClose(translated.interval, [1e14, 1e14 + 1]);
});

test("L1 forms a finite midpoint for intervals near the largest finite number", () => {
  const result = projectOntoLineL1([1, 1], [1.6e308, 1.7e308]);
  assert.equal(result.nonUnique, true);
  assert.ok(Number.isFinite(result.parameter));
  assert.ok(result.point.every(Number.isFinite));
  assertPointClose(result.point, [1.65e308, 1.65e308], 1e-12);
});

test("line projection handles axis lines, scaled directions, and points on the line", () => {
  const horizontal = compareLineProjections([3, 0], [-2, 4]);
  assertPointClose(horizontal.l2.point, [-2, 0]);
  assertPointClose(horizontal.l1.point, [-2, 0]);

  const first = compareLineProjections([2, -1], [4, -2]);
  const scaled = compareLineProjections([-6, 3], [4, -2]);
  assertPointClose(first.l2.point, [4, -2]);
  assertPointClose(first.l1.point, [4, -2]);
  assertPointClose(scaled.l2.point, [4, -2]);
  assertPointClose(scaled.l1.point, [4, -2]);
  assertClose(first.l2.distance, 0);
  assertClose(first.l1.distance, 0);
});

test("projection rejects missing, non-finite, and zero directions", () => {
  assert.throws(() => projectOntoLineL2([0, 0], [1, 2]), /non-zero/);
  assert.throws(() => projectOntoLineL1([0, 0], [1, 2]), /non-zero/);
  assert.throws(() => projectOntoLineL2([1], [1, 2]), /two coordinates/);
  assert.throws(() => projectOntoLineL1([1, 2], [Infinity, 0]), /finite/);
});

test("L2 projection keeps finite geometry for very large finite coordinates", () => {
  const result = projectOntoLineL2([1e308, 1e308], [1e308, 0]);
  assert.ok(result.point.every(Number.isFinite));
  assert.ok(result.residual.every(Number.isFinite));
  assertPointClose(result.point, [5e307, 5e307], 1e-12);
});

test("L2 projection handles directions and components at Number.MAX_VALUE", () => {
  const maximum = Number.MAX_VALUE;
  for (const [direction, target, expected] of [
    [[maximum, maximum], [maximum, maximum], [maximum, maximum]],
    [[1, 1], [maximum, maximum], [maximum, maximum]],
    [[maximum, maximum], [maximum, 0], [maximum / 2, maximum / 2]],
  ]) {
    const result = projectOntoLineL2(direction, target);
    assert.ok(result.point.every(Number.isFinite));
    assertPointClose(result.point, expected, 1e-12);
  }
});

test("2 by 2 SVD reconstructs a general matrix with orthogonal factors", () => {
  const matrix = [[1, 1], [0, 1]];
  const result = svd2x2(matrix);
  assert.ok(result.singularValues[0] >= result.singularValues[1]);
  assert.ok(result.singularValues.every((value) => value >= 0));
  assert.equal(result.rank, 2);
  assertOrthogonal(result.U);
  assertOrthogonal(result.V);
  assertMatrixClose(result.reconstruction, matrix);
  assertMatrixClose(svdStageMatrix(result, 3), matrix);
  assertClose(
    result.singularValues[0] * result.singularValues[1],
    Math.abs(determinantMatrix2(matrix)),
  );
});

test("SVD orders diagonal singular values and exposes every exact factor stage", () => {
  const result = svd2x2([[1, 0], [0, 3]]);
  assertPointClose(result.singularValues, [3, 1]);
  assertMatrixClose(svdStageMatrix(result, 0), [[1, 0], [0, 1]]);
  assertMatrixClose(svdStageMatrix(result, 1), result.VT);
  assertMatrixClose(
    svdStageMatrix(result, 2),
    multiplyMatrix2(result.Sigma, result.VT),
  );
  assertMatrixClose(svdStageMatrix(result, 3), [[1, 0], [0, 3]]);
});

test("SVD handles rank-one and zero matrices deterministically", () => {
  const rankOne = svd2x2([[2, 4], [1, 2]]);
  assert.equal(rankOne.rank, 1);
  assertClose(rankOne.singularValues[1], 0);
  assert.equal(rankOne.conditionNumber, Infinity);
  assertOrthogonal(rankOne.U);
  assertOrthogonal(rankOne.V);
  assertMatrixClose(rankOne.reconstruction, [[2, 4], [1, 2]]);

  const zero = svd2x2([[0, 0], [0, 0]]);
  assert.equal(zero.rank, 0);
  assert.deepEqual(zero.singularValues, [0, 0]);
  assert.deepEqual(zero.U, [[1, 0], [0, 1]]);
  assert.deepEqual(zero.V, [[1, 0], [0, 1]]);
  assertMatrixClose(svdStageMatrix(zero, 3), [[0, 0], [0, 0]]);
});

test("isotropic rotations and reflections keep equal singular values", () => {
  const rotation = svd2x2([[0, -1], [1, 0]]);
  assertPointClose(rotation.singularValues, [1, 1]);
  assert.equal(rotation.repeatedSingularValues, true);
  assert.equal(rotation.leftOrientation, "rotation");
  assertMatrixClose(rotation.reconstruction, [[0, -1], [1, 0]]);

  const reflection = svd2x2([[-1, 0], [0, 1]]);
  assertPointClose(reflection.singularValues, [1, 1]);
  assert.equal(reflection.leftOrientation, "reflection");
  assertMatrixClose(reflection.reconstruction, [[-1, 0], [0, 1]]);
});

test("scaled SVD remains stable for very large, tiny, and near-singular inputs", () => {
  for (const scale of [1e200, 1e-200]) {
    const matrix = [[3 * scale, 0], [0, scale]];
    const result = svd2x2(matrix);
    assertPointClose(result.singularValues, [3 * scale, scale], 1e-9);
    assertMatrixClose(result.reconstruction, matrix, 1e-9);
  }

  const nearSingular = svd2x2([[1, 1], [1, 1 + 1e-12]]);
  assert.ok(nearSingular.singularValues[1] > 0);
  assertMatrixClose(nearSingular.reconstruction, [[1, 1], [1, 1 + 1e-12]], 1e-8);
});

test("SVD retains a tiny non-zero reflected direction below its numerical rank threshold", () => {
  const matrix = [[1e20, 0], [0, -1]];
  const result = svd2x2(matrix);

  assert.equal(result.rank, 1);
  assertPointClose(result.singularValues, [1e20, 1], 1e-12);
  assert.equal(result.conditionNumber, 1e20);
  assert.equal(result.leftOrientation, "reflection");
  assertOrthogonal(result.U);
  assertMatrixClose(result.reconstruction, matrix, 1e-12);
});

test("SVD snaps cardinal factors so extreme diagonal matrices stay diagonal", () => {
  const matrix = [[1, 0], [0, 1e20]];
  const result = svd2x2(matrix);
  assert.deepEqual(result.reconstruction, matrix);
  assertMatrixClose(svdStageMatrix(result, 3), matrix);
});

test("SVD preserves off-diagonal information when singular values are nearly repeated", () => {
  const matrix = [[1e14, 1], [0, 1e14]];
  const result = svd2x2(matrix);

  assert.equal(result.repeatedSingularValues, true);
  assert.ok(result.reconstructionError / Math.hypot(...matrix.flat()) < 1e-15);
  assertClose(result.reconstruction[0][1], 1, 0.05);
});

test("reflection playback stays orthogonal until the final reflection jump", () => {
  const result = svd2x2([[-2, 0], [0, 1]]);
  assert.equal(result.leftOrientation, "reflection");
  assert.ok(determinantMatrix2(svdStageMatrix(result, 2.5)) > 0);
  assert.ok(determinantMatrix2(svdStageMatrix(result, 3)) < 0);
});

test("SVD rejects malformed and non-finite matrices", () => {
  assert.throws(() => svd2x2([[1, 2, 3], [4, 5, 6]]), /2 by 2/);
  assert.throws(() => svd2x2([[1, 0], [0, Number.NaN]]), /finite/);
});
