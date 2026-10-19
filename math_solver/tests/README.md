# Math Solver Tests

## Engine And Worker

From the repository root:

```sh
node --test math_solver/tests/*.test.cjs
```

The suites use the bundled mathjs and Nerdamer files. They cover exact scalar arithmetic, radicals, matrices, statistics, equations, calculus, resource limits, and the worker import/result contract. The system helper suites also cover exact rational polynomial elimination and bounded real numerical search, including multiple branches, three-variable symmetric systems, rational denominators, transcendental equations, rank deficiency, scaling, domain failures, and work budgets.

General systems accept up to 8 unknowns and 16 scalar equalities, separated by semicolons, newlines, or LaTeX `cases`. Omitting `options.variables` automatically selects all unknowns; an explicit array such as `['x', 'y']` leaves other symbols (for example `a`) as parameters. `options.variable` continues to select the scalar equation/calculus variable. Systems try exact elimination and branch back-substitution before numerical search; an analytic solution is not guaranteed. The common `rootLower`/`rootUpper` interval defaults to `[-10, 10]` for every numerically searched variable. Exact symbolic solutions are not restricted to this interval. Numerical search only finds real roots within a finite range, may miss roots, and cannot prove nonexistence merely by finding none. System results retain flat `solutions` records and add `solutionSets` (one array of variable records per solution); `answerLatex`, `answerText`, and `table` can be rendered directly.

## System Frontend And Resource Loading

Check JavaScript syntax from the repository root:

```sh
node --check math_solver/js/app.js
node --check math_solver/js/catalog.js
node --check math_solver/js/solver-worker.js
```

Check the following without navigating a browser that is being used by another task:

- In `index.html`, the deferred `system-numeric.js?v=12` and `system-polynomial.js?v=12` scripts must both precede `engine.js?v=12`. Catalog and app scripts also use `v=12`; dependencies must retain their execution order.
- The app gives the worker the engine script's query. The worker must preserve all of `self.location.search` on both helpers and the engine, import the helpers before the engine, and use `?v=12` when no query is present. A Node `vm` context can execute these local scripts in page order and capture worker `importScripts` calls without browser navigation.
- Auto and solve modes expose system unknowns and root bounds; other modes hide these system/search controls. A blank unknowns field must omit `options.variables`, while comma-separated names must survive history replay and a shared-link round trip. The existing scalar variable setting must remain independent.
- Run the catalog's four-solution polynomial, three-variable nonlinear, trigonometric, exponential, logarithmic, and rational system examples. Check that the equation category's first four examples include nonlinear systems, and that grouped answers and tables render using the existing result components. At mobile widths, the added field should wrap within the existing options grid.

The Node suites and VM checks do not replace a visual mobile layout check in a separate browser session.

## Formula And Text Input

Open `math_solver/index.html`, then run this in that page's browser console:

```js
const script = document.createElement('script');
script.src = 'tests/editor.browser.js';
await new Promise((resolve, reject) => {
  script.onload = resolve;
  script.onerror = reject;
  document.head.append(script);
});
await MathSolverBrowserTests.run();
```

The result contains `passed`, `failed`, `total`, and per-case results. The tests replace the current input and leave it empty. Run at desktop and mobile widths. They use the real bundled MathLive field and check structure as well as computed values, including nested roots/fractions, selections, powers, matching fences, matrix cells, undo/redo, and text placeholders.

Pointer long-press and physical keyboard events should also be checked with browser automation or manually. The script exercises the insertion paths but is not a substitute for trusted pointer/key event tests.
