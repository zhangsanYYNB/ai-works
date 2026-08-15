<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>钢尺弯曲与振动 3D 物理仿真 (带阻尼动力学版)</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
    <style>
        body {
            margin: 0;
            overflow: hidden;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #1a1a1a;
            color: #e0e0e0;
            display: flex;
            height: 100vh;
        }

        #sidebar {
            width: 340px;
            background-color: #252525;
            padding: 20px;
            box-shadow: 2px 0 10px rgba(0,0,0,0.5);
            overflow-y: auto;
            z-index: 10;
            display: flex;
            flex-direction: column;
        }

        #canvas-container {
            flex: 1;
            position: relative;
            min-width: 0; 
        }

        h2 {
            margin-top: 0;
            color: #4fc3f7;
            border-bottom: 2px solid #4fc3f7;
            padding-bottom: 5px;
            font-size: 1.2em;
        }

        h3 {
            color: #81c784;
            margin-top: 15px;
            margin-bottom: 5px;            font-size: 1em;
        }

        .control-group {
            margin-bottom: 12px;
        }

        .control-group label {
            display: flex;
            justify-content: space-between;
            font-size: 0.9em;
            margin-bottom: 4px;
        }

        .control-group input[type="range"] {
            width: 100%;
            cursor: pointer;
        }

        .value-display {
            color: #ffb74d;
            font-weight: bold;
        }

        button {
            width: 100%;
            padding: 10px;
            margin-top: 10px;
            background-color: #4fc3f7;
            color: #1a1a1a;
            border: none;
            border-radius: 4px;
            font-size: 1em;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.2s;
        }

        button:hover {
            background-color: #81d4fa;
        }

        button.active {
            background-color: #ef5350;
            color: white;
        }

        #formula-container {
            margin-top: 20px;
            padding: 15px;            background-color: #333;
            border-radius: 8px;
            font-size: 0.85em;
            overflow-x: auto;
        }

        .formula-block {
            margin-bottom: 15px;
            line-height: 1.5;
        }

        .katex {
            font-size: 1.05em !important;
        }

        #info-overlay {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.6);
            padding: 10px;
            border-radius: 5px;
            font-size: 0.85em;
            pointer-events: none;
        }
        
        .status-indicator {
            text-align: center;
            padding: 5px;
            margin-top: 10px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 0.9em;
        }
        .status-press { background: #ef5350; color: white; }
        .status-vib { background: #ffb74d; color: #1a1a1a; }
        .status-rest { background: #555; color: #ccc; }
    </style>
</head>
<body>

<div id="sidebar">
    <h2>物理参数控制</h2>
    
    <h3>几何与材料</h3>
    <div class="control-group">
        <label>总长度 $l$ <span class="value-display" id="val-l">0.30 m</span></label>
        <input type="range" id="param-l" min="0.1" max="0.5" step="0.01" value="0.3">
    </div>
    <div class="control-group">        <label>悬空长度 $x$ <span class="value-display" id="val-x">0.20 m</span></label>
        <input type="range" id="param-x" min="0.05" max="0.5" step="0.01" value="0.2">
    </div>
    <div class="control-group">
        <label>宽度 $b$ <span class="value-display" id="val-b">30 mm</span></label>
        <input type="range" id="param-b" min="10" max="50" step="1" value="30">
    </div>
    <div class="control-group">
        <label>厚度 $h$ <span class="value-display" id="val-h">0.5 mm</span></label>
        <input type="range" id="param-h" min="0.1" max="2.0" step="0.1" value="0.5">
    </div>
    <div class="control-group">
        <label>总质量 $m$ <span class="value-display" id="val-m">50 g</span></label>
        <input type="range" id="param-m" min="10" max="200" step="5" value="50">
    </div>

    <h3>力学参数</h3>
    <div class="control-group">
        <label>施力位置 $y$ <span class="value-display" id="val-y">0.15 m</span></label>
        <input type="range" id="param-y" min="0.01" max="0.5" step="0.01" value="0.15">
    </div>
    <div class="control-group">
        <label>施加力 $n$ <span class="value-display" id="val-n">2.0 N</span></label>
        <input type="range" id="param-n" min="0" max="10" step="0.1" value="2.0">
    </div>

    <h3>可视化与动力学控制</h3>
    <div class="control-group">
        <label>挠度放大倍数 <span class="value-display" id="val-scale">10x</span></label>
        <input type="range" id="param-scale" min="1" max="100" step="1" value="10">
    </div>
    <div class="control-group">
        <label>阻尼比 $\zeta$ <span class="value-display" id="val-zeta">2.0%</span></label>
        <input type="range" id="param-zeta" min="0" max="0.2" step="0.005" value="0.02">
    </div>

    <button id="btn-press">按住 / 松开 (切换状态)</button>
    <div id="status-box" class="status-indicator status-rest">当前状态：静止</div>

    <div id="formula-container">
        <h3>实时解析方程</h3>
        <div class="formula-block" id="static-formula"></div>
        <div class="formula-block" id="dynamic-formula"></div>
        <div class="formula-block" id="freq-formula"></div>
        <div class="formula-block" id="result-formula"></div>
    </div>
</div>

<div id="canvas-container">
    <div id="info-overlay">        鼠标左键：旋转 | 右键：平移 | 滚轮：缩放
    </div>
</div>

<script>
    // ================= 物理与全局变量 =================
    const params = {
        l: 0.3, x: 0.2, b: 0.03, h: 0.0005, m: 0.05,
        y: 0.15, n: 2.0, E: 2e11, scale: 10, zeta: 0.02
    };

    let I, EI, q, f1, omega1;
    let currentForce = 0; 
    let targetForce = 0;  
    let isPressed = false;
    
    let isVibrating = false;
    let vibrationStartTime = 0;
    let initialDeflectionProfile = []; 

    const modes = [
        { beta_x: 1.87510407, sigma: 0, omega: 0, Ak: 0 },
        { beta_x: 4.69409113, sigma: 0, omega: 0, Ak: 0 },
        { beta_x: 7.85475744, sigma: 0, omega: 0, Ak: 0 }
    ];

    // ================= 物理计算核心 =================
    function updatePhysics() {
        if (params.y > params.x) params.y = params.x;
        if (params.x > params.l) params.x = params.l;

        I = (params.b * Math.pow(params.h, 3)) / 12;
        EI = params.E * I;
        q = (params.m * 9.8) / params.l;

        modes.forEach(m => {
            const cosh_bx = Math.cosh(m.beta_x);
            const cos_bx = Math.cos(m.beta_x);
            const sinh_bx = Math.sinh(m.beta_x);
            const sin_bx = Math.sin(m.beta_x);
            m.sigma = (cosh_bx + cos_bx) / (sinh_bx + sin_bx);
            m.omega = (Math.pow(m.beta_x, 2) / Math.pow(params.x, 2)) * Math.sqrt(EI * params.l / params.m);
        });
        
        omega1 = modes[0].omega;
        f1 = omega1 / (2 * Math.PI);
    }

    function W(s, mode) {
        const beta = mode.beta_x / params.x;        const bs = beta * s;
        return (Math.cosh(bs) - Math.cos(bs)) - mode.sigma * (Math.sinh(bs) - Math.sin(bs));
    }

    function calcStaticDeflection(s, force) {
        if (s <= 0) return 0;
        if (s > params.x) s = params.x;

        let v_g = (q / (24 * EI)) * (Math.pow(s, 4) - 4 * params.x * Math.pow(s, 3) + 6 * Math.pow(params.x, 2) * Math.pow(s, 2));
        let v_n = 0;
        if (force > 0) {
            if (s <= params.y) {
                v_n = (force / (6 * EI)) * (3 * params.y * Math.pow(s, 2) - Math.pow(s, 3));
            } else {
                v_n = (force * Math.pow(params.y, 2) / (6 * EI)) * (3 * s - params.y);
            }
        }
        return v_g + v_n;
    }

    function calculateModalCoefficients() {
        const N = 100; 
        const ds = params.x / (N - 1);
        
        modes.forEach(mode => {
            let num = 0, den = 0;
            for (let i = 0; i < N; i++) {
                const s = i * ds;
                const w0 = initialDeflectionProfile[i] || 0;
                const W_val = W(s, mode);
                num += w0 * W_val;
                den += W_val * W_val;
            }
            mode.Ak = num / den;
        });
    }

    // ================= 3D 场景初始化 =================
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a2a2a);

    let cWidth = container.clientWidth || 800;
    let cHeight = container.clientHeight || 600;

    const camera = new THREE.PerspectiveCamera(45, cWidth / cHeight, 0.01, 10);
    camera.position.set(0.3, 0.2, 0.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(cWidth, cHeight);    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0.1, 0, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 2, 1);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const deskGeo = new THREE.BoxGeometry(0.2, 0.05, 0.4);
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.8 });
    const desk = new THREE.Mesh(deskGeo, deskMat);
    desk.position.set(-0.1, -0.025, 0);
    desk.receiveShadow = true;
    scene.add(desk);

    const gridHelper = new THREE.GridHelper(2, 20, 0x444444, 0x333333);
    gridHelper.position.y = -0.05;
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(0.1);
    scene.add(axesHelper);

    // ================= 钢尺 3D 模型构建 =================
    const segments = 100;
    const rulerGeometry = new THREE.BufferGeometry();
    const vertices = new Float32Array((segments + 1) * 4 * 3);
    const indices = [];

    for (let i = 0; i < segments; i++) {
        const base = i * 4;
        indices.push(base, base + 4, base + 1, base + 1, base + 4, base + 5);
        indices.push(base + 2, base + 3, base + 6, base + 3, base + 7, base + 6);
        indices.push(base, base + 3, base + 4, base + 3, base + 7, base + 4);
        indices.push(base + 1, base + 5, base + 2, base + 2, base + 5, base + 6);
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    rulerGeometry.setIndex(indices);
    rulerGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    const rulerMat = new THREE.MeshStandardMaterial({ 
        color: 0xbdbdbd, metalness: 0.9, roughness: 0.2, side: THREE.DoubleSide
    });
    const rulerMesh = new THREE.Mesh(rulerGeometry, rulerMat);    rulerMesh.castShadow = true;
    rulerMesh.receiveShadow = true;
    scene.add(rulerMesh);

    const arrowDir = new THREE.Vector3(0, -1, 0);
    const arrowOrigin = new THREE.Vector3(0, 0, 0);
    const arrowHelper = new THREE.ArrowHelper(arrowDir, arrowOrigin, 0.05, 0xff5252, 0.01, 0.005);
    scene.add(arrowHelper);

    // ================= 更新钢尺几何体 =================
    function updateRulerGeometry(time) {
        const lerpSpeed = isPressed ? 0.05 : 0.15; 
        currentForce += (targetForce - currentForce) * lerpSpeed;
        if (Math.abs(currentForce - targetForce) < 0.001) currentForce = targetForce;

        if (!isPressed && currentForce > 0.01 && !isVibrating) {
            const v_gravity_profile = [];
            for(let i=0; i<=segments; i++) {
                let s = (i / segments) * params.x;
                v_gravity_profile.push(calcStaticDeflection(s, 0));
            }
            
            initialDeflectionProfile = [];
            for(let i=0; i<=segments; i++) {
                let s = (i / segments) * params.x;
                let v_total = calcStaticDeflection(s, currentForce);
                initialDeflectionProfile.push(v_total - v_gravity_profile[i]); 
            }
            calculateModalCoefficients();
            isVibrating = true;
            vibrationStartTime = time;
            updateStatusUI('vib');
        }

        const positions = rulerGeometry.attributes.position.array;
        const dx = params.x / segments;
        const halfB = params.b / 2;
        const halfH = params.h / 2;

        for (let i = 0; i <= segments; i++) {
            let s = i * dx;
            if (s > params.x) s = params.x;

            let v_final = calcStaticDeflection(s, currentForce);
            
            if (isVibrating && !isPressed) {
                let t = time - vibrationStartTime;
                let v_vib = 0;
                let maxDecay = 0; 
                                modes.forEach((mode, index) => {
                    // 引入阻尼：衰减因子 e^(-zeta * omega * t)
                    let decay = Math.exp(-params.zeta * mode.omega * t);
                    if (index === 0) maxDecay = decay; // 基频衰减最慢，用基频判断整体是否停止
                    
                    // 阻尼固有频率 omega_d = omega * sqrt(1 - zeta^2)
                    let omega_d = mode.omega * Math.sqrt(1 - params.zeta * params.zeta);
                    
                    v_vib += mode.Ak * W(s, mode) * decay * Math.cos(omega_d * t);
                });
                
                // 如果基频振幅衰减到不足 0.1%，且阻尼大于0，则认为振动停止
                if (maxDecay < 0.001 && params.zeta > 0) {
                    isVibrating = false;
                    updateStatusUI('rest');
                    v_final = calcStaticDeflection(s, 0); 
                } else {
                    let v_gravity = calcStaticDeflection(s, 0);
                    v_final = v_gravity + v_vib;
                }
            }

            let y_center = -v_final * params.scale;
            const baseIdx = i * 4 * 3;
            
            positions[baseIdx + 0] = s; positions[baseIdx + 1] = y_center - halfH; positions[baseIdx + 2] = -halfB;
            positions[baseIdx + 3] = s; positions[baseIdx + 4] = y_center - halfH; positions[baseIdx + 5] = halfB;
            positions[baseIdx + 6] = s; positions[baseIdx + 7] = y_center + halfH; positions[baseIdx + 8] = halfB;
            positions[baseIdx + 9] = s; positions[baseIdx + 10] = y_center + halfH; positions[baseIdx + 11] = -halfB;
        }

        rulerGeometry.attributes.position.needsUpdate = true;
        rulerGeometry.computeVertexNormals();

        if (currentForce > 0.01) {
            let v_y = calcStaticDeflection(params.y, currentForce);
            arrowHelper.position.set(params.y, -v_y * params.scale + 0.05, 0);
            arrowHelper.visible = true;
        } else {
            arrowHelper.visible = false;
        }
    }

    // ================= UI 与 公式渲染 =================
    function updateUI() {
        document.getElementById('val-l').innerText = params.l.toFixed(2) + ' m';
        document.getElementById('val-x').innerText = params.x.toFixed(2) + ' m';
        document.getElementById('val-b').innerText = (params.b * 1000).toFixed(0) + ' mm';
        document.getElementById('val-h').innerText = (params.h * 1000).toFixed(1) + ' mm';
        document.getElementById('val-m').innerText = (params.m * 1000).toFixed(0) + ' g';        document.getElementById('val-y').innerText = params.y.toFixed(2) + ' m';
        document.getElementById('val-n').innerText = params.n.toFixed(1) + ' N';
        document.getElementById('val-scale').innerText = params.scale + 'x';
        document.getElementById('val-zeta').innerText = (params.zeta * 100).toFixed(1) + '%';

        document.getElementById('param-x').max = params.l;
        document.getElementById('param-y').max = params.x;
    }

    function updateStatusUI(state) {
        const box = document.getElementById('status-box');
        box.className = 'status-indicator';
        if (state === 'press') {
            box.classList.add('status-press');
            box.innerText = '当前状态：按压中 (准静态)';
        } else if (state === 'vib') {
            box.classList.add('status-vib');
            box.innerText = '当前状态：衰减振动 (动力学)';
        } else {
            box.classList.add('status-rest');
            box.innerText = '当前状态：静止';
        }
    }

    function renderFormulas() {
        const staticEq = `
            \\text{静力学: } v(s) = \\begin{cases} 
            \\frac{mg}{24lEI} (s^4 - 4xs^3 + 6x^2s^2) + \\frac{n}{6EI} (3ys^2 - s^3), & s \\le y \\\\ 
            \\frac{mg}{24lEI} (s^4 - 4xs^3 + 6x^2s^2) + \\frac{ny^2}{6EI} (3s - y), & s > y 
            \\end{cases}
        `;
        katex.render(staticEq, document.getElementById('static-formula'), { displayMode: true, throwOnError: false });

        const dynamicEq = `
            \\text{动力学: } w(s,t) = \\sum_{k=1}^{3} A_k W_k(s) e^{-\\zeta \\omega_k t} \\cos(\\omega_{dk} t)
        `;
        katex.render(dynamicEq, document.getElementById('dynamic-formula'), { displayMode: true, throwOnError: false });

        const freqEq = `
            f_1 = \\frac{1.8751^2}{2\\pi x^2} \\sqrt{\\frac{EI l}{m}} \\approx ${f1.toFixed(2)} \\text{ Hz}
        `;
        katex.render(freqEq, document.getElementById('freq-formula'), { displayMode: true, throwOnError: false });

        const maxDeflection = calcStaticDeflection(params.x, params.n) * 1000;
        const resultEq = `
            \\text{理论最大静挠度: } ${maxDeflection.toFixed(2)} \\text{ mm}
        `;
        katex.render(resultEq, document.getElementById('result-formula'), { displayMode: true, throwOnError: false });
    }
    // ================= 事件绑定 =================
    const sliders = ['l', 'x', 'b', 'h', 'm', 'y', 'n', 'scale', 'zeta'];
    sliders.forEach(key => {
        const el = document.getElementById(`param-${key}`);
        el.addEventListener('input', (e) => {
            let val = parseFloat(e.target.value);
            if (key === 'b' || key === 'h') val /= 1000;
            if (key === 'm') val /= 1000;
            params[key] = val;
            
            updatePhysics();
            updateUI();
            renderFormulas();
            
            if (isVibrating) {
                isVibrating = false;
                currentForce = 0;
                targetForce = 0;
                isPressed = false;
                document.getElementById('btn-press').classList.remove('active');
                document.getElementById('btn-press').innerText = '按住 (施加力)';
                updateStatusUI('rest');
            }
        });
    });

    document.getElementById('btn-press').addEventListener('click', (e) => {
        isPressed = !isPressed;
        targetForce = isPressed ? params.n : 0;
        
        e.target.classList.toggle('active', isPressed);
        e.target.innerText = isPressed ? '松开 (释放)' : '按住 (施加力)';
        
        if (isPressed) {
            isVibrating = false; 
            updateStatusUI('press');
        } 
    });

    // ================= 动画循环 =================
    function animate() {
        requestAnimationFrame(animate);
        const time = performance.now() / 1000;
        updateRulerGeometry(time);
        controls.update();
        renderer.render(scene, camera);
    }

    window.addEventListener('resize', () => {
        cWidth = container.clientWidth;        cHeight = container.clientHeight;
        camera.aspect = cWidth / cHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(cWidth, cHeight);
    });

    // ================= 启动 =================
    updatePhysics();
    updateUI();
    renderFormulas();
    animate();

</script>
</body>
</html>
