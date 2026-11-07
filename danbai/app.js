(function (root) {
    'use strict';

    var document = root.document;
    var physics = root.PendulumPhysics;
    var state;
    var params = null;
    var scene = null;
    var sceneReady = false;
    var sceneGeneration = 0;
    var animationFrame = 0;
    var rebuildFrame = 0;
    var rebuildQueued = false;
    var lastFrame = 0;
    var destroyed = false;
    var view = 'perspective';
    var controls = Object.create(null);
    var resizeObserver = null;

    var MODELS = {
        double: {
            name: '双线摆', category: '等效摆长',
            subtitle: '两个悬点，一条等效转轴。', parameters: ['l', 'alphaDeg']
        },
        fold: {
            name: '折线摆', category: '组合周期',
            subtitle: '两段摆长依次参与运动，周期由两个半周期组成。', parameters: ['l1', 'l2']
        },
        arc: {
            name: '圆弧摆', category: '球心轨迹',
            subtitle: '球心沿圆弧运动，等效摆长由轨道半径修正。', parameters: ['R']
        },
        incline: {
            name: '斜面摆', category: '有效重力',
            subtitle: '沿斜面的重力分量提供回复力。', parameters: ['inclineL', 'inclineDeg']
        },
        cone: {
            name: '圆锥摆', category: '匀速圆周运动',
            subtitle: '张力的水平分量提供向心力。', parameters: ['coneL', 'coneThetaDeg']
        }
    };

    function byId(id) {
        return document ? document.getElementById(id) : null;
    }

    function clear(element) {
        if (!element) return;
        while (element.firstChild) element.removeChild(element.firstChild);
    }

    function makeElement(tag, className, text) {
        var element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function formatNumber(value, decimals) {
        return Number(value).toFixed(decimals);
    }

    function parameterBounds(key) {
        var descriptor = physics.PARAMS[key];
        var limits = physics.limits(state);
        return limits[key] || { min: descriptor.min, max: descriptor.max };
    }

    function formatParameter(key) {
        var descriptor = physics.PARAMS[key];
        return formatNumber(state[key], descriptor.decimals) + descriptor.unit;
    }

    function createParameter(key, parent) {
        var descriptor = physics.PARAMS[key];
        if (!descriptor || !parent) return null;

        var parameter = makeElement('div', 'parameter');
        parameter.setAttribute('data-param', key);

        var rangeId = key + '-range';
        var numberId = key + '-number';
        var heading = makeElement('div', 'parameter-head');
        var label = makeElement('label');
        label.htmlFor = rangeId;
        label.appendChild(makeElement('span', '', descriptor.label));
        label.appendChild(makeElement('i', 'parameter-symbol', descriptor.symbol));

        var numericField = makeElement('div', 'numeric-field');
        var number = makeElement('input', 'number-input');
        number.type = 'number';
        number.id = numberId;
        number.setAttribute('data-key', key);
        number.setAttribute('aria-label', descriptor.label + '数值');
        number.setAttribute('inputmode', 'decimal');
        numericField.appendChild(number);
        numericField.appendChild(makeElement('span', 'parameter-unit', descriptor.unit));

        var range = makeElement('input', 'parameter-range');
        range.type = 'range';
        range.id = rangeId;
        range.setAttribute('data-key', key);
        range.setAttribute('aria-label', descriptor.label);

        var rangeLimits = makeElement('div', 'range-limits');
        var minLabel = makeElement('span');
        var maxLabel = makeElement('span');
        rangeLimits.appendChild(minLabel);
        rangeLimits.appendChild(maxLabel);

        heading.appendChild(label);
        heading.appendChild(numericField);
        parameter.appendChild(heading);
        parameter.appendChild(range);
        parameter.appendChild(rangeLimits);
        parent.appendChild(parameter);

        controls[key] = {
            root: parameter, range: range, number: number,
            minLabel: minLabel, maxLabel: maxLabel
        };
        return parameter;
    }

    function buildParameterControls() {
        var globalContainer = byId('global-controls');
        var modelContainer = byId('model-controls');
        var lowerContainer = byId('lower-string-control');
        clear(globalContainer);
        clear(modelContainer);
        clear(lowerContainer);
        controls = Object.create(null);

        ['g', 'r', 'ampDeg'].forEach(function (key) {
            createParameter(key, globalContainer);
        });
        MODELS[state.model].parameters.forEach(function (key) {
            createParameter(key, modelContainer);
        });
        if (state.model === 'double' && state.hangOn) createParameter('d', lowerContainer);

        var speedRange = byId('speed');
        if (speedRange) {
            controls.speed = {
                range: speedRange,
                number: null,
                output: byId('speed-value')
            };
        }
        bindParameterInputs();
        syncParameterControls();
    }

    function setParameterBounds(key, control) {
        var descriptor = physics.PARAMS[key];
        var bounds = parameterBounds(key);
        [control.range, control.number].forEach(function (input) {
            if (!input) return;
            input.min = String(bounds.min);
            input.max = String(bounds.max);
            input.step = String(descriptor.step);
        });
        if (control.minLabel) control.minLabel.textContent = formatNumber(bounds.min, descriptor.decimals) + descriptor.unit;
        if (control.maxLabel) control.maxLabel.textContent = formatNumber(bounds.max, descriptor.decimals) + descriptor.unit;
    }

    function syncParameterControls() {
        if (!state || !physics) return;
        Object.keys(controls).forEach(function (key) {
            var control = controls[key];
            if (!control || !control.range) return;
            setParameterBounds(key, control);
            control.range.value = String(state[key]);
            if (control.number) control.number.value = String(state[key]);
            if (control.output) control.output.textContent = formatParameter(key);
        });
    }

    function geometryChangesFor(key) {
        return key !== 'speed' && key !== 'g';
    }

    function commitParameter(key, input) {
        if (!physics.PARAMS[key] || !input) return;
        var raw = input.value;
        if (raw === '' || !Number.isFinite(Number(raw))) {
            syncParameterControls();
            return;
        }
        state[key] = Number(raw);
        refresh(geometryChangesFor(key));
    }

    function bindParameterInputs() {
        Object.keys(controls).forEach(function (key) {
            if (key === 'speed') return;
            var control = controls[key];
            if (!control || !control.range) return;
            control.range.addEventListener('input', function () {
                commitParameter(key, control.range);
            });
            if (control.number) {
                control.number.addEventListener('change', function () {
                    commitParameter(key, control.number);
                });
                control.number.addEventListener('keydown', function (event) {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        commitParameter(key, control.number);
                        control.number.blur();
                    }
                });
            }
        });
    }

    function readUrlState() {
        try {
            var query = new root.URLSearchParams(root.location.search);
            var model = query.get('model');
            var theme = query.get('theme');
            if (model && Object.prototype.hasOwnProperty.call(MODELS, model)) state.model = model;
            if (theme === 'light' || theme === 'dark') state.theme = theme;
            if (query.has('hang')) {
                var hang = query.get('hang');
                state.hangOn = hang === '1' || hang === 'true' || hang === 'on';
            }
            var hangMode = query.get('hangmode');
            if (hangMode === 'normal' || hangMode === 'side') state.hangMode = hangMode;
        } catch (error) {
            // Ignore malformed or unavailable URL state and keep defaults.
        }
    }

    function setActiveModel() {
        var tabs = document.querySelectorAll('#tabs [data-model]');
        Array.prototype.forEach.call(tabs, function (button) {
            var active = button.getAttribute('data-model') === state.model;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });

        var model = MODELS[state.model];
        var category = byId('model-category');
        var name = byId('hero-name');
        var subtitle = byId('hero-sub');
        var title = byId('model-parameters-title');
        if (category) category.textContent = model.category;
        if (name) name.textContent = model.name;
        if (subtitle) subtitle.textContent = model.subtitle;
        if (title) title.textContent = model.name + '参数';
    }

    function updateControlVisibility() {
        var doubleOptions = byId('double-options');
        var hangToggle = byId('hang-toggle');
        var hangControls = byId('hang-controls');
        var isDouble = state.model === 'double';
        if (doubleOptions) doubleOptions.hidden = !isDouble;
        if (hangToggle) hangToggle.checked = state.hangOn;
        if (hangControls) hangControls.hidden = !isDouble || !state.hangOn;

        Array.prototype.forEach.call(document.querySelectorAll('[data-hang-mode]'), function (button) {
            var active = button.getAttribute('data-hang-mode') === state.hangMode;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });

        var autorotate = byId('autorotate-toggle');
        var trail = byId('trail-toggle');
        var annotations = byId('annotation-toggle');
        if (autorotate) autorotate.checked = state.autoRotate;
        if (trail) trail.checked = state.showTrail;
        if (annotations) annotations.checked = state.showAnnotations;

        var note = byId('constraint-note');
        if (note) {
            note.hidden = state.model !== 'fold';
            if (state.model === 'fold') {
                var bounds = physics.limits(state);
                note.textContent = '约束更新：l₂ ≤ ' + formatNumber(bounds.l2.max, 2) + ' m，当前振幅上限 A ≤ ' + formatNumber(bounds.ampDeg.max, 1) + '°。';
            } else {
                note.textContent = '';
            }
        }
    }

    function setMetric(element, value, unit, compact) {
        if (!element) return;
        clear(element);
        element.classList.toggle('fold-value', !!compact);
        element.appendChild(document.createTextNode(value));
        if (unit) element.appendChild(makeElement('span', 'unit', unit));
    }

    function setFormula(lines) {
        var formula = byId('formula');
        if (!formula) return;
        clear(formula);
        var fragment = document.createDocumentFragment();
        lines.forEach(function (line) {
            fragment.appendChild(makeElement('span', 'eq', line));
        });
        formula.appendChild(fragment);
    }

    function renderPanel() {
        var p = params;
        if (!p) return;
        var lines = [];
        var extra = '';
        var explanation = '';
        var common = '';
        if (state.model === 'double') {
            if (!state.hangOn) {
                lines = ['L = l · sin α + r', 'g_eff = g', 'T = 2π√((l · sin α + r) / g)'];
                extra = '当前 h = ' + formatNumber(p.h, 3) + ' m，等效摆长 L = ' + formatNumber(p.L, 3) + ' m。';
                explanation = '双线摆由两条等长上线连接球心上方的下交点 C。摆动平面垂直于两上悬点连线，等效悬点为两悬点中点 O；h 是 O 到 C 的竖直距离，r 计入 O 到球心的摆长。';
            } else if (state.hangMode === 'side') {
                lines = ['侧摆：以 V 形下交点 C 为悬点', 'L_side = d + r', 'g_eff = g', 'T_side = 2π√((d + r) / g)'];
                extra = '下挂线长 d = ' + formatNumber(state.d, 2) + ' m；侧摆方向沿两上悬点连线，V 形上线保持不动。';
                explanation = '加挂下线后，球可沿两上悬点连线方向侧摆；此模式以 C 为悬点，摆长为下挂线长加球半径。';
            } else {
                lines = ['普通加挂摆：以 O 为等效悬点', 'L_normal = l · sin α + d + r', 'g_eff = g', 'T_normal = 2π√((l · sin α + d + r) / g)'];
                extra = 'h = ' + formatNumber(p.h, 3) + ' m，d = ' + formatNumber(state.d, 2) + ' m，等效摆长 L = ' + formatNumber(p.L, 3) + ' m。';
                explanation = '加挂下线后整体绕两上悬点连线摆动，等效摆长为 O 到球心的距离，即 h + d + r。';
            }
        } else if (state.model === 'fold') {
            lines = ['L₁ = l₁ + r，L₂ = l₂ + r', 'g_eff = g', 'T = π(√(L₁/g) + √(L₂/g))', 'T = π(√((l₁+r)/g) + √((l₂+r)/g))'];
            extra = '长摆侧半周期 T₁/₂,long = ' + formatNumber(p.halfLong, 3) + ' s，短摆侧半周期 T₁/₂,short = ' + formatNumber(p.halfShort, 3) + ' s；两者之和为总周期 ' + formatNumber(p.T, 3) + ' s。';
            explanation = '折线摆的摆球在两侧之间切换：长摆侧绕上悬点摆动，短摆侧绕钉子 P 摆动。周期是两个半周期之和；动态约束保证短侧振幅也不超过 18°。';
        } else if (state.model === 'arc') {
            lines = ['L = R - r', 'g_eff = g', 'T = 2π√((R - r) / g)'];
            extra = '圆弧轨道半径 R = ' + formatNumber(state.R, 2) + ' m，球心轨迹半径 L = ' + formatNumber(p.L, 3) + ' m。';
            explanation = '小球在凹形圆弧内侧作小角摆动；球心沿半径 R - r 的圆弧运动，等效悬点为圆弧圆心。';
        } else if (state.model === 'incline') {
            lines = ['L = l + r', 'g_eff = g · sin θ', 'T = 2π√((l + r) / (g · sin θ))'];
            extra = '斜面倾角 θ = ' + state.inclineDeg.toFixed(0) + '°，g_eff = ' + formatNumber(p.geff, 3) + ' m/s²。';
            explanation = '摆球受光滑斜面约束，只能沿斜面内的摆动平面运动；回复力由重力沿斜面方向的分量提供。';
        } else {
            lines = ['L = l + r，h = L · cos θ', 'r_circle = L · sin θ', 'ω² = g / (L · cos θ) = g / h', 'T_period = 2π√(h / g)', 'F_tension = m g / cos θ'];
            extra = '半锥角 θ = ' + state.coneThetaDeg.toFixed(0) + '°，圆周半径 r_circle = ' + formatNumber(p.rCirc, 3) + ' m，悬点到圆周平面的高度 h = ' + formatNumber(p.hCone, 3) + ' m，角速度 ω = ' + formatNumber(p.omega, 3) + ' rad/s。';
            explanation = '圆锥摆作匀速圆周运动，不是小角简谐振动。绳张力记作 F_tension，满足 F_tension = m g / cos θ；其水平分量提供向心力，T_period 专指运动周期。';
        }

        common = '适用条件：摆线轻且不可伸长，摆球半径 r 计入球心运动长度；无摩擦。双线摆、折线摆、圆弧摆和斜面摆采用小角近似；圆锥摆按理想匀速圆周运动处理。';

        setFormula(lines);
        var lengthLabel = byId('length-label');
        if (lengthLabel) {
            clear(lengthLabel);
            lengthLabel.appendChild(document.createTextNode(state.model === 'fold' ? '两侧等效摆长 ' : '等效摆长 '));
            lengthLabel.appendChild(makeElement('i', '', state.model === 'fold' ? 'L₁ / L₂' : 'L'));
        }
        var lengthValue = byId('val-L');
        if (state.model === 'fold') {
            setMetric(lengthValue, 'L₁ = ' + formatNumber(p.L1, 3) + ' m / L₂ = ' + formatNumber(p.L2, 3) + ' m', '', true);
        } else {
            setMetric(lengthValue, formatNumber(p.L, 3), 'm');
        }
        setMetric(byId('val-geff'), p.geff === null ? '—' : formatNumber(p.geff, 3), p.geff === null ? '' : 'm/s²');
        setMetric(byId('val-T'), formatNumber(p.T, 3), 's');

        var extraElement = byId('val-extra');
        var explanationElement = byId('assumption');
        var assumptionsElement = byId('assumptions-text');
        if (extraElement) extraElement.textContent = extra;
        if (explanationElement) explanationElement.textContent = explanation;
        if (assumptionsElement) assumptionsElement.textContent = common;

        var heroSubtitle = byId('hero-sub');
        if (heroSubtitle) {
            heroSubtitle.textContent = MODELS[state.model].subtitle + ' 周期 T = ' + formatNumber(p.T, 3) + ' s。';
        }
    }

    function updateTransport(pose) {
        var time = byId('time-value');
        var angle = byId('angle-value');
        var symbol = byId('angle-symbol');
        if (time) time.textContent = Number(state.t).toFixed(2);
        if (angle) {
            var degrees = pose.angle * 180 / Math.PI;
            if (state.model === 'cone') degrees = ((degrees % 360) + 360) % 360;
            angle.textContent = degrees.toFixed(1);
        }
        if (symbol) symbol.textContent = pose.angleLabel || (state.model === 'cone' ? 'φ' : 'θ');

        var playButton = byId('play-btn');
        var playLabel = byId('play-label');
        var playIcon = byId('play-icon');
        var status = byId('play-status');
        var statusDot = byId('status-dot');
        if (playButton) {
            playButton.setAttribute('aria-label', state.playing ? '暂停动画' : '播放动画');
            if (playIcon) {
                var use = playIcon.querySelector('use');
                if (use) use.setAttribute('href', state.playing ? '#i-pause' : '#i-play');
            }
        }
        if (playLabel) playLabel.textContent = state.playing ? '暂停' : '播放';
        if (status) status.textContent = state.playing ? '演示中' : '已暂停';
        if (statusDot) statusDot.classList.toggle('paused', !state.playing);
    }

    function applySceneUpdate() {
        if (!scene || !sceneReady || typeof scene.update !== 'function') return;
        var pose = physics.sample(state, params, state.t);
        scene.update({ model: state.model, p: params, pose: pose });
    }

    function updateScene(rebuild) {
        if (!scene || !sceneReady) return;
        if (rebuild) {
            if (rebuildQueued) return;
            rebuildQueued = true;
            rebuildFrame = root.requestAnimationFrame(function () {
                rebuildFrame = 0;
                rebuildQueued = false;
                if (!scene || !sceneReady) return;
                try {
                    if (typeof scene.setModel === 'function') scene.setModel(state.model, params);
                    applySceneUpdate();
                } catch (error) {
                    handleSceneError(error, sceneGeneration);
                }
            });
            return;
        }
        if (rebuildQueued) return;
        try {
            applySceneUpdate();
        } catch (error) {
            handleSceneError(error, sceneGeneration);
        }
    }

    function refresh(rebuild) {
        if (!physics || !state) return;
        physics.normalize(state);
        params = physics.compute(state);
        syncParameterControls();
        setActiveModel();
        updateControlVisibility();
        renderPanel();
        updateScene(!!rebuild);
        updateTransport(physics.sample(state, params, state.t));
    }

    function setModel(model) {
        if (!Object.prototype.hasOwnProperty.call(MODELS, model) || model === state.model) return;
        state.model = model;
        state.t = 0;
        physics.normalize(state);
        buildParameterControls();
        refresh(true);
    }

    function setTheme(theme) {
        state.theme = theme === 'dark' ? 'dark' : 'light';
        physics.normalize(state);
        document.body.setAttribute('data-theme', state.theme);
        var button = byId('theme-btn');
        if (button) {
            var darkAction = state.theme === 'light';
            button.setAttribute('aria-label', darkAction ? '切换深色主题' : '切换浅色主题');
            button.title = darkAction ? '切换深色主题' : '切换浅色主题';
            var use = button.querySelector('use');
            if (use) use.setAttribute('href', darkAction ? '#i-moon' : '#i-sun');
        }
        if (scene && typeof scene.setTheme === 'function') {
            try { scene.setTheme(state.theme); } catch (error) { handleSceneError(error, sceneGeneration); }
        }
        refresh(false);
    }

    function setView(nextView) {
        if (nextView !== 'front' && nextView !== 'perspective') return;
        view = nextView;
        Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (button) {
            var active = button.getAttribute('data-view') === view;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        if (scene && typeof scene.setView === 'function') {
            try { scene.setView(view); } catch (error) { handleSceneError(error, sceneGeneration); }
        }
    }

    function resetView() {
        setView('perspective');
        if (scene && typeof scene.resetView === 'function') {
            try { scene.resetView(); } catch (error) { handleSceneError(error, sceneGeneration); }
        }
    }

    function showFallback(message) {
        var fallback = byId('fallback');
        var text = byId('fallback-message');
        if (text && message) text.textContent = message;
        if (fallback) fallback.hidden = false;
    }

    function handleSceneError(error, generation) {
        if (generation !== sceneGeneration) return;
        sceneReady = false;
        var message = error && error.message ? error.message : String(error || '未知错误');
        showFallback('三维场景暂时无法启动：' + message);
    }

    function onSceneReady(generation) {
        if (generation !== sceneGeneration || !scene) return;
        sceneReady = true;
        var fallback = byId('fallback');
        if (fallback) fallback.hidden = true;
        try {
            if (typeof scene.setTheme === 'function') scene.setTheme(state.theme);
            if (typeof scene.setModel === 'function') scene.setModel(state.model, params);
            if (typeof scene.setView === 'function') scene.setView(view);
            if (typeof scene.resize === 'function') scene.resize();
            updateScene(false);
        } catch (error) {
            handleSceneError(error, generation);
        }
    }

    function disposeScene() {
        sceneGeneration += 1;
        sceneReady = false;
        if (rebuildFrame) root.cancelAnimationFrame(rebuildFrame);
        rebuildFrame = 0;
        rebuildQueued = false;
        if (scene && typeof scene.dispose === 'function') {
            try { scene.dispose(); } catch (error) { /* Disposal is best-effort. */ }
        }
        scene = null;
    }

    function ensureLabelsOverlay() {
        var labels = byId('label-layer');
        if (labels) return labels;
        var stage = byId('stage');
        if (!stage || !stage.parentNode) return null;
        labels = makeElement('div', 'label-layer');
        labels.id = 'label-layer';
        labels.setAttribute('aria-hidden', 'true');
        stage.parentNode.appendChild(labels);
        return labels;
    }

    function initScene() {
        disposeScene();
        var api = root.PendulumScene;
        if (!api || typeof api.create !== 'function') {
            showFallback('三维场景模块尚未加载。下方参数、公式与计算结果仍可使用。');
            return;
        }
        var generation = sceneGeneration;
        var readyBeforeReturn = false;
        var instance;
        try {
            instance = api.create({
                container: byId('stage'),
                labels: ensureLabelsOverlay(),
                state: state,
                onReady: function () {
                    if (scene) onSceneReady(generation);
                    else readyBeforeReturn = true;
                },
                onError: function (error) {
                    handleSceneError(error, generation);
                }
            });
            scene = instance || null;
            if (!scene) {
                showFallback('三维场景未能创建。下方参数、公式与计算结果仍可使用。');
                return;
            }
            if (readyBeforeReturn) onSceneReady(generation);
        } catch (error) {
            handleSceneError(error, generation);
        }
    }

    function resizeScene() {
        if (scene && typeof scene.resize === 'function') {
            try { scene.resize(); } catch (error) { handleSceneError(error, sceneGeneration); }
        }
    }

    function bindUI() {
        var form = byId('parameter-form');
        if (form) form.addEventListener('submit', function (event) { event.preventDefault(); });

        var tabs = document.querySelectorAll('#tabs [data-model]');
        Array.prototype.forEach.call(tabs, function (button) {
            button.addEventListener('click', function () {
                setModel(button.getAttribute('data-model'));
            });
        });

        var speedRange = byId('speed');
        if (speedRange) speedRange.addEventListener('input', function () {
            commitParameter('speed', speedRange);
        });

        var play = byId('play-btn');
        if (play) play.addEventListener('click', function () {
            state.playing = !state.playing;
            updateTransport(physics.sample(state, params, state.t));
        });

        var reset = byId('reset-btn');
        if (reset) reset.addEventListener('click', function () {
            state.t = 0;
            refresh(false);
        });

        var themeButton = byId('theme-btn');
        if (themeButton) themeButton.addEventListener('click', function () {
            setTheme(state.theme === 'dark' ? 'light' : 'dark');
        });

        var viewButton = byId('view-btn');
        if (viewButton) viewButton.addEventListener('click', resetView);
        Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (button) {
            button.addEventListener('click', function () {
                setView(button.getAttribute('data-view'));
            });
        });

        var hangToggle = byId('hang-toggle');
        if (hangToggle) hangToggle.addEventListener('change', function () {
            state.hangOn = hangToggle.checked;
            buildParameterControls();
            refresh(true);
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-hang-mode]'), function (button) {
            button.addEventListener('click', function () {
                state.hangMode = button.getAttribute('data-hang-mode');
                refresh(true);
            });
        });

        var toggles = [
            ['autorotate-toggle', 'autoRotate'],
            ['trail-toggle', 'showTrail'],
            ['annotation-toggle', 'showAnnotations']
        ];
        toggles.forEach(function (entry) {
            var input = byId(entry[0]);
            if (!input) return;
            input.addEventListener('change', function () {
                state[entry[1]] = input.checked;
                refresh(false);
            });
        });

        var retry = byId('retry-btn');
        if (retry) retry.addEventListener('click', initScene);
    }

    function animate(now) {
        if (destroyed) return;
        var dt = lastFrame ? Math.max(0, Math.min((now - lastFrame) / 1000, 0.05)) : 0;
        lastFrame = now;
        if (state.playing) state.t += dt * state.speed;
        var pose = physics.sample(state, params, state.t);
        updateTransport(pose);
        if (scene && sceneReady && !rebuildQueued) {
            try {
                applySceneUpdate();
            } catch (error) {
                handleSceneError(error, sceneGeneration);
            }
        }
        animationFrame = root.requestAnimationFrame(animate);
    }

    function teardown() {
        if (destroyed) return;
        destroyed = true;
        if (animationFrame) root.cancelAnimationFrame(animationFrame);
        if (resizeObserver) resizeObserver.disconnect();
        if (rebuildFrame) root.cancelAnimationFrame(rebuildFrame);
        rebuildFrame = 0;
        rebuildQueued = false;
        root.removeEventListener('resize', resizeScene);
        disposeScene();
    }

    function init() {
        if (!document || !physics) {
            showFallback('物理计算模块尚未加载。');
            return;
        }
        state = Object.assign({}, physics.DEFAULTS);
        readUrlState();
        physics.normalize(state);
        document.body.setAttribute('data-theme', state.theme);
        setActiveModel();
        buildParameterControls();
        bindUI();
        setTheme(state.theme);
        setView(view);
        refresh(false);

        var stage = byId('stage');
        if (root.ResizeObserver && stage) {
            resizeObserver = new root.ResizeObserver(resizeScene);
            resizeObserver.observe(stage);
        }
        root.addEventListener('resize', resizeScene);
        root.addEventListener('pagehide', teardown, { once: true });

        initScene();
        lastFrame = 0;
        animationFrame = root.requestAnimationFrame(animate);
    }

    root.__danbai = {
        get state() { return state; },
        get params() { return params; },
        setModel: setModel,
        setTheme: setTheme,
        setView: setView,
        resetView: resetView,
        refresh: refresh,
        createParameter: createParameter,
        dispose: teardown
    };

    init();
})(typeof window !== 'undefined' ? window : globalThis);
