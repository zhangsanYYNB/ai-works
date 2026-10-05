# Math Solver Tests

## Engine And Worker

From the repository root:

```sh
node --test math_solver/tests/engine.test.cjs
```

The suite uses the bundled mathjs and Nerdamer files. It covers exact scalar arithmetic, radicals, matrices, statistics, equations, calculus, resource limits, and the worker import/result contract.

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
