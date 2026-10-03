/* Example inputs are executable; no network resources are used. */
(function (root) {
  'use strict';
  const examples = [
    { id: 'quadratic', category: '方程与不等式', label: '一元二次方程', input: 'x^2-5x+6=0', latex: 'x^2-5x+6=0', mode: 'solve' },
    { id: 'fraction', category: '科学计算', label: '分数与根式', input: '1/3+1/6+sqrt(2)', latex: '\\frac{1}{3}+\\frac{1}{6}+\\sqrt{2}', mode: 'evaluate' },
    { id: 'diff', category: '微积分', label: '乘积与复合函数求导', input: 'x^2*sin(x)', latex: 'x^2\\sin(x)', mode: 'derivative' },
    { id: 'system', category: '方程与不等式', label: '二元线性方程组', input: '2x+y=7; x-y=2', latex: '\\begin{cases}2x+y=7\\\\x-y=2\\end{cases}', mode: 'solve', text: true },
    { id: 'factor', category: '代数', label: '多项式因式分解', input: 'x^3-x', latex: 'x^3-x', mode: 'factor' },
    { id: 'expand', category: '代数', label: '二项式展开', input: '(x+2)^4', latex: '(x+2)^4', mode: 'expand' },
    { id: 'simplify', category: '代数', label: '分式化简', input: '(x^2-1)/(x-1)', latex: '\\frac{x^2-1}{x-1}', mode: 'simplify' },
    { id: 'quadratic-complex', category: '方程与不等式', label: '复数根', input: 'x^2+2x+5=0', latex: 'x^2+2x+5=0', mode: 'solve' },
    { id: 'cubic', category: '方程与不等式', label: '高次多项式方程', input: 'x^3-6x^2+11x-6=0', mode: 'solve' },
    { id: 'inequality', category: '方程与不等式', label: '二次不等式', input: 'x^2-5x+6<=0', latex: 'x^2-5x+6\\le0', mode: 'solve' },
    { id: 'rational-ineq', category: '方程与不等式', label: '有理式不等式', input: '(x+1)/(x-2)>0', latex: '\\frac{x+1}{x-2}>0', mode: 'solve' },
    { id: 'system3', category: '方程与不等式', label: '三元线性方程组', input: 'x+y+z=6; 2x-y+z=3; x+2y-z=2', mode: 'solve', text: true },
    { id: 'transcendental', category: '方程与不等式', label: '非多项式方程实根搜索', input: 'cos(x)=x', latex: '\\cos(x)=x', mode: 'solve', options: { angle: 'rad' } },
    { id: 'absolute-equation', category: '方程与不等式', label: '绝对值方程', input: 'abs(x-1)=2', latex: '\\left|x-1\\right|=2', mode: 'solve' },
    { id: 'absolute-inequality', category: '方程与不等式', label: '绝对值不等式', input: 'abs(x-1)<=2', latex: '\\left|x-1\\right|\\le2', mode: 'solve' },
    { id: 'trig-rad', category: '科学计算', label: '弧度制三角函数', input: 'sin(pi/6)+cos(pi/3)', latex: '\\sin\\frac{\\pi}{6}+\\cos\\frac{\\pi}{3}', mode: 'evaluate', options: { angle: 'rad' } },
    { id: 'trig-deg', category: '科学计算', label: '角度制三角函数', input: 'sin(30)+cos(60)', latex: '\\sin(30)+\\cos(60)', mode: 'evaluate', options: { angle: 'deg' } },
    { id: 'inverse-trig', category: '科学计算', label: '反三角函数', input: 'asin(0.5)', mode: 'evaluate', options: { angle: 'deg' } },
    { id: 'log', category: '科学计算', label: '指定底数的对数', input: 'log(32,2)+ln(e^3)', mode: 'evaluate' },
    { id: 'complex', category: '科学计算', label: '复数运算', input: '(2+3i)*(1-2i)', latex: '(2+3i)(1-2i)', mode: 'evaluate' },
    { id: 'complex-root', category: '科学计算', label: '负数平方根', input: 'sqrt(-16)', latex: '\\sqrt{-16}', mode: 'evaluate' },
    { id: 'factorial', category: '科学计算', label: '阶乘与组合数', input: 'combinations(10,3)', latex: '\\binom{10}{3}', mode: 'evaluate' },
    { id: 'permutation', category: '科学计算', label: '排列数', input: 'permutations(8,3)', mode: 'evaluate' },
    { id: 'gcd', category: '科学计算', label: '最大公约数', input: 'gcd(84,126,210)', mode: 'evaluate' },
    { id: 'lcm', category: '科学计算', label: '最小公倍数', input: 'lcm(12,18,24)', mode: 'evaluate' },
    { id: 'percent', category: '科学计算', label: '百分比与复利', input: '10000*(1+5%)^3', latex: '10000(1+5\\%)^3', mode: 'evaluate' },
    { id: 'hyperbolic', category: '科学计算', label: '双曲函数', input: 'sinh(1)^2-cosh(1)^2', mode: 'evaluate' },
    { id: 'derivative-chain', category: '微积分', label: '链式法则', input: 'ln(1+x^2)', latex: '\\ln(1+x^2)', mode: 'derivative' },
    { id: 'derivative2', category: '微积分', label: '二阶导数', input: 'x^4+sin(x)', latex: 'x^4+\\sin(x)', mode: 'derivative', options: { order: 2 } },
    { id: 'integral', category: '微积分', label: '不定积分', input: '3x^2+2x+1', mode: 'integral' },
    { id: 'integral-parts', category: '微积分', label: '分部积分', input: 'x*exp(x)', latex: 'xe^x', mode: 'integral' },
    { id: 'definite', category: '微积分', label: '定积分', input: 'sin(x)', latex: '\\int_0^\\pi\\sin(x)\\,dx', mode: 'integral', options: { lower: '0', upper: 'pi', angle: 'rad' } },
    { id: 'limit', category: '微积分', label: '经典极限', input: 'sin(x)/x', latex: '\\lim_{x\\to0}\\frac{\\sin x}{x}', mode: 'limit', options: { point: '0', angle: 'rad' } },
    { id: 'limit-infinity', category: '微积分', label: '无穷远极限', input: '(3x^2+2)/(x^2-1)', latex: '\\lim_{x\\to\\infty}\\frac{3x^2+2}{x^2-1}', mode: 'limit', options: { point: 'Infinity' } },
    { id: 'limit-right', category: '微积分', label: '单侧极限', input: '1/x', latex: '\\lim_{x\\to0^+}\\frac{1}{x}', mode: 'limit', options: { point: '0', direction: 'right' } },
    { id: 'sum', category: '微积分', label: '有限求和', input: 'sum(k^2,k,1,10)', latex: '\\sum_{k=1}^{10}k^2', mode: 'auto', text: true },
    { id: 'product', category: '微积分', label: '有限连乘', input: 'product(k,k,1,6)', latex: '\\prod_{k=1}^{6}k', mode: 'auto', text: true },
    { id: 'det', category: '矩阵与统计', label: '矩阵行列式', input: 'det([1,2;3,4])', latex: '\\det\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}', mode: 'matrix', text: true },
    { id: 'inverse', category: '矩阵与统计', label: '矩阵求逆', input: 'inv([2,1;1,1])', latex: '\\begin{bmatrix}2&1\\\\1&1\\end{bmatrix}^{-1}', mode: 'matrix', text: true },
    { id: 'matrix-multiply', category: '矩阵与统计', label: '矩阵乘法', input: '[1,2;3,4]*[2,0;1,2]', latex: '\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}\\begin{bmatrix}2&0\\\\1&2\\end{bmatrix}', mode: 'matrix', text: true },
    { id: 'transpose', category: '矩阵与统计', label: '矩阵转置', input: 'transpose([1,2,3;4,5,6])', mode: 'matrix', text: true },
    { id: 'dot', category: '矩阵与统计', label: '向量点积', input: 'dot([1,2,3],[4,5,6])', mode: 'matrix', text: true },
    { id: 'cross', category: '矩阵与统计', label: '向量叉积', input: 'cross([1,0,0],[0,1,0])', mode: 'matrix', text: true },
    { id: 'stats', category: '矩阵与统计', label: '描述统计', input: '2,4,4,4,5,5,7,9', latex: '2,4,4,4,5,5,7,9', mode: 'statistics', text: true },
    { id: 'stats-decimal', category: '矩阵与统计', label: '小数数据统计', input: '12.5,10.2,13.8,9.5,11.4,10.2', mode: 'statistics', text: true },
    { id: 'unit-length', category: '单位换算', label: '长度换算', input: '12 inch to cm', mode: 'units', text: true },
    { id: 'unit-temp', category: '单位换算', label: '温度换算', input: '32 degF to degC', mode: 'units', text: true },
    { id: 'unit-speed', category: '单位换算', label: '速度换算', input: '100 km/h to m/s', mode: 'units', text: true },
    { id: 'unit-mass', category: '单位换算', label: '质量换算', input: '1 lb to kg', mode: 'units', text: true },
    { id: 'unit-energy', category: '单位换算', label: '能量换算', input: '1 kWh to J', mode: 'units', text: true },
    { id: 'unit-area', category: '单位换算', label: '面积换算', input: '1 acre to m^2', mode: 'units', text: true },
    { id: 'binomial', category: '科学计算', label: '二项分布概率', input: 'combinations(10,3)*0.5^3*(1-0.5)^7', mode: 'evaluate', text: true }
  ];
  const reference = [
    { title: '代数与方程', formulas: [
      { name: '二次方程求根公式', latex: 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}', example: 'quadratic' },
      { name: '平方差', latex: 'a^2-b^2=(a-b)(a+b)', input: 'x^2-9', mode: 'factor' },
      { name: '完全平方', latex: '(a+b)^2=a^2+2ab+b^2', input: '(x+3)^2', mode: 'expand' },
      { name: '立方和', latex: 'a^3+b^3=(a+b)(a^2-ab+b^2)', input: 'x^3+8', mode: 'factor' }
    ] },
    { title: '三角函数', formulas: [
      { name: '基本恒等式', latex: '\\sin^2x+\\cos^2x=1', input: 'sin(pi/4)^2+cos(pi/4)^2', mode: 'evaluate', options: { angle: 'rad' } },
      { name: '倍角公式', latex: '\\sin(2x)=2\\sin x\\cos x', input: 'sin(2*pi/6)', mode: 'evaluate', options: { angle: 'rad' } },
      { name: '角度与弧度', latex: '180^\\circ=\\pi\\;\\mathrm{rad}', example: 'trig-deg' },
      { name: '反三角函数', latex: '\\arcsin(\\tfrac12)=\\tfrac\\pi6=30^\\circ', example: 'inverse-trig' }
    ] },
    { title: '微分', formulas: [
      { name: '幂函数求导', latex: '\\frac{d}{dx}x^n=nx^{n-1}', input: 'x^5', mode: 'derivative' },
      { name: '乘积法则', latex: '(uv)\'=u\'v+uv\'', example: 'diff' },
      { name: '链式法则', latex: '\\frac{d}{dx}f(g(x))=f\'(g(x))g\'(x)', example: 'derivative-chain' },
      { name: '指数与对数', latex: '(e^x)\'=e^x,\\qquad(\\ln x)\'=\\frac1x', input: 'exp(x)+ln(x)', mode: 'derivative' }
    ] },
    { title: '积分与极限', formulas: [
      { name: '幂函数积分（n ≠ −1）', latex: '\\int x^n\\,dx=\\frac{x^{n+1}}{n+1}+C', example: 'integral' },
      { name: '分部积分', latex: '\\int u\\,dv=uv-\\int v\\,du', example: 'integral-parts' },
      { name: '微积分基本定理', latex: '\\int_a^bf(x)\\,dx=F(b)-F(a)', example: 'definite' },
      { name: '经典三角极限（弧度）', latex: '\\lim_{x\\to0}\\frac{\\sin x}{x}=1', example: 'limit' }
    ] },
    { title: '矩阵与向量', formulas: [
      { name: '二阶行列式', latex: '\\det\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}=ad-bc', example: 'det' },
      { name: '逆矩阵（ad − bc ≠ 0）', latex: 'A^{-1}=\\frac1{ad-bc}\\begin{bmatrix}d&-b\\\\-c&a\\end{bmatrix}', example: 'inverse' },
      { name: '点积', latex: '\\mathbf{a}\\cdot\\mathbf{b}=\\sum_{i=1}^na_ib_i', example: 'dot' },
      { name: '向量的模', latex: '\\Vert\\mathbf{v}\\Vert=\\sqrt{v_1^2+v_2^2+\\cdots+v_n^2}', input: 'norm([3,4])', mode: 'matrix', text: true }
    ] },
    { title: '统计与概率', formulas: [
      { name: '算术平均数', latex: '\\bar{x}=\\frac1n\\sum_{i=1}^nx_i', example: 'stats' },
      { name: '总体方差与样本方差', latex: '\\sigma^2=\\frac{\\sum(x_i-\\bar x)^2}n,\\quad s^2=\\frac{\\sum(x_i-\\bar x)^2}{n-1}', example: 'stats-decimal' },
      { name: '组合数', latex: '\\binom nk=\\frac{n!}{k!(n-k)!}', example: 'factorial' },
      { name: '二项分布', latex: 'P(X=k)=\\binom nkp^k(1-p)^{n-k}', example: 'binomial' }
    ] }
  ];
  root.MathSolverCatalog = { examples, reference };
}(typeof globalThis !== 'undefined' ? globalThis : this));
