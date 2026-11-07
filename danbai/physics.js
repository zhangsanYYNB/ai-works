(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.PendulumPhysics = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
    'use strict';

    var PARAMS = {
        speed: { label: '动画速度', symbol: 'speed', min: 0.25, max: 2, step: 0.05, value: 1.1, unit: '×', decimals: 2 },
        g: { label: '重力加速度', symbol: 'g', min: 1, max: 20, step: 0.1, value: 9.8, unit: 'm/s²', decimals: 1 },
        r: { label: '摆球半径', symbol: 'r', min: 0.02, max: 0.3, step: 0.01, value: 0.12, unit: 'm', decimals: 2 },
        ampDeg: { label: '小角振幅', symbol: 'A', min: 1, max: 18, step: 0.1, value: 14, unit: '°', decimals: 1 },
        l: { label: '双线摆上线长度', symbol: 'l', min: 0.8, max: 3, step: 0.05, value: 2, unit: 'm', decimals: 2 },
        alphaDeg: { label: '双线摆上线与水平夹角', symbol: 'α', min: 10, max: 70, step: 1, value: 35, unit: '°', decimals: 0 },
        d: { label: '双线摆下挂线长度', symbol: 'd', min: 0.2, max: 2.5, step: 0.05, value: 1.2, unit: 'm', decimals: 2 },
        l1: { label: '折线摆长侧摆线长度', symbol: 'l1', min: 1, max: 3, step: 0.05, value: 2.2, unit: 'm', decimals: 2 },
        l2: { label: '折线摆短侧摆线长度', symbol: 'l2', min: 0.4, max: 2, step: 0.05, value: 1, unit: 'm', decimals: 2 },
        R: { label: '圆弧轨道半径', symbol: 'R', min: 1, max: 4, step: 0.05, value: 2.5, unit: 'm', decimals: 2 },
        inclineL: { label: '斜面摆摆线长度', symbol: 'l', min: 0.8, max: 3, step: 0.05, value: 2, unit: 'm', decimals: 2 },
        inclineDeg: { label: '斜面倾角', symbol: 'θ', min: 5, max: 45, step: 1, value: 25, unit: '°', decimals: 0 },
        coneL: { label: '圆锥摆摆线长度', symbol: 'l', min: 0.8, max: 3, step: 0.05, value: 2, unit: 'm', decimals: 2 },
        coneThetaDeg: { label: '圆锥摆半锥角', symbol: 'θ', min: 5, max: 60, step: 1, value: 25, unit: '°', decimals: 0 }
    };

    var DEFAULTS = {
        model: 'double', theme: 'light', playing: true, speed: 1.1,
        autoRotate: false, showTrail: true, showAnnotations: true, t: 0,
        g: 9.8, r: 0.12, ampDeg: 14,
        l: 2, alphaDeg: 35, d: 1.2,
        l1: 2.2, l2: 1, R: 2.5,
        inclineL: 2, inclineDeg: 25,
        coneL: 2, coneThetaDeg: 25,
        hangOn: false, hangMode: 'normal'
    };

    Object.keys(PARAMS).forEach(function (key) { Object.freeze(PARAMS[key]); });
    Object.freeze(PARAMS);
    Object.freeze(DEFAULTS);

    var MODEL_KEYS = ['double', 'fold', 'arc', 'incline', 'cone'];
    var PARAM_KEYS = Object.keys(PARAMS);
    var MAX_TIME = Number.MAX_SAFE_INTEGER || 9007199254740991;

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function numeric(value, fallback) {
        if (typeof value === 'string' && value.trim() === '') return fallback;
        try {
            var n = Number(value);
            return Number.isFinite(n) ? n : fallback;
        } catch (error) {
            return fallback;
        }
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function snap(value, descriptor, min, max) {
        var step = descriptor.step;
        var snapped = min + Math.round((value - min) / step) * step;
        return clamp(Number(snapped.toFixed(10)), min, max);
    }

    function l2Maximum(l1) {
        return Number(Math.max(PARAMS.l2.min, Math.min(PARAMS.l2.max, l1 - 0.2)).toFixed(10));
    }

    function ampMaximum(state) {
        if (state.model !== 'fold') return PARAMS.ampDeg.max;
        var longLength = state.l1 + state.r;
        var shortLength = state.l2 + state.r;
        var raw = Math.min(PARAMS.ampDeg.max, 18 * Math.sqrt(shortLength / longLength));
        return Math.max(PARAMS.ampDeg.min, Math.floor(raw * 10 + 1e-10) / 10);
    }

    function normalizeInto(state) {
        if (MODEL_KEYS.indexOf(state.model) === -1) state.model = DEFAULTS.model;
        if (state.theme !== 'light' && state.theme !== 'dark') state.theme = DEFAULTS.theme;

        PARAM_KEYS.forEach(function (key) {
            if (key === 'l2' || key === 'ampDeg' || key === 'speed') return;
            var descriptor = PARAMS[key];
            var value = numeric(state[key], descriptor.value);
            state[key] = snap(clamp(value, descriptor.min, descriptor.max), descriptor, descriptor.min, descriptor.max);
        });

        var maxL2 = l2Maximum(state.l1);
        state.l2 = snap(clamp(numeric(state.l2, PARAMS.l2.value), PARAMS.l2.min, maxL2), PARAMS.l2, PARAMS.l2.min, maxL2);
        var maxAmp = ampMaximum(state);
        state.ampDeg = snap(clamp(numeric(state.ampDeg, PARAMS.ampDeg.value), PARAMS.ampDeg.min, maxAmp), PARAMS.ampDeg, PARAMS.ampDeg.min, maxAmp);

        var speed = numeric(state.speed, PARAMS.speed.value);
        state.speed = snap(clamp(speed, PARAMS.speed.min, PARAMS.speed.max), PARAMS.speed, PARAMS.speed.min, PARAMS.speed.max);
        state.t = clamp(numeric(state.t, DEFAULTS.t), 0, MAX_TIME);

        ['playing', 'autoRotate', 'showTrail', 'showAnnotations', 'hangOn'].forEach(function (key) {
            state[key] = typeof state[key] === 'boolean' ? state[key] : DEFAULTS[key];
        });
        if (state.hangMode !== 'normal' && state.hangMode !== 'side') state.hangMode = DEFAULTS.hangMode;
        return state;
    }

    function copyNormalized(state) {
        var copy = Object.assign({}, DEFAULTS, isObject(state) ? state : {});
        return normalizeInto(copy);
    }

    function normalize(state) {
        if (!isObject(state)) return copyNormalized(null);
        Object.keys(DEFAULTS).forEach(function (key) {
            if (!Object.prototype.hasOwnProperty.call(state, key)) state[key] = DEFAULTS[key];
        });
        return normalizeInto(state);
    }

    function limits(state) {
        var effective = copyNormalized(state);
        return {
            ampDeg: { min: PARAMS.ampDeg.min, max: ampMaximum(effective) },
            l2: { min: PARAMS.l2.min, max: l2Maximum(effective.l1) }
        };
    }

    function radians(degrees) {
        return degrees * Math.PI / 180;
    }

    function compute(state) {
        var s = copyNormalized(state);
        var g = s.g;
        var r = s.r;
        var alpha = radians(s.alphaDeg);
        var incline = radians(s.inclineDeg);
        var coneTheta = radians(s.coneThetaDeg);
        var A = radians(s.ampDeg);
        var l = s.l;
        var d = s.d;
        var l1 = s.l1;
        var l2 = s.l2;
        var R = s.R;
        var inclineL = s.inclineL;
        var coneL = s.coneL;
        var h = l * Math.sin(alpha);
        var p = {
            g: g, r: r, alpha: alpha, incline: incline, coneTheta: coneTheta, A: A,
            l: l, d: d, l1: l1, l2: l2, R: R, inclineL: inclineL, coneL: coneL,
            h: h, L: null, L1: null, L2: null, geff: null, T: null
        };

        if (s.model === 'double') {
            if (s.hangOn && s.hangMode === 'side') { p.L = d + r; p.mode = 'side'; }
            else if (s.hangOn) { p.L = h + d + r; p.mode = 'normal'; }
            else { p.L = h + r; p.mode = 'classic'; }
            p.geff = g;
            p.T = 2 * Math.PI * Math.sqrt(p.L / g);
        } else if (s.model === 'fold') {
            p.L1 = l1 + r;
            p.L2 = l2 + r;
            p.geff = g;
            p.T = Math.PI * (Math.sqrt(p.L1 / g) + Math.sqrt(p.L2 / g));
            p.halfLong = Math.PI * Math.sqrt(p.L1 / g);
            p.halfShort = Math.PI * Math.sqrt(p.L2 / g);
            p.A1 = A;
            p.A2 = p.A1 * Math.sqrt(p.L1 / p.L2);
            p.omega1 = Math.sqrt(g / p.L1);
            p.omega2 = Math.sqrt(g / p.L2);
        } else if (s.model === 'arc') {
            p.L = R - r;
            p.geff = g;
            p.T = 2 * Math.PI * Math.sqrt(p.L / g);
        } else if (s.model === 'incline') {
            p.L = inclineL + r;
            p.geff = g * Math.sin(incline);
            p.T = 2 * Math.PI * Math.sqrt(p.L / p.geff);
        } else if (s.model === 'cone') {
            p.L = coneL + r;
            p.hCone = p.L * Math.cos(coneTheta);
            p.rCirc = p.L * Math.sin(coneTheta);
            p.geff = null;
            p.omega = Math.sqrt(g / p.hCone);
            p.T = 2 * Math.PI * Math.sqrt(p.hCone / g);
        }
        return p;
    }

    function positiveModulo(value, divisor) {
        var result = value % divisor;
        return result < 0 ? result + divisor : result;
    }

    function finiteTime(time) {
        return numeric(time, 0);
    }

    function sample(state, p, time) {
        var s = copyNormalized(state);
        var params = isObject(p) ? p : compute(s);
        var t = finiteTime(time);

        if (s.model === 'fold') {
            if (!(Number.isFinite(params.T) && params.T > 0 && Number.isFinite(params.halfShort) && params.halfShort > 0 &&
                Number.isFinite(params.halfLong) && params.halfLong > 0 && Number.isFinite(params.A1) && Number.isFinite(params.A2) &&
                Number.isFinite(params.omega1) && Number.isFinite(params.omega2))) params = compute(s);
            var elapsed = positiveModulo(t, params.T);
            if (params.T - elapsed <= 1e-12 * params.T) elapsed = 0;
            var side, phase, amplitude, omega, sign;
            if (elapsed < params.halfShort) {
                side = 'short';
                phase = Math.PI * elapsed / params.halfShort;
                amplitude = params.A2;
                omega = params.omega2;
                sign = 1;
            } else {
                side = 'long';
                phase = Math.PI * (elapsed - params.halfShort) / params.halfLong;
                amplitude = params.A1;
                omega = params.omega1;
                sign = -1;
            }
            phase = clamp(phase, 0, Math.PI);
            return {
                angle: sign * amplitude * Math.sin(phase),
                angularVelocity: sign * amplitude * omega * Math.cos(phase),
                angleLabel: 'θ', side: side, phase: phase
            };
        }

        var angleLabel = s.model === 'cone' ? 'φ' : 'θ';
        var angularFrequency = s.model === 'cone' ? params.omega : Math.sqrt(params.geff / params.L);
        if (!Number.isFinite(angularFrequency) || angularFrequency <= 0) {
            params = compute(s);
            angularFrequency = s.model === 'cone' ? params.omega : Math.sqrt(params.geff / params.L);
        }
        var period = 2 * Math.PI / angularFrequency;
        var reducedPhase = positiveModulo(t, period) * angularFrequency;
        var rawPhase = t * angularFrequency;
        var phaseOut = Number.isFinite(rawPhase) ? rawPhase : reducedPhase;
        if (s.model === 'cone') {
            var coneAngle = Number.isFinite(rawPhase) ? rawPhase : reducedPhase;
            return { angle: coneAngle, angularVelocity: angularFrequency, angleLabel: angleLabel, side: null, phase: coneAngle };
        }
        return {
            angle: params.A * Math.sin(reducedPhase),
            angularVelocity: params.A * angularFrequency * Math.cos(reducedPhase),
            angleLabel: angleLabel, side: null, phase: phaseOut
        };
    }

    return {
        DEFAULTS: DEFAULTS,
        PARAMS: PARAMS,
        normalize: normalize,
        limits: limits,
        compute: compute,
        sample: sample
    };
});
