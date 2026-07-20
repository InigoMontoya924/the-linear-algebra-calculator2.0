import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const publicRoot = new URL("../public/", import.meta.url);
const distClient = new URL("../dist/client/", import.meta.url);

async function listRelativeFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await listRelativeFiles(new URL(`${entry.name}/`, directory), `${relative}/`));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files.sort();
}

async function staticAssetFetch(request) {
  const url = new URL(request.url);
  const relative = url.pathname.replace(/^\/+/, "") || "index.html";
  try {
    const body = await readFile(new URL(relative, distClient));
    const mime = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
    }[extname(relative)] || "application/octet-stream";
    return new Response(body, { headers: { "content-type": mime } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

test("production worker serves the finished product and its modules", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const env = { ASSETS: { fetch: staticAssetFetch } };

  const home = await worker.fetch(new Request("https://linear-algebra-calculator.test/"), env);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type") ?? "", /^text\/html/);
  const html = await home.text();
  assert.match(html, /<title>The Linear Algebra Calculator 2\.0<\/title>/);
  assert.match(html, /Matrix <em>calculator\.<\/em>/);

  const app = await worker.fetch(new Request("https://linear-algebra-calculator.test/app.js"), env);
  assert.equal(app.status, 200);
  assert.match(await app.text(), /linear-algebra-calculator\.workspace\.v1/);

  const labs = await worker.fetch(new Request("https://linear-algebra-calculator.test/labs.js"), env);
  assert.equal(labs.status, 200);
  assert.match(await labs.text(), /projectOntoLineL1|svd2x2/);

  const mathRendering = await worker.fetch(new Request("https://linear-algebra-calculator.test/math-rendering.js"), env);
  assert.equal(mathRendering.status, 200);
  assert.match(await mathRendering.text(), /tex2svgPromise|matrixToTex/);
});

test("the web build loads pinned MathJax and renders dynamic TeX", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");
  const app = await readFile(new URL("app.js", publicRoot), "utf8");
  const rendering = await readFile(new URL("math-rendering.js", publicRoot), "utf8");

  assert.match(html, /cdn\.jsdelivr\.net\/npm\/mathjax@4\.0\.0\/tex-svg\.js/);
  assert.match(html, /typeset:\s*false/);
  assert.match(app, /matrixToTex|renderMathAwareText|renderTex/);
  assert.match(rendering, /tex2svgPromise/);
  assert.match(rendering, /readable source text remains in place/);
});

test("product HTML exposes all five accessible learning workspaces", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");
  assert.match(html, /role="tablist"/);
  for (const workspace of ["calculator", "transform", "vectors", "projection", "svd"]) {
    assert.match(html, new RegExp(`id="${workspace}-tab"[^>]*aria-controls="${workspace}-panel"`));
    assert.match(html, new RegExp(`id="${workspace}-panel"[^>]*aria-labelledby="${workspace}-tab"`));
  }
  assert.match(html, /aria-label="Matrix cell editor"/);
  assert.match(html, /id="transform-canvas"[^>]*role="img"/);
  assert.match(html, /id="vector-canvas"[^>]*role="img"/);
  assert.match(html, /id="projection-canvas"[^>]*role="img"/);
  assert.match(html, /id="svd-canvas"[^>]*role="img"/);
  assert.match(html, /Exact<\/button>/);
  assert.match(html, /Decimal<\/button>/);
  assert.doesNotMatch(html, /codex-preview|taking shape|react-loading-skeleton/i);
});

test("browser code keeps calculations local and includes the complete parity set", async () => {
  const source = await readFile(new URL("app.js", publicRoot), "utf8");
  for (const operation of ["rref", "add", "multiply", "inverse", "diagonalize"]) {
    assert.match(source, new RegExp(`\\b${operation}\\b`));
  }
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /MAX_SIZE = 6/);
  assert.match(source, /diagonalizeMatrix\(first\)/);
  assert.match(source, /first:\s*\{ name: firstModel\.name, cells:/);
  assert.match(source, /const needsSecond = operation === "add" \|\| operation === "multiply"/);
  assert.match(source, /elements\.editorError\.textContent = "";\n\s+clearCalculationError\(\);\n\s+renderMatrices\(\); renderResult\(\); saveState\(\);/);
  assert.match(source, /Matrix .* cannot be drawn yet/);
  assert.doesNotMatch(source, /\beval\s*\(|new Function|\bfetch\s*\(/);
  await Promise.all([
    access(new URL("math.js", publicRoot)),
    access(new URL("visuals.js", publicRoot)),
    access(new URL("labs.js", publicRoot)),
    access(new URL("lab-visuals.js", publicRoot)),
    access(new URL("styles.css", publicRoot)),
  ]);
});

test("operation failures explain both the reason and a useful next step", async () => {
  const source = await readFile(new URL("app.js", publicRoot), "utf8");
  for (const code of [
    "INVALID_ENTRY",
    "DIMENSION_MISMATCH",
    "NON_SQUARE",
    "SINGULAR",
    "COMPLEX_EIGENVALUES",
    "NOT_DIAGONALIZABLE",
    "UNSUPPORTED_IRRATIONAL_EIGENVALUES",
  ]) {
    assert.match(source, new RegExp(`code === "${code}"|code === "[^"]+" \\|\\| code === "${code}"`));
  }
  assert.match(source, /What to try:/);
  assert.match(source, /matrixName: model\.name/);
  assert.match(source, /pagehide/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /calculation\.approximate \? "≈" : "="/);
});

test("the interface uses the Oxford-blue education theme", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");
  const css = await readFile(new URL("styles.css", publicRoot), "utf8");
  assert.match(html, /meta name="theme-color" content="#002147"/);
  assert.match(html, /Step 1 · Choose/);
  assert.match(html, /Step 4 · Understand/);
  assert.match(css, /--oxford-900:\s*#002147/);
  assert.match(css, /\.operation-panel \.form-error\[data-visible="true"\]/);
});

test("a clean checkout builds before running deployment tests", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.match(packageJson.scripts.test, /^npm run build &&/);
});

test("the Pages artifact is complete and safe under a repository subpath", async () => {
  const sourceFiles = await listRelativeFiles(publicRoot);
  const artifactFiles = await listRelativeFiles(distClient);
  assert.deepEqual(artifactFiles, sourceFiles);

  const repositoryUrl = new URL("https://example.github.io/theLinearAlgebraCalculator2.0/");
  const html = await readFile(new URL("index.html", distClient), "utf8");
  const htmlReferences = [...html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/g)]
    .map((match) => match[1]);

  async function assertLocalReference(reference, baseUrl, sourceName) {
    if (reference.startsWith("#")) return;
    const resolved = new URL(reference, baseUrl);
    if (resolved.origin !== repositoryUrl.origin) return;
    assert.ok(
      resolved.pathname.startsWith(repositoryUrl.pathname),
      `${sourceName} reference ${reference} escapes the GitHub Pages repository path`,
    );
    const relative = decodeURIComponent(resolved.pathname.slice(repositoryUrl.pathname.length)) || "index.html";
    await access(new URL(relative, distClient));
  }

  await Promise.all(htmlReferences.map((reference) => (
    assertLocalReference(reference, repositoryUrl, "index.html")
  )));

  for (const filename of artifactFiles.filter((entry) => entry.endsWith(".js"))) {
    const source = await readFile(new URL(filename, distClient), "utf8");
    const imports = [...source.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)]
      .map((match) => match[1] ?? match[2]);
    const moduleUrl = new URL(filename, repositoryUrl);
    await Promise.all(imports.map((reference) => (
      assertLocalReference(reference, moduleUrl, filename)
    )));
  }

  for (const filename of artifactFiles.filter((entry) => entry.endsWith(".css"))) {
    const source = await readFile(new URL(filename, distClient), "utf8");
    const references = [...source.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)]
      .map((match) => match[2]);
    const stylesheetUrl = new URL(filename, repositoryUrl);
    await Promise.all(references.map((reference) => (
      assertLocalReference(reference, stylesheetUrl, filename)
    )));
  }
});

test("responsive and accessibility safeguards ship with the interface", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");
  const css = await readFile(new URL("styles.css", publicRoot), "utf8");
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media \(max-width: 780px\)/);
  assert.match(css, /@media \(max-width: 470px\)/);
  assert.doesNotMatch(css, /position:\s*fixed/);
  assert.match(html, /id="new-matrix-dialog"[^>]*aria-labelledby="matrix-dialog-title"[^>]*aria-describedby="matrix-dialog-description"/);
  assert.match(html, /id="editor-error"[^>]*role="alert"/);
  const app = await readFile(new URL("app.js", publicRoot), "utf8");
  assert.match(app, /bindRovingButtons\("\.nav-tab"/);
  assert.match(app, /bindRovingButtons\("\.operation-chip"/);
});

test("basis editing and eigen-direction exploration are wired for pointer and keyboard use", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");
  const app = await readFile(new URL("app.js", publicRoot), "utf8");
  const css = await readFile(new URL("styles.css", publicRoot), "utf8");

  for (const id of [
    "basis-edit-toggle",
    "eigen-directions-toggle",
    "basis-drag-status",
    "basis-i-select",
    "basis-j-select",
    "basis-i-x",
    "basis-i-y",
    "basis-j-x",
    "basis-j-y",
    "eigen-direction-readout",
    "eigen-direction-list",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, /id="basis-drag-status"[^>]*aria-live="polite"/);
  assert.match(html, /id="transform-canvas"[^>]*aria-describedby="[^"]*basis-drag-status/);
  assert.match(app, /analyzeEigenDirections2x2\(model\.cells\)/);
  assert.match(app, /hitTestBasisEndpoint\(/);
  assert.match(app, /clientToCanvasPoint\(/);
  assert.match(app, /clientToMathPoint\(/);
  assert.match(app, /model\.cells\[0\]\[0\] = String\(x\)/);
  assert.match(app, /model\.cells\[1\]\[1\] = String\(y\)/);
  assert.match(app, /addEventListener\("pointerdown", startBasisDrag\)/);
  assert.match(app, /addEventListener\("pointermove", moveBasisDrag\)/);
  assert.match(app, /addEventListener\("pointerup", endBasisDrag\)/);
  assert.match(app, /ArrowLeft:[^\n]*\[-1, 0\]/);
  assert.match(app, /basisEditing: parsed\.basisEditing !== false/);
  assert.match(app, /showEigenDirections: parsed\.showEigenDirections !== false/);
  assert.match(app, /transformMatrixId/);
  assert.match(app, /state\.transformMatrixId = elements\.transformMatrix\.value \|\| null/);
  assert.match(app, /announce: false/);
  assert.match(css, /#transform-canvas\.is-basis-editing[^}]*cursor:\s*grab/s);
  assert.match(css, /#transform-canvas\.is-dragging[^}]*cursor:\s*grabbing/s);
});

test("the matrix shelf is the primary calculator selector", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");
  const app = await readFile(new URL("app.js", publicRoot), "utf8");

  assert.doesNotMatch(html, /id="operand-a"/);
  assert.match(html, /id="operand-a-name"/);
  assert.match(html, /Selected from your matrices/);
  assert.match(app, /const firstModel = activeMatrix\(\)/);
  assert.match(app, /state\.operandA = primary\.id/);
  assert.match(app, /button\.setAttribute\("aria-pressed"/);
  assert.match(app, /state\.activeMatrixId = entry\.operandA/);
  assert.doesNotMatch(app, /elements\.operandA\.addEventListener/);
});

test("the transformation toolbar and eigen readout use the simplified presentation", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");
  const app = await readFile(new URL("app.js", publicRoot), "utf8");
  const favicon = await readFile(new URL("favicon.svg", publicRoot), "utf8");

  assert.match(html, /data-preset="rotation"[^>]*>Rotation<\/button>/);
  assert.doesNotMatch(html, /Quarter turn|data-preset="shear"/);
  assert.doesNotMatch(html, /See the structure\. Build the intuition\. Keep the exact answer\./);
  assert.match(app, /function fixedTransformDecimal\(value\)/);
  assert.match(app, /toDecimal\(2, false\)/);
  assert.match(app, /direction\.vector\.map\(fixedTransformDecimal\)/);
  assert.match(app, /labels: \{ xBasis: "î", yBasis: "ĵ" \}/);
  assert.match(app, /stretchCue:[\s\S]+?showLabel: true/);
  assert.match(app, /has length 1/);
  assert.match(app, /The transform sends it to/);
  assert.match(html, />Eigenvectors<\/span>/);
  assert.match(html, /<small>Unit vectors<\/small><h3[^>]*>Eigenvector stretching<\/h3>/);
  assert.doesNotMatch(html, /id="eigen-direction-readout"[^>]*aria-live/);
  assert.doesNotMatch(app, /shear:\s*\[\[/);
  assert.match(favicon, /#002147/);
  assert.match(favicon, /#F1B434/);
  assert.match(favicon, /#8FD0EE/);
});

test("projection compares L₂ least squares with the complete L₁ nearest-point answer", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");
  const app = await readFile(new URL("app.js", publicRoot), "utf8");
  const labs = await readFile(new URL("labs.js", publicRoot), "utf8");

  for (const id of [
    "projection-a-x",
    "projection-a-y",
    "projection-b-x",
    "projection-b-y",
    "projection-drag-status",
    "projection-uniqueness",
    "projection-direction-handle",
    "projection-drag-handle",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /L₂ least squares/);
  assert.match(html, /L₁ absolute error/);
  assert.match(html, /Why can L₁ have several answers\?/);
  assert.match(html, /data-projection-vector="direction"/);
  assert.match(html, /data-projection-vector="target"/);
  assert.match(app, /drawProjectionComparison\(/);
  assert.match(app, /\[elements\.projectionDirectionHandle, elements\.projectionDragHandle\]\.forEach/);
  assert.match(app, /handle\.addEventListener\("pointerdown", startProjectionDrag\)/);
  assert.match(app, /handle\.addEventListener\("pointermove", moveProjectionDrag\)/);
  assert.match(app, /handle\.addEventListener\("keydown", nudgeProjectionHandle\)/);
  assert.match(app, /projectionDrag\.kind === "direction"/);
  assert.match(app, /Coordinates updated: a is/);
  assert.match(app, /direction\[0\] === 0 && direction\[1\] === 0/);
  assert.match(labs, /weighted medians/);
  assert.match(labs, /nonUnique/);
  assert.doesNotMatch(app, /L1 least squares/i);
});

test("playback speed is shared, persisted, and never shorter than two seconds", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");
  const app = await readFile(new URL("app.js", publicRoot), "utf8");

  assert.equal((html.match(/class="playback-speed-control"/g) ?? []).length, 2);
  assert.match(html, /name="transform-playback-speed" value="slow"[^>]*data-playback-speed[^>]*checked/);
  assert.match(html, /name="transform-playback-speed" value="fast"[^>]*data-playback-speed/);
  assert.match(html, /name="svd-playback-speed" value="slow"[^>]*data-playback-speed[^>]*checked/);
  assert.match(html, /name="svd-playback-speed" value="fast"[^>]*data-playback-speed/);
  assert.match(html, /aria-describedby="transform-speed-help"/);
  assert.match(html, /aria-describedby="svd-speed-help"/);
  assert.match(app, /playbackSpeed: "slow"/);
  assert.match(app, /playbackSpeed: parsed\.playbackSpeed === "fast" \? "fast" : "slow"/);
  assert.match(app, /transform: Object\.freeze\(\{ slow: 4200, fast: 2200 \}\)/);
  assert.match(app, /svd: Object\.freeze\(\{ slow: 7500, fast: 4500 \}\)/);
  assert.match(app, /playbackDuration\("transform"\)/);
  assert.match(app, /playbackDuration\("svd"\)/);
  assert.match(app, /document\.querySelectorAll\("\[data-playback-speed\]"\)/);
  assert.match(app, /input\.checked = input\.value === state\.playbackSpeed/);
  assert.match(app, /if \(input\.checked\) setPlaybackSpeed\(input\.value\)/);
});

test("SVD explorer exposes V transpose, Sigma, and U as ordered factor stages", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");
  const app = await readFile(new URL("app.js", publicRoot), "utf8");
  const labs = await readFile(new URL("labs.js", publicRoot), "utf8");

  for (const stage of [0, 1, 2, 3]) {
    assert.match(html, new RegExp(`data-svd-stage="${stage}"`));
  }
  for (const id of ["svd-matrix", "svd-progress", "svd-u", "svd-sigma", "svd-vt"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /id="svd-vector-angle"|id="svd-angle-label"/);
  assert.match(html, /A = UΣVᵀ/);
  assert.match(html, /aria-label="A equals U times Sigma times V transpose"/);
  assert.match(html, /id="svd-intro-title">SVD in three moves/);
  assert.match(html, /SVD decomposes any real rectangular matrix A as A = UΣVᵀ/);
  assert.match(html, /rotation or reflection, followed by a stretch or collapse, then another rotation or reflection/);
  assert.match(html, /this explorer visualises the 2×2 case/i);
  assert.match(html, /press Play factors or select a stage/i);
  assert.match(html, /solid grid and canonical basis move toward the faint final A-grid/);
  assert.match(html, /Why are the basis vectors enough\?/);
  const svdPanel = html.slice(html.indexOf('id="svd-panel"'));
  assert.ok(svdPanel.indexOf('id="svd-intro-title"') < svdPanel.indexOf('class="visual-layout learning-lab-layout"'));
  assert.match(app, /drawSvdExplorer\(/);
  assert.match(app, /leftOrientation === "reflection"/);
  assert.match(app, /renderSvdMatrix\(elements\.svdU, decomposition\.U, "U"\)/);
  assert.match(app, /aria-valuetext/);
  assert.doesNotMatch(app, /svdVectorAngle|unit circle|ellipse/i);
  assert.match(labs, /I -> V\^T -> Sigma V\^T -> U Sigma V\^T/);
  assert.match(labs, /normalizedDeterminant \/ sigmaNormalized1/);
});

test("new labs retain keyboard alternatives and readable mobile navigation", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");
  const css = await readFile(new URL("styles.css", publicRoot), "utf8");
  const app = await readFile(new URL("app.js", publicRoot), "utf8");

  assert.match(html, /id="projection-canvas"[^>]*aria-describedby="[^"]*projection-input-help/);
  assert.match(html, /id="svd-play-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.doesNotMatch(html, /id="svd-stage-copy"[^>]*aria-live/);
  assert.match(css, /\.workspace-nav[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.nav-tab[^}]*min-width:\s*86px/s);
  assert.match(css, /\.projection-canvas-wrap canvas[^}]*touch-action:\s*auto/s);
  assert.match(css, /\.projection-drag-handle[^}]*touch-action:\s*none/s);
  assert.match(css, /\.svd-overview[^}]*grid-template-columns:\s*minmax/s);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.svd-overview\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(max-width: 470px\)[\s\S]*\.playback-controls\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /@media \(max-width: 470px\)[\s\S]*\.workspace-nav\s*\{[^}]*grid-template-columns:\s*repeat\(6/);
  assert.match(app, /if \(view === "projection"\) drawProjectionView\(\)/);
  assert.match(app, /if \(view === "svd"\) drawSvdView\(\)/);
  assert.match(app, /activeTab\.scrollIntoView/);
  assert.match(app, /svdPlayStatus\.textContent = "SVD factor animation complete\."/);
  assert.match(app, /history\.pushState\(null, "", `#\$\{view\}`\)/);
  assert.match(app, /window\.addEventListener\("popstate"/);
  assert.match(app, /restoredInvalidValue/);
  assert.match(app, /projectionDirection = normalizedPair/);
  assert.match(app, /squareMatrixIds\.has\(parsed\.svdMatrixId\)/);
});

test("version 2 branding and publication assets are release-ready", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const readme = await readFile(new URL("README.md", root), "utf8");
  const buildWeek = await readFile(new URL("BUILD_WEEK.md", root), "utf8");
  const legacyReadme = await readFile(new URL("README_linear_calc.md", root), "utf8");
  const legacyApp = await readFile(new URL("linear_calc.py", root), "utf8");
  const deploymentGuide = await readFile(new URL("DEPLOYMENT.md", root), "utf8");
  const pagesWorkflow = await readFile(new URL(".github/workflows/pages.yml", root), "utf8");
  const app = await readFile(new URL("app.js", publicRoot), "utf8");

  assert.equal(packageJson.name, "linear-algebra-calculator");
  assert.equal(packageJson.version, "2.0.0");
  assert.equal(packageJson.license, "MIT");
  assert.equal(packageJson.private, true);
  assert.match(html, /name="application-name" content="The Linear Algebra Calculator 2\.0"/);
  assert.match(html, /aria-label="The Linear Algebra Calculator 2\.0 home"/);
  assert.match(html, /<strong>The Linear Algebra Calculator 2\.0<\/strong>/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/app\.js"/);
  assert.doesNotMatch(html, /\bLinear Lab\b/);
  assert.match(app, /Math\.min\(4, matrix\.cells\[0\]\.length\)/);
  assert.match(readme, /^# The Linear Algebra Calculator 2\.0/m);
  assert.match(readme, /## How it's built/);
  assert.match(readme, /\[linear_calc\.py\]\(linear_calc\.py\)/);
  assert.match(readme, /GPT-5\.6 Sol Ultra/);
  assert.match(legacyReadme, /old REAMDME I wrote for linear_calc\.py/);
  assert.match(legacyApp, /from tkinter import \*/);
  assert.match(deploymentGuide, /Settings → Pages/);
  assert.match(deploymentGuide, /GitHub Actions/);
  assert.match(buildWeek, /Education/);
  assert.match(buildWeek, /GPT-5\.6/);
  assert.match(buildWeek, /\/feedback/);
  assert.match(buildWeek, /three minutes or shorter/);
  assert.match(pagesWorkflow, /actions\/checkout@v7/);
  assert.match(pagesWorkflow, /actions\/setup-node@v6/);
  assert.match(pagesWorkflow, /actions\/configure-pages@v6/);
  assert.match(pagesWorkflow, /actions\/upload-pages-artifact@v5/);
  assert.match(pagesWorkflow, /path: \.\/dist\/client/);
  assert.match(pagesWorkflow, /actions\/deploy-pages@v5/);
  assert.match(pagesWorkflow, /run: npm test/);
  assert.match(pagesWorkflow, /needs: build/);
});
