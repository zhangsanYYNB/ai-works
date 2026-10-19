/* Keep symbolic computations off the UI thread when served over HTTP(S). */
// Match the page's query for the engine and its helpers to avoid mixing cached versions.
const query = self.location.search || '?v=12';
importScripts('../vendor/math.min.js', '../vendor/nerdamer.min.js', 'system-numeric.js' + query,
  'system-polynomial.js' + query, 'engine.js' + query);
self.addEventListener('message', function (event) {
  const { id, input, options } = event.data || {};
  try { self.postMessage({ id, result: self.MathSolverEngine.solve(input, options) }); }
  catch (error) { self.postMessage({ id, error: error && error.message ? error.message : '无法完成此计算，请检查表达式。' }); }
});
