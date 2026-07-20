import assert from "node:assert/strict";
import test from "node:test";

import {
  MatrixError,
  QuadraticSurd,
  Rational,
  addMatrices,
  analyzeEigenDirections2x2,
  determinant,
  diagonalize2x2,
  diagonalizeMatrix,
  formatMatrix,
  inverseMatrix,
  matrixFromStrings,
  multiplyMatrices,
  parseRational,
  rrefMatrix,
} from "../public/math.js";

const exact = (matrix) => formatMatrix(matrix, { mode: "exact" });

function numericMultiply(left, right) {
  return left.map((row) =>
    right[0].map((_, column) =>
      row.reduce(
        (sum, entry, index) => sum + Number(entry) * Number(right[index][column]),
        0,
      ),
    ),
  );
}

function assertMatrixClose(actual, expected, tolerance = 1e-10) {
  assert.equal(actual.length, expected.length);
  actual.forEach((row, rowIndex) => {
    assert.equal(row.length, expected[rowIndex].length);
    row.forEach((entry, columnIndex) => {
      assert.ok(
        Math.abs(Number(entry) - Number(expected[rowIndex][columnIndex])) <=
          tolerance,
        `Expected (${rowIndex + 1}, ${columnIndex + 1}) ${entry} to be within ${tolerance} of ${expected[rowIndex][columnIndex]}`,
      );
    });
  });
}

test("Rational normalizes signs and supports exact arithmetic", () => {
  assert.equal(new Rational(6n, -8n).toString(), "-3/4");
  assert.equal(parseRational("2/3").add("5/6").toString(), "3/2");
  assert.equal(parseRational("-7/5").multiply("10/21").toString(), "-2/3");
  assert.equal(parseRational("1/3").toDecimal(4), "0.3333");
  assert.equal(parseRational("2/3").toDecimal(3), "0.667");
  assert.equal(parseRational("-1/200").toDecimal(2), "-0.01");
});

test("decimal parsing is exact and never evaluates expressions", () => {
  assert.equal(parseRational("0.125").toString(), "1/8");
  assert.equal(parseRational("-.50").toString(), "-1/2");
  assert.equal(parseRational("1.25e-2").toString(), "1/80");
  assert.equal(parseRational("12.").toString(), "12");
  assert.throws(() => parseRational("1 + 2"), TypeError);
  assert.throws(() => parseRational("Infinity"), TypeError);
  assert.throws(() => parseRational("1/0"), RangeError);
});

test("matrix parsing rejects ragged, oversized, and unsafe entries", () => {
  assert.throws(
    () => matrixFromStrings([["1", "2"], ["3"]]),
    (error) => error instanceof MatrixError && error.code === "RAGGED_MATRIX",
  );
  assert.throws(
    () => matrixFromStrings(Array.from({ length: 7 }, () => ["1"])),
    (error) => error instanceof MatrixError && error.code === "MATRIX_TOO_LARGE",
  );
  assert.throws(
    () => matrixFromStrings([["alert(1)"]]),
    (error) => error instanceof MatrixError && error.code === "INVALID_ENTRY",
  );
});

test("matrix addition and multiplication preserve fractions", () => {
  const addition = addMatrices(
    [["1/2", "-2"], ["0.25", "3"]],
    [["1/3", "5"], ["3/4", "-1"]],
  );
  assert.deepEqual(exact(addition.matrix), [
    ["5/6", "3"],
    ["1", "2"],
  ]);
  assert.equal(addition.steps.length, 4);

  const product = multiplyMatrices(
    [["1/2", "2"], ["-1", "3"]],
    [["4", "1/3"], ["2", "6"]],
  );
  assert.deepEqual(exact(product.matrix), [
    ["6", "73/6"],
    ["2", "53/3"],
  ]);
  assert.match(product.steps[0], /×/);
});

test("maximum-size exact matrices remain stable across core operations", () => {
  const diagonal = Array.from({ length: 6 }, (_, row) =>
    Array.from({ length: 6 }, (_, column) => (row === column ? String(row + 1) : "0")),
  );
  const identity = Array.from({ length: 6 }, (_, row) =>
    Array.from({ length: 6 }, (_, column) => (row === column ? "1" : "0")),
  );

  const parsed = matrixFromStrings(diagonal);
  assert.equal(parsed.length, 6);
  assert.deepEqual(exact(rrefMatrix(parsed).matrix), identity);

  const inverse = inverseMatrix(parsed).matrix;
  assert.deepEqual(exact(multiplyMatrices(parsed, inverse).matrix), identity);

  const sum = addMatrices(parsed, identity).matrix;
  assert.deepEqual(exact(sum), diagonal.map((row, rowIndex) =>
    row.map((value, columnIndex) => rowIndex === columnIndex ? String(Number(value) + 1) : "0"),
  ));

  const diagonalization = diagonalizeMatrix(parsed);
  assert.deepEqual(exact(diagonalization.D), diagonal);
  assert.deepEqual(exact(multiplyMatrices(
    multiplyMatrices(diagonalization.P, diagonalization.D).matrix,
    diagonalization.Pinv,
  ).matrix), diagonal);
});

test("matrix operations report incompatible dimensions", () => {
  assert.throws(
    () => addMatrices([[1, 2]], [[1], [2]]),
    (error) =>
      error instanceof MatrixError && error.code === "DIMENSION_MISMATCH",
  );
  assert.throws(
    () => multiplyMatrices([[1, 2]], [[1, 2]]),
    (error) =>
      error instanceof MatrixError && error.code === "DIMENSION_MISMATCH",
  );
});

test("RREF is exact, ranks deficient matrices, and records row operations", () => {
  const result = rrefMatrix([
    ["1", "2", "3"],
    ["2", "4", "6"],
    ["1", "1", "1"],
  ]);
  assert.deepEqual(exact(result.matrix), [
    ["1", "0", "-1"],
    ["0", "1", "2"],
    ["0", "0", "0"],
  ]);
  assert.equal(result.rank, 2);
  assert.deepEqual(result.pivotColumns, [0, 1]);
  assert.ok(result.steps.length >= 2);
  assert.equal(result.work.length, result.steps.length + 1);
});

test("inverse uses exact augmented row reduction", () => {
  const result = inverseMatrix([
    ["2", "1"],
    ["5", "3"],
  ]);
  assert.deepEqual(exact(result.matrix), [
    ["3", "-1"],
    ["-5", "2"],
  ]);
  assert.match(result.steps.at(-1), /A⁻¹/);
  assert.ok(result.work[0].matrix[0].length === 4);
});

test("singular matrices have no inverse and expose completed teaching steps", () => {
  assert.throws(
    () => inverseMatrix([[1, 2], [2, 4]]),
    (error) => {
      assert.ok(error instanceof MatrixError);
      assert.equal(error.code, "SINGULAR");
      assert.ok(Array.isArray(error.details.steps));
      assert.match(error.message, /singular/i);
      return true;
    },
  );
});

test("determinant handles fractions, row swaps, and singular matrices", () => {
  assert.equal(determinant([["1/2", "1"], ["3", "4"]]).toString(), "-1");
  assert.equal(determinant([[0, 2], [3, 4]]).toString(), "-6");
  assert.equal(determinant([[1, 2, 3], [2, 4, 6], [0, 1, 1]]).toString(), "0");
});

test("diagonalization returns exact rational P, D, and P inverse", () => {
  const result = diagonalize2x2([[4, 1], [2, 3]]);
  assert.equal(result.kind, "rational");
  assert.deepEqual(result.eigenvalues.map(String), ["5", "2"]);
  assert.deepEqual(exact(result.D), [["5", "0"], ["0", "2"]]);
  assert.deepEqual(exact(result.P), [["1", "1"], ["1", "-2"]]);
  assert.deepEqual(exact(result.Pinv), [["2/3", "1/3"], ["1/3", "-1/3"]]);
});

test("diagonalization preserves irrational eigenvalues as symbolic square roots", () => {
  const result = diagonalize2x2([[0, 1], [1, 1]]);
  assert.equal(result.kind, "surd");
  assert.ok(result.eigenvalues[0] instanceof QuadraticSurd);
  assert.equal(result.eigenvalues[0].toString(), "1/2 + 1/2*sqrt(5)");
  assert.equal(result.eigenvalues[1].toString(), "1/2 - 1/2*sqrt(5)");
  assert.deepEqual(exact(result.D), [
    ["1/2 + 1/2*sqrt(5)", "0"],
    ["0", "1/2 - 1/2*sqrt(5)"],
  ]);
  const decimal = formatMatrix(result.D, { mode: "decimal", precision: 3 });
  assert.deepEqual(decimal, [["1.618", "0"], ["0", "-0.618"]]);
});

test("diagonalization explains repeated and complex failures", () => {
  const scalar = diagonalize2x2([[3, 0], [0, 3]]);
  assert.equal(scalar.kind, "repeated");
  assert.deepEqual(exact(scalar.P), [["1", "0"], ["0", "1"]]);

  assert.throws(
    () => diagonalize2x2([[1, 1], [0, 1]]),
    (error) =>
      error instanceof MatrixError && error.code === "NOT_DIAGONALIZABLE",
  );
  assert.throws(
    () => diagonalize2x2([[0, -1], [1, 0]]),
    (error) =>
      error instanceof MatrixError && error.code === "COMPLEX_EIGENVALUES",
  );
});

test("general diagonalization preserves an already-diagonal 2 by 2 basis", () => {
  const result = diagonalizeMatrix([[2, 0], [0, 3]]);
  assert.deepEqual(exact(result.P), [["1", "0"], ["0", "1"]]);
  assert.deepEqual(exact(result.D), [["2", "0"], ["0", "3"]]);
  assert.deepEqual(exact(result.Pinv), [["1", "0"], ["0", "1"]]);
  assert.deepEqual(result.eigenvalues.map(String), ["2", "3"]);

  const focusedResult = diagonalize2x2([[2, 0], [0, 3]]);
  assert.deepEqual(exact(focusedResult.P), [["1", "0"], ["0", "1"]]);
  assert.deepEqual(exact(focusedResult.D), [["2", "0"], ["0", "3"]]);
  assert.deepEqual(focusedResult.eigenvalues.map(String), ["2", "3"]);
});

test("general diagonalization builds a nontrivial exact eigenbasis for 3 by 3", () => {
  const source = [
    [2, 1, -1],
    [-1, 2, 1],
    [-1, 1, 2],
  ];
  const result = diagonalizeMatrix(source);

  assert.equal(result.kind, "rational");
  assert.deepEqual(result.eigenvalues.map(String), ["1", "2", "3"]);
  assert.notDeepEqual(exact(result.P), [
    ["1", "0", "0"],
    ["0", "1", "0"],
    ["0", "0", "1"],
  ]);
  assert.deepEqual(exact(result.D), [
    ["1", "0", "0"],
    ["0", "2", "0"],
    ["0", "0", "3"],
  ]);

  const rebuilt = multiplyMatrices(
    multiplyMatrices(result.P, result.D).matrix,
    result.Pinv,
  ).matrix;
  assert.deepEqual(exact(rebuilt), source.map((row) => row.map(String)));
  assert.deepEqual(result.characteristicPolynomial.map(String), [
    "1",
    "-6",
    "11",
    "-6",
  ]);
});

test("general diagonalization preserves a diagonal 4 by 4 matrix", () => {
  const source = [
    ["1/2", 0, 0, 0],
    [0, -2, 0, 0],
    [0, 0, 3, 0],
    [0, 0, 0, "1/2"],
  ];
  const result = diagonalizeMatrix(source);
  assert.deepEqual(exact(result.P), [
    ["1", "0", "0", "0"],
    ["0", "1", "0", "0"],
    ["0", "0", "1", "0"],
    ["0", "0", "0", "1"],
  ]);
  assert.deepEqual(exact(result.D), source.map((row) => row.map(String)));
  assert.deepEqual(result.eigenvalues.map(String), ["1/2", "-2", "3", "1/2"]);
});

test("general diagonalization rejects a defective 3 by 3 eigenbasis", () => {
  assert.throws(
    () =>
      diagonalizeMatrix([
        [2, 1, 0],
        [0, 2, 0],
        [0, 0, 3],
      ]),
    (error) => {
      assert.ok(error instanceof MatrixError);
      assert.equal(error.code, "NOT_DIAGONALIZABLE");
      assert.equal(error.details.algebraicMultiplicity, 2);
      assert.equal(error.details.geometricMultiplicity, 1);
      return true;
    },
  );
});

test("general diagonalization supports repeated and singular eigenvalues", () => {
  const repeated = diagonalizeMatrix([
    [2, 1, 0],
    [1, 2, 0],
    [0, 0, 3],
  ]);
  assert.deepEqual(repeated.eigenvalues.map(String), ["1", "3", "3"]);
  const repeatedRebuilt = multiplyMatrices(
    multiplyMatrices(repeated.P, repeated.D).matrix,
    repeated.Pinv,
  ).matrix;
  assert.deepEqual(exact(repeatedRebuilt), [
    ["2", "1", "0"],
    ["1", "2", "0"],
    ["0", "0", "3"],
  ]);

  const singular = diagonalizeMatrix([
    [1, 1, 0],
    [1, 1, 0],
    [0, 0, 3],
  ]);
  assert.deepEqual(singular.eigenvalues.map(String), ["0", "2", "3"]);
  assert.equal(determinant(singular.D).toString(), "0");
});

test("all operations accept restored string cells without mutating saved data", () => {
  const savedA = Object.freeze([
    Object.freeze(["2", "1", "-1"]),
    Object.freeze(["-1", "2", "1"]),
    Object.freeze(["-1", "1", "2"]),
  ]);
  const savedB = Object.freeze([
    Object.freeze(["1", "0", "0"]),
    Object.freeze(["0", "1", "0"]),
    Object.freeze(["0", "0", "1"]),
  ]);
  const snapshot = JSON.stringify({ savedA, savedB });

  addMatrices(savedA, savedB);
  multiplyMatrices(savedA, savedB);
  rrefMatrix(savedA);
  inverseMatrix(savedA);
  determinant(savedA);
  diagonalizeMatrix(savedA);

  assert.equal(JSON.stringify({ savedA, savedB }), snapshot);
});

test("singular and defective errors remain operation-specific", () => {
  assert.throws(
    () => inverseMatrix([[1, 2], [2, 4]]),
    (error) => error instanceof MatrixError && error.code === "SINGULAR",
  );
  assert.throws(
    () => diagonalizeMatrix([[1, 1], [0, 1]]),
    (error) =>
      error instanceof MatrixError && error.code === "NOT_DIAGONALIZABLE",
  );
  assert.throws(
    () => diagonalizeMatrix([[0, -1], [1, 0]]),
    (error) =>
      error instanceof MatrixError && error.code === "COMPLEX_EIGENVALUES",
  );
});

test("symmetric 3 by 3 matrices with irrational spectra use Jacobi fallback", () => {
  const source = [
    [1, 1, 0],
    [1, 2, 0],
    [0, 0, 3],
  ];
  const result = diagonalizeMatrix(source);

  assert.equal(result.kind, "numeric-symmetric");
  assert.equal(result.approximate, true);
  assert.equal(result.numericDetails.method, "jacobi");
  assert.ok(result.steps.some((step) => /approximate|Jacobi/i.test(step)));
  assertMatrixClose(result.Pinv, result.P[0].map((_, column) =>
    result.P.map((row) => row[column]),
  ));
  assertMatrixClose(
    numericMultiply(numericMultiply(result.P, result.D), result.Pinv),
    source,
  );
  assertMatrixClose(result.eigenvalues.map((value) => [value]), [
    [(3 - Math.sqrt(5)) / 2],
    [(3 + Math.sqrt(5)) / 2],
    [3],
  ]);
});

test("Jacobi fallback reconstructs a fully coupled irrational 4 by 4 spectrum", () => {
  const source = [
    [2, 1, 0, 0],
    [1, 2, 1, 0],
    [0, 1, 2, 1],
    [0, 0, 1, 2],
  ];
  const result = diagonalizeMatrix(source);
  assert.equal(result.kind, "numeric-symmetric");
  assertMatrixClose(
    numericMultiply(numericMultiply(result.P, result.D), result.Pinv),
    source,
  );
  assertMatrixClose(
    numericMultiply(result.Pinv, result.P),
    source.map((row, rowIndex) =>
      row.map((_, columnIndex) => (rowIndex === columnIndex ? 1 : 0)),
    ),
  );
});

test("numerical fallback remains limited to symmetric matrices", () => {
  assert.throws(
    () =>
      diagonalizeMatrix([
        [1, 1, 0],
        [2, 1, 0],
        [0, 0, 3],
      ]),
    (error) =>
      error instanceof MatrixError &&
      error.code === "UNSUPPORTED_IRRATIONAL_EIGENVALUES",
  );
});

test("scaled symmetric decimals reach Jacobi without unbounded root factoring", () => {
  const source = [
    ["1e-20", "1e-20", "0"],
    ["1e-20", "2e-20", "0"],
    ["0", "0", "3e-20"],
  ];
  const result = diagonalizeMatrix(source);
  assert.equal(result.kind, "numeric-symmetric");
  assertMatrixClose(
    numericMultiply(numericMultiply(result.P, result.D), result.Pinv),
    source.map((row) => row.map(Number)),
    1e-32,
  );
});

function assertUnitDirection(direction, tolerance = 1e-12) {
  assert.ok(
    Math.abs(Math.hypot(...direction.vector) - 1) <= tolerance,
    `Expected ${direction.vector.join(", ")} to be a unit direction`,
  );
  const anchor =
    Math.abs(direction.vector[0]) >= Math.abs(direction.vector[1]) ? 0 : 1;
  assert.ok(direction.vector[anchor] >= 0, "line direction sign is stable");
}

function assertEigenDirection(matrix, direction, tolerance = 1e-11) {
  const [x, y] = direction.vector;
  const transformed = [
    Number(matrix[0][0]) * x + Number(matrix[0][1]) * y,
    Number(matrix[1][0]) * x + Number(matrix[1][1]) * y,
  ];
  assert.ok(
    Math.abs(transformed[0] - direction.eigenvalueApprox * x) <= tolerance,
  );
  assert.ok(
    Math.abs(transformed[1] - direction.eigenvalueApprox * y) <= tolerance,
  );
}

test("eigenvector explorer returns two normalized rational eigenlines", () => {
  const matrix = [[4, 1], [2, 3]];
  const analysis = analyzeEigenDirections2x2(matrix);
  assert.equal(analysis.kind, "distinct-real");
  assert.equal(analysis.hasRealEigenlines, true);
  assert.equal(analysis.allDirectionsInvariant, false);
  assert.deepEqual(analysis.eigenvalueLabels, ["5", "2"]);
  assert.deepEqual(
    analysis.directions.map((direction) => direction.exactVector),
    [["1", "1"], ["1", "-2"]],
  );
  analysis.directions.forEach((direction) => {
    assertUnitDirection(direction);
    assertEigenDirection(matrix, direction);
  });
});

test("eigenvector explorer keeps exact surd labels with drawable directions", () => {
  const matrix = [[0, 1], [1, 1]];
  const analysis = analyzeEigenDirections2x2(matrix);
  assert.equal(analysis.kind, "distinct-real");
  assert.deepEqual(analysis.eigenvalueLabels, [
    "1/2 + 1/2*sqrt(5)",
    "1/2 - 1/2*sqrt(5)",
  ]);
  assert.deepEqual(analysis.directions[0].exactVector, [
    "1",
    "1/2 + 1/2*sqrt(5)",
  ]);
  analysis.directions.forEach((direction) => {
    assertUnitDirection(direction);
    assertEigenDirection(matrix, direction);
  });
  const dot =
    analysis.directions[0].vector[0] * analysis.directions[1].vector[0] +
    analysis.directions[0].vector[1] * analysis.directions[1].vector[1];
  assert.ok(Math.abs(dot) <= 1e-12);
});

test("eigenvector explorer exposes one line for a defective repeated matrix", () => {
  const matrix = [[1, 1], [0, 1]];
  const analysis = analyzeEigenDirections2x2(matrix);
  assert.equal(analysis.kind, "defective");
  assert.equal(analysis.directions.length, 1);
  assert.deepEqual(analysis.eigenvalueLabels, ["1"]);
  assert.deepEqual(analysis.directions[0].vector, [1, 0]);
  assert.match(analysis.explanation, /one real eigenline|not diagonalizable/i);
  assertUnitDirection(analysis.directions[0]);
  assertEigenDirection(matrix, analysis.directions[0]);
});

test("eigenvector explorer marks every direction invariant for scalar matrices", () => {
  for (const matrix of [[[3, 0], [0, 3]], [[0, 0], [0, 0]]]) {
    const analysis = analyzeEigenDirections2x2(matrix);
    assert.equal(analysis.kind, "scalar");
    assert.equal(analysis.allDirectionsInvariant, true);
    assert.equal(analysis.hasRealEigenlines, true);
    assert.deepEqual(analysis.directions, []);
    assert.match(analysis.explanation, /every line/i);
  }
});

test("eigenvector explorer reports no real lines for complex eigenvalues", () => {
  const analysis = analyzeEigenDirections2x2([[0, -1], [1, 0]]);
  assert.equal(analysis.kind, "complex");
  assert.equal(analysis.hasRealEigenlines, false);
  assert.equal(analysis.allDirectionsInvariant, false);
  assert.deepEqual(analysis.directions, []);
  assert.deepEqual(analysis.eigenvalueLabels, ["i", "-i"]);
  assert.match(analysis.explanation, /no real eigenlines/i);
});

test("eigenvector explorer validates its 2 by 2 input", () => {
  assert.throws(
    () => analyzeEigenDirections2x2([[1, 0, 0], [0, 1, 0]]),
    (error) =>
      error instanceof MatrixError && error.code === "INVALID_DIMENSION",
  );
});
