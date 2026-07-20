import {
  MatrixError,
  addMatrices,
  analyzeEigenDirections2x2,
  determinant,
  diagonalizeMatrix,
  inverseMatrix,
  matrixFromStrings,
  multiplyMatrices,
  parseRational,
  rrefMatrix,
} from "./math.js";
import {
  calculateResultant,
  clientToCanvasPoint,
  clientToMathPoint,
  drawTransformation,
  drawVectors,
  hitTestBasisEndpoint,
} from "./visuals.js";
import {
  compareLineProjections,
  svd2x2,
} from "./labs.js";
import {
  drawProjectionComparison,
  drawSvdExplorer,
} from "./lab-visuals.js";
import {
  matrixToTex,
  renderMathAwareText,
  renderTex,
  scalarTextToTex,
} from "./math-rendering.js";

const STORAGE_KEY = "linear-algebra-calculator.workspace.v1";
const MAX_SIZE = 6;
const palette = ["#e56352", "#377bb8", "#0b5f91", "#9a6a00", "#776885", "#526a82"];
const operationCopy = {
  rref: {
    label: "RREF",
    action: "Calculate RREF",
    summary: "Reduce a matrix to its simplest row-equivalent form.",
    concept: "Row operations change how a system is written without changing its solutions. RREF exposes pivot positions, free variables, and the matrix rank.",
  },
  add: {
    label: "Addition",
    action: "Add matrices",
    summary: "Combine matching entries from two matrices of the same size.",
    concept: "Matrix addition is entry-by-entry. The two matrices must have identical dimensions because every value needs a partner in the same position.",
  },
  multiply: {
    label: "Multiplication",
    action: "Multiply matrices",
    summary: "Pair each row of the first matrix with each column of the second.",
    concept: "Matrix multiplication composes transformations. Each result entry is a dot product between one row from the first matrix and one column from the second.",
  },
  inverse: {
    label: "Inverse",
    action: "Find the inverse",
    summary: "Find the matrix that reverses this transformation.",
    concept: "An inverse undoes a matrix: A⁻¹A = I. It exists only when every direction remains recoverable—equivalently, when the determinant is non-zero.",
  },
  diagonalize: {
    label: "Diagonalization",
    action: "Diagonalize matrix",
    summary: "Rewrite a matrix using its eigenvector directions.",
    concept: "Diagonalization changes to a basis made from eigenvectors. In that special coordinate system, the transformation only stretches each axis: A = PDP⁻¹.",
  },
};

const defaultState = () => ({
  version: 1,
  matrices: [
    { id: "matrix-a", name: "A", cells: [["1", "2"], ["3", "4"]] },
    { id: "matrix-b", name: "B", cells: [["2", "0"], ["1", "2"]] },
  ],
  activeMatrixId: "matrix-a",
  operation: "rref",
  operandA: "matrix-a",
  operandB: "matrix-b",
  resultFormat: "exact",
  decimalPrecision: 4,
  transformExtent: 4,
  transformMatrixId: "matrix-a",
  basisEditing: true,
  showEigenDirections: true,
  playbackSpeed: "slow",
  projectionDirection: [2, 1],
  projectionTarget: [2, 3],
  svdMatrixId: "matrix-a",
  svdProgress: 3,
  history: [],
  vectors: [
    { id: "vector-u", label: "u", x: "0", y: "0", dx: "3", dy: "2", color: palette[0], hidden: false },
    { id: "vector-v", label: "v", x: "0", y: "0", dx: "-1", dy: "3", color: palette[1], hidden: false },
  ],
  showResultant: false,
});

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.matrices) || !parsed.matrices.length) return defaultState();
    const fallback = defaultState();
    const validCells = (cells) => {
      if (!Array.isArray(cells) || cells.length < 1 || cells.length > MAX_SIZE) return false;
      const columns = Array.isArray(cells[0]) ? cells[0].length : 0;
      return columns >= 1 && columns <= MAX_SIZE && cells.every((row) => Array.isArray(row) && row.length === columns);
    };
    const normalizeSnapshot = (snapshot) => snapshot && validCells(snapshot.cells)
      ? {
        name: String(snapshot.name || "Saved matrix"),
        cells: snapshot.cells.map((row) => row.map((value) => String(value ?? ""))),
      }
      : null;
    const matrices = parsed.matrices.filter((matrix) => {
      return matrix && typeof matrix.id === "string" && typeof matrix.name === "string" && validCells(matrix.cells);
    }).map((matrix) => ({
      id: matrix.id,
      name: matrix.name.trim() || "Untitled",
      cells: matrix.cells.map((row) => row.map((value) => String(value ?? ""))),
    }));
    if (!matrices.length) return fallback;
    const matrixIds = new Set(matrices.map((matrix) => matrix.id));
    const vectors = Array.isArray(parsed.vectors)
      ? parsed.vectors.filter((vector) => vector && typeof vector.id === "string").map((vector, index) => ({
        id: vector.id,
        label: String(vector.label || `v${index + 1}`),
        x: String(vector.x ?? "0"),
        y: String(vector.y ?? "0"),
        dx: String(vector.dx ?? "0"),
        dy: String(vector.dy ?? "0"),
        color: typeof vector.color === "string" ? vector.color : palette[index % palette.length],
        hidden: Boolean(vector.hidden),
      }))
      : fallback.vectors;
    const history = Array.isArray(parsed.history)
      ? parsed.history.filter((entry) => entry && operationCopy[entry.operation]).slice(0, 20).map((entry, index) => ({
        id: typeof entry.id === "string" ? entry.id : `restored-history-${index}`,
        operation: entry.operation,
        operandA: typeof entry.operandA === "string" ? entry.operandA : null,
        operandB: typeof entry.operandB === "string" ? entry.operandB : null,
        first: normalizeSnapshot(entry.first),
        second: normalizeSnapshot(entry.second),
        label: typeof entry.label === "string" && entry.label.trim()
          ? entry.label
          : `${operationCopy[entry.operation].label} result`,
      }))
      : [];
    const activeMatrixId = matrixIds.has(parsed.activeMatrixId) ? parsed.activeMatrixId : matrices[0].id;
    const normalizedPair = (value, defaultValue) => {
      if (!Array.isArray(value) || value.length !== 2) return defaultValue.slice();
      const pair = value.map(Number);
      return pair.every(Number.isFinite) ? pair : defaultValue.slice();
    };
    let projectionDirection = normalizedPair(parsed.projectionDirection, fallback.projectionDirection);
    if (Math.hypot(...projectionDirection) < 1e-9) projectionDirection = fallback.projectionDirection.slice();
    const projectionTarget = normalizedPair(parsed.projectionTarget, fallback.projectionTarget);
    const squareMatrixIds = new Set(
      matrices
        .filter((matrix) => matrix.cells.length === 2 && matrix.cells[0].length === 2)
        .map((matrix) => matrix.id),
    );
    const transformMatrixId = squareMatrixIds.has(parsed.transformMatrixId)
      ? parsed.transformMatrixId
      : squareMatrixIds.has(activeMatrixId)
        ? activeMatrixId
        : [...squareMatrixIds][0] ?? null;
    const svdMatrixId = squareMatrixIds.has(parsed.svdMatrixId)
      ? parsed.svdMatrixId
      : squareMatrixIds.has(activeMatrixId)
        ? activeMatrixId
        : [...squareMatrixIds][0] ?? null;
    const svdProgress = Math.min(3, Math.max(0, Number(parsed.svdProgress)));
    return {
      ...fallback,
      ...parsed,
      matrices,
      vectors,
      activeMatrixId,
      operandA: activeMatrixId,
      operandB: matrixIds.has(parsed.operandB) ? parsed.operandB : matrices[Math.min(1, matrices.length - 1)].id,
      operation: operationCopy[parsed.operation] ? parsed.operation : fallback.operation,
      resultFormat: parsed.resultFormat === "decimal" ? "decimal" : "exact",
      basisEditing: parsed.basisEditing !== false,
      showEigenDirections: parsed.showEigenDirections !== false,
      playbackSpeed: parsed.playbackSpeed === "fast" ? "fast" : "slow",
      projectionDirection,
      projectionTarget,
      transformMatrixId,
      svdMatrixId,
      svdProgress: Number.isFinite(svdProgress) ? svdProgress : fallback.svdProgress,
      history,
    };
  } catch {
    return defaultState();
  }
}

let state = loadState();
let currentResult = null;
let saveTimer = null;
let animationFrame = null;
let matrixDialogMode = "create";
let editingVectorId = null;
let transformationFrame = null;
let draggedBasis = null;
let selectedBasisForKeyboard = "x";
let projectionFrame = null;
let projectionDrag = null;
let svdAnimationFrame = null;
const WORKSPACE_VIEWS = new Set(["calculator", "transform", "vectors", "projection", "svd"]);
const PLAYBACK_DURATIONS = Object.freeze({
  transform: Object.freeze({ slow: 4200, fast: 2200 }),
  svd: Object.freeze({ slow: 7500, fast: 4500 }),
});

const byId = (id) => document.getElementById(id);
const elements = {
  saveStatus: byId("save-status"),
  matrixLibrary: byId("matrix-library"),
  historyList: byId("history-list"),
  editorTitle: byId("editor-title"),
  matrixEditor: byId("matrix-editor"),
  rowCount: byId("row-count"),
  columnCount: byId("column-count"),
  operandRow: byId("operand-row"),
  operandAName: byId("operand-a-name"),
  operandASize: byId("operand-a-size"),
  operandB: byId("operand-b"),
  operandBLabel: byId("operand-b-label"),
  operandBCopy: byId("operand-b-copy"),
  operationSummary: byId("operation-summary"),
  calculateButton: byId("calculate-button"),
  calculationError: byId("calculation-error"),
  editorError: byId("editor-error"),
  resultEmpty: byId("result-empty"),
  resultContent: byId("result-content"),
  resultTitle: byId("result-title"),
  resultEquation: byId("result-equation"),
  resultMatrices: byId("result-matrices"),
  decimalPrecision: byId("decimal-precision"),
  conceptSummary: byId("concept-summary"),
  conceptBody: byId("concept-body"),
  stepList: byId("step-list"),
  stepsSummary: byId("steps-summary"),
  pastePanel: byId("paste-panel"),
  pasteInput: byId("paste-input"),
  newMatrixDialog: byId("new-matrix-dialog"),
  newMatrixName: byId("new-matrix-name"),
  newMatrixError: byId("new-matrix-error"),
  transformMatrix: byId("transform-matrix"),
  transformCanvas: byId("transform-canvas"),
  transformProgress: byId("transform-progress"),
  basisEditToggle: byId("basis-edit-toggle"),
  eigenDirectionsToggle: byId("eigen-directions-toggle"),
  basisDragGuide: byId("basis-drag-guide"),
  basisDragStatus: byId("basis-drag-status"),
  basisISelect: byId("basis-i-select"),
  basisJSelect: byId("basis-j-select"),
  basisCoordinateEditor: byId("basis-coordinate-editor"),
  basisIX: byId("basis-i-x"),
  basisIY: byId("basis-i-y"),
  basisJX: byId("basis-j-x"),
  basisJY: byId("basis-j-y"),
  eigenDirectionReadout: byId("eigen-direction-readout"),
  eigenDirectionList: byId("eigen-direction-list"),
  zoomLabel: byId("zoom-label"),
  determinantValue: byId("determinant-value"),
  orientationValue: byId("orientation-value"),
  transformationStoryTitle: byId("transformation-story-title"),
  transformationStory: byId("transformation-story"),
  basisI: byId("basis-i"),
  basisJ: byId("basis-j"),
  vectorCanvas: byId("vector-canvas"),
  vectorForm: byId("vector-form"),
  vectorList: byId("vector-list"),
  vectorCount: byId("vector-count"),
  vectorError: byId("vector-error"),
  vectorSubmit: byId("vector-submit"),
  cancelVectorEdit: byId("cancel-vector-edit"),
  showResultant: byId("show-resultant"),
  projectionCanvas: byId("projection-canvas"),
  projectionDirectionHandle: byId("projection-direction-handle"),
  projectionDragHandle: byId("projection-drag-handle"),
  projectionDragStatus: byId("projection-drag-status"),
  projectionError: byId("projection-error"),
  projectionAX: byId("projection-a-x"),
  projectionAY: byId("projection-a-y"),
  projectionBX: byId("projection-b-x"),
  projectionBY: byId("projection-b-y"),
  projectionStoryTitle: byId("projection-story-title"),
  projectionStory: byId("projection-story"),
  projectionL2Distance: byId("projection-l2-distance"),
  projectionL1Distance: byId("projection-l1-distance"),
  projectionL2Point: byId("projection-l2-point"),
  projectionL1Point: byId("projection-l1-point"),
  projectionL2Residual: byId("projection-l2-residual"),
  projectionL1Residual: byId("projection-l1-residual"),
  projectionUniqueness: byId("projection-uniqueness"),
  svdMatrix: byId("svd-matrix"),
  svdCanvas: byId("svd-canvas"),
  svdProgress: byId("svd-progress"),
  svdProgressLabel: byId("svd-progress-label"),
  svdStageCopy: byId("svd-stage-copy"),
  svdPlayStatus: byId("svd-play-status"),
  svdError: byId("svd-error"),
  svdStoryTitle: byId("svd-story-title"),
  svdStory: byId("svd-story"),
  svdRank: byId("svd-rank"),
  svdCondition: byId("svd-condition"),
  svdSigmaOne: byId("svd-sigma-one"),
  svdSigmaTwo: byId("svd-sigma-two"),
  svdSigmaOneBar: byId("svd-sigma-one-bar"),
  svdSigmaTwoBar: byId("svd-sigma-two-bar"),
  svdU: byId("svd-u"),
  svdSigma: byId("svd-sigma"),
  svdVT: byId("svd-vt"),
  svdNote: byId("svd-note"),
};

function persistState() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (elements.saveStatus) elements.saveStatus.innerHTML = '<span aria-hidden="true">●</span> Your work is saved';
  } catch {
    if (elements.saveStatus) elements.saveStatus.textContent = "Could not save locally";
  }
}

function saveState() {
  if (elements.saveStatus) elements.saveStatus.innerHTML = '<span aria-hidden="true">●</span> Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistState, 120);
}

function activeMatrix() {
  return state.matrices.find((matrix) => matrix.id === state.activeMatrixId) || state.matrices[0];
}

function matrixById(id) {
  return state.matrices.find((matrix) => matrix.id === id);
}

function fillSizeSelect(select) {
  select.replaceChildren();
  for (let size = 1; size <= MAX_SIZE; size += 1) {
    const option = document.createElement("option");
    option.value = String(size);
    option.textContent = String(size);
    select.append(option);
  }
}

function createMiniMatrix(matrix) {
  const mini = document.createElement("span");
  mini.className = "mini-matrix";
  mini.style.setProperty("--columns", String(Math.min(4, matrix.cells[0].length)));
  matrix.cells.slice(0, 4).forEach((row) => row.slice(0, 4).forEach(() => mini.append(document.createElement("i"))));
  return mini;
}

function renderLibrary() {
  elements.matrixLibrary.replaceChildren();
  state.matrices.forEach((matrix) => {
    const selected = matrix.id === state.activeMatrixId;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `matrix-library-item${selected ? " is-active" : ""}`;
    button.dataset.matrixId = matrix.id;
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-label", `Select matrix ${matrix.name}, ${matrix.cells.length} by ${matrix.cells[0].length}, as the primary matrix`);
    const text = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = `Matrix ${matrix.name}`;
    const size = document.createElement("small");
    size.textContent = `${matrix.cells.length} × ${matrix.cells[0].length}`;
    text.append(name, size);
    const preview = document.createElement("span");
    preview.className = "matrix-library-preview";
    if (selected) {
      const indicator = document.createElement("span");
      indicator.className = "selected-indicator";
      indicator.textContent = "Selected";
      preview.append(indicator);
    } else preview.append(createMiniMatrix(matrix));
    button.append(text, preview);
    button.addEventListener("click", () => {
      state.activeMatrixId = matrix.id;
      state.operandA = matrix.id;
      currentResult = null;
      elements.editorError.textContent = "";
      clearCalculationError();
      renderMatrices();
      renderResult();
      saveState();
      requestAnimationFrame(() => {
        [...elements.matrixLibrary.querySelectorAll("[data-matrix-id]")]
          .find((item) => item.dataset.matrixId === matrix.id)
          ?.focus();
      });
    });
    elements.matrixLibrary.append(button);
  });
}

function renderEditor() {
  const matrix = activeMatrix();
  elements.editorTitle.textContent = `Matrix ${matrix.name}`;
  elements.rowCount.value = String(matrix.cells.length);
  elements.columnCount.value = String(matrix.cells[0].length);
  elements.matrixEditor.style.setProperty("--columns", String(matrix.cells[0].length));
  elements.matrixEditor.replaceChildren();
  matrix.cells.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    const input = document.createElement("input");
    input.className = "matrix-cell";
    input.value = value;
    input.inputMode = "text";
    input.autocomplete = "off";
    input.setAttribute("aria-label", `Matrix ${matrix.name}, row ${rowIndex + 1}, column ${columnIndex + 1}`);
    try { parseRational(input.value); input.setAttribute("aria-invalid", "false"); }
    catch { input.setAttribute("aria-invalid", "true"); }
    input.addEventListener("input", () => {
      matrix.cells[rowIndex][columnIndex] = input.value;
      try { parseRational(input.value); input.setAttribute("aria-invalid", "false"); }
      catch { input.setAttribute("aria-invalid", "true"); }
      currentResult = null;
      elements.editorError.textContent = "";
      clearCalculationError();
      renderResult();
      saveState();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const inputs = [...elements.matrixEditor.querySelectorAll("input")];
      const next = inputs[inputs.indexOf(input) + 1];
      if (next) next.focus(); else elements.calculateButton.focus();
    });
    elements.matrixEditor.append(input);
  }));
}

function renderMatrixSelects() {
  const previousTransform = state.transformMatrixId || elements.transformMatrix.value;
  const previousSvd = elements.svdMatrix.value || state.svdMatrixId;
  const primary = activeMatrix();
  state.operandA = primary.id;
  elements.operandAName.textContent = `Matrix ${primary.name}`;
  elements.operandASize.textContent = `${primary.cells.length} × ${primary.cells[0].length}`;

  const previousSecond = state.operandB;
  elements.operandB.replaceChildren();
  state.matrices.forEach((matrix) => {
    const option = document.createElement("option");
    option.value = matrix.id;
    option.textContent = `Matrix ${matrix.name} · ${matrix.cells.length}×${matrix.cells[0].length}`;
    elements.operandB.append(option);
  });
  elements.operandB.value = matrixById(previousSecond) ? previousSecond : state.matrices[0].id;
  state.operandB = elements.operandB.value;

  elements.transformMatrix.replaceChildren();
  const squareMatrices = state.matrices.filter((matrix) => matrix.cells.length === 2 && matrix.cells[0].length === 2);
  squareMatrices.forEach((matrix) => {
    const option = document.createElement("option");
    option.value = matrix.id;
    option.textContent = `Matrix ${matrix.name}`;
    elements.transformMatrix.append(option);
  });
  const selectedTransformId = squareMatrices.some((matrix) => matrix.id === previousTransform)
    ? previousTransform
    : squareMatrices.some((matrix) => matrix.id === state.transformMatrixId)
      ? state.transformMatrixId
      : squareMatrices[0]?.id ?? "";
  elements.transformMatrix.value = selectedTransformId;
  state.transformMatrixId = selectedTransformId || null;

  elements.svdMatrix.replaceChildren();
  squareMatrices.forEach((matrix) => {
    const option = document.createElement("option");
    option.value = matrix.id;
    option.textContent = `Matrix ${matrix.name}`;
    elements.svdMatrix.append(option);
  });
  const selectedSvdId = squareMatrices.some((matrix) => matrix.id === previousSvd)
    ? previousSvd
    : squareMatrices.some((matrix) => matrix.id === state.svdMatrixId)
      ? state.svdMatrixId
      : squareMatrices[0]?.id ?? "";
  elements.svdMatrix.value = selectedSvdId;
  state.svdMatrixId = selectedSvdId || null;
}

function renderMatrices() {
  renderLibrary();
  renderEditor();
  renderMatrixSelects();
  drawTransformationView();
  if (!byId("svd-panel").hidden) drawSvdView();
}

function resizeActiveMatrix(rows, columns) {
  const matrix = activeMatrix();
  matrix.cells = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => matrix.cells[row]?.[column] ?? "0"));
  currentResult = null;
  elements.editorError.textContent = "";
  clearCalculationError();
  renderMatrices();
  renderResult();
  saveState();
}

function renderOperation() {
  const copy = operationCopy[state.operation];
  document.querySelectorAll(".operation-chip").forEach((button) => {
    const active = button.dataset.operation === state.operation;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-checked", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  const needsSecond = state.operation === "add" || state.operation === "multiply";
  elements.operandRow.classList.toggle("has-second", needsSecond);
  elements.operandBLabel.hidden = !needsSecond;
  elements.operandBCopy.textContent = state.operation === "multiply" ? "Multiply on the right by" : "Add this matrix";
  elements.operationSummary.textContent = copy.summary;
  elements.calculateButton.firstChild.textContent = `${copy.action} `;
}

function matrixValueText(value, mode = state.resultFormat) {
  if (value == null) return "—";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    const precision = mode === "decimal" ? state.decimalPrecision : Math.max(6, state.decimalPrecision);
    const rounded = Math.abs(value) >= 1e9 || (Math.abs(value) > 0 && Math.abs(value) < 10 ** -precision)
      ? value.toExponential(Math.max(2, precision - 1))
      : value.toFixed(precision).replace(/\.0+$|(?<=\.[0-9]*[1-9])0+$/, "");
    return rounded === "-0" ? "0" : rounded;
  }
  if (mode === "decimal") {
    if (typeof value.toDecimal === "function") return value.toDecimal(state.decimalPrecision);
    if (typeof value.approximate === "function") return value.approximate(state.decimalPrecision);
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(state.decimalPrecision).replace(/\.0+$|(?<=\.[0-9]*[1-9])0+$/, "") : String(value);
  }
  if (typeof value.toExact === "function") return value.toExact();
  return String(value);
}

function renderFormatControls() {
  const approximate = Boolean(currentResult?.approximate);
  const effectiveFormat = approximate ? "decimal" : state.resultFormat;
  document.querySelectorAll("[data-format]").forEach((button) => {
    const active = button.dataset.format === effectiveFormat;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled = approximate && button.dataset.format === "exact";
  });
}

function clearCalculationError() {
  elements.calculationError.replaceChildren();
  elements.calculationError.removeAttribute("data-visible");
}

function showCalculationError(error, operation, firstModel, secondModel) {
  const copy = operationCopy[operation] || { label: "Calculation" };
  const code = error instanceof MatrixError ? error.code : "UNKNOWN";
  const details = error instanceof MatrixError ? error.details || {} : {};
  let reason = error?.message || "The calculation could not be completed.";
  let remedy = "Check the selected matrices and try again.";

  if (code === "INVALID_ENTRY") {
    const matrixName = details.matrixName ? `Matrix ${details.matrixName}` : "The selected matrix";
    reason = `${matrixName} has an unreadable value in row ${(details.row ?? 0) + 1}, column ${(details.column ?? 0) + 1}.`;
    remedy = "Use an integer, a decimal such as 0.5, or a fraction such as 1/2 in every cell.";
  } else if (code === "DIMENSION_MISMATCH" && operation === "add") {
    reason = `Matrix ${firstModel?.name || "A"} is ${details.left?.rows}×${details.left?.columns}, while matrix ${secondModel?.name || "B"} is ${details.right?.rows}×${details.right?.columns}. Addition pairs entries in the same position, so both shapes must match.`;
    remedy = "Resize one matrix to the same number of rows and columns, or choose a compatible pair.";
  } else if (code === "DIMENSION_MISMATCH" && operation === "multiply") {
    reason = `Matrix ${firstModel?.name || "A"} has ${details.left?.columns} columns, but matrix ${secondModel?.name || "B"} has ${details.right?.rows} rows. Each row–column dot product needs those two counts to agree.`;
    remedy = `Choose or resize the matrices so the first matrix has exactly ${details.right?.rows} columns.`;
  } else if (code === "NON_SQUARE") {
    reason = `${copy.label} requires a square matrix, but matrix ${firstModel?.name || "A"} is ${details.rows}×${details.columns}. A square matrix has the same number of rows and columns.`;
    remedy = "Resize the matrix to a square shape or choose another matrix.";
  } else if (code === "SINGULAR") {
    reason = `Matrix ${firstModel?.name || "A"} is singular: at least one row or column depends on the others, so its determinant is zero and no inverse can undo it.`;
    remedy = "Change the entries or choose a matrix with independent rows and columns.";
  } else if (code === "COMPLEX_EIGENVALUES") {
    reason = `Matrix ${firstModel?.name || "A"} has non-real eigenvalues, so it cannot be diagonalized using the real-number basis taught in this workspace.`;
    remedy = "Try a matrix with real eigenvalues. Complex diagonalization is not included in this lesson yet.";
  } else if (code === "NOT_DIAGONALIZABLE") {
    reason = error.message;
    remedy = "A matrix needs one independent eigenvector for every dimension. Repeated eigenvalues do not always provide enough eigenvectors.";
  } else if (code === "UNSUPPORTED_IRRATIONAL_EIGENVALUES" || code === "UNSUPPORTED_EIGENVALUES") {
    reason = error.message;
    remedy = "This does not necessarily mean the matrix is mathematically non-diagonalizable; it means this exact calculator cannot yet represent that spectrum.";
  }

  const title = document.createElement("strong");
  title.textContent = `${copy.label} cannot be completed`;
  const explanation = document.createElement("span");
  explanation.textContent = reason;
  const nextStep = document.createElement("small");
  nextStep.textContent = `What to try: ${remedy}`;
  elements.calculationError.replaceChildren(title, explanation, nextStep);
  elements.calculationError.setAttribute("data-visible", "true");
}

function parseMatrixModel(model, operand) {
  try {
    return matrixFromStrings(model.cells);
  } catch (error) {
    if (error instanceof MatrixError) {
      throw new MatrixError(error.code, error.message, {
        ...error.details,
        matrixName: model.name,
        operand,
      });
    }
    throw error;
  }
}

function createMatrixDisplay(matrix, mode = state.resultFormat) {
  const display = document.createElement("div");
  display.className = "matrix-display";
  const formatted = matrix.map((row) => row.map((value) => matrixValueText(value, mode)));
  const fallback = `[${formatted.map((row) => row.join("  ")).join(";  ")}]`;
  renderTex(display, matrixToTex(formatted), fallback, { display: true });
  return display;
}

function renderResult() {
  renderFormatControls();
  if (!currentResult) {
    elements.resultEmpty.hidden = false;
    elements.resultContent.hidden = true;
    elements.resultTitle.textContent = "Ready when you are";
    return;
  }
  elements.resultEmpty.hidden = true;
  elements.resultContent.hidden = false;
  elements.resultTitle.textContent = currentResult.title;
  const displayMode = currentResult.approximate ? "decimal" : state.resultFormat;
  const resultEquation = currentResult.operation === "diagonalize" && currentResult.eigenvalues
    ? `${currentResult.matrixName} ${currentResult.approximate ? "≈" : "="} PDP⁻¹ · ${currentResult.approximate ? "approximate " : ""}eigenvalues ${currentResult.eigenvalues.map((value) => matrixValueText(value, displayMode)).join(", ")}`
    : currentResult.equation;
  renderMathAwareText(elements.resultEquation, resultEquation);
  elements.resultMatrices.replaceChildren();
  currentResult.outputs.forEach((output, index) => {
    if (index > 0) {
      const separator = document.createElement("span");
      separator.className = "result-separator";
      separator.textContent = "·";
      elements.resultMatrices.append(separator);
    }
    const group = document.createElement("div");
    group.className = "result-matrix-group";
    const label = document.createElement("strong");
    label.textContent = output.label;
    group.append(label, createMatrixDisplay(output.matrix, displayMode));
    elements.resultMatrices.append(group);
  });
  const copy = operationCopy[currentResult.operation];
  elements.conceptSummary.textContent = copy.summary;
  elements.conceptBody.replaceChildren();
  const paragraph = document.createElement("p");
  renderMathAwareText(paragraph, currentResult.concept || copy.concept);
  elements.conceptBody.append(paragraph);
  elements.stepList.replaceChildren();
  const steps = currentResult.steps?.length ? currentResult.steps : ["The result follows directly from the definition of this operation."];
  steps.slice(0, 80).forEach((step) => {
    const item = document.createElement("li");
    renderMathAwareText(item, typeof step === "string" ? step : step.description || step.label || String(step));
    elements.stepList.append(item);
  });
  elements.stepsSummary.textContent = `${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
}

function buildCalculationResult(operation, firstModel, secondModel = null) {
    const needsSecond = operation === "add" || operation === "multiply";
    if (!firstModel) throw new Error("Choose a first matrix.");
    if (needsSecond && !secondModel) throw new Error("Choose a second matrix.");
    const first = parseMatrixModel(firstModel, "first");
    const second = needsSecond ? parseMatrixModel(secondModel, "second") : null;
    let calculation;
    let outputs;
    let title;
    let equation;

    if (operation === "rref") {
      calculation = rrefMatrix(first);
      outputs = [{ label: "RREF =", matrix: calculation.matrix }];
      title = `RREF of matrix ${firstModel.name}`;
      equation = `rank ${calculation.rank ?? "—"} · pivots in ${calculation.pivotColumns?.map((column) => column + 1).join(", ") || "none"}`;
    } else if (operation === "add") {
      calculation = addMatrices(first, second);
      outputs = [{ label: `${firstModel.name} + ${secondModel.name} =`, matrix: calculation.matrix }];
      title = "Matrices added";
      equation = "Matching positions combine";
    } else if (operation === "multiply") {
      calculation = multiplyMatrices(first, second);
      outputs = [{ label: `${firstModel.name}${secondModel.name} =`, matrix: calculation.matrix }];
      title = "Matrices multiplied";
      equation = `${firstModel.cells.length}×${firstModel.cells[0].length} composed with ${secondModel.cells.length}×${secondModel.cells[0].length}`;
    } else if (operation === "inverse") {
      calculation = inverseMatrix(first);
      outputs = [{ label: `${firstModel.name}⁻¹ =`, matrix: calculation.matrix }];
      title = `Inverse of matrix ${firstModel.name}`;
      equation = `${firstModel.name}⁻¹${firstModel.name} = I`;
    } else {
      calculation = diagonalizeMatrix(first);
      const relation = calculation.approximate ? "≈" : "=";
      outputs = [
        { label: `P ${relation}`, matrix: calculation.P },
        { label: `D ${relation}`, matrix: calculation.D },
        { label: `P⁻¹ ${relation}`, matrix: calculation.Pinv },
      ];
      title = `Matrix ${firstModel.name} diagonalized`;
      equation = `${firstModel.name} ${relation} PDP⁻¹`;
    }
    return {
      operation,
      outputs,
      steps: calculation.steps,
      title,
      equation,
      matrixName: firstModel.name,
      eigenvalues: calculation.eigenvalues,
      approximate: Boolean(calculation.approximate),
      concept: calculation.approximate
        ? `${operationCopy[operation].concept} This symmetric matrix uses a numerically computed orthonormal eigenbasis, so rounded values are marked as approximate.`
        : operationCopy[operation].concept,
    };
}

function calculate(recordHistory = true) {
  clearCalculationError();
  const firstModel = activeMatrix();
  const secondModel = matrixById(state.operandB);
  state.operandA = firstModel.id;
  try {
    currentResult = buildCalculationResult(state.operation, firstModel, secondModel);
    if (recordHistory) {
      state.history.unshift({
        id: `history-${Date.now()}`,
        operation: state.operation,
        operandA: state.operandA,
        operandB: state.operandB,
        first: { name: firstModel.name, cells: firstModel.cells.map((row) => [...row]) },
        second: secondModel ? { name: secondModel.name, cells: secondModel.cells.map((row) => [...row]) } : null,
        label: currentResult.title,
      });
      state.history = state.history.slice(0, 20);
      renderHistory();
      saveState();
    }
    renderResult();
    byId("result-section").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  } catch (error) {
    showCalculationError(error, state.operation, firstModel, secondModel);
    currentResult = null;
    renderResult();
  }
}

function renderHistory() {
  elements.historyList.replaceChildren();
  if (!state.history.length) {
    const empty = document.createElement("li");
    empty.className = "empty-history";
    empty.textContent = "Your calculations will appear here.";
    elements.historyList.append(empty);
    return;
  }
  state.history.slice(0, 5).forEach((entry) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    const label = document.createElement("span");
    label.textContent = entry.label;
    const arrow = document.createElement("span");
    arrow.textContent = "↗";
    button.append(label, arrow);
    button.addEventListener("click", () => {
      try {
        const firstSnapshot = entry.first || matrixById(entry.operandA);
        const secondSnapshot = entry.second || matrixById(entry.operandB);
        if (!firstSnapshot) return;
        state.operation = entry.operation;
        if (matrixById(entry.operandA)) {
          state.activeMatrixId = entry.operandA;
          state.operandA = entry.operandA;
          renderLibrary();
          renderEditor();
        }
        if (matrixById(entry.operandB)) state.operandB = entry.operandB;
        currentResult = buildCalculationResult(entry.operation, firstSnapshot, secondSnapshot);
        renderMatrixSelects();
        renderOperation();
        renderResult();
      } catch (error) {
        showCalculationError(error, entry.operation, entry.first || matrixById(entry.operandA), entry.second || matrixById(entry.operandB));
      }
    });
    item.append(button);
    elements.historyList.append(item);
  });
}

function rationalNumber(value) {
  const rational = parseRational(String(value));
  const number = typeof rational.toNumber === "function"
    ? rational.toNumber()
    : typeof rational.toDecimal === "function"
      ? Number(rational.toDecimal(12))
      : Number(rational);
  if (!Number.isFinite(number)) throw new Error("This value is too large to draw on the plane.");
  return number;
}

function selectedTransformData() {
  const matrix = matrixById(elements.transformMatrix.value) || state.matrices.find((item) => item.cells.length === 2 && item.cells[0].length === 2);
  if (!matrix) return { model: null, numeric: null, error: "Create a 2×2 matrix to use the transformation playground." };
  try { return { model: matrix, numeric: matrix.cells.map((row) => row.map(rationalNumber)) }; }
  catch (error) { return { model: matrix, numeric: null, error: `Matrix ${matrix.name} cannot be drawn yet. ${error.message}` }; }
}

function drawCanvasNotice(canvas, message) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width || 960);
  const height = Math.max(1, rect.height || 520);
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  if (!context) return;
  const styles = getComputedStyle(document.documentElement);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.fillStyle = styles.getPropertyValue("--paper").trim() || "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = styles.getPropertyValue("--muted").trim();
  context.font = "500 15px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText(message, width / 2, height / 2, Math.max(240, width - 70));
  canvas.setAttribute("aria-label", message);
}

function visualColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    background: styles.getPropertyValue("--paper").trim(),
    text: styles.getPropertyValue("--ink").trim(),
    mutedText: styles.getPropertyValue("--muted").trim(),
    grid: styles.getPropertyValue("--line").trim(),
    originalGrid: styles.getPropertyValue("--line-strong").trim(),
    axes: styles.getPropertyValue("--muted").trim(),
    transformedGrid: styles.getPropertyValue("--oxford-700").trim(),
    xBasis: styles.getPropertyValue("--coral").trim(),
    yBasis: styles.getPropertyValue("--blue").trim(),
    collapse: styles.getPropertyValue("--danger").trim(),
    resultant: styles.getPropertyValue("--oxford-900").trim(),
    line: styles.getPropertyValue("--oxford-700").trim(),
    target: styles.getPropertyValue("--oxford-900").trim(),
    l2: styles.getPropertyValue("--coral").trim(),
    l1: styles.getPropertyValue("--blue").trim(),
    highlight: styles.getPropertyValue("--gold").trim(),
    reference: styles.getPropertyValue("--line-strong").trim(),
    curve: styles.getPropertyValue("--oxford-700").trim(),
    axisOne: styles.getPropertyValue("--coral").trim(),
    axisTwo: styles.getPropertyValue("--blue").trim(),
    eigenSeries: [
      styles.getPropertyValue("--gold").trim(),
      styles.getPropertyValue("--success").trim(),
      styles.getPropertyValue("--coral").trim(),
    ],
    vectorSeries: palette,
  };
}

function cleanCoordinateNumber(value, precision = 4) {
  const rounded = Number(Number(value).toFixed(precision));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function snapCoordinate(value, fine = false) {
  const step = fine ? 0.05 : 0.25;
  return cleanCoordinateNumber(Math.round(value / step) * step);
}

function setSelectedBasis(axis, announce = false) {
  selectedBasisForKeyboard = axis === "y" ? "y" : "x";
  elements.basisISelect.setAttribute("aria-pressed", String(selectedBasisForKeyboard === "x"));
  elements.basisJSelect.setAttribute("aria-pressed", String(selectedBasisForKeyboard === "y"));
  if (announce && elements.basisDragStatus) {
    elements.basisDragStatus.textContent = `${selectedBasisForKeyboard === "x" ? "î" : "ĵ"} selected. Use the arrow keys to nudge its endpoint; hold Shift for finer steps.`;
  }
}

function setBasisInputValue(input, value) {
  if (document.activeElement !== input) {
    input.value = String(value);
    input.setAttribute("aria-invalid", "false");
  }
}

function syncBasisControls(model, error = null) {
  const available = Boolean(model && model.cells?.length === 2 && model.cells[0]?.length === 2);
  const enabled = available && state.basisEditing && !error;
  elements.basisEditToggle.checked = Boolean(state.basisEditing);
  elements.eigenDirectionsToggle.checked = Boolean(state.showEigenDirections);
  [elements.basisISelect, elements.basisJSelect, elements.basisIX, elements.basisIY, elements.basisJX, elements.basisJY]
    .forEach((control) => { control.disabled = !enabled; });
  if (available) {
    setBasisInputValue(elements.basisIX, model.cells[0][0]);
    setBasisInputValue(elements.basisIY, model.cells[1][0]);
    setBasisInputValue(elements.basisJX, model.cells[0][1]);
    setBasisInputValue(elements.basisJY, model.cells[1][1]);
  }
  setSelectedBasis(selectedBasisForKeyboard);
  const canvasWrap = elements.transformCanvas.closest(".canvas-wrap");
  if (canvasWrap) {
    canvasWrap.dataset.basisEditing = String(enabled);
    canvasWrap.classList.toggle("is-basis-editing", enabled);
    canvasWrap.dataset.basisDragging = String(Boolean(draggedBasis));
    canvasWrap.classList.toggle("is-dragging", Boolean(draggedBasis));
  }
  elements.transformCanvas.classList.toggle("is-basis-editing", enabled);
  elements.transformCanvas.classList.toggle("is-dragging", Boolean(draggedBasis));
  if (draggedBasis) return;
  if (error) elements.basisDragStatus.textContent = error;
  else if (!available) elements.basisDragStatus.textContent = "Create or select a 2×2 matrix to edit its basis vectors.";
  else if (!state.basisEditing) elements.basisDragStatus.textContent = "Turn on Edit basis to begin.";
  else elements.basisDragStatus.textContent = "Drag an arrow tip, or choose î or ĵ and use the arrow keys. Hold Shift for finer steps.";
}

function syncMatrixEditorFromModel(model) {
  if (!model || state.activeMatrixId !== model.id) return;
  const inputs = [...elements.matrixEditor.querySelectorAll("input")];
  model.cells.flat().forEach((value, index) => {
    if (!inputs[index]) return;
    inputs[index].value = value;
    inputs[index].setAttribute("aria-invalid", "false");
  });
}

function writeBasisColumn(model, axis, x, y) {
  if (axis === "x") {
    model.cells[0][0] = String(x);
    model.cells[1][0] = String(y);
  } else {
    model.cells[0][1] = String(x);
    model.cells[1][1] = String(y);
  }
}

function finishBasisEdit(model, axis, x, y, options = {}) {
  writeBasisColumn(model, axis, x, y);
  currentResult = null;
  clearCalculationError();
  syncMatrixEditorFromModel(model);
  renderResult();
  drawTransformationView();
  saveState();
  if (options.announce !== false) {
    const symbol = axis === "x" ? "î" : "ĵ";
    elements.basisDragStatus.textContent = `${symbol} now lands at (${x}, ${y}). The ${axis === "x" ? "first" : "second"} matrix column changed with it.${options.fine ? " Fine step used." : ""}`;
  }
}

function fixedTransformDecimal(value) {
  if (value && typeof value.toDecimal === "function") {
    const exact = value.toDecimal(2, false);
    return exact === "-0.00" ? "0.00" : exact;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  const rounded = Math.abs(numeric) < 0.005 ? 0 : numeric;
  return rounded.toFixed(2);
}

function transformEigenvectors(analysis) {
  if (!analysis) return [];
  if (analysis.kind === "scalar") {
    const eigenvalue = analysis.eigenvalues?.[0] ?? analysis.eigenvalueApprox;
    return [[1, 0], [0, 1]].map((vector) => ({
      vector,
      eigenvalue,
      eigenvalueApprox: Number(
        analysis.eigenvalueApprox ?? eigenvalue?.toNumber?.() ?? eigenvalue,
      ),
      representative: true,
    }));
  }
  return analysis.directions || [];
}

function transformEigenPresentation(analysis) {
  if (!analysis) {
    return {
      eigenvalueLabels: [],
      directionLabels: [],
      explanation: "Enter a valid 2×2 matrix to inspect its unit eigenvectors.",
    };
  }
  if (!analysis.kind) {
    return {
      eigenvalueLabels: [],
      directionLabels: [],
      explanation: analysis.explanation || "Eigenvectors could not be analysed for this matrix.",
    };
  }

  const eigenvectors = transformEigenvectors(analysis);
  const directionLabels = eigenvectors.map((direction) =>
    `(${direction.vector.map(fixedTransformDecimal).join(", ")})`,
  );

  if (analysis.kind === "complex") {
    const realPart = analysis.trace.toNumber() / 2;
    const imaginaryPart = Math.sqrt(Math.max(0, -analysis.discriminant.toNumber())) / 2;
    const realLabel = fixedTransformDecimal(realPart);
    const imaginaryLabel = fixedTransformDecimal(imaginaryPart);
    const eigenvalueLabels = [
      `${realLabel} + ${imaginaryLabel}i`,
      `${realLabel} − ${imaginaryLabel}i`,
    ];
    return {
      eigenvalueLabels,
      directionLabels,
      explanation: `The eigenvalues are ${eigenvalueLabels[0]} and ${eigenvalueLabels[1]}, so there are no real unit eigenvectors to draw.`,
    };
  }

  const eigenvalueLabels = analysis.kind === "scalar"
    ? [fixedTransformDecimal(analysis.eigenvalues?.[0] ?? analysis.eigenvalueApprox)]
    : (analysis.directions || []).map((direction) => fixedTransformDecimal(direction.eigenvalue));

  if (analysis.kind === "scalar") {
    return {
      eigenvalueLabels,
      directionLabels,
      explanation: `Every direction is an eigenvector. The arrows show representative unit vectors v₁ and v₂; both are scaled by λ = ${eigenvalueLabels[0]}.`,
    };
  }
  if (analysis.kind === "defective") {
    return {
      eigenvalueLabels,
      directionLabels,
      explanation: `The repeated eigenvalue λ = ${eigenvalueLabels[0]} has only one independent real unit eigenvector, so there is no independent v₂ and the matrix is not diagonalizable.`,
    };
  }
  return {
    eigenvalueLabels,
    directionLabels,
    explanation: `The arrows start as unit eigenvectors. During the transformation, v₁ becomes λ₁v₁ and v₂ becomes λ₂v₂ without turning away from their eigenvector axes.`,
  };
}

function eigenOverlayFromAnalysis(analysis, progress) {
  if (!analysis || !state.showEigenDirections) return null;
  const colors = visualColors().eigenSeries;
  const presentation = transformEigenPresentation(analysis);
  if (analysis.kind === "complex") {
    return { state: "none", lines: [], summary: presentation.explanation };
  }
  const eigenvectors = transformEigenvectors(analysis);
  const scalar = analysis.kind === "scalar";
  return {
    state: scalar ? "all" : eigenvectors.length === 1 ? "one" : "distinct",
    label: scalar ? "every direction" : undefined,
    summary: presentation.explanation,
    lines: eigenvectors.map((direction, index) => {
      const current = 1 - progress + progress * direction.eigenvalueApprox;
      const subscript = index === 0 ? "₁" : "₂";
      const eigenvalueLabel = scalar
        ? presentation.eigenvalueLabels[0]
        : presentation.eigenvalueLabels[index];
      const lambda = scalar || eigenvectors.length === 1 ? "λ" : `λ${subscript}`;
      return {
        id: `eigen-direction-${index + 1}`,
        label: `v${subscript}`,
        direction: direction.vector,
        eigenvalue: current,
        eigenvalueLabel,
        stretchCue: progress >= 0.999
          ? `${lambda} = ${eigenvalueLabel}`
          : `now ×${fixedTransformDecimal(current)}`,
        showLabel: true,
        representative: Boolean(direction.representative),
        color: colors[index % colors.length],
        accessibleText: `Unit eigenvector v${subscript} ${presentation.directionLabels[index]} is currently scaled by ${fixedTransformDecimal(current)}; its final eigenvalue is ${eigenvalueLabel}.`,
      };
    }),
  };
}

function renderEigenDirectionReadout(analysis) {
  elements.eigenDirectionReadout.hidden = !state.showEigenDirections;
  if (!state.showEigenDirections) return;
  const presentation = transformEigenPresentation(analysis);
  const signature = JSON.stringify({
    explanation: presentation.explanation,
    eigenvalueLabels: presentation.eigenvalueLabels,
    directions: presentation.directionLabels,
  });
  if (elements.eigenDirectionList.dataset.mathSignature === signature) return;
  elements.eigenDirectionList.dataset.mathSignature = signature;
  elements.eigenDirectionList.replaceChildren();
  const explanation = document.createElement("p");
  renderMathAwareText(explanation, presentation.explanation);
  elements.eigenDirectionList.append(explanation);
  const eigenvectors = transformEigenvectors(analysis);
  if (!eigenvectors.length) return;
  eigenvectors.forEach((direction, index) => {
    const item = document.createElement("p");
    const subscript = index === 0 ? "₁" : "₂";
    const scalar = analysis.kind === "scalar";
    const lambda = scalar || eigenvectors.length === 1 ? "λ" : `λ${subscript}`;
    const eigenvalueLabel = scalar
      ? presentation.eigenvalueLabels[0]
      : presentation.eigenvalueLabels[index];
    const target = direction.vector.map((component) =>
      fixedTransformDecimal(component * direction.eigenvalueApprox),
    );
    const numericEigenvalue = Number(direction.eigenvalueApprox);
    const effect = numericEigenvalue < 0
      ? " Its negative eigenvalue also reverses the arrow."
      : numericEigenvalue === 0
        ? " It collapses to the origin."
        : "";
    renderMathAwareText(
      item,
      `v${subscript} = ${presentation.directionLabels[index]} has length 1. The transform sends it to ${lambda}v${subscript} = (${target.join(", ")}), where ${lambda} = ${eigenvalueLabel}.${effect}`,
    );
    elements.eigenDirectionList.append(item);
  });
}

function drawTransformationView() {
  if (!elements.transformCanvas) return;
  state.transformExtent = Math.min(10, Math.max(2, Number(state.transformExtent) || 4));
  elements.zoomLabel.textContent = `±${state.transformExtent}`;
  const { model, numeric, error } = selectedTransformData();
  syncBasisControls(model, error);
  if (error || !numeric) {
    transformationFrame = null;
    renderEigenDirectionReadout(null);
    drawCanvasNotice(elements.transformCanvas, error || "This matrix cannot be drawn.");
    elements.determinantValue.textContent = "—";
    elements.orientationValue.textContent = "check entries";
    elements.basisI.textContent = "—";
    elements.basisJ.textContent = "—";
    elements.transformationStoryTitle.textContent = "The matrix needs attention";
    elements.transformationStory.textContent = error || "Check each matrix entry before visualizing the transformation.";
    return;
  }
  const progress = Number(elements.transformProgress.value) / 100;
  let eigenAnalysis = null;
  try {
    eigenAnalysis = analyzeEigenDirections2x2(model.cells);
  } catch (analysisError) {
    eigenAnalysis = { directions: [], explanation: analysisError.message || "Eigenvectors could not be analysed for this matrix." };
  }
  renderEigenDirectionReadout(eigenAnalysis);
  let frame;
  try {
    frame = drawTransformation(elements.transformCanvas, numeric, progress, {
      colors: visualColors(),
      gridExtent: state.transformExtent,
      labels: { xBasis: "î", yBasis: "ĵ" },
      basisHandles: {
        visible: state.basisEditing,
        active: draggedBasis?.axis || selectedBasisForKeyboard,
        radius: 7,
        hitRadius: 18,
        accessibleText: {
          x: "Drag the î endpoint to edit the first matrix column.",
          y: "Drag the ĵ endpoint to edit the second matrix column.",
        },
      },
      eigenOverlay: eigenOverlayFromAnalysis(eigenAnalysis, progress),
    });
  }
  catch (drawError) {
    transformationFrame = null;
    const message = drawError.message || "This transformation could not be drawn.";
    drawCanvasNotice(elements.transformCanvas, message);
    elements.determinantValue.textContent = "—";
    elements.orientationValue.textContent = "check entries";
    elements.basisI.textContent = "—";
    elements.basisJ.textContent = "—";
    elements.transformationStoryTitle.textContent = "The view needs attention";
    elements.transformationStory.textContent = message;
    return;
  }
  if (!frame) return;
  transformationFrame = frame;
  syncBasisControls(model);
  const det = frame.determinant;
  const eigenCanvasDescription = state.showEigenDirections
    ? frame.eigenOverlay.lines.length
      ? frame.eigenOverlay.lines.map((line) => {
        const endpoint = line.transformedVector.map(fixedTransformDecimal).join(", ");
        return `${line.accessibleText || line.label} Its current endpoint is (${endpoint}).${line.isClipped ? " The arrow continues beyond the current view." : ""}`;
      }).join(" ")
      : transformEigenPresentation(eigenAnalysis).explanation
    : "Eigenvectors are hidden.";
  elements.transformCanvas.setAttribute(
    "aria-label",
    `Coordinate grid showing matrix ${model?.name || "T"} at ${Math.round(progress * 100)}% of the transformation. Determinant ${Number(det.toFixed(3))}; orientation ${frame.orientation}; basis vectors (${frame.xBasis.map((value) => Number(value.toFixed(3))).join(", ")}) and (${frame.yBasis.map((value) => Number(value.toFixed(3))).join(", ")}). ${eigenCanvasDescription}`,
  );
  elements.determinantValue.textContent = Number.isInteger(det) ? String(det) : det.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  elements.orientationValue.textContent = frame.orientation === "collapsed" ? "collapsed" : frame.orientation === "reversed" ? "flipped" : "kept";
  elements.basisI.textContent = `(${frame.xBasis.map((value) => Number(value.toFixed(3))).join(", ")})`;
  elements.basisJ.textContent = `(${frame.yBasis.map((value) => Number(value.toFixed(3))).join(", ")})`;
  if (frame.singular) {
    elements.transformationStoryTitle.textContent = "The plane collapses";
    elements.transformationStory.textContent = "Area becomes zero, so at least one direction is lost and the transformation cannot be undone.";
  } else if (frame.orientation === "reversed") {
    elements.transformationStoryTitle.textContent = "The plane flips over";
    elements.transformationStory.textContent = `At this point, matrix ${model?.name || "T"} reverses orientation while scaling area by ${frame.areaScale.toFixed(2).replace(/\.00$/, "")}.`;
  } else if (Math.abs(frame.areaScale - 1) < 1e-9) {
    elements.transformationStoryTitle.textContent = "The plane keeps its area";
    elements.transformationStory.textContent = "Every grid point moves, but one square unit still covers one square unit after the transformation.";
  } else {
    elements.transformationStoryTitle.textContent = frame.areaScale > 1 ? "The plane expands" : "The plane contracts";
    elements.transformationStory.textContent = `At this point in the animation, area is multiplied by ${frame.areaScale.toFixed(2).replace(/\.00$/, "")}, even though different directions may stretch by different amounts.`;
  }
}

function applyPreset(name) {
  stopTransformationAnimation();
  cancelBasisDrag();
  const presets = {
    rotation: [["0", "-1"], ["1", "0"]],
    reflection: [["-1", "0"], ["0", "1"]],
    projection: [["1", "0"], ["0", "0"]],
  };
  let playground = state.matrices.find((matrix) => matrix.id === "matrix-playground");
  if (!playground) {
    playground = { id: "matrix-playground", name: "Playground", cells: presets[name] };
    state.matrices.push(playground);
  } else playground.cells = presets[name];
  state.transformMatrixId = playground.id;
  renderMatrices();
  elements.transformMatrix.value = playground.id;
  elements.transformProgress.value = "100";
  drawTransformationView();
  saveState();
}

function playbackDuration(kind) {
  const speed = state.playbackSpeed === "fast" ? "fast" : "slow";
  return PLAYBACK_DURATIONS[kind][speed];
}

function syncPlaybackSpeedControls() {
  document.querySelectorAll("[data-playback-speed]").forEach((input) => {
    input.checked = input.value === state.playbackSpeed;
  });
}

function setPlaybackSpeed(speed) {
  state.playbackSpeed = speed === "fast" ? "fast" : "slow";
  stopTransformationAnimation();
  stopSvdAnimation();
  syncPlaybackSpeedControls();
  saveState();
}

function playTransformation() {
  stopTransformationAnimation();
  cancelBasisDrag();
  syncBasisControls(selectedTransformData().model);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    elements.transformProgress.value = "100";
    drawTransformationView();
    return;
  }
  const start = performance.now();
  const duration = playbackDuration("transform");
  const tick = (now) => {
    const raw = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - raw, 3);
    elements.transformProgress.value = String(Math.round(eased * 100));
    drawTransformationView();
    if (raw < 1) animationFrame = requestAnimationFrame(tick);
    else animationFrame = null;
  };
  elements.transformProgress.value = "0";
  animationFrame = requestAnimationFrame(tick);
}

function stopTransformationAnimation() {
  cancelAnimationFrame(animationFrame);
  animationFrame = null;
}

function cancelBasisDrag() {
  if (!draggedBasis) return;
  const pointerId = draggedBasis.pointerId;
  draggedBasis = null;
  try {
    if (elements.transformCanvas.hasPointerCapture?.(pointerId)) {
      elements.transformCanvas.releasePointerCapture(pointerId);
    }
  } catch { /* capture may already be released */ }
}

function basisTargetFromVisiblePoint(axis, point, progress) {
  const safeProgress = Math.max(0.001, progress);
  if (axis === "x") {
    return [
      (point[0] - (1 - safeProgress)) / safeProgress,
      point[1] / safeProgress,
    ];
  }
  return [
    point[0] / safeProgress,
    (point[1] - (1 - safeProgress)) / safeProgress,
  ];
}

function startBasisDrag(event) {
  if (!state.basisEditing || !transformationFrame || event.isPrimary === false) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const rect = elements.transformCanvas.getBoundingClientRect();
  let canvasPoint;
  try {
    canvasPoint = clientToCanvasPoint(event, rect, transformationFrame.viewport);
  } catch {
    return;
  }
  const hit = hitTestBasisEndpoint(canvasPoint, transformationFrame.basisEndpoints, {
    preferredAxis: selectedBasisForKeyboard,
    hitRadius: 18,
  });
  if (!hit) return;
  stopTransformationAnimation();
  if (Number(elements.transformProgress.value) < 20) {
    elements.transformProgress.value = "100";
    drawTransformationView();
  }
  draggedBasis = { axis: hit.axis, pointerId: event.pointerId };
  setSelectedBasis(hit.axis);
  try { elements.transformCanvas.setPointerCapture(event.pointerId); } catch { /* pointer capture is an enhancement */ }
  syncBasisControls(selectedTransformData().model);
  elements.basisDragStatus.textContent = `Dragging ${hit.axis === "x" ? "î" : "ĵ"}. Move its tip; hold Shift for finer 0.05 steps.`;
  event.preventDefault();
}

function moveBasisDrag(event) {
  if (!draggedBasis || event.pointerId !== draggedBasis.pointerId || !transformationFrame) return;
  const { model } = selectedTransformData();
  if (!model) return;
  const rect = elements.transformCanvas.getBoundingClientRect();
  let visiblePoint;
  try {
    visiblePoint = clientToMathPoint(event, rect, transformationFrame.viewport);
  } catch {
    return;
  }
  const progress = Math.max(0.001, Number(elements.transformProgress.value) / 100);
  const target = basisTargetFromVisiblePoint(draggedBasis.axis, visiblePoint, progress)
    .map((value) => snapCoordinate(value, event.shiftKey));
  finishBasisEdit(model, draggedBasis.axis, target[0], target[1], { fine: event.shiftKey, announce: false });
  event.preventDefault();
}

function endBasisDrag(event) {
  if (!draggedBasis || event.pointerId !== draggedBasis.pointerId) return;
  const axis = draggedBasis.axis;
  draggedBasis = null;
  try {
    if (elements.transformCanvas.hasPointerCapture?.(event.pointerId)) {
      elements.transformCanvas.releasePointerCapture(event.pointerId);
    }
  } catch { /* capture may already be released */ }
  const { model } = selectedTransformData();
  drawTransformationView();
  if (model) {
    const x = axis === "x" ? model.cells[0][0] : model.cells[0][1];
    const y = axis === "x" ? model.cells[1][0] : model.cells[1][1];
    elements.basisDragStatus.textContent = `${axis === "x" ? "î" : "ĵ"} set to (${x}, ${y}). Its matrix column is saved.`;
  }
  saveState();
  event.preventDefault();
}

function commitBasisInputs(axis) {
  const { model } = selectedTransformData();
  if (!model || !state.basisEditing) return;
  const xInput = axis === "x" ? elements.basisIX : elements.basisJX;
  const yInput = axis === "x" ? elements.basisIY : elements.basisJY;
  let valid = true;
  [xInput, yInput].forEach((input) => {
    try {
      parseRational(input.value);
      input.setAttribute("aria-invalid", "false");
    } catch {
      input.setAttribute("aria-invalid", "true");
      valid = false;
    }
  });
  if (!valid) {
    elements.basisDragStatus.textContent = "Each basis coordinate must be an integer, decimal, or fraction such as 1/2.";
    return;
  }
  stopTransformationAnimation();
  elements.transformProgress.value = "100";
  setSelectedBasis(axis);
  finishBasisEdit(model, axis, xInput.value.trim(), yInput.value.trim());
}

function nudgeBasis(axis, event) {
  const offsets = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowDown: [0, -1],
    ArrowUp: [0, 1],
  };
  const offset = offsets[event.key];
  if (!offset || !state.basisEditing) return;
  const { model, numeric } = selectedTransformData();
  if (!model || !numeric) return;
  event.preventDefault();
  stopTransformationAnimation();
  elements.transformProgress.value = "100";
  setSelectedBasis(axis);
  const current = axis === "x"
    ? [numeric[0][0], numeric[1][0]]
    : [numeric[0][1], numeric[1][1]];
  const step = event.shiftKey ? 0.05 : 0.25;
  const next = [
    cleanCoordinateNumber(current[0] + offset[0] * step),
    cleanCoordinateNumber(current[1] + offset[1] * step),
  ];
  finishBasisEdit(model, axis, next[0], next[1], { fine: event.shiftKey });
}

function vectorNumeric(vector) {
  return {
    id: vector.id,
    label: vector.label,
    color: vector.color,
    start: [rationalNumber(vector.x), rationalNumber(vector.y)],
    components: [rationalNumber(vector.dx), rationalNumber(vector.dy)],
  };
}

function drawVectorView() {
  let visible;
  try {
    visible = state.vectors.filter((vector) => !vector.hidden).map(vectorNumeric);
    elements.vectorError.textContent = "";
  } catch (error) {
    const message = `The vector plane cannot be drawn yet. ${error.message || "Check every vector value."}`;
    drawCanvasNotice(elements.vectorCanvas, message);
    elements.vectorError.textContent = message;
    return;
  }
  if (state.showResultant && visible.length > 1) {
    const colors = visualColors();
    visible.push(calculateResultant(visible, { color: colors.resultant }));
  }
  try {
    drawVectors(elements.vectorCanvas, visible, { colors: visualColors() });
  } catch (error) {
    const message = `The vector plane could not be drawn. ${error.message || "Check the vector values and try again."}`;
    drawCanvasNotice(elements.vectorCanvas, message);
    elements.vectorError.textContent = message;
    return;
  }
  const description = visible.length
    ? visible.map((vector) => `${vector.label} moves ${vector.components[0]} horizontally and ${vector.components[1]} vertically`).join("; ")
    : "No visible vectors on the plane";
  elements.vectorCanvas.setAttribute("aria-label", `Coordinate plane. ${description}.`);
}

function setVectorSubmitLabel(label) {
  elements.vectorSubmit.replaceChildren(document.createTextNode(`${label} `));
  const arrow = document.createElement("span");
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "→";
  elements.vectorSubmit.append(arrow);
}

function resetVectorForm() {
  editingVectorId = null;
  byId("vector-form-title").textContent = "New vector";
  byId("vector-label").value = String.fromCharCode(117 + (state.vectors.length % 5));
  byId("vector-start-x").value = "0";
  byId("vector-start-y").value = "0";
  byId("vector-dx").value = "3";
  byId("vector-dy").value = "2";
  elements.cancelVectorEdit.hidden = true;
  elements.vectorError.textContent = "";
  setVectorSubmitLabel("Add vector");
}

function editVector(vector) {
  editingVectorId = vector.id;
  byId("vector-form-title").textContent = `Edit vector ${vector.label}`;
  byId("vector-label").value = vector.label;
  byId("vector-start-x").value = vector.x;
  byId("vector-start-y").value = vector.y;
  byId("vector-dx").value = vector.dx;
  byId("vector-dy").value = vector.dy;
  elements.cancelVectorEdit.hidden = false;
  setVectorSubmitLabel("Save vector");
  byId("vector-label").focus();
}

function renderVectorList() {
  elements.vectorList.replaceChildren();
  elements.vectorCount.textContent = `${state.vectors.length} ${state.vectors.length === 1 ? "vector" : "vectors"}`;
  state.vectors.forEach((vector) => {
    const item = document.createElement("li");
    item.className = `vector-item${vector.hidden ? " is-hidden" : ""}`;
    const swatch = document.createElement("span");
    swatch.className = "vector-swatch";
    swatch.style.background = vector.color;
    const text = document.createElement("span");
    const label = document.createElement("strong");
    label.textContent = vector.label;
    const detail = document.createElement("small");
    detail.textContent = `(${vector.x}, ${vector.y}) + ⟨${vector.dx}, ${vector.dy}⟩`;
    text.append(label, detail);
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit vector ${vector.label}`);
    edit.addEventListener("click", () => editVector(vector));
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = vector.hidden ? "Show" : "Hide";
    toggle.setAttribute("aria-label", `${vector.hidden ? "Show" : "Hide"} vector ${vector.label}`);
    toggle.addEventListener("click", () => { vector.hidden = !vector.hidden; renderVectors(); saveState(); });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete vector ${vector.label}`);
    remove.addEventListener("click", () => {
      state.vectors = state.vectors.filter((item) => item.id !== vector.id);
      if (editingVectorId === vector.id) resetVectorForm();
      renderVectors();
      saveState();
    });
    item.append(swatch, text, edit, toggle, remove);
    elements.vectorList.append(item);
  });
}

function renderVectors() {
  elements.showResultant.checked = Boolean(state.showResultant);
  renderVectorList();
  drawVectorView();
}

function formatLabNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return number === Infinity ? "∞" : "—";
  const rounded = Math.abs(number) < 0.005 ? 0 : number;
  return rounded.toFixed(2);
}

function formatLabPoint(point) {
  return `(${point.map(formatLabNumber).join(", ")})`;
}

function syncProjectionInputs() {
  const controls = [
    [elements.projectionAX, state.projectionDirection[0]],
    [elements.projectionAY, state.projectionDirection[1]],
    [elements.projectionBX, state.projectionTarget[0]],
    [elements.projectionBY, state.projectionTarget[1]],
  ];
  let restoredInvalidValue = false;
  controls.forEach(([input, value]) => {
    if (document.activeElement !== input) {
      restoredInvalidValue ||= input.getAttribute("aria-invalid") === "true";
      input.value = String(cleanCoordinateNumber(value));
      input.setAttribute("aria-invalid", "false");
    }
  });
  if (restoredInvalidValue && controls.every(([input]) => input.getAttribute("aria-invalid") !== "true")) {
    elements.projectionError.textContent = "";
  }
}

function commitProjectionInputs() {
  const controls = [
    elements.projectionAX,
    elements.projectionAY,
    elements.projectionBX,
    elements.projectionBY,
  ];
  const values = controls.map((input) => input.valueAsNumber);
  let valid = true;
  controls.forEach((input, index) => {
    const inputValid = Number.isFinite(values[index]);
    input.setAttribute("aria-invalid", String(!inputValid));
    valid = valid && inputValid;
  });
  if (!valid) {
    elements.projectionError.textContent = "Enter a finite number in every coordinate.";
    return;
  }
  const direction = values.slice(0, 2).map((value) => cleanCoordinateNumber(value));
  if (direction[0] === 0 && direction[1] === 0) {
    elements.projectionAX.setAttribute("aria-invalid", "true");
    elements.projectionAY.setAttribute("aria-invalid", "true");
    elements.projectionError.textContent = "Direction a cannot be (0, 0), because it would not span a line.";
    return;
  }
  state.projectionDirection = direction;
  state.projectionTarget = values.slice(2).map((value) => cleanCoordinateNumber(value));
  controls.forEach((input) => input.setAttribute("aria-invalid", "false"));
  elements.projectionError.textContent = "";
  elements.projectionDragStatus.textContent = `Coordinates updated: a is ${formatLabPoint(state.projectionDirection)} and b is ${formatLabPoint(state.projectionTarget)}.`;
  drawProjectionView();
  saveState();
}

function drawProjectionView() {
  if (byId("projection-panel").hidden) return;
  syncProjectionInputs();
  let comparison;
  try {
    comparison = compareLineProjections(state.projectionDirection, state.projectionTarget);
    const requiredExtent = Math.max(
      5,
      ...[
        ...comparison.direction,
        ...comparison.target,
        ...comparison.l2.point,
        ...comparison.l1.intervalPoints.flat(),
      ].map((value) => Math.abs(value) * 1.18),
    );
    const drawingExtent = projectionDrag?.frozenExtent ?? requiredExtent;
    projectionFrame = drawProjectionComparison(
      elements.projectionCanvas,
      comparison.direction,
      comparison.target,
      {
        colors: visualColors(),
        extent: drawingExtent,
        accessibleText:
          `Projection comparison. Target b is ${formatLabPoint(comparison.target)} and the line spanned by direction a uses ${formatLabPoint(comparison.direction)}. ` +
          `The L two least-squares projection is ${formatLabPoint(comparison.l2.point)}. ` +
          `${comparison.l1.nonUnique ? `The L one nearest points form a segment from ${formatLabPoint(comparison.l1.intervalPoints[0])} to ${formatLabPoint(comparison.l1.intervalPoints[1])}.` : `The L one nearest point is ${formatLabPoint(comparison.l1.point)}.`}`,
      },
    );
    const directionCanvas = projectionFrame.directionHandle.canvas;
    const targetCanvas = projectionFrame.targetHandle.canvas;
    const clustered = Math.hypot(
      directionCanvas[0] - targetCanvas[0],
      directionCanvas[1] - targetCanvas[1],
    ) < 46;
    const directionOffset = clustered ? -18 : 0;
    const targetOffset = clustered ? 18 : 0;
    const positionHandle = (handle, point, offsetX) => {
      handle.hidden = false;
      handle.classList.toggle("is-clustered", clustered);
      handle.style.left = `${Math.min(projectionFrame.size.width - 22, Math.max(22, point[0] + offsetX))}px`;
      handle.style.top = `${Math.min(projectionFrame.size.height - 22, Math.max(22, point[1]))}px`;
    };
    positionHandle(elements.projectionDirectionHandle, directionCanvas, directionOffset);
    positionHandle(elements.projectionDragHandle, targetCanvas, targetOffset);
    elements.projectionDirectionHandle.setAttribute(
      "aria-label",
      `Move spanning direction a, currently ${formatLabPoint(comparison.direction)}. Use the arrow keys for quarter-unit steps; hold Shift for finer steps.`,
    );
    elements.projectionDragHandle.setAttribute(
      "aria-label",
      `Move target b, currently ${formatLabPoint(comparison.target)}. Use the arrow keys for quarter-unit steps; hold Shift for finer steps.`,
    );
  } catch (error) {
    projectionFrame = null;
    elements.projectionDirectionHandle.hidden = true;
    elements.projectionDragHandle.hidden = true;
    const message = error.message || "The projection comparison could not be drawn.";
    drawCanvasNotice(elements.projectionCanvas, message);
    elements.projectionError.textContent = message;
    return;
  }

  elements.projectionL2Distance.textContent = formatLabNumber(comparison.l2.squaredDistance);
  elements.projectionL1Distance.textContent = formatLabNumber(comparison.l1.distance);
  elements.projectionL2Point.textContent = formatLabPoint(comparison.l2.point);
  elements.projectionL1Point.textContent = comparison.l1.nonUnique
    ? `${formatLabPoint(comparison.l1.intervalPoints[0])} → ${formatLabPoint(comparison.l1.intervalPoints[1])}`
    : formatLabPoint(comparison.l1.point);
  elements.projectionL2Residual.textContent = formatLabPoint(comparison.l2.residual);
  elements.projectionL1Residual.textContent = formatLabPoint(comparison.l1.residual);

  const answersAgree = Math.hypot(
    comparison.l2.point[0] - comparison.l1.point[0],
    comparison.l2.point[1] - comparison.l1.point[1],
  ) < 0.01;
  if (comparison.l1.nonUnique) {
    elements.projectionStoryTitle.textContent = "L₁ has many nearest points";
    elements.projectionStory.textContent = "The blue segment is the complete L₁ answer. Its midpoint is highlighted only as a representative optimum; every point on the segment has the same absolute error.";
    elements.projectionUniqueness.textContent = `L₁ minimisers use t from ${formatLabNumber(comparison.l1.interval[0])} to ${formatLabNumber(comparison.l1.interval[1])}.`;
  } else if (answersAgree) {
    elements.projectionStoryTitle.textContent = "The norms agree here";
    elements.projectionStory.textContent = "For this geometry, perpendicular distance and Manhattan distance choose the same point on the line.";
    elements.projectionUniqueness.textContent = `Both methods select t = ${formatLabNumber(comparison.l1.parameter)}.`;
  } else {
    elements.projectionStoryTitle.textContent = "The norms choose different points";
    elements.projectionStory.textContent = "L₂ uses a perpendicular residual. L₁ follows horizontal and vertical movement, so its diamond-shaped distance contours touch the line elsewhere.";
    elements.projectionUniqueness.textContent = `L₂ uses t = ${formatLabNumber(comparison.l2.parameter)}; L₁ uses t = ${formatLabNumber(comparison.l1.parameter)}.`;
  }
}

function projectionValue(kind) {
  return kind === "direction" ? state.projectionDirection : state.projectionTarget;
}

function projectionHandle(kind) {
  return kind === "direction" ? projectionFrame?.directionHandle : projectionFrame?.targetHandle;
}

function projectionVectorName(kind) {
  return kind === "direction" ? "spanning direction a" : "target b";
}

function startProjectionDrag(event) {
  const kind = event.currentTarget.dataset.projectionVector;
  const handle = projectionHandle(kind);
  if (!projectionFrame || !handle || event.isPrimary === false) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  let pointerPoint;
  try {
    pointerPoint = clientToMathPoint(
      event,
      elements.projectionCanvas.getBoundingClientRect(),
      projectionFrame.viewport,
    );
  } catch {
    return;
  }
  const currentValue = projectionValue(kind);
  projectionDrag = {
    kind,
    pointerId: event.pointerId,
    element: event.currentTarget,
    frozenExtent: projectionFrame.viewport.bounds.maxX,
    grabOffset: [currentValue[0] - pointerPoint[0], currentValue[1] - pointerPoint[1]],
  };
  elements.projectionCanvas.closest(".projection-canvas-wrap")?.classList.add("is-dragging");
  try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* optional enhancement */ }
  elements.projectionDragStatus.textContent = kind === "direction"
    ? "Dragging a. Move it away from the origin to rotate the spanning line."
    : "Dragging b. Release it to compare the two nearest-point rules.";
  event.preventDefault();
}

function moveProjectionDrag(event) {
  if (projectionDrag?.pointerId !== event.pointerId || !projectionFrame) return;
  let point;
  try {
    point = clientToMathPoint(
      event,
      elements.projectionCanvas.getBoundingClientRect(),
      projectionFrame.viewport,
    );
    point = [
      point[0] + projectionDrag.grabOffset[0],
      point[1] + projectionDrag.grabOffset[1],
    ];
  } catch {
    return;
  }
  const { bounds } = projectionFrame.viewport;
  const step = event.shiftKey ? 0.05 : 0.1;
  const candidate = [
    Math.min(bounds.maxX, Math.max(bounds.minX, point[0])),
    Math.min(bounds.maxY, Math.max(bounds.minY, point[1])),
  ].map((value) => cleanCoordinateNumber(Math.round(value / step) * step));
  if (projectionDrag.kind === "direction" && candidate[0] === 0 && candidate[1] === 0) {
    elements.projectionDragStatus.textContent = "a must stay non-zero, so the last valid direction is being kept.";
    event.preventDefault();
    return;
  }
  if (projectionDrag.kind === "direction") state.projectionDirection = candidate;
  else state.projectionTarget = candidate;
  syncProjectionInputs();
  drawProjectionView();
  saveState();
  event.preventDefault();
}

function endProjectionDrag(event) {
  if (projectionDrag?.pointerId !== event.pointerId) return;
  const completedDrag = projectionDrag;
  projectionDrag = null;
  elements.projectionCanvas.closest(".projection-canvas-wrap")?.classList.remove("is-dragging");
  try {
    if (completedDrag.element.hasPointerCapture?.(event.pointerId)) {
      completedDrag.element.releasePointerCapture(event.pointerId);
    }
  } catch { /* capture may already be gone */ }
  const value = projectionValue(completedDrag.kind);
  elements.projectionDragStatus.textContent = `${projectionVectorName(completedDrag.kind)} is now ${formatLabPoint(value)}. The coordinate inputs remain available for precise editing.`;
  drawProjectionView();
  saveState();
  event.preventDefault();
}

function nudgeProjectionHandle(event) {
  const offsets = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowDown: [0, -1],
    ArrowUp: [0, 1],
  };
  const offset = offsets[event.key];
  if (!offset) return;
  event.preventDefault();
  const kind = event.currentTarget.dataset.projectionVector;
  const currentValue = projectionValue(kind);
  const step = event.shiftKey ? 0.05 : 0.25;
  const candidate = [
    cleanCoordinateNumber(currentValue[0] + offset[0] * step),
    cleanCoordinateNumber(currentValue[1] + offset[1] * step),
  ];
  if (kind === "direction" && candidate[0] === 0 && candidate[1] === 0) {
    elements.projectionDragStatus.textContent = "a must stay non-zero, so the last valid direction is being kept.";
    return;
  }
  if (kind === "direction") state.projectionDirection = candidate;
  else state.projectionTarget = candidate;
  elements.projectionDragStatus.textContent = `${projectionVectorName(kind)} moved to ${formatLabPoint(candidate)}.`;
  syncProjectionInputs();
  drawProjectionView();
  saveState();
}

function cancelProjectionDrag() {
  if (!projectionDrag) return;
  const cancelledDrag = projectionDrag;
  projectionDrag = null;
  elements.projectionCanvas.closest(".projection-canvas-wrap")?.classList.remove("is-dragging");
  try {
    if (cancelledDrag.element.hasPointerCapture?.(cancelledDrag.pointerId)) {
      cancelledDrag.element.releasePointerCapture(cancelledDrag.pointerId);
    }
  } catch { /* capture may already be gone */ }
}

function selectedSvdData() {
  const matrix = matrixById(elements.svdMatrix.value || state.svdMatrixId);
  if (!matrix || matrix.cells.length !== 2 || matrix.cells[0].length !== 2) {
    return { model: null, numeric: null, error: "Create a 2×2 matrix to use the SVD explorer." };
  }
  try {
    return { model: matrix, numeric: matrix.cells.map((row) => row.map(rationalNumber)), error: null };
  } catch (error) {
    return { model: matrix, numeric: null, error: `Matrix ${matrix.name} cannot be decomposed yet. ${error.message}` };
  }
}

function formatLabMatrix(matrix) {
  return `[${matrix.map((row) => row.map(formatLabNumber).join("  ")).join(";  ")}]`;
}

function accessibleLabMatrix(name, matrix) {
  return `${name} matrix. ${matrix.map((row, index) =>
    `Row ${index + 1}: ${row.map(formatLabNumber).join(", ")}`
  ).join(". ")}.`;
}

function svdStagePresentation(progress) {
  if (progress < 0.02) return { label: "Input", title: "Start with the canonical basis", copy: "The solid grid begins at the identity; the faint dashed grid previews the final transformation A." };
  if (progress < 0.98) return { label: "Vᵀ", title: "Vᵀ aligns the input", copy: "The first orthogonal factor rotates or reflects the grid toward the directions that Σ will scale." };
  if (progress < 1.02) return { label: "Vᵀ", title: "The first orthogonal move is complete", copy: "The basis and every grid line have now moved through Vᵀ." };
  if (progress < 1.98) return { label: "Σ", title: "Σ stretches or collapses", copy: "Σ scales independently along the coordinate axes, so grid spacing can widen, shrink, or disappear." };
  if (progress < 2.02) return { label: "Σ", title: "The stretch is complete", copy: "The singular values have set the two scale factors; a zero value collapses one direction." };
  if (progress < 3) return { label: "U", title: "U sets the final orientation", copy: "The last orthogonal factor rotates or reflects the stretched grid toward the faint destination." };
  return { label: "U", title: "The factors reconstruct A", copy: "The solid grid now matches the faint destination: UΣVᵀ has produced the same transformation as A." };
}

function clearSvdReadout(message) {
  elements.svdError.textContent = message;
  elements.svdRank.textContent = "—";
  elements.svdCondition.textContent = "—";
  elements.svdSigmaOne.textContent = "—";
  elements.svdSigmaTwo.textContent = "—";
  elements.svdSigmaOneBar.style.width = "0";
  elements.svdSigmaTwoBar.style.width = "0";
  elements.svdU.textContent = "—";
  elements.svdSigma.textContent = "—";
  elements.svdVT.textContent = "—";
}

function drawSvdView() {
  if (byId("svd-panel").hidden) return;
  const { model, numeric, error } = selectedSvdData();
  state.svdProgress = Math.min(3, Math.max(0, Number(state.svdProgress) || 0));
  elements.svdProgress.value = String(Math.round(state.svdProgress * 100));
  const presentation = svdStagePresentation(state.svdProgress);
  elements.svdProgressLabel.value = presentation.label;
  elements.svdProgress.setAttribute(
    "aria-valuetext",
    `${presentation.label} stage, ${Math.round(state.svdProgress / 3 * 100)} percent complete`,
  );
  if (elements.svdStageCopy.textContent !== presentation.copy) {
    elements.svdStageCopy.textContent = presentation.copy;
  }
  document.querySelectorAll("[data-svd-stage]").forEach((button) => {
    const selected = Math.abs(Number(button.dataset.svdStage) - state.svdProgress) < 0.02;
    button.setAttribute("aria-pressed", String(selected));
  });

  if (error || !numeric) {
    const message = error || "This matrix cannot be decomposed.";
    drawCanvasNotice(elements.svdCanvas, message);
    clearSvdReadout(message);
    return;
  }

  let decomposition;
  try {
    decomposition = svd2x2(numeric);
    drawSvdExplorer(
      elements.svdCanvas,
      decomposition,
      state.svdProgress,
      {
        colors: visualColors(),
        accessibleText:
          `SVD of matrix ${model.name} at the ${presentation.label} stage. ` +
          `The solid Cartesian grid and canonical basis vectors show the current cumulative factors; the faint dashed grid shows the final transformation A. ` +
          `Singular values are ${formatLabNumber(decomposition.singularValues[0])} and ${formatLabNumber(decomposition.singularValues[1])}; rank ${decomposition.rank}.`,
      },
    );
    elements.svdError.textContent = "";
  } catch (drawError) {
    const message = drawError.message || "The SVD explorer could not draw this matrix.";
    drawCanvasNotice(elements.svdCanvas, message);
    clearSvdReadout(message);
    return;
  }

  elements.svdStoryTitle.textContent = presentation.title;
  elements.svdStory.textContent = presentation.copy;
  elements.svdRank.textContent = String(decomposition.rank);
  elements.svdCondition.textContent = Number.isFinite(decomposition.conditionNumber)
    ? decomposition.conditionNumber >= 10_000
      ? decomposition.conditionNumber.toExponential(1)
      : formatLabNumber(decomposition.conditionNumber)
    : "∞";
  elements.svdSigmaOne.textContent = formatLabNumber(decomposition.singularValues[0]);
  elements.svdSigmaTwo.textContent = formatLabNumber(decomposition.singularValues[1]);
  const sigmaRatio = decomposition.singularValues[0] > 0
    ? decomposition.singularValues[1] / decomposition.singularValues[0]
    : 0;
  elements.svdSigmaOneBar.style.width = decomposition.singularValues[0] > 0 ? "100%" : "0";
  elements.svdSigmaTwoBar.style.width = `${Math.max(0, Math.min(100, sigmaRatio * 100))}%`;
  const renderSvdMatrix = (element, matrix, name) => {
    const fallback = formatLabMatrix(matrix);
    renderTex(
      element,
      matrixToTex(matrix, (value) => scalarTextToTex(formatLabNumber(value))),
      fallback,
      { ariaLabel: accessibleLabMatrix(name, matrix) },
    );
  };
  renderSvdMatrix(elements.svdU, decomposition.U, "U");
  renderSvdMatrix(elements.svdSigma, decomposition.Sigma, "Sigma");
  renderSvdMatrix(elements.svdVT, decomposition.VT, "V transpose");

  if (decomposition.rank === 0) {
    elements.svdNote.textContent = "Both singular values are zero, so the grid and both basis vectors collapse to the origin.";
  } else if (decomposition.rank === 1) {
    elements.svdNote.textContent = decomposition.singularValues[1] === 0
      ? "σ₂ = 0, so one dimension is lost and the grid collapses onto a line."
      : "σ₂ is non-zero but below the numerical rank threshold. The grid becomes extremely thin, and the full factorisation is still retained.";
  } else if (decomposition.leftOrientation === "reflection") {
    elements.svdNote.textContent = `${decomposition.repeatedSingularValues ? "The singular values are equal or nearly equal, so the singular directions are not unique. " : ""}This matrix reverses orientation. The preview rotates continuously, then applies the reflection as a final jump because a reflection cannot be reached continuously through rotations.`;
  } else if (decomposition.repeatedSingularValues) {
    elements.svdNote.textContent = "The singular values are equal or nearly equal, so the singular directions are not unique; this explorer uses one stable valid basis.";
  } else {
    elements.svdNote.textContent = "The faint dashed grid is the final A-transformed destination; the solid grid shows the current cumulative factor stage.";
  }
}

function stopSvdAnimation() {
  cancelAnimationFrame(svdAnimationFrame);
  svdAnimationFrame = null;
}

function setSvdProgress(progress, persist = true) {
  stopSvdAnimation();
  state.svdProgress = Math.min(3, Math.max(0, Number(progress) || 0));
  drawSvdView();
  if (persist) saveState();
}

function playSvd() {
  stopSvdAnimation();
  elements.svdPlayStatus.textContent = "";
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    state.svdProgress = 3;
    drawSvdView();
    saveState();
    return;
  }
  const start = performance.now();
  const duration = playbackDuration("svd");
  const tick = (now) => {
    const amount = Math.min(1, (now - start) / duration);
    state.svdProgress = amount * 3;
    drawSvdView();
    if (amount < 1) svdAnimationFrame = requestAnimationFrame(tick);
    else {
      svdAnimationFrame = null;
      elements.svdPlayStatus.textContent = "SVD factor animation complete.";
      saveState();
    }
  };
  state.svdProgress = 0;
  drawSvdView();
  svdAnimationFrame = requestAnimationFrame(tick);
}

function switchView(view, updateHistory = true) {
  view = WORKSPACE_VIEWS.has(view) ? view : "calculator";
  const previousView = document.querySelector(".nav-tab.is-active")?.dataset.view;
  if (view !== "transform") {
    stopTransformationAnimation();
    cancelBasisDrag();
  }
  if (view !== "projection") cancelProjectionDrag();
  if (view !== "svd") stopSvdAnimation();
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll(".workspace-panel").forEach((panel) => {
    const active = panel.dataset.panel === view;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  const activeTab = document.querySelector(`.nav-tab[data-view="${view}"]`);
  const workspaceNav = activeTab?.closest(".workspace-nav");
  if (activeTab && workspaceNav?.scrollWidth > workspaceNav.clientWidth) {
    activeTab.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }
  if (updateHistory && previousView !== view) {
    history.pushState(null, "", `#${view}`);
  }
  requestAnimationFrame(() => {
    if (view === "transform") drawTransformationView();
    if (view === "vectors") drawVectorView();
    if (view === "projection") drawProjectionView();
    if (view === "svd") drawSvdView();
  });
}

function bindRovingButtons(selector, activate) {
  const buttons = [...document.querySelectorAll(selector)];
  buttons.forEach((button, index) => button.addEventListener("keydown", (event) => {
    let nextIndex = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % buttons.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + buttons.length) % buttons.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = buttons.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextButton = buttons[nextIndex];
    activate(nextButton);
    nextButton.focus();
  }));
}

function openMatrixDialog(mode) {
  matrixDialogMode = mode;
  const renaming = mode === "rename";
  byId("matrix-dialog-kicker").textContent = renaming ? "Rename matrix" : "New matrix";
  byId("matrix-dialog-title").textContent = renaming ? "Choose a clearer name" : "Give it a name";
  byId("matrix-dialog-description").textContent = renaming
    ? "The matrix and its saved values will stay exactly the same."
    : "You can change its size once it is on your shelf.";
  byId("matrix-dialog-submit").textContent = renaming ? "Save name" : "Create matrix";
  elements.newMatrixName.value = renaming ? activeMatrix().name : "";
  elements.newMatrixError.textContent = "";
  elements.newMatrixDialog.showModal();
  requestAnimationFrame(() => { elements.newMatrixName.focus(); elements.newMatrixName.select(); });
}

function uniqueMatrixName(base) {
  let candidate = base;
  let counter = 2;
  while (state.matrices.some((matrix) => matrix.name.toLowerCase() === candidate.toLowerCase())) {
    candidate = `${base} ${counter}`;
    counter += 1;
  }
  return candidate;
}

function bindEvents() {
  document.querySelectorAll(".nav-tab").forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  document.querySelectorAll(".operation-chip").forEach((button) => button.addEventListener("click", () => {
    state.operation = button.dataset.operation;
    currentResult = null;
    clearCalculationError();
    renderOperation();
    renderResult();
    saveState();
  }));
  bindRovingButtons(".nav-tab", (tab) => switchView(tab.dataset.view));
  bindRovingButtons(".operation-chip", (button) => {
    state.operation = button.dataset.operation;
    currentResult = null;
    clearCalculationError();
    renderOperation();
    renderResult();
    saveState();
  });
  document.querySelectorAll("[data-format]").forEach((button) => button.addEventListener("click", () => {
    state.resultFormat = button.dataset.format;
    renderResult();
    saveState();
  }));
  elements.decimalPrecision.addEventListener("change", () => {
    state.decimalPrecision = Number(elements.decimalPrecision.value);
    renderResult();
    saveState();
  });
  elements.rowCount.addEventListener("change", () => resizeActiveMatrix(Number(elements.rowCount.value), activeMatrix().cells[0].length));
  elements.columnCount.addEventListener("change", () => resizeActiveMatrix(activeMatrix().cells.length, Number(elements.columnCount.value)));
  elements.operandB.addEventListener("change", () => {
    state.operandB = elements.operandB.value;
    currentResult = null;
    clearCalculationError();
    renderResult();
    saveState();
  });
  elements.calculateButton.addEventListener("click", () => calculate(true));

  byId("new-matrix-button").addEventListener("click", () => openMatrixDialog("create"));
  byId("rename-matrix-button").addEventListener("click", () => openMatrixDialog("rename"));
  byId("duplicate-matrix-button").addEventListener("click", () => {
    const source = activeMatrix();
    const id = `matrix-${Date.now()}`;
    const copy = { id, name: uniqueMatrixName(`${source.name} copy`), cells: source.cells.map((row) => [...row]) };
    state.matrices.push(copy);
    state.activeMatrixId = id;
    state.operandA = id;
    currentResult = null;
    elements.editorError.textContent = "";
    clearCalculationError();
    renderMatrices();
    renderResult();
    saveState();
  });
  byId("cancel-new-matrix").addEventListener("click", () => elements.newMatrixDialog.close());
  byId("new-matrix-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = elements.newMatrixName.value.trim();
    if (!name) { elements.newMatrixError.textContent = "Enter a short name for the matrix."; return; }
    if (state.matrices.some((matrix) => matrix.name.toLowerCase() === name.toLowerCase() && (matrixDialogMode !== "rename" || matrix.id !== activeMatrix().id))) { elements.newMatrixError.textContent = "That name is already on your shelf."; return; }
    if (matrixDialogMode === "rename") {
      activeMatrix().name = name;
      elements.newMatrixDialog.close();
      clearCalculationError();
      renderMatrices();
      saveState();
      return;
    }
    const id = `matrix-${Date.now()}`;
    state.matrices.push({ id, name, cells: [["1", "0"], ["0", "1"]] });
    state.activeMatrixId = id;
    state.operandA = id;
    currentResult = null;
    elements.editorError.textContent = "";
    clearCalculationError();
    elements.newMatrixDialog.close();
    renderMatrices(); renderResult();
    saveState();
  });
  byId("delete-matrix-button").addEventListener("click", () => {
    elements.editorError.textContent = "";
    if (state.matrices.length === 1) { elements.editorError.textContent = "Keep at least one matrix in the workspace."; return; }
    const target = activeMatrix();
    if (!confirm(`Delete matrix ${target.name}?`)) return;
    state.matrices = state.matrices.filter((matrix) => matrix.id !== target.id);
    state.activeMatrixId = state.matrices[0].id;
    state.operandA = state.activeMatrixId;
    if (!matrixById(state.operandB)) state.operandB = state.matrices[0].id;
    currentResult = null;
    elements.editorError.textContent = "";
    clearCalculationError();
    renderMatrices(); renderResult(); saveState();
  });
  byId("paste-matrix-button").addEventListener("click", () => {
    elements.editorError.textContent = "";
    elements.pastePanel.hidden = false;
    elements.pasteInput.focus();
  });
  byId("cancel-paste").addEventListener("click", () => {
    elements.pastePanel.hidden = true;
    elements.editorError.textContent = "";
    byId("paste-matrix-button").focus();
  });
  byId("apply-paste").addEventListener("click", () => {
    try {
      const rows = elements.pasteInput.value.trim().split(/;|\n/).map((row) => row.trim().split(/[\s,]+/).filter(Boolean));
      if (!rows.length || !rows[0].length || rows.length > MAX_SIZE || rows[0].length > MAX_SIZE || rows.some((row) => row.length !== rows[0].length)) throw new Error("Use a rectangular matrix up to 6×6.");
      matrixFromStrings(rows);
      activeMatrix().cells = rows;
      elements.pastePanel.hidden = true;
      elements.pasteInput.value = "";
      elements.editorError.textContent = "";
      currentResult = null;
      clearCalculationError();
      renderMatrices(); renderResult(); saveState();
      byId("paste-matrix-button").focus();
    } catch (error) {
      elements.editorError.textContent = error.message || "That pasted matrix could not be read.";
    }
  });
  byId("clear-history").addEventListener("click", () => { state.history = []; renderHistory(); saveState(); });
  byId("reset-workspace").addEventListener("click", () => {
    if (!confirm("Reset all matrices, vectors, lab settings, and recent calculations?")) return;
    state = defaultState(); currentResult = null; editingVectorId = null; elements.editorError.textContent = ""; renderAll(); resetVectorForm(); saveState(); switchView("calculator");
  });

  elements.transformMatrix.addEventListener("change", () => {
    stopTransformationAnimation();
    state.transformMatrixId = elements.transformMatrix.value || null;
    drawTransformationView();
    saveState();
  });
  elements.transformProgress.addEventListener("input", () => { stopTransformationAnimation(); drawTransformationView(); });
  elements.basisEditToggle.addEventListener("change", () => {
    state.basisEditing = elements.basisEditToggle.checked;
    if (!state.basisEditing) cancelBasisDrag();
    drawTransformationView();
    saveState();
  });
  elements.eigenDirectionsToggle.addEventListener("change", () => {
    state.showEigenDirections = elements.eigenDirectionsToggle.checked;
    drawTransformationView();
    saveState();
  });
  [[elements.basisISelect, "x"], [elements.basisJSelect, "y"]].forEach(([button, axis]) => {
    button.addEventListener("click", () => { setSelectedBasis(axis, true); drawTransformationView(); });
    button.addEventListener("focus", () => setSelectedBasis(axis));
    button.addEventListener("keydown", (event) => nudgeBasis(axis, event));
  });
  [[elements.basisIX, "x"], [elements.basisIY, "x"], [elements.basisJX, "y"], [elements.basisJY, "y"]].forEach(([input, axis]) => {
    input.addEventListener("change", () => commitBasisInputs(axis));
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commitBasisInputs(axis);
    });
  });
  elements.transformCanvas.addEventListener("pointerdown", startBasisDrag);
  elements.transformCanvas.addEventListener("pointermove", moveBasisDrag);
  elements.transformCanvas.addEventListener("pointerup", endBasisDrag);
  elements.transformCanvas.addEventListener("pointercancel", endBasisDrag);
  elements.transformCanvas.addEventListener("lostpointercapture", endBasisDrag);
  byId("play-transform").addEventListener("click", playTransformation);
  document.querySelectorAll("[data-playback-speed]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) setPlaybackSpeed(input.value);
    });
  });
  byId("zoom-out").addEventListener("click", () => { state.transformExtent = Math.min(10, state.transformExtent + 1); drawTransformationView(); saveState(); });
  byId("zoom-in").addEventListener("click", () => { state.transformExtent = Math.max(2, state.transformExtent - 1); drawTransformationView(); saveState(); });
  document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => applyPreset(button.dataset.preset)));

  elements.vectorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    elements.vectorError.textContent = "";
    try {
      const values = {
        x: byId("vector-start-x").value,
        y: byId("vector-start-y").value,
        dx: byId("vector-dx").value,
        dy: byId("vector-dy").value,
      };
      Object.values(values).forEach(parseRational);
      if (Math.abs(rationalNumber(values.dx)) < 1e-12 && Math.abs(rationalNumber(values.dy)) < 1e-12) throw new Error("Give the vector some movement in x or y.");
      const label = byId("vector-label").value.trim() || `v${state.vectors.length + 1}`;
      const editing = state.vectors.find((vector) => vector.id === editingVectorId);
      if (editing) Object.assign(editing, { label, ...values });
      else state.vectors.push({ id: `vector-${Date.now()}`, label, ...values, color: palette[state.vectors.length % palette.length], hidden: false });
      resetVectorForm();
      renderVectors(); saveState();
    } catch (error) { elements.vectorError.textContent = error.message || "Check the vector values."; }
  });
  elements.cancelVectorEdit.addEventListener("click", resetVectorForm);
  elements.showResultant.addEventListener("change", () => { state.showResultant = elements.showResultant.checked; renderVectors(); saveState(); });

  [elements.projectionAX, elements.projectionAY, elements.projectionBX, elements.projectionBY].forEach((input) => {
    input.addEventListener("change", commitProjectionInputs);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commitProjectionInputs();
    });
  });
  [elements.projectionDirectionHandle, elements.projectionDragHandle].forEach((handle) => {
    handle.addEventListener("pointerdown", startProjectionDrag);
    handle.addEventListener("pointermove", moveProjectionDrag);
    handle.addEventListener("pointerup", endProjectionDrag);
    handle.addEventListener("pointercancel", endProjectionDrag);
    handle.addEventListener("lostpointercapture", endProjectionDrag);
    handle.addEventListener("keydown", nudgeProjectionHandle);
  });

  elements.svdMatrix.addEventListener("change", () => {
    stopSvdAnimation();
    state.svdMatrixId = elements.svdMatrix.value || null;
    drawSvdView();
    saveState();
  });
  elements.svdProgress.addEventListener("input", () => setSvdProgress(Number(elements.svdProgress.value) / 100));
  document.querySelectorAll("[data-svd-stage]").forEach((button) => button.addEventListener("click", () => {
    setSvdProgress(Number(button.dataset.svdStage));
  }));
  byId("play-svd").addEventListener("click", playSvd);

  const syncViewFromLocation = () => {
    const requestedView = location.hash.replace(/^#/, "");
    const view = WORKSPACE_VIEWS.has(requestedView) ? requestedView : "calculator";
    if (document.querySelector(".nav-tab.is-active")?.dataset.view !== view) {
      switchView(view, false);
    }
  };
  window.addEventListener("popstate", syncViewFromLocation);
  window.addEventListener("hashchange", syncViewFromLocation);

  window.addEventListener("resize", () => {
    drawTransformationView();
    drawVectorView();
    drawProjectionView();
    drawSvdView();
  });
  window.addEventListener("pagehide", persistState);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && saveTimer) persistState();
  });
}

function renderAll() {
  state.decimalPrecision = [2, 4, 6, 8].includes(Number(state.decimalPrecision)) ? Number(state.decimalPrecision) : 4;
  elements.decimalPrecision.value = String(state.decimalPrecision);
  renderMatrices();
  renderOperation();
  renderHistory();
  renderResult();
  renderVectors();
  syncPlaybackSpeedControls();
  syncProjectionInputs();
}

fillSizeSelect(elements.rowCount);
fillSizeSelect(elements.columnCount);
bindEvents();
renderAll();
switchView(
  WORKSPACE_VIEWS.has(location.hash.replace(/^#/, ""))
    ? location.hash.replace(/^#/, "")
    : "calculator",
  false,
);
