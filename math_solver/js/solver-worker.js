/* Keep symbolic computations off the UI thread when served over HTTP(S). */
// The engine query must match the one the page loaded, otherwise the worker silently
// keeps solving with a cached copy of an older engine.
importScripts('../vendor/math.min.js', '../vendor/nerdamer.min.js', 'engine.js' + (self.location.search || '?v=1'));
self.addEventListener('message', function (event) {
  const { id, input, options } = event.data || {};
  try { self.postMessage({ id, result: self.MathSolverEngine.solve(input, options) }); }
  catch (error) { self.postMessage({ id, error: error && error.message ? error.message : '无法完成此计算，请检查表达式。' }); }
});
