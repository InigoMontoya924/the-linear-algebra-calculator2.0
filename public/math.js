/**
 * Exact, dependency-free linear algebra helpers shared by the browser and tests.
 *
 * Matrices accepted by the public arithmetic functions may contain Rational
 * instances or values understood by parseRational(). Results never mutate the
 * provided matrices.
 */

const MAX_MATRIX_SIZE = 6;
const MAX_DECIMAL_PRECISION = 100;
const MAX_DIVISOR_SEARCH_ROOT = 100_000n;

/** @typedef {Rational | QuadraticSurd} ExactScalar */
/** @typedef {Rational[][]} RationalMatrix */
/** @typedef {ExactScalar[][]} ExactMatrix */

export class MatrixError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MatrixError";
    this.code = code;
    this.details = details;
  }
}

function bigintAbs(value) {
  return value < 0n ? -value : value;
}

function bigintGcd(left, right) {
  let a = bigintAbs(left);
  let b = bigintAbs(right);
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function integerSquareRoot(value) {
  if (value < 0n) {
    throw new RangeError("Cannot take the square root of a negative integer.");
  }
  if (value < 2n) return value;

  let estimate = 1n << (BigInt(value.toString(2).length) + 1n) / 2n;
  while (true) {
    const next = (estimate + value / estimate) / 2n;
    if (next >= estimate) return estimate;
    estimate = next;
  }
}

function perfectRationalSquareRoot(value) {
  if (value.numerator < 0n) return null;
  const numeratorRoot = integerSquareRoot(value.numerator);
  const denominatorRoot = integerSquareRoot(value.denominator);
  if (
    numeratorRoot * numeratorRoot === value.numerator &&
    denominatorRoot * denominatorRoot === value.denominator
  ) {
    return new Rational(numeratorRoot, denominatorRoot);
  }
  return null;
}

function assertPrecision(precision) {
  if (
    !Number.isInteger(precision) ||
    precision < 0 ||
    precision > MAX_DECIMAL_PRECISION
  ) {
    throw new RangeError(
      `Decimal precision must be an integer from 0 to ${MAX_DECIMAL_PRECISION}.`,
    );
  }
}

export class Rational {
  constructor(numerator, denominator = 1n) {
    let top;
    let bottom;
    try {
      top = BigInt(numerator);
      bottom = BigInt(denominator);
    } catch {
      throw new TypeError("Rational numerator and denominator must be integers.");
    }

    if (bottom === 0n) {
      throw new RangeError("A rational number cannot have a zero denominator.");
    }

    if (bottom < 0n) {
      top = -top;
      bottom = -bottom;
    }

    const divisor = bigintGcd(top, bottom);
    this.numerator = top / divisor;
    this.denominator = bottom / divisor;
    Object.freeze(this);
  }

  static get zero() {
    return new Rational(0n);
  }

  static get one() {
    return new Rational(1n);
  }

  add(other) {
    const right = parseRational(other);
    return new Rational(
      this.numerator * right.denominator + right.numerator * this.denominator,
      this.denominator * right.denominator,
    );
  }

  subtract(other) {
    const right = parseRational(other);
    return new Rational(
      this.numerator * right.denominator - right.numerator * this.denominator,
      this.denominator * right.denominator,
    );
  }

  multiply(other) {
    const right = parseRational(other);
    return new Rational(
      this.numerator * right.numerator,
      this.denominator * right.denominator,
    );
  }

  divide(other) {
    const right = parseRational(other);
    if (right.isZero()) {
      throw new RangeError("Cannot divide by zero.");
    }
    return new Rational(
      this.numerator * right.denominator,
      this.denominator * right.numerator,
    );
  }

  negate() {
    return new Rational(-this.numerator, this.denominator);
  }

  abs() {
    return this.numerator < 0n ? this.negate() : this;
  }

  reciprocal() {
    if (this.isZero()) throw new RangeError("Zero has no reciprocal.");
    return new Rational(this.denominator, this.numerator);
  }

  isZero() {
    return this.numerator === 0n;
  }

  isOne() {
    return this.numerator === this.denominator;
  }

  isNegative() {
    return this.numerator < 0n;
  }

  equals(other) {
    const right = parseRational(other);
    return (
      this.numerator === right.numerator &&
      this.denominator === right.denominator
    );
  }

  compare(other) {
    const right = parseRational(other);
    const difference =
      this.numerator * right.denominator - right.numerator * this.denominator;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  }

  toString() {
    return this.denominator === 1n
      ? this.numerator.toString()
      : `${this.numerator}/${this.denominator}`;
  }

  /**
   * Return a rounded base-10 representation without converting through Number.
   * Rounding is half away from zero.
   */
  toDecimal(precision = 4, trimTrailingZeros = true) {
    assertPrecision(precision);
    const scale = 10n ** BigInt(precision);
    const absoluteNumerator = bigintAbs(this.numerator);
    let scaled = (absoluteNumerator * scale) / this.denominator;
    const remainder = (absoluteNumerator * scale) % this.denominator;
    if (remainder * 2n >= this.denominator) scaled += 1n;

    let digits = scaled.toString();
    if (precision > 0) {
      digits = digits.padStart(precision + 1, "0");
      const splitAt = digits.length - precision;
      let fractional = digits.slice(splitAt);
      if (trimTrailingZeros) fractional = fractional.replace(/0+$/, "");
      digits = fractional
        ? `${digits.slice(0, splitAt)}.${fractional}`
        : digits.slice(0, splitAt);
    }

    const roundedIsZero = scaled === 0n;
    return this.isNegative() && !roundedIsZero ? `-${digits}` : digits;
  }

  toNumber() {
    return Number(this.numerator) / Number(this.denominator);
  }

  toJSON() {
    return this.toString();
  }
}

function parseDecimalString(input) {
  const match = input.match(
    /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/,
  );
  if (!match) {
    throw new TypeError(
      `“${input}” is not an integer, fraction, or finite decimal.`,
    );
  }

  const sign = match[1] === "-" ? -1n : 1n;
  const integerPart = match[2] ?? "0";
  const fractionalPart = match[3] ?? match[4] ?? "";
  const exponent = Number(match[5] ?? "0");
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) {
    throw new RangeError("The decimal exponent must be between -1000 and 1000.");
  }

  const digits = `${integerPart}${fractionalPart}`.replace(/^0+(?=\d)/, "");
  const decimalPlaces = fractionalPart.length - exponent;
  if (decimalPlaces <= 0) {
    return new Rational(
      sign * BigInt(digits || "0") * 10n ** BigInt(-decimalPlaces),
    );
  }
  return new Rational(
    sign * BigInt(digits || "0"),
    10n ** BigInt(decimalPlaces),
  );
}

/** Safely parse an integer, fraction, decimal, Rational, bigint, or finite number. */
export function parseRational(value) {
  if (value instanceof Rational) return value;
  if (typeof value === "bigint") return new Rational(value);

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Only finite numbers can be used in a matrix.");
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new RangeError(
        "Unsafe JavaScript integers must be supplied as strings or bigint values.",
      );
    }
    return parseDecimalString(value.toString());
  }

  if (typeof value !== "string") {
    throw new TypeError("Matrix entries must be numbers or numeric strings.");
  }

  const input = value.trim();
  if (!input) throw new TypeError("Matrix entries cannot be blank.");

  const fraction = input.match(/^([+-]?\d+)\s*\/\s*([+-]?\d+)$/);
  if (fraction) {
    const denominator = BigInt(fraction[2]);
    if (denominator === 0n) {
      throw new RangeError("A fraction cannot have a zero denominator.");
    }
    return new Rational(BigInt(fraction[1]), denominator);
  }

  return parseDecimalString(input);
}

/**
 * An exact value a + b*sqrt(r), where a, b and r are rational and r > 0.
 * It is used for real irrational eigenvalues and their eigenvectors.
 */
export class QuadraticSurd {
  constructor(rationalPart, radicalCoefficient, radicand) {
    this.rationalPart = parseRational(rationalPart);
    this.radicalCoefficient = parseRational(radicalCoefficient);
    this.radicand = parseRational(radicand);
    if (this.radicand.compare(0) <= 0) {
      throw new RangeError("A real quadratic surd needs a positive radicand.");
    }
    Object.freeze(this);
  }

  add(other) {
    const right = promoteSurd(other, this.radicand);
    assertMatchingRadicand(this, right);
    return new QuadraticSurd(
      this.rationalPart.add(right.rationalPart),
      this.radicalCoefficient.add(right.radicalCoefficient),
      this.radicand,
    );
  }

  subtract(other) {
    return this.add(scalarNegate(other));
  }

  multiply(other) {
    const right = promoteSurd(other, this.radicand);
    assertMatchingRadicand(this, right);
    const rationalPart = this.rationalPart
      .multiply(right.rationalPart)
      .add(
        this.radicalCoefficient
          .multiply(right.radicalCoefficient)
          .multiply(this.radicand),
      );
    const radicalCoefficient = this.rationalPart
      .multiply(right.radicalCoefficient)
      .add(this.radicalCoefficient.multiply(right.rationalPart));
    return new QuadraticSurd(
      rationalPart,
      radicalCoefficient,
      this.radicand,
    );
  }

  divide(other) {
    const right = promoteSurd(other, this.radicand);
    return this.multiply(right.reciprocal());
  }

  negate() {
    return new QuadraticSurd(
      this.rationalPart.negate(),
      this.radicalCoefficient.negate(),
      this.radicand,
    );
  }

  reciprocal() {
    const denominator = this.rationalPart
      .multiply(this.rationalPart)
      .subtract(
        this.radicalCoefficient
          .multiply(this.radicalCoefficient)
          .multiply(this.radicand),
      );
    if (denominator.isZero()) {
      throw new RangeError("This quadratic surd has no reciprocal.");
    }
    return new QuadraticSurd(
      this.rationalPart.divide(denominator),
      this.radicalCoefficient.negate().divide(denominator),
      this.radicand,
    );
  }

  isZero() {
    return this.rationalPart.isZero() && this.radicalCoefficient.isZero();
  }

  equals(other) {
    const right = promoteSurd(other, this.radicand);
    return (
      this.radicand.equals(right.radicand) &&
      this.rationalPart.equals(right.rationalPart) &&
      this.radicalCoefficient.equals(right.radicalCoefficient)
    );
  }

  toString() {
    if (this.radicalCoefficient.isZero()) return this.rationalPart.toString();

    const radical = `sqrt(${this.radicand.toString()})`;
    const coefficientMagnitude = this.radicalCoefficient.abs();
    const radicalTerm = coefficientMagnitude.isOne()
      ? radical
      : `${coefficientMagnitude.toString()}*${radical}`;

    if (this.rationalPart.isZero()) {
      return this.radicalCoefficient.isNegative()
        ? `-${radicalTerm}`
        : radicalTerm;
    }
    return this.radicalCoefficient.isNegative()
      ? `${this.rationalPart.toString()} - ${radicalTerm}`
      : `${this.rationalPart.toString()} + ${radicalTerm}`;
  }

  toDecimal(precision = 4, trimTrailingZeros = true) {
    assertPrecision(precision);
    const value =
      this.rationalPart.toNumber() +
      this.radicalCoefficient.toNumber() * Math.sqrt(this.radicand.toNumber());
    if (!Number.isFinite(value)) return this.toString();
    let output = value.toFixed(precision);
    if (trimTrailingZeros && output.includes(".")) {
      output = output.replace(/0+$/, "").replace(/\.$/, "");
    }
    return output === "-0" ? "0" : output;
  }

  toJSON() {
    return this.toString();
  }
}

function assertMatchingRadicand(left, right) {
  if (!left.radicand.equals(right.radicand)) {
    throw new TypeError("Cannot combine surds with different radicands.");
  }
}

function promoteSurd(value, radicand) {
  if (value instanceof QuadraticSurd) return value;
  return new QuadraticSurd(parseRational(value), Rational.zero, radicand);
}

function scalarAdd(left, right) {
  if (left instanceof QuadraticSurd) return left.add(right);
  if (right instanceof QuadraticSurd) return right.add(left);
  return parseRational(left).add(right);
}

function scalarSubtract(left, right) {
  if (left instanceof QuadraticSurd) return left.subtract(right);
  if (right instanceof QuadraticSurd) {
    return promoteSurd(left, right.radicand).subtract(right);
  }
  return parseRational(left).subtract(right);
}

function scalarMultiply(left, right) {
  if (left instanceof QuadraticSurd) return left.multiply(right);
  if (right instanceof QuadraticSurd) return right.multiply(left);
  return parseRational(left).multiply(right);
}

function scalarDivide(left, right) {
  if (left instanceof QuadraticSurd) return left.divide(right);
  if (right instanceof QuadraticSurd) {
    return promoteSurd(left, right.radicand).divide(right);
  }
  return parseRational(left).divide(right);
}

function scalarNegate(value) {
  return value instanceof QuadraticSurd
    ? value.negate()
    : parseRational(value).negate();
}

function scalarIsZero(value) {
  return value instanceof QuadraticSurd
    ? value.isZero()
    : parseRational(value).isZero();
}

function scalarToString(value) {
  return value instanceof QuadraticSurd
    ? value.toString()
    : parseRational(value).toString();
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function matrixShape(matrix) {
  return { rows: matrix.length, columns: matrix[0].length };
}

/** Parse and validate a non-empty rectangular matrix no larger than 6 by 6. */
export function matrixFromStrings(input) {
  if (!Array.isArray(input)) {
    throw new MatrixError("INVALID_MATRIX", "A matrix must be an array of rows.");
  }
  if (input.length === 0) {
    throw new MatrixError("EMPTY_MATRIX", "A matrix needs at least one row.");
  }
  if (input.length > MAX_MATRIX_SIZE) {
    throw new MatrixError(
      "MATRIX_TOO_LARGE",
      `Matrices can have at most ${MAX_MATRIX_SIZE} rows and columns.`,
      { rows: input.length },
    );
  }

  if (!Array.isArray(input[0]) || input[0].length === 0) {
    throw new MatrixError(
      "EMPTY_MATRIX",
      "Every matrix needs at least one column.",
    );
  }
  const columns = input[0].length;
  if (columns > MAX_MATRIX_SIZE) {
    throw new MatrixError(
      "MATRIX_TOO_LARGE",
      `Matrices can have at most ${MAX_MATRIX_SIZE} rows and columns.`,
      { columns },
    );
  }

  return input.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== columns) {
      throw new MatrixError(
        "RAGGED_MATRIX",
        "Every row in a matrix must have the same number of entries.",
        { row: rowIndex, expectedColumns: columns, actualColumns: row?.length },
      );
    }
    return row.map((value, columnIndex) => {
      try {
        return parseRational(value);
      } catch (error) {
        throw new MatrixError(
          "INVALID_ENTRY",
          `Entry in row ${rowIndex + 1}, column ${columnIndex + 1} is invalid: ${error.message}`,
          { row: rowIndex, column: columnIndex, value, cause: error },
        );
      }
    });
  });
}

function requireSameShape(left, right, operation) {
  const leftShape = matrixShape(left);
  const rightShape = matrixShape(right);
  if (
    leftShape.rows !== rightShape.rows ||
    leftShape.columns !== rightShape.columns
  ) {
    throw new MatrixError(
      "DIMENSION_MISMATCH",
      `${operation} needs matrices with matching dimensions; received ${leftShape.rows}×${leftShape.columns} and ${rightShape.rows}×${rightShape.columns}.`,
      { left: leftShape, right: rightShape },
    );
  }
}

function requireSquare(matrix, operation) {
  const shape = matrixShape(matrix);
  if (shape.rows !== shape.columns) {
    throw new MatrixError(
      "NON_SQUARE",
      `${operation} needs a square matrix; received ${shape.rows}×${shape.columns}.`,
      shape,
    );
  }
}

function subscript(value) {
  const digits = "₀₁₂₃₄₅₆₇₈₉";
  return String(value)
    .split("")
    .map((digit) => digits[Number(digit)])
    .join("");
}

/** Add equally sized matrices exactly. */
export function addMatrices(leftInput, rightInput) {
  const left = matrixFromStrings(leftInput);
  const right = matrixFromStrings(rightInput);
  requireSameShape(left, right, "Matrix addition");

  const steps = [];
  const matrix = left.map((row, rowIndex) =>
    row.map((value, columnIndex) => {
      const sum = value.add(right[rowIndex][columnIndex]);
      steps.push(
        `c${subscript(rowIndex + 1)}${subscript(columnIndex + 1)} = ${value.toString()} + ${right[rowIndex][columnIndex].toString()} = ${sum.toString()}`,
      );
      return sum;
    }),
  );
  return { matrix, steps };
}

/** Multiply compatible matrices exactly. */
export function multiplyMatrices(leftInput, rightInput) {
  const left = matrixFromStrings(leftInput);
  const right = matrixFromStrings(rightInput);
  const leftShape = matrixShape(left);
  const rightShape = matrixShape(right);
  if (leftShape.columns !== rightShape.rows) {
    throw new MatrixError(
      "DIMENSION_MISMATCH",
      `Matrix multiplication needs the first matrix’s columns (${leftShape.columns}) to match the second matrix’s rows (${rightShape.rows}).`,
      { left: leftShape, right: rightShape },
    );
  }

  const steps = [];
  const matrix = Array.from({ length: leftShape.rows }, (_, rowIndex) =>
    Array.from({ length: rightShape.columns }, (_, columnIndex) => {
      let sum = Rational.zero;
      const terms = [];
      for (let index = 0; index < leftShape.columns; index += 1) {
        const product = left[rowIndex][index].multiply(right[index][columnIndex]);
        sum = sum.add(product);
        terms.push(
          `(${left[rowIndex][index].toString()} × ${right[index][columnIndex].toString()})`,
        );
      }
      steps.push(
        `c${subscript(rowIndex + 1)}${subscript(columnIndex + 1)} = ${terms.join(" + ")} = ${sum.toString()}`,
      );
      return sum;
    }),
  );
  return { matrix, steps };
}

function rowScaleDescription(row, factor) {
  return `Scale R${row + 1} by ${factor.toString()}.`;
}

function rowEliminationDescription(targetRow, sourceRow, factor) {
  if (factor.isNegative()) {
    return `R${targetRow + 1} ← R${targetRow + 1} + ${factor.abs().toString()}R${sourceRow + 1}.`;
  }
  return `R${targetRow + 1} ← R${targetRow + 1} − ${factor.toString()}R${sourceRow + 1}.`;
}

function recordWork(steps, work, description, matrix) {
  steps.push(description);
  work.push({ description, matrix: cloneMatrix(matrix) });
}

/** Compute exact RREF, retaining readable row operations and matrix snapshots. */
export function rrefMatrix(input) {
  const matrix = matrixFromStrings(input);
  const { rows, columns } = matrixShape(matrix);
  const steps = [];
  const work = [
    { description: "Start with the original matrix.", matrix: cloneMatrix(matrix) },
  ];
  const pivotColumns = [];
  let pivotRow = 0;

  for (let column = 0; column < columns && pivotRow < rows; column += 1) {
    let candidate = pivotRow;
    while (candidate < rows && matrix[candidate][column].isZero()) candidate += 1;
    if (candidate === rows) continue;

    if (candidate !== pivotRow) {
      [matrix[candidate], matrix[pivotRow]] = [matrix[pivotRow], matrix[candidate]];
      recordWork(
        steps,
        work,
        `Swap R${pivotRow + 1} and R${candidate + 1}.`,
        matrix,
      );
    }

    const pivot = matrix[pivotRow][column];
    if (!pivot.isOne()) {
      const scale = pivot.reciprocal();
      matrix[pivotRow] = matrix[pivotRow].map((entry) =>
        entry.multiply(scale),
      );
      recordWork(steps, work, rowScaleDescription(pivotRow, scale), matrix);
    }

    for (let row = 0; row < rows; row += 1) {
      if (row === pivotRow || matrix[row][column].isZero()) continue;
      const factor = matrix[row][column];
      matrix[row] = matrix[row].map((entry, entryColumn) =>
        entry.subtract(matrix[pivotRow][entryColumn].multiply(factor)),
      );
      recordWork(
        steps,
        work,
        rowEliminationDescription(row, pivotRow, factor),
        matrix,
      );
    }

    pivotColumns.push(column);
    pivotRow += 1;
  }

  if (steps.length === 0) {
    steps.push("The matrix is already in reduced row echelon form.");
  }

  return {
    matrix,
    steps,
    work,
    rank: pivotColumns.length,
    pivotColumns,
  };
}

function identityMatrix(size) {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) =>
      row === column ? Rational.one : Rational.zero,
    ),
  );
}

/** Compute an exact inverse via an augmented matrix and retain every row step. */
export function inverseMatrix(input) {
  const source = matrixFromStrings(input);
  requireSquare(source, "Matrix inversion");
  const size = source.length;
  const augmented = source.map((row, rowIndex) => [
    ...row,
    ...identityMatrix(size)[rowIndex],
  ]);
  const steps = [];
  const work = [
    {
      description: "Augment the matrix with the identity matrix [A | I].",
      matrix: cloneMatrix(augmented),
    },
  ];

  for (let column = 0; column < size; column += 1) {
    let candidate = column;
    while (candidate < size && augmented[candidate][column].isZero()) {
      candidate += 1;
    }
    if (candidate === size) {
      throw new MatrixError(
        "SINGULAR",
        "This matrix is singular, so it does not have an inverse.",
        { steps, work },
      );
    }

    if (candidate !== column) {
      [augmented[candidate], augmented[column]] = [
        augmented[column],
        augmented[candidate],
      ];
      recordWork(
        steps,
        work,
        `Swap R${column + 1} and R${candidate + 1}.`,
        augmented,
      );
    }

    const pivot = augmented[column][column];
    if (!pivot.isOne()) {
      const scale = pivot.reciprocal();
      augmented[column] = augmented[column].map((entry) =>
        entry.multiply(scale),
      );
      recordWork(steps, work, rowScaleDescription(column, scale), augmented);
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column || augmented[row][column].isZero()) continue;
      const factor = augmented[row][column];
      augmented[row] = augmented[row].map((entry, entryColumn) =>
        entry.subtract(augmented[column][entryColumn].multiply(factor)),
      );
      recordWork(
        steps,
        work,
        rowEliminationDescription(row, column, factor),
        augmented,
      );
    }
  }

  const matrix = augmented.map((row) => row.slice(size));
  steps.push("The left side is I, so the right side is A⁻¹.");
  return { matrix, steps, work };
}

/** Compute the exact determinant of a square matrix. */
export function determinant(input) {
  const matrix = matrixFromStrings(input);
  requireSquare(matrix, "A determinant");
  const size = matrix.length;
  let result = Rational.one;
  let sign = Rational.one;

  for (let column = 0; column < size; column += 1) {
    let candidate = column;
    while (candidate < size && matrix[candidate][column].isZero()) candidate += 1;
    if (candidate === size) return Rational.zero;

    if (candidate !== column) {
      [matrix[candidate], matrix[column]] = [matrix[column], matrix[candidate]];
      sign = sign.negate();
    }

    const pivot = matrix[column][column];
    result = result.multiply(pivot);
    for (let row = column + 1; row < size; row += 1) {
      if (matrix[row][column].isZero()) continue;
      const factor = matrix[row][column].divide(pivot);
      for (let entryColumn = column; entryColumn < size; entryColumn += 1) {
        matrix[row][entryColumn] = matrix[row][entryColumn].subtract(
          matrix[column][entryColumn].multiply(factor),
        );
      }
    }
  }

  return result.multiply(sign);
}

function scalarMatrixInverse2x2(matrix) {
  const det = scalarSubtract(
    scalarMultiply(matrix[0][0], matrix[1][1]),
    scalarMultiply(matrix[0][1], matrix[1][0]),
  );
  if (scalarIsZero(det)) {
    throw new MatrixError(
      "NOT_DIAGONALIZABLE",
      "Independent eigenvectors could not be constructed for this matrix.",
    );
  }
  return [
    [scalarDivide(matrix[1][1], det), scalarDivide(scalarNegate(matrix[0][1]), det)],
    [scalarDivide(scalarNegate(matrix[1][0]), det), scalarDivide(matrix[0][0], det)],
  ];
}

function eigenvectorFor(matrix, eigenvalue) {
  const [[a, b], [c, d]] = matrix;
  if (!b.isZero()) {
    return [b, scalarSubtract(eigenvalue, a)];
  }
  if (!c.isZero()) {
    return [scalarSubtract(eigenvalue, d), c];
  }
  if (scalarSubtract(eigenvalue, a).isZero?.()) return [Rational.one, Rational.zero];
  return [Rational.zero, Rational.one];
}

/**
 * Diagonalize a real 2×2 rational matrix.
 *
 * Distinct irrational eigenvalues are represented exactly as QuadraticSurd
 * values. Repeated non-scalar matrices and matrices with complex eigenvalues
 * throw clear MatrixError instances.
 */
export function diagonalize2x2(input) {
  const matrix = matrixFromStrings(input);
  const shape = matrixShape(matrix);
  if (shape.rows !== 2 || shape.columns !== 2) {
    throw new MatrixError(
      "INVALID_DIMENSION",
      `Diagonalization in this lesson supports 2×2 matrices; received ${shape.rows}×${shape.columns}.`,
      shape,
    );
  }

  const [[a, b], [c, d]] = matrix;
  const trace = a.add(d);
  const det = a.multiply(d).subtract(b.multiply(c));
  const discriminant = trace.multiply(trace).subtract(det.multiply(4));
  const steps = [
    `The characteristic polynomial is λ² − (${trace.toString()})λ + (${det.toString()}).`,
    `Its discriminant is Δ = ${discriminant.toString()}.`,
  ];

  if (discriminant.isNegative()) {
    throw new MatrixError(
      "COMPLEX_EIGENVALUES",
      "This matrix has complex eigenvalues, so it cannot be diagonalized over the real numbers.",
      { trace, determinant: det, discriminant, steps },
    );
  }

  if (discriminant.isZero()) {
    const eigenvalue = trace.divide(2);
    if (!b.isZero() || !c.isZero() || !a.equals(d)) {
      throw new MatrixError(
        "NOT_DIAGONALIZABLE",
        "This matrix has one repeated eigenvalue but not two independent eigenvectors.",
        {
          eigenvalue,
          discriminant,
          algebraicMultiplicity: 2,
          geometricMultiplicity: 1,
          steps,
        },
      );
    }
    const identity = identityMatrix(2);
    steps.push(
      `The repeated eigenvalue is λ = ${eigenvalue.toString()}.`,
      "The matrix is already a scalar diagonal matrix, so the standard basis is an eigenbasis.",
    );
    return {
      P: identity,
      D: cloneMatrix(matrix),
      Pinv: identityMatrix(2),
      eigenvalues: [eigenvalue, eigenvalue],
      kind: "repeated",
      steps,
    };
  }

  if (b.isZero() && c.isZero()) {
    const identity = identityMatrix(2);
    steps.push(
      `The eigenvalues are the diagonal entries λ₁ = ${a.toString()} and λ₂ = ${d.toString()}.`,
      "The standard basis is already an eigenbasis, so P = I and D = A.",
    );
    return {
      P: identity,
      D: cloneMatrix(matrix),
      Pinv: identityMatrix(2),
      eigenvalues: [a, d],
      kind: "rational",
      steps,
    };
  }

  const squareRoot = perfectRationalSquareRoot(discriminant);
  let lambdaOne;
  let lambdaTwo;
  let kind;
  if (squareRoot) {
    lambdaOne = trace.add(squareRoot).divide(2);
    lambdaTwo = trace.subtract(squareRoot).divide(2);
    kind = "rational";
  } else {
    lambdaOne = new QuadraticSurd(
      trace.divide(2),
      new Rational(1n, 2n),
      discriminant,
    );
    lambdaTwo = new QuadraticSurd(
      trace.divide(2),
      new Rational(-1n, 2n),
      discriminant,
    );
    kind = "surd";
  }

  const firstVector = eigenvectorFor(matrix, lambdaOne);
  const secondVector = eigenvectorFor(matrix, lambdaTwo);
  const P = [
    [firstVector[0], secondVector[0]],
    [firstVector[1], secondVector[1]],
  ];
  const D = [
    [lambdaOne, Rational.zero],
    [Rational.zero, lambdaTwo],
  ];
  const Pinv = scalarMatrixInverse2x2(P);
  steps.push(
    `The eigenvalues are λ₁ = ${scalarToString(lambdaOne)} and λ₂ = ${scalarToString(lambdaTwo)}.`,
    `Choose eigenvectors v₁ = (${firstVector.map(scalarToString).join(", ")}) and v₂ = (${secondVector.map(scalarToString).join(", ")}).`,
    "Put the eigenvectors into the columns of P; then A = PDP⁻¹.",
  );

  return {
    P,
    D,
    Pinv,
    eigenvalues: [lambdaOne, lambdaTwo],
    kind,
    steps,
  };
}

function scalarApproximateNumber(value) {
  if (value instanceof QuadraticSurd) {
    return (
      value.rationalPart.toNumber() +
      value.radicalCoefficient.toNumber() * Math.sqrt(value.radicand.toNumber())
    );
  }
  return parseRational(value).toNumber();
}

function normalizedLineDirection(exactVector) {
  const numeric = exactVector.map(scalarApproximateNumber);
  if (numeric.some((entry) => !Number.isFinite(entry))) {
    throw new MatrixError(
      "NUMERIC_RANGE",
      "This eigenvector is too large to draw reliably.",
    );
  }
  const length = Math.hypot(...numeric);
  if (!Number.isFinite(length) || length === 0) {
    throw new MatrixError(
      "INTERNAL_CALCULATION_ERROR",
      "A nonzero eigenvector direction could not be constructed.",
    );
  }

  let vector = numeric.map((entry) => entry / length);
  const anchor = Math.abs(vector[0]) >= Math.abs(vector[1]) ? 0 : 1;
  if (vector[anchor] < 0) vector = vector.map((entry) => -entry);
  return vector.map(stableNumericValue);
}

function eigenDirectionRecord(eigenvalue, exactVector) {
  const exactVectorLabels = exactVector.map(scalarToString);
  return {
    eigenvalue,
    eigenvalueLabel: scalarToString(eigenvalue),
    eigenvalueApprox: stableNumericValue(scalarApproximateNumber(eigenvalue)),
    vector: normalizedLineDirection(exactVector),
    exactVector: exactVectorLabels,
    vectorLabel: `(${exactVectorLabels.join(", ")})`,
  };
}

function complexEigenvalueLabels(trace, discriminant) {
  const realPart = trace.divide(2);
  const positiveMagnitude = discriminant.negate();
  const rationalRoot = perfectRationalSquareRoot(positiveMagnitude);
  let imaginaryTerm;
  if (rationalRoot) {
    const coefficient = rationalRoot.divide(2);
    imaginaryTerm = coefficient.isOne() ? "i" : `${coefficient.toString()}i`;
  } else {
    imaginaryTerm = `1/2*sqrt(${positiveMagnitude.toString()})i`;
  }

  if (realPart.isZero()) return [imaginaryTerm, `-${imaginaryTerm}`];
  return [
    `${realPart.toString()} + ${imaginaryTerm}`,
    `${realPart.toString()} - ${imaginaryTerm}`,
  ];
}

/**
 * Analyze the real invariant line directions of a rational 2×2 matrix.
 *
 * Exact values and labels are retained for instruction, while each drawable
 * direction is a deterministically signed numeric unit vector. Because a line
 * has no inherent arrow direction, the component with the largest magnitude is
 * always made nonnegative to keep redraws and saved-workspace replays stable.
 */
export function analyzeEigenDirections2x2(input) {
  const matrix = matrixFromStrings(input);
  const shape = matrixShape(matrix);
  if (shape.rows !== 2 || shape.columns !== 2) {
    throw new MatrixError(
      "INVALID_DIMENSION",
      `The eigenvector explorer needs a 2×2 matrix; received ${shape.rows}×${shape.columns}.`,
      shape,
    );
  }

  const [[a, b], [c, d]] = matrix;
  const trace = a.add(d);
  const det = a.multiply(d).subtract(b.multiply(c));
  const discriminant = trace.multiply(trace).subtract(det.multiply(4));
  const shared = { trace, determinant: det, discriminant };

  if (discriminant.isNegative()) {
    const eigenvalueLabels = complexEigenvalueLabels(trace, discriminant);
    return {
      ...shared,
      kind: "complex",
      directions: [],
      eigenvalues: [],
      eigenvalueLabels,
      hasRealEigenlines: false,
      allDirectionsInvariant: false,
      explanation: `The eigenvalues ${eigenvalueLabels.join(" and ")} are complex, so there are no real eigenlines to draw.`,
    };
  }

  if (discriminant.isZero()) {
    const eigenvalue = trace.divide(2);
    if (b.isZero() && c.isZero() && a.equals(d)) {
      return {
        ...shared,
        kind: "scalar",
        directions: [],
        eigenvalues: [eigenvalue],
        eigenvalueLabels: [eigenvalue.toString()],
        eigenvalueApprox: stableNumericValue(eigenvalue.toNumber()),
        hasRealEigenlines: true,
        allDirectionsInvariant: true,
        explanation: `This is a scalar matrix: every vector is scaled by ${eigenvalue.toString()}, so every line through the origin is invariant.`,
      };
    }

    const exactVector = eigenvectorFor(matrix, eigenvalue);
    const direction = eigenDirectionRecord(eigenvalue, exactVector);
    return {
      ...shared,
      kind: "defective",
      directions: [direction],
      eigenvalues: [eigenvalue],
      eigenvalueLabels: [direction.eigenvalueLabel],
      hasRealEigenlines: true,
      allDirectionsInvariant: false,
      explanation: `The repeated eigenvalue λ = ${eigenvalue.toString()} has only one independent eigenvector direction, so this matrix has one real eigenline and is not diagonalizable.`,
    };
  }

  const diagonalization = diagonalize2x2(matrix);
  const directions = diagonalization.eigenvalues.map((eigenvalue, column) =>
    eigenDirectionRecord(eigenvalue, [
      diagonalization.P[0][column],
      diagonalization.P[1][column],
    ]),
  );
  return {
    ...shared,
    kind: "distinct-real",
    directions,
    eigenvalues: diagonalization.eigenvalues,
    eigenvalueLabels: directions.map((direction) => direction.eigenvalueLabel),
    hasRealEigenlines: true,
    allDirectionsInvariant: false,
    explanation:
      "Two distinct real eigenvalues give two invariant lines. Vectors starting on either line remain on that line after the transformation.",
  };
}

function multiplyRationalMatrices(left, right) {
  return Array.from({ length: left.length }, (_, row) =>
    Array.from({ length: right[0].length }, (_, column) => {
      let value = Rational.zero;
      for (let index = 0; index < right.length; index += 1) {
        value = value.add(left[row][index].multiply(right[index][column]));
      }
      return value;
    }),
  );
}

/** Return the monic characteristic-polynomial coefficients, highest power first. */
function characteristicPolynomial(matrix) {
  const size = matrix.length;
  const coefficients = [Rational.one];
  let auxiliary = identityMatrix(size);

  // Faddeev-LeVerrier keeps every coefficient exact and is small at n <= 6.
  for (let order = 1; order <= size; order += 1) {
    const product = multiplyRationalMatrices(matrix, auxiliary);
    let trace = Rational.zero;
    for (let diagonal = 0; diagonal < size; diagonal += 1) {
      trace = trace.add(product[diagonal][diagonal]);
    }
    const coefficient = trace.negate().divide(order);
    coefficients.push(coefficient);
    auxiliary = product.map((row, rowIndex) =>
      row.map((entry, columnIndex) =>
        rowIndex === columnIndex ? entry.add(coefficient) : entry,
      ),
    );
  }

  return coefficients;
}

function bigintLcm(left, right) {
  const a = bigintAbs(left);
  const b = bigintAbs(right);
  if (a === 0n || b === 0n) return 0n;
  return (a / bigintGcd(a, b)) * b;
}

function primitiveIntegerCoefficients(coefficients) {
  let commonDenominator = 1n;
  for (const coefficient of coefficients) {
    commonDenominator = bigintLcm(
      commonDenominator,
      coefficient.denominator,
    );
  }
  let integers = coefficients.map(
    (coefficient) =>
      coefficient.numerator * (commonDenominator / coefficient.denominator),
  );
  let divisor = 0n;
  for (const integer of integers) divisor = bigintGcd(divisor, integer);
  if (divisor > 1n) integers = integers.map((integer) => integer / divisor);
  if (integers[0] < 0n) integers = integers.map((integer) => -integer);
  return integers;
}

function positiveDivisors(value) {
  const target = bigintAbs(value);
  if (target === 0n) return [];
  const small = [];
  const large = [];
  const root = integerSquareRoot(target);
  if (root > MAX_DIVISOR_SEARCH_ROOT) {
    throw new MatrixError(
      "RATIONAL_ROOT_SEARCH_LIMIT",
      "The exact rational eigenvalue search would require too many factor candidates.",
      { integerMagnitude: target.toString() },
    );
  }
  for (let candidate = 1n; candidate <= root; candidate += 1n) {
    if (target % candidate !== 0n) continue;
    small.push(candidate);
    const partner = target / candidate;
    if (partner !== candidate) large.push(partner);
  }
  large.reverse();
  return [...small, ...large];
}

function evaluatePolynomial(coefficients, value) {
  let result = coefficients[0];
  for (let index = 1; index < coefficients.length; index += 1) {
    result = result.multiply(value).add(coefficients[index]);
  }
  return result;
}

function syntheticDivide(coefficients, root) {
  const quotient = [coefficients[0]];
  for (let index = 1; index < coefficients.length - 1; index += 1) {
    quotient.push(
      coefficients[index].add(quotient.at(-1).multiply(root)),
    );
  }
  const remainder = coefficients.at(-1).add(quotient.at(-1).multiply(root));
  if (!remainder.isZero()) {
    throw new MatrixError(
      "INTERNAL_CALCULATION_ERROR",
      "An exact eigenvalue did not divide the characteristic polynomial.",
    );
  }
  return quotient;
}

function rationalRootCandidates(coefficients) {
  const integers = primitiveIntegerCoefficients(coefficients);
  const numeratorDivisors = positiveDivisors(integers.at(-1));
  const denominatorDivisors = positiveDivisors(integers[0]);
  const unique = new Map();

  for (const numerator of numeratorDivisors) {
    for (const denominator of denominatorDivisors) {
      const positive = new Rational(numerator, denominator);
      unique.set(positive.toString(), positive);
      const negative = positive.negate();
      unique.set(negative.toString(), negative);
    }
  }
  return [...unique.values()].sort((left, right) => left.compare(right));
}

function factorRationalRoots(coefficients) {
  const roots = [];
  let remaining = [...coefficients];

  while (remaining.length > 1) {
    if (remaining.at(-1).isZero()) {
      const root = Rational.zero;
      roots.push(root);
      remaining = syntheticDivide(remaining, root);
      continue;
    }

    const root = rationalRootCandidates(remaining).find((candidate) =>
      evaluatePolynomial(remaining, candidate).isZero(),
    );
    if (!root) break;
    roots.push(root);
    remaining = syntheticDivide(remaining, root);
  }

  return { roots, remaining };
}

function superscript(value) {
  const digits = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  return String(value)
    .split("")
    .map((digit) => digits[Number(digit)])
    .join("");
}

function formatPolynomial(coefficients) {
  const degree = coefficients.length - 1;
  const terms = [];
  for (let index = 0; index < coefficients.length; index += 1) {
    const coefficient = coefficients[index];
    if (coefficient.isZero()) continue;
    const power = degree - index;
    const magnitude = coefficient.abs();
    let body;
    if (power === 0) {
      body = magnitude.toString();
    } else {
      const variable = power === 1 ? "λ" : `λ${superscript(power)}`;
      body = magnitude.isOne()
        ? variable
        : `${magnitude.toString()}${variable}`;
    }

    if (terms.length === 0) {
      terms.push(coefficient.isNegative() ? `−${body}` : body);
    } else {
      terms.push(coefficient.isNegative() ? `− ${body}` : `+ ${body}`);
    }
  }
  return terms.join(" ") || "0";
}

function isDiagonalMatrix(matrix) {
  return matrix.every((row, rowIndex) =>
    row.every(
      (entry, columnIndex) =>
        rowIndex === columnIndex || entry.isZero(),
    ),
  );
}

function isTriangularMatrix(matrix) {
  let upper = true;
  let lower = true;
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column < matrix.length; column += 1) {
      if (row > column && !matrix[row][column].isZero()) upper = false;
      if (row < column && !matrix[row][column].isZero()) lower = false;
    }
  }
  return upper || lower;
}

function isSymmetricMatrix(matrix) {
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = row + 1; column < matrix.length; column += 1) {
      if (!matrix[row][column].equals(matrix[column][row])) return false;
    }
  }
  return true;
}

function stableNumericValue(value) {
  if (!Number.isFinite(value)) {
    throw new MatrixError(
      "NUMERIC_RANGE",
      "These entries are too large for a stable numerical eigendecomposition.",
    );
  }
  if (value === 0) return 0;
  const rounded = Number(value.toPrecision(14));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function largestOffDiagonalEntry(matrix) {
  let row = 0;
  let column = 1;
  let magnitude = 0;
  for (let candidateRow = 0; candidateRow < matrix.length; candidateRow += 1) {
    for (
      let candidateColumn = candidateRow + 1;
      candidateColumn < matrix.length;
      candidateColumn += 1
    ) {
      const candidateMagnitude = Math.abs(
        matrix[candidateRow][candidateColumn],
      );
      if (candidateMagnitude > magnitude) {
        magnitude = candidateMagnitude;
        row = candidateRow;
        column = candidateColumn;
      }
    }
  }
  return { row, column, magnitude };
}

/** Jacobi rotations for a small real symmetric numeric matrix. */
function jacobiSymmetricEigendecomposition(source) {
  const size = source.length;
  const matrix = source.map((row) => [...row]);
  const eigenvectors = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => (row === column ? 1 : 0)),
  );
  const scale = Math.max(
    ...matrix.flatMap((row) => row.map((entry) => Math.abs(entry))),
  );
  const tolerance = Math.max(
    Number.MIN_VALUE,
    Number.EPSILON * scale * size * 64,
  );
  const maximumRotations = 100 * size * size;
  let rotations = 0;

  for (; rotations < maximumRotations; rotations += 1) {
    const largest = largestOffDiagonalEntry(matrix);
    if (largest.magnitude <= tolerance) break;

    const { row: pivotRow, column: pivotColumn } = largest;
    const diagonalRow = matrix[pivotRow][pivotRow];
    const diagonalColumn = matrix[pivotColumn][pivotColumn];
    const offDiagonal = matrix[pivotRow][pivotColumn];
    const angle = 0.5 * Math.atan2(
      2 * offDiagonal,
      diagonalColumn - diagonalRow,
    );
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);

    for (let index = 0; index < size; index += 1) {
      if (index === pivotRow || index === pivotColumn) continue;
      const rowValue = matrix[index][pivotRow];
      const columnValue = matrix[index][pivotColumn];
      const nextRowValue = cosine * rowValue - sine * columnValue;
      const nextColumnValue = sine * rowValue + cosine * columnValue;
      matrix[index][pivotRow] = nextRowValue;
      matrix[pivotRow][index] = nextRowValue;
      matrix[index][pivotColumn] = nextColumnValue;
      matrix[pivotColumn][index] = nextColumnValue;
    }

    matrix[pivotRow][pivotRow] =
      cosine * cosine * diagonalRow -
      2 * sine * cosine * offDiagonal +
      sine * sine * diagonalColumn;
    matrix[pivotColumn][pivotColumn] =
      sine * sine * diagonalRow +
      2 * sine * cosine * offDiagonal +
      cosine * cosine * diagonalColumn;
    matrix[pivotRow][pivotColumn] = 0;
    matrix[pivotColumn][pivotRow] = 0;

    for (let index = 0; index < size; index += 1) {
      const rowVectorValue = eigenvectors[index][pivotRow];
      const columnVectorValue = eigenvectors[index][pivotColumn];
      eigenvectors[index][pivotRow] =
        cosine * rowVectorValue - sine * columnVectorValue;
      eigenvectors[index][pivotColumn] =
        sine * rowVectorValue + cosine * columnVectorValue;
    }
  }

  const finalOffDiagonal = largestOffDiagonalEntry(matrix).magnitude;
  if (finalOffDiagonal > tolerance * 4) {
    throw new MatrixError(
      "NUMERIC_CONVERGENCE",
      "The symmetric eigendecomposition did not converge to a stable classroom result.",
      { rotations, tolerance, finalOffDiagonal },
    );
  }

  const pairs = Array.from({ length: size }, (_, column) => ({
    value: matrix[column][column],
    vector: eigenvectors.map((row) => row[column]),
    originalColumn: column,
  })).sort(
    (left, right) =>
      left.value - right.value || left.originalColumn - right.originalColumn,
  );

  // Eigenvector signs are arbitrary. Normalize them deterministically so saved
  // calculations render the same values on every replay and browser.
  for (const pair of pairs) {
    const norm = Math.hypot(...pair.vector);
    pair.vector = pair.vector.map((entry) => entry / norm);
    let anchor = 0;
    for (let index = 1; index < pair.vector.length; index += 1) {
      if (Math.abs(pair.vector[index]) > Math.abs(pair.vector[anchor])) {
        anchor = index;
      }
    }
    if (pair.vector[anchor] < 0) {
      pair.vector = pair.vector.map((entry) => -entry);
    }
  }

  return {
    eigenvalues: pairs.map((pair) => stableNumericValue(pair.value)),
    P: Array.from({ length: size }, (_, row) =>
      pairs.map((pair) => stableNumericValue(pair.vector[row])),
    ),
    rotations,
    tolerance,
    finalOffDiagonal,
  };
}

function diagonalizeSymmetricNumerically(
  matrix,
  polynomial,
  priorSteps,
  rationalEigenvalues,
) {
  const numeric = matrix.map((row) =>
    row.map((entry) => stableNumericValue(entry.toNumber())),
  );
  const decomposition = jacobiSymmetricEigendecomposition(numeric);
  const size = matrix.length;
  const D = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) =>
      row === column ? decomposition.eigenvalues[row] : 0,
    ),
  );
  const Pinv = Array.from({ length: size }, (_, row) =>
    Array.from(
      { length: size },
      (_, column) => decomposition.P[column][row],
    ),
  );
  const steps = [
    ...priorSteps,
    rationalEigenvalues.length
      ? `Exact factoring finds ${rationalEigenvalues.map((value) => value.toString()).join(", ")}, but the remaining eigenvalues are irrational.`
      : "The characteristic polynomial does not split completely into rational factors.",
    "Because the matrix is real and symmetric, the spectral theorem guarantees a complete orthonormal eigenbasis.",
    `Apply Jacobi plane rotations until the largest off-diagonal entry is approximately ${decomposition.finalOffDiagonal.toExponential(2)} (${decomposition.rotations} rotations).`,
    `The approximate eigenvalues are ${decomposition.eigenvalues.join(", ")}.`,
    "The columns of P are orthonormal approximate eigenvectors, so P⁻¹ = Pᵀ (up to rounding).",
  ];

  return {
    P: decomposition.P,
    D,
    Pinv,
    eigenvalues: decomposition.eigenvalues,
    kind: "numeric-symmetric",
    approximate: true,
    steps,
    characteristicPolynomial: polynomial,
    numericDetails: {
      method: "jacobi",
      rotations: decomposition.rotations,
      tolerance: decomposition.tolerance,
      finalOffDiagonal: decomposition.finalOffDiagonal,
    },
  };
}

function nullSpaceBasis(matrix) {
  const reduced = rrefMatrix(matrix);
  const columns = matrix[0].length;
  const pivotSet = new Set(reduced.pivotColumns);
  const freeColumns = Array.from({ length: columns }, (_, index) => index).filter(
    (column) => !pivotSet.has(column),
  );

  return freeColumns.map((freeColumn) => {
    const vector = Array.from({ length: columns }, () => Rational.zero);
    vector[freeColumn] = Rational.one;
    for (let row = 0; row < reduced.pivotColumns.length; row += 1) {
      const pivotColumn = reduced.pivotColumns[row];
      vector[pivotColumn] = reduced.matrix[row][freeColumn].negate();
    }
    return vector;
  });
}

function eigenvalueGroups(eigenvalues) {
  const groups = [];
  for (const eigenvalue of eigenvalues) {
    const existing = groups.find((group) => group.value.equals(eigenvalue));
    if (existing) {
      existing.multiplicity += 1;
    } else {
      groups.push({ value: eigenvalue, multiplicity: 1 });
    }
  }
  return groups;
}

function shiftedMatrix(matrix, eigenvalue) {
  return matrix.map((row, rowIndex) =>
    row.map((entry, columnIndex) =>
      rowIndex === columnIndex ? entry.subtract(eigenvalue) : entry,
    ),
  );
}

function unsupportedSpectrumError(remaining, details) {
  if (remaining.length === 3) {
    const [a, b, c] = remaining;
    const discriminant = b.multiply(b).subtract(a.multiply(c).multiply(4));
    if (discriminant.isNegative()) {
      return new MatrixError(
        "COMPLEX_EIGENVALUES",
        "This matrix has complex eigenvalues, so it cannot be diagonalized over the real numbers.",
        { ...details, remainingPolynomial: remaining, discriminant },
      );
    }
    return new MatrixError(
      "UNSUPPORTED_IRRATIONAL_EIGENVALUES",
      "This matrix has real irrational eigenvalues. Exact surd diagonalization is currently supported for 2×2 matrices only.",
      { ...details, remainingPolynomial: remaining, discriminant },
    );
  }

  return new MatrixError(
    "UNSUPPORTED_EIGENVALUES",
    "The characteristic polynomial does not split into rational linear factors. Its remaining eigenvalues are irrational or complex, which are not supported for matrices larger than 2×2.",
    { ...details, remainingPolynomial: remaining },
  );
}

/**
 * Diagonalize a 1×1–6×6 rational matrix over the reals.
 *
 * The exact 2×2 implementation retains quadratic-surd support. For larger
 * matrices, the characteristic polynomial must split completely over the
 * rationals and the matrix must provide a full independent eigenbasis.
 */
export function diagonalizeMatrix(input) {
  const matrix = matrixFromStrings(input);
  requireSquare(matrix, "Diagonalization");
  const size = matrix.length;
  const polynomial = characteristicPolynomial(matrix);

  if (size === 1) {
    const identity = identityMatrix(1);
    const eigenvalue = matrix[0][0];
    return {
      P: identity,
      D: cloneMatrix(matrix),
      Pinv: identityMatrix(1),
      eigenvalues: [eigenvalue],
      kind: "rational",
      steps: [
        `The characteristic polynomial is ${formatPolynomial(polynomial)}.`,
        `The eigenvalue is λ = ${eigenvalue.toString()}, and every nonzero one-dimensional vector is an eigenvector.`,
      ],
      characteristicPolynomial: polynomial,
    };
  }

  // Preserve the basis students already see. Previously a distinct diagonal
  // 2×2 matrix went through the quadratic-formula path, which returned a valid
  // but needlessly swapped D and a permutation P. This canonical result is also
  // consistent with the larger-matrix path and saved-workspace replays.
  if (isDiagonalMatrix(matrix)) {
    const eigenvalues = matrix.map((row, index) => row[index]);
    const identity = identityMatrix(size);
    return {
      P: identity,
      D: cloneMatrix(matrix),
      Pinv: identityMatrix(size),
      eigenvalues,
      kind:
        size === 2 && eigenvalues[0].equals(eigenvalues[1])
          ? "repeated"
          : "rational",
      steps: [
        `The characteristic polynomial is ${formatPolynomial(polynomial)}.`,
        "The matrix is already diagonal, so the standard basis supplies a complete eigenbasis.",
      ],
      characteristicPolynomial: polynomial,
    };
  }

  if (size === 2) {
    return {
      ...diagonalize2x2(matrix),
      characteristicPolynomial: polynomial,
    };
  }

  const steps = [
    `The characteristic polynomial is ${formatPolynomial(polynomial)}.`,
  ];

  let eigenvalues;
  if (isTriangularMatrix(matrix)) {
    eigenvalues = matrix.map((row, index) => row[index]);
    steps.push(
      `Because the matrix is triangular, its eigenvalues are its diagonal entries: ${eigenvalues.map((value) => value.toString()).join(", ")}.`,
    );
  } else {
    let factorization;
    try {
      factorization = factorRationalRoots(polynomial);
    } catch (error) {
      if (
        error instanceof MatrixError &&
        error.code === "RATIONAL_ROOT_SEARCH_LIMIT"
      ) {
        if (isSymmetricMatrix(matrix)) {
          return diagonalizeSymmetricNumerically(
            matrix,
            polynomial,
            steps,
            [],
          );
        }
        throw new MatrixError(
          "COMPUTATION_LIMIT",
          "The exact eigenvalue candidates are too large to factor safely. Try equivalent smaller entries or a symmetric matrix.",
          { characteristicPolynomial: polynomial, cause: error, steps },
        );
      }
      throw error;
    }
    if (factorization.remaining.length > 1) {
      if (isSymmetricMatrix(matrix)) {
        return diagonalizeSymmetricNumerically(
          matrix,
          polynomial,
          steps,
          factorization.roots,
        );
      }
      throw unsupportedSpectrumError(factorization.remaining, {
        characteristicPolynomial: polynomial,
        rationalEigenvalues: factorization.roots,
        steps,
      });
    }
    eigenvalues = factorization.roots;
    steps.push(
      `Factoring over the rationals gives eigenvalues ${eigenvalues.map((value) => value.toString()).join(", ")}.`,
    );
  }

  const vectors = [];
  const orderedEigenvalues = [];
  for (const group of eigenvalueGroups(eigenvalues)) {
    const basis = nullSpaceBasis(shiftedMatrix(matrix, group.value));
    if (basis.length < group.multiplicity) {
      throw new MatrixError(
        "NOT_DIAGONALIZABLE",
        `The eigenvalue λ = ${group.value.toString()} has algebraic multiplicity ${group.multiplicity}, but its eigenspace has dimension ${basis.length}. A full eigenbasis does not exist.`,
        {
          eigenvalue: group.value,
          algebraicMultiplicity: group.multiplicity,
          geometricMultiplicity: basis.length,
          characteristicPolynomial: polynomial,
          steps,
        },
      );
    }
    const selected = basis.slice(0, group.multiplicity);
    vectors.push(...selected);
    orderedEigenvalues.push(
      ...Array.from({ length: group.multiplicity }, () => group.value),
    );
    steps.push(
      `For λ = ${group.value.toString()}, a basis for the eigenspace is ${selected
        .map((vector) => `(${vector.map((entry) => entry.toString()).join(", ")})`)
        .join(", ")}.`,
    );
  }

  if (vectors.length !== size) {
    throw new MatrixError(
      "NOT_DIAGONALIZABLE",
      `Only ${vectors.length} independent eigenvectors were found, but a ${size}×${size} matrix needs ${size}.`,
      { characteristicPolynomial: polynomial, steps },
    );
  }

  const P = Array.from({ length: size }, (_, row) =>
    vectors.map((vector) => vector[row]),
  );
  const D = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) =>
      row === column ? orderedEigenvalues[row] : Rational.zero,
    ),
  );
  const Pinv = inverseMatrix(P).matrix;
  steps.push("Place those eigenvectors in the columns of P; then A = PDP⁻¹.");

  return {
    P,
    D,
    Pinv,
    eigenvalues: orderedEigenvalues,
    kind: "rational",
    steps,
    characteristicPolynomial: polynomial,
  };
}

/** Format a Rational/QuadraticSurd matrix for exact or rounded display. */
export function formatMatrix(matrix, options = {}) {
  const { mode = "exact", precision = 4, trimTrailingZeros = true } = options;
  if (mode !== "exact" && mode !== "decimal") {
    throw new TypeError('Matrix format mode must be either "exact" or "decimal".');
  }
  assertPrecision(precision);
  if (!Array.isArray(matrix)) {
    throw new MatrixError("INVALID_MATRIX", "A matrix must be an array of rows.");
  }

  return matrix.map((row, rowIndex) => {
    if (!Array.isArray(row)) {
      throw new MatrixError(
        "INVALID_MATRIX",
        `Row ${rowIndex + 1} is not an array.`,
      );
    }
    return row.map((value) => {
      const scalar =
        value instanceof QuadraticSurd ? value : parseRational(value);
      return mode === "exact"
        ? scalar.toString()
        : scalar.toDecimal(precision, trimTrailingZeros);
    });
  });
}

export const MATRIX_LIMIT = MAX_MATRIX_SIZE;
