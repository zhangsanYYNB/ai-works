(function (window) {
    'use strict';

    if (!window) return;

    var PI = Math.PI;
    var TAU = PI * 2;

    function number(value, fallback) {
        return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    }

    function clamp(value, low, high) {
        return Math.max(low, Math.min(high, value));
    }

    function radians(value) {
        return value * PI / 180;
    }

    function create(options) {
        options = options || {};
        var THREE = window.THREE;
        var state = options.state || {};
        var document = window.document;
        var container = element(options.container);
        var labelLayer = element(options.labels);
        var renderer, scene, camera, controls, observer;
        var frameId = 0;
        var contextRecoveryTimer = 0;
        var contextLost = false;
        var disposed = false;
        var failed = false;
        var lastFrame = 0;
        var currentModel = '';
        var currentP = null;
        var lastPose = null;
        var signature = '';
        var theme = '';
        var observedTheme = state.theme;
        var apparatus, annotations, rig, trail;
        var trailCount = 0;
        var trailTime = null;
        var trailLast = null;
        var trailCapacity = 240;
        var labelRecords = [];
        var listeners = [];
        var geometries = new Set();
        var modelGeometries = new Set();
        var materials = {};
        var shapes = {};
        var lights = {};
        var width = 1;
        var height = 1;
        var view = 'perspective';
        var framingPoints = [];
        var fallbackOrbit = null;
        var target = null;
        var axisY = null;
        var scratch = null;
        var direction = null;
        var projected = null;
        var api = {
            update: update,
            resize: resize,
            setModel: setModel,
            setTheme: setTheme,
            setView: setView,
            resetView: resetView,
            dispose: dispose
        };

        function element(value) {
            if (typeof value !== 'string') return value || null;
            try { return document.querySelector(value); } catch (ignore) { return null; }
        }

        function callback(fn, value) {
            if (typeof fn === 'function') {
                try { fn(value); } catch (ignore) {}
            }
        }

        function listen(object, type, handler, settings) {
            object.addEventListener(type, handler, settings);
            listeners.push(function () { object.removeEventListener(type, handler, settings); });
        }

        function vector(x, y, z) {
            return new THREE.Vector3(x || 0, y || 0, z || 0);
        }

        function ownGeometry(geometry, temporary) {
            geometries.add(geometry);
            if (temporary) modelGeometries.add(geometry);
            return geometry;
        }

        function mesh(geometry, material, parent, shadows) {
            var object = new THREE.Mesh(geometry, material);
            object.castShadow = !!shadows;
            object.receiveShadow = !!shadows;
            (parent || apparatus).add(object);
            return object;
        }

        function box(position, size, material, parent, shadows) {
            var object = mesh(shapes.box, material, parent, shadows);
            object.position.copy(position);
            object.scale.set(size[0], size[1], size[2]);
            return object;
        }

        function rod(start, end, radius, material, parent, shadows) {
            var object = mesh(shapes.cylinder, material, parent, shadows);
            setRod(object, start, end, radius);
            return object;
        }

        function setRod(object, start, end, radius) {
            direction.subVectors(end, start);
            var length = direction.length();
            object.visible = length > 0.00001;
            if (!object.visible) return;
            object.position.copy(start).add(end).multiplyScalar(0.5);
            direction.multiplyScalar(1 / length);
            object.quaternion.setFromUnitVectors(axisY, direction);
            if (radius !== undefined) object.scale.set(radius, length, radius);
            else object.scale.y = length;
        }

        function wire(parent) {
            var object = mesh(shapes.wire, materials.string, parent, false);
            object.scale.set(0.0042, 1, 0.0042);
            return object;
        }

        function loop(position, normal, scale, parent, material) {
            var object = mesh(shapes.loop, material || materials.nickel, parent, false);
            object.position.copy(position);
            object.scale.setScalar(scale || 1);
            object.quaternion.setFromUnitVectors(vector(0, 0, 1), normal.clone().normalize());
            return object;
        }

        function bearing(position, normal, parent) {
            var a = position.clone().addScaledVector(normal, -0.047);
            var b = position.clone().addScaledVector(normal, 0.047);
            rod(a, b, 0.031, materials.nickel, parent, false);
            loop(a, normal, 1.18, parent, materials.darkMetal);
            loop(b, normal, 1.18, parent);
            return loop(position, normal, 0.8, parent);
        }

        function bob(radius) {
            var object = mesh(shapes.ball, materials.ball, apparatus, true);
            object.name = 'pendulum-bob';
            object.scale.setScalar(radius);
            var gloss = mesh(shapes.highlight, materials.highlight, object, false);
            gloss.scale.set(0.035, 0.39, 0.02);
            gloss.position.set(-0.27, 0.38, 0.82);
            return object;
        }

        function bevelBox(w, h, d) {
            var shape = new THREE.Shape();
            shape.moveTo(-w / 2, -h / 2);
            shape.lineTo(w / 2, -h / 2);
            shape.lineTo(w / 2, h / 2);
            shape.lineTo(-w / 2, h / 2);
            shape.closePath();
            var geometry = new THREE.ExtrudeGeometry(shape, {
                depth: d, steps: 1, bevelEnabled: true,
                bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 2
            });
            geometry.translate(0, 0, -d / 2);
            return ownGeometry(geometry, true);
        }

        function frame(span, y) {
            var beam = mesh(bevelBox(span, 0.105, 0.145), materials.metal, apparatus, true);
            beam.position.set(0, y + 0.18, -0.06);
            box(vector(0, y + 0.12, -0.06), [span * 0.93, 0.018, 0.11], materials.darkMetal);
            [-1, 1].forEach(function (sign) {
                var x = sign * (span / 2 - 0.1);
                box(vector(sign * (span / 2 + 0.009), y + 0.18, -0.06),
                    [0.022, 0.103, 0.145], materials.darkMetal);
                rod(vector(x, -2.46, -0.55), vector(x, y + 0.18, -0.55),
                    0.022, materials.metal, apparatus, true);
                rod(vector(x, y + 0.18, -0.55), vector(x, y + 0.18, -0.08),
                    0.022, materials.nickel, apparatus, true);
                box(vector(x, -2.475, -0.55), [0.24, 0.05, 0.38], materials.darkMetal, apparatus, true);
                box(vector(x, -2.444, -0.55), [0.16, 0.014, 0.29], materials.metal);
            });
            include(vector(-span / 2 - 0.12, -2.55, -0.8));
            include(vector(span / 2 + 0.12, -2.55, -0.8));
            include(vector(-span / 2 - 0.12, y + 0.32, -0.65));
            include(vector(span / 2 + 0.12, y + 0.32, 0.16));
        }

        function mount(position, normal) {
            rod(position.clone().add(vector(0, 0.13, -0.06)), position,
                0.019, materials.metal, apparatus, false);
            bearing(position, normal, apparatus);
        }

        function include(position) {
            framingPoints.push(position.clone());
        }

        function includeBall(position, radius) {
            include(position.clone().addScalar(radius * 1.4));
            include(position.clone().addScalar(-radius * 1.4));
        }

        function line(points, material, parent, dynamic) {
            var geometry = ownGeometry(new THREE.BufferGeometry().setFromPoints(points), true);
            if (dynamic) geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
            var object = new THREE.Line(geometry, material);
            object.frustumCulled = !dynamic;
            (parent || annotations).add(object);
            return object;
        }

        function setLine(object, points) {
            var attribute = object.geometry.attributes.position;
            for (var i = 0; i < points.length; i += 1) {
                attribute.setXYZ(i, points[i].x, points[i].y, points[i].z);
            }
            attribute.needsUpdate = true;
        }

        function addLabel(symbol, position, kind, dx, dy, priority) {
            if (!labelLayer || !document) return null;
            var span = document.createElement('span');
            span.className = 'scene-label' + (kind ? ' ' + kind : '');
            span.textContent = symbol;
            span.style.position = 'absolute';
            span.style.left = '0';
            span.style.top = '0';
            span.style.pointerEvents = 'none';
            span.setAttribute('aria-hidden', 'true');
            labelLayer.appendChild(span);
            var record = {
                element: span, position: position, dx: dx || 0, dy: dy || 0,
                priority: priority || 0, hidden: false, x: 0, y: 0,
                halfWidth: Math.max(10, symbol.length * 4 + 7)
            };
            labelRecords.push(record);
            labelRecords.sort(function (a, b) { return b.priority - a.priority; });
            return record;
        }

        function clearLabels() {
            labelRecords.forEach(function (record) {
                if (record.element.parentNode) record.element.parentNode.removeChild(record.element);
            });
            labelRecords.length = 0;
        }

        function makeTrail() {
            var geometry = ownGeometry(new THREE.BufferGeometry(), true);
            var attribute = new THREE.BufferAttribute(new Float32Array(trailCapacity * 3), 3);
            attribute.setUsage(THREE.DynamicDrawUsage);
            geometry.setAttribute('position', attribute);
            geometry.setDrawRange(0, 0);
            trail = new THREE.Line(geometry, materials.trail);
            trail.name = 'pendulum-trail';
            trail.frustumCulled = false;
            apparatus.add(trail);
            trailCount = 0;
            trailLast = null;
            trailTime = null;
        }

        function sampleTrail(position) {
            if (!trail) return;
            var time = number(state.t, null);
            if (time !== null && trailTime !== null && time < trailTime - 0.000001) {
                trailCount = 0;
                trailLast = null;
            }
            trailTime = time;
            if (state.showTrail === false) return;
            if (trailLast && trailLast.distanceToSquared(position) < 0.00009) return;
            var attribute = trail.geometry.attributes.position;
            if (trailCount === trailCapacity) {
                attribute.array.copyWithin(0, 3);
                trailCount -= 1;
            }
            attribute.setXYZ(trailCount, position.x, position.y, position.z);
            trailCount += 1;
            attribute.needsUpdate = true;
            trail.geometry.setDrawRange(0, trailCount);
            if (!trailLast) trailLast = position.clone();
            else trailLast.copy(position);
        }

        function arrow(material) {
            var shaft = mesh(shapes.wire, material, annotations, false);
            var head = mesh(shapes.arrow, material, annotations, false);
            shaft.scale.set(0.008, 1, 0.008);
            head.scale.set(0.04, 0.12, 0.04);
            return function (origin, unitDirection, length) {
                scratch.copy(origin).addScaledVector(unitDirection, length - 0.12);
                setRod(shaft, origin, scratch);
                head.position.copy(origin).addScaledVector(unitDirection, length - 0.06);
                head.quaternion.setFromUnitVectors(axisY, unitDirection);
            };
        }

        function makeMaterials() {
            function standard(name, color, metalness, roughness) {
                materials[name] = new THREE.MeshPhongMaterial({
                    color: color, specular: metalness > 0.5 ? 0xdce3e5 : 0x666d72,
                    shininess: Math.round(120 * (1 - roughness) + 12)
                });
            }
            standard('metal', 0xb8c0c1, 0.82, 0.29);
            standard('nickel', 0xd8dedd, 0.94, 0.18);
            standard('darkMetal', 0x424b51, 0.68, 0.34);
            standard('string', 0x283139, 0.35, 0.48);
            standard('plane', 0xc8cecc, 0.19, 0.52);
            standard('track', 0xb9c3c5, 0.8, 0.24);
            materials.track.side = THREE.DoubleSide;
            standard('gravity', 0xbd7768, 0.08, 0.5);
            standard('tension', 0x648c7d, 0.12, 0.46);
            materials.ball = new THREE.MeshPhongMaterial({
                color: 0x085cc3, specular: 0xe3efff, shininess: 125
            });
            materials.guide = new THREE.LineBasicMaterial({
                color: 0x8b999d, transparent: true, opacity: 0.46, depthWrite: false
            });
            materials.contour = new THREE.LineBasicMaterial({
                color: 0x89999d, transparent: true, opacity: 0.34, depthWrite: false
            });
            materials.trail = new THREE.LineBasicMaterial({
                color: 0x337ead, transparent: true, opacity: 0.52, depthWrite: false
            });
            materials.highlight = new THREE.MeshPhongMaterial({
                color: 0xffffff, specular: 0xffffff, shininess: 135,
                transparent: true, opacity: 0.48, depthWrite: false
            });
            materials.cone = new THREE.MeshBasicMaterial({
                color: 0x8da7af, side: THREE.DoubleSide,
                transparent: true, opacity: 0.035, depthWrite: false
            });
            materials.contact = new THREE.MeshBasicMaterial({
                color: 0x343e43, transparent: true, opacity: 0.22,
                depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1
            });
            var shadowCanvas = document.createElement('canvas');
            shadowCanvas.width = shadowCanvas.height = 128;
            var shadowContext = shadowCanvas.getContext('2d');
            var shadowGradient = shadowContext.createRadialGradient(64, 64, 3, 64, 64, 62);
            shadowGradient.addColorStop(0, 'rgba(54, 50, 44, 0.24)');
            shadowGradient.addColorStop(0.38, 'rgba(54, 50, 44, 0.12)');
            shadowGradient.addColorStop(1, 'rgba(54, 50, 44, 0)');
            shadowContext.fillStyle = shadowGradient;
            shadowContext.fillRect(0, 0, 128, 128);
            var shadowTexture = new THREE.CanvasTexture(shadowCanvas);
            shadowTexture.minFilter = THREE.LinearFilter;
            materials.shadow = new THREE.MeshBasicMaterial({
                color: 0x655d52, map: shadowTexture, transparent: true,
                opacity: 0.85, depthWrite: false, toneMapped: false
            });
        }

        function makeShapes() {
            shapes.box = ownGeometry(new THREE.BoxGeometry(1, 1, 1));
            shapes.cylinder = ownGeometry(new THREE.CylinderGeometry(1, 1, 1, 20));
            shapes.wire = ownGeometry(new THREE.CylinderGeometry(1, 1, 1, 8));
            shapes.ball = ownGeometry(new THREE.SphereGeometry(1, 56, 40));
            shapes.highlight = ownGeometry(new THREE.SphereGeometry(1, 20, 14));
            shapes.loop = ownGeometry(new THREE.TorusGeometry(0.029, 0.0055, 8, 28));
            shapes.arrow = ownGeometry(new THREE.ConeGeometry(1, 1, 16));
            shapes.contact = ownGeometry(new THREE.RingGeometry(0.35, 1, 32));
        }

        function setTheme(value) {
            if (disposed || failed || !scene) return;
            observedTheme = state.theme;
            var next = value === 'dark' ? 'dark' : 'light';
            if (theme === next) return;
            theme = next;
            var dark = theme === 'dark';
            var palette = {
                metal: dark ? 0x929ea4 : 0xb8c0c1,
                nickel: dark ? 0xc1cdd1 : 0xd8dedd,
                darkMetal: dark ? 0x566269 : 0x424b51,
                string: dark ? 0x829197 : 0x283139,
                plane: dark ? 0x4f6068 : 0xc8cecc,
                track: dark ? 0x8a9a9f : 0xb9c3c5,
                ball: dark ? 0x176fd1 : 0x085cc3,
                guide: dark ? 0x9aadb3 : 0x8b999d,
                contour: dark ? 0xa0b3b9 : 0x89999d,
                trail: dark ? 0x6fa8cf : 0x337ead,
                gravity: dark ? 0xd09482 : 0xbd7768,
                tension: dark ? 0x87b49d : 0x648c7d
            };
            Object.keys(palette).forEach(function (key) { materials[key].color.setHex(palette[key]); });
            materials.shadow.color.setHex(dark ? 0x303942 : 0x655d52);
            materials.shadow.opacity = dark ? 0.72 : 0.85;
            lights.hemi.color.setHex(dark ? 0xd5e2ee : 0xf7f2e8);
            lights.hemi.groundColor.setHex(dark ? 0x242d36 : 0x83817b);
            lights.key.intensity = dark ? 1.85 : 2.05;
            lights.fill.intensity = dark ? 0.65 : 0.7;
            renderer.toneMappingExposure = dark ? 1.04 : 1.08;
        }

        function paramsFor(model, supplied) {
            var p = supplied || {};
            function value(key, fallback) { return number(p[key], number(state[key], fallback)); }
            var result = {
                r: clamp(value('r', 0.12), 0.02, 0.3),
                g: Math.max(0.01, value('g', 9.8)),
                A: number(p.A, radians(number(state.ampDeg, 14)))
            };
            if (model === 'double') {
                result.l = Math.max(0.1, value('l', 2));
                result.alpha = number(p.alpha, radians(number(state.alphaDeg, 35)));
                result.h = number(p.h, result.l * Math.sin(result.alpha));
                result.d = Math.max(0.01, value('d', 1.2));
                result.mode = p.mode || (state.hangOn ? (state.hangMode === 'side' ? 'side' : 'normal') : 'classic');
                result.L = number(p.L, result.mode === 'side' ? result.d + result.r :
                    result.h + result.r + (result.mode === 'normal' ? result.d : 0));
            } else if (model === 'fold') {
                result.l1 = Math.max(0.3, value('l1', 2.2));
                result.l2 = Math.max(0.1, value('l2', 1));
                result.L1 = number(p.L1, result.l1 + result.r);
                result.L2 = number(p.L2, result.l2 + result.r);
                result.A1 = number(p.A1, result.A);
                result.A2 = number(p.A2, result.A1 * Math.sqrt(result.L1 / result.L2));
            } else if (model === 'arc') {
                result.R = Math.max(result.r + 0.05, value('R', 2.5));
                result.L = number(p.L, result.R - result.r);
            } else if (model === 'incline') {
                result.inclineL = Math.max(0.1, value('inclineL', 2));
                result.incline = number(p.incline, radians(number(state.inclineDeg, 25)));
                result.L = number(p.L, result.inclineL + result.r);
            } else {
                result.coneL = Math.max(0.1, value('coneL', 2));
                result.coneTheta = number(p.coneTheta, radians(number(state.coneThetaDeg, 25)));
                result.L = number(p.L, result.coneL + result.r);
                result.hCone = number(p.hCone, result.L * Math.cos(result.coneTheta));
                result.rCirc = number(p.rCirc, result.L * Math.sin(result.coneTheta));
                result.omega = number(p.omega, Math.sqrt(result.g / Math.max(0.01, result.hCone)));
            }
            return result;
        }

        function structuralSignature(model, p) {
            var fields = {
                double: ['r', 'l', 'alpha', 'h', 'd', 'mode', 'L'],
                fold: ['r', 'l1', 'l2', 'L1', 'L2'],
                arc: ['r', 'R', 'L'],
                incline: ['r', 'incline', 'inclineL', 'L'],
                cone: ['r', 'coneL', 'coneTheta', 'L', 'hCone', 'rCirc']
            };
            return model + ':' + fields[model].map(function (key) { return p[key]; }).join('/');
        }

        function poseFor(data, p) {
            if (window.PendulumPhysics && window.PendulumPhysics.sample) {
                try { return window.PendulumPhysics.sample(data, p, number(data.t, 0)); } catch (ignore) {}
            }
            return { angle: data.model === 'cone' ? p.omega * number(data.t, 0) : 0, side: 'short' };
        }

        function buildDouble(p) {
            var H = 2;
            var O = vector(0, H, 0);
            var a = p.l * Math.cos(p.alpha);
            var A = vector(-a, H, 0);
            var B = vector(a, H, 0);
            var C = vector(0, H - p.h, 0);
            var center = vector();
            var surface = vector();
            var radial = vector();
            var lengthMark = vector();
            var normal = vector(1, 0, 0);
            frame(2 * a + 0.48, H);
            mount(A, normal);
            mount(B, normal);
            var cableA = wire();
            var cableB = wire();
            var lowerCable = wire();
            var junction = loop(C, normal, 0.56);
            var eye = loop(C, normal, Math.min(0.5, p.r * 3));
            var ball = bob(p.r);
            var guide = line([O, center], materials.guide, annotations, true);
            line([A, B], materials.guide).computeLineDistances();
            addLabel('A', A, 'point', -13, -15, 5);
            addLabel('B', B, 'point', 13, -15, 5);
            addLabel('O', O, 'point', 0, -20, 4);
            addLabel('C', C, 'point', 15, 4, 3);
            addLabel('L', lengthMark, 'accent', 16, 0, 1);

            function position(angle) {
                if (p.mode === 'side') {
                    C.set(0, H - p.h, 0);
                    radial.set(Math.sin(angle), -Math.cos(angle), 0);
                    center.copy(C).addScaledVector(radial, p.L);
                } else {
                    radial.set(0, -Math.cos(angle), Math.sin(angle));
                    C.copy(O).addScaledVector(radial, p.h);
                    center.copy(O).addScaledVector(radial, p.L);
                }
                return center;
            }
            for (var i = -1; i <= 1; i += 1) includeBall(position(i * radians(18)), p.r);
            return {
                target: vector(0, Math.min(0.9, (H + H - p.h - p.L) / 2 + 0.15), 0),
                update: function (pose) {
                    position(number(pose.angle, 0));
                    surface.copy(center).addScaledVector(radial, -p.r);
                    setRod(cableA, A, C);
                    setRod(cableB, B, C);
                    setRod(lowerCable, C, surface);
                    lowerCable.visible = p.mode !== 'classic';
                    junction.position.copy(C);
                    eye.position.copy(surface);
                    eye.quaternion.setFromUnitVectors(vector(0, 0, 1), radial);
                    ball.position.copy(center);
                    var pivot = p.mode === 'side' ? C : O;
                    setLine(guide, [pivot, center]);
                    lengthMark.copy(pivot).lerp(center, 0.48);
                    return center;
                }
            };
        }

        function buildFold(p) {
            var A = vector(0, 2.15, 0);
            var P = vector(0, 2.15 - (p.l1 - p.l2), 0);
            var center = vector();
            var surface = vector();
            var radial = vector();
            var lengthMark = vector();
            frame(1.9, A.y);
            mount(A, vector(0, 0, 1));
            rod(vector(0, A.y + 0.13, -0.27), P.clone().add(vector(0, 0, -0.27)),
                0.021, materials.darkMetal, apparatus, true);
            rod(P.clone().add(vector(0, 0, -0.27)), P, 0.021, materials.nickel);
            bearing(P, vector(0, 0, 1), apparatus);
            rod(A, P, 0.025, materials.metal, apparatus, true);
            var movingCable = wire();
            var eye = loop(P, vector(0, 0, 1), Math.min(0.5, p.r * 3));
            var ball = bob(p.r);
            addLabel('A', A, 'point', 17, -10, 5);
            addLabel('P', P, 'point', -18, 0, 5);
            var lengthLabel = addLabel('L₂', lengthMark, 'accent', 18, 0, 2);
            var neutralBottom = vector(0, A.y - p.L1, 0);
            line([A, neutralBottom], materials.guide).computeLineDistances();
            for (var sideIndex = 0; sideIndex < 2; sideIndex += 1) {
                var base = sideIndex === 0 ? P : A;
                var radius = sideIndex === 0 ? p.L2 : p.L1;
                for (var sample = 0; sample <= 2; sample += 1) {
                    var angle = radians(18) * (sample / 2) * (sideIndex === 0 ? 1 : -1);
                    includeBall(base.clone().add(vector(radius * Math.sin(angle), -radius * Math.cos(angle), 0)), p.r);
                }
            }
            return {
                target: vector(0, 0.85 - Math.max(0, p.L1 - 2.5) * 0.35, 0),
                update: function (pose) {
                    var angle = number(pose.angle, 0);
                    var side = pose.side;
                    var shortSide = side === 'short' || side === 0 || side === '0';
                    if (side !== 'short' && side !== 'long' && side !== 0 && side !== 1 && side !== '0' && side !== '1') {
                        shortSide = angle >= 0;
                    }
                    var pivot = shortSide ? P : A;
                    radial.set(Math.sin(angle), -Math.cos(angle), 0);
                    center.copy(pivot).addScaledVector(radial, shortSide ? p.L2 : p.L1);
                    surface.copy(center).addScaledVector(radial, -p.r);
                    setRod(movingCable, pivot, surface);
                    ball.position.copy(center);
                    eye.position.copy(surface);
                    lengthMark.copy(pivot).lerp(center, 0.56);
                    if (lengthLabel) lengthLabel.element.textContent = shortSide ? 'L₂' : 'L₁';
                    return center;
                }
            };
        }

        function buildArc(p) {
            var O = vector(0, 1.45, 0);
            var center = vector();
            var contact = vector();
            var inward = vector();
            var radiusMark = vector();
            var halfWidth = Math.max(0.22, p.r * 1.15);
            mesh(trackGeometry(O, p.R, halfWidth), materials.track, apparatus, true);
            [-1, 1].forEach(function (side) {
                var edgePoints = [];
                for (var step = 0; step <= 80; step += 1) {
                    var phi = -1 + step / 40;
                    edgePoints.push(vector((p.R + 0.006) * Math.sin(phi),
                        O.y - (p.R + 0.006) * Math.cos(phi), side * halfWidth));
                }
                var curve = new THREE.CatmullRomCurve3(edgePoints);
                var tube = ownGeometry(new THREE.TubeGeometry(curve, 96, 0.012, 6, false), true);
                mesh(tube, materials.nickel, apparatus, false);
                var angle = side * 0.78;
                var x = p.R * Math.sin(angle);
                var y = O.y - p.R * Math.cos(angle) - 0.065;
                rod(vector(x, floorY + 0.05, -halfWidth * 0.7), vector(x, y, -halfWidth * 0.7),
                    0.027, materials.metal, apparatus, true);
                rod(vector(x, y, -halfWidth), vector(x, y, halfWidth), 0.03, materials.darkMetal);
                box(vector(x, floorY + 0.025, 0), [0.32, 0.05, halfWidth * 2 + 0.18], materials.darkMetal, apparatus, true);
            });
            var ball = bob(p.r);
            var contactShade = mesh(shapes.contact, materials.contact, apparatus, false);
            contactShade.scale.setScalar(p.r * 0.42);
            var guide = line([O, contact], materials.guide, annotations, true);
            addLabel('O', O, 'point', 14, -5, 4);
            addLabel('R', radiusMark, 'accent', 15, 0, 2);
            for (var i = 0; i <= 16; i += 1) {
                var phi = -1 + i / 8;
                include(vector((p.R + 0.1) * Math.sin(phi), O.y - (p.R + 0.1) * Math.cos(phi), halfWidth));
            }
            include(O.clone().add(vector(0, 0.18, 0)));
            return {
                target: vector(0, O.y - p.R * 0.48, 0),
                update: function (pose) {
                    var angle = number(pose.angle, 0);
                    center.set(p.L * Math.sin(angle), O.y - p.L * Math.cos(angle), 0);
                    contact.set(p.R * Math.sin(angle), O.y - p.R * Math.cos(angle), 0);
                    inward.set(-Math.sin(angle), Math.cos(angle), 0);
                    ball.position.copy(center);
                    contactShade.position.copy(contact).addScaledVector(inward, 0.0015);
                    contactShade.quaternion.setFromUnitVectors(vector(0, 0, 1), inward);
                    setLine(guide, [O, contact]);
                    radiusMark.copy(O).lerp(contact, 0.46);
                    return center;
                }
            };
        }

        function trackGeometry(O, radius, halfWidth) {
            var vertices = [];
            var indices = [];
            var steps = 112;
            for (var i = 0; i <= steps; i += 1) {
                var phi = -1 + 2 * i / steps;
                [
                    [radius, -halfWidth], [radius, halfWidth],
                    [radius + 0.055, halfWidth], [radius + 0.055, -halfWidth]
                ].forEach(function (pair) {
                    vertices.push(pair[0] * Math.sin(phi), O.y - pair[0] * Math.cos(phi), pair[1]);
                });
            }
            for (var section = 0; section < steps; section += 1) {
                for (var edge = 0; edge < 4; edge += 1) {
                    var a = section * 4 + edge;
                    var b = section * 4 + (edge + 1) % 4;
                    indices.push(a, b, b + 4, a, b + 4, a + 4);
                }
            }
            indices.push(0, 2, 1, 0, 3, 2);
            var end = steps * 4;
            indices.push(end, end + 1, end + 2, end, end + 2, end + 3);
            var geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setIndex(indices);
            geometry.computeVertexNormals();
            return ownGeometry(geometry, true);
        }

        function buildIncline(p) {
            var O = vector(0, 2, 0);
            var normal = vector(0, Math.cos(p.incline), Math.sin(p.incline));
            var e2 = vector(0, -Math.sin(p.incline), Math.cos(p.incline));
            var anchor = O.clone();
            var halfWidth = Math.max(0.68, p.L * Math.sin(radians(18)) + p.r + 0.15);
            var boardEnd = p.L + p.r + 0.26;
            var boardStart = -0.23;
            var matrix = new THREE.Matrix4().makeBasis(vector(1, 0, 0), normal, e2);
            var boardCenter = O.clone().addScaledVector(e2, (boardEnd + boardStart) / 2)
                .addScaledVector(normal, -0.029);
            var plate = box(boardCenter, [halfWidth * 2, 0.058, boardEnd - boardStart], materials.plane, apparatus, true);
            plate.quaternion.setFromRotationMatrix(matrix);
            [-1, 1].forEach(function (side) {
                var railStart = O.clone().add(vector(side * halfWidth, 0, 0)).addScaledVector(e2, boardStart);
                var railEnd = O.clone().add(vector(side * halfWidth, 0, 0)).addScaledVector(e2, boardEnd);
                rod(railStart, railEnd, 0.014, materials.nickel);
                [0.14, boardEnd - 0.2].forEach(function (along) {
                    var top = O.clone().add(vector(side * halfWidth * 0.86, 0, 0))
                        .addScaledVector(e2, along).addScaledVector(normal, -0.05);
                    rod(vector(top.x, floorY + 0.04, top.z), top, 0.023, materials.metal, apparatus, true);
                    box(vector(top.x, floorY + 0.025, top.z), [0.2, 0.05, 0.27], materials.darkMetal, apparatus, true);
                });
                includeBall(railStart, 0.07);
                includeBall(railEnd, 0.07);
            });
            mount(anchor, normal);
            var cable = wire();
            var ball = bob(p.r);
            var contactShade = mesh(shapes.contact, materials.contact, apparatus, false);
            contactShade.scale.setScalar(p.r * 0.48);
            contactShade.quaternion.setFromUnitVectors(vector(0, 0, 1), normal);
            var center = vector();
            var surface = vector();
            var radial = vector();
            var lengthMark = vector();
            var effectiveMark = vector();
            var effectiveArrow = arrow(materials.tension);
            var baselineEnd = O.clone().addScaledVector(e2, boardEnd - 0.05).addScaledVector(normal, 0.002);
            line([O.clone().addScaledVector(normal, 0.002), baselineEnd], materials.guide).computeLineDistances();
            var angleOrigin = O.clone().add(vector(-halfWidth - 0.08, 0, 0));
            var anglePoints = [];
            for (var j = 0; j <= 20; j += 1) {
                var phi = p.incline * j / 20;
                anglePoints.push(angleOrigin.clone().add(vector(0, -0.38 * Math.sin(phi), 0.38 * Math.cos(phi))));
            }
            line(anglePoints, materials.contour);
            line([angleOrigin, angleOrigin.clone().add(vector(0, 0, 0.55))], materials.guide).computeLineDistances();
            addLabel('O', O, 'point', 16, -12, 5);
            addLabel('L', lengthMark, 'accent', 15, -2, 2);
            addLabel('θ', anglePoints[10], 'accent', -13, -3, 3);
            addLabel('gₑff', effectiveMark, 'force-effective', 12, 0, 4);
            for (var i = -1; i <= 1; i += 1) {
                var a = radians(18) * i;
                var futureCenter = anchor.clone().addScaledVector(e2, p.L * Math.cos(a))
                    .add(vector(p.L * Math.sin(a), 0, 0)).addScaledVector(normal, p.r);
                includeBall(futureCenter, p.r);
            }
            return {
                target: O.clone().addScaledVector(e2, p.L * 0.52).add(vector(0, -0.25, 0)),
                front: normal,
                update: function (pose) {
                    var angle = number(pose.angle, 0);
                    radial.copy(e2).multiplyScalar(Math.cos(angle)).add(vector(Math.sin(angle), 0, 0));
                    center.copy(anchor).addScaledVector(radial, p.L).addScaledVector(normal, p.r);
                    surface.copy(center).sub(anchor).normalize().multiplyScalar(-p.r).add(center);
                    setRod(cable, anchor, surface);
                    ball.position.copy(center);
                    contactShade.position.copy(center).addScaledVector(normal, -p.r + 0.0015);
                    effectiveArrow(center, e2, 0.54);
                    effectiveMark.copy(center).addScaledVector(e2, 0.67);
                    lengthMark.copy(anchor).lerp(center, 0.52);
                    return center;
                }
            };
        }

        function buildCone(p) {
            var O = vector(0, 2.05, 0);
            var circleCenter = vector(0, O.y - p.hCone, 0);
            var center = vector();
            var surface = vector();
            var towardO = vector();
            var thetaMark = vector();
            var gravityMark = vector();
            var tensionMark = vector();
            var gravityDirection = vector(0, -1, 0);
            frame(1.8, O.y);
            mount(O, vector(0, 0, 1));
            var cable = wire();
            var ball = bob(p.r);
            var eye = loop(O, vector(0, 0, 1), Math.min(0.5, p.r * 3));
            var shellGeometry = ownGeometry(new THREE.ConeGeometry(p.rCirc, p.hCone, 48, 1, true), true);
            var shell = mesh(shellGeometry, materials.cone, apparatus, false);
            shell.position.copy(O).add(vector(0, -p.hCone / 2, 0));
            var ringPoints = [];
            for (var i = 0; i <= 96; i += 1) {
                var phi = TAU * i / 96;
                ringPoints.push(vector(p.rCirc * Math.cos(phi), circleCenter.y, p.rCirc * Math.sin(phi)));
                if (i % 6 === 0) includeBall(ringPoints[i], p.r);
            }
            line(ringPoints, materials.contour);
            line([O, circleCenter], materials.guide).computeLineDistances();
            var generators = [];
            for (var ray = 0; ray < 4; ray += 1) generators.push(O, ringPoints[ray * 24]);
            var generatorGeometry = ownGeometry(new THREE.BufferGeometry().setFromPoints(generators), true);
            annotations.add(new THREE.LineSegments(generatorGeometry, materials.contour));
            var gravityArrow = arrow(materials.gravity);
            var tensionArrow = arrow(materials.tension);
            var tensionLength = 0.56 / Math.max(0.3, Math.cos(p.coneTheta));
            addLabel('O', O, 'point', 15, -10, 5);
            addLabel('φ', thetaMark, 'accent', 12, 0, 2);
            addLabel('mg', gravityMark, 'force-g', 12, 0, 4);
            addLabel('Fₜ', tensionMark, 'force-tension', 14, 0, 4);
            includeBall(circleCenter.clone().add(vector(0, -0.7, 0)), 0.07);
            return {
                target: vector(0, (O.y + circleCenter.y) / 2 - 0.12, 0),
                update: function (pose) {
                    var phi = number(pose.angle, number(pose.phase, 0)) % TAU;
                    center.set(p.rCirc * Math.cos(phi), circleCenter.y, p.rCirc * Math.sin(phi));
                    towardO.subVectors(O, center).normalize();
                    surface.copy(center).addScaledVector(towardO, p.r);
                    setRod(cable, O, surface);
                    ball.position.copy(center);
                    eye.position.copy(surface);
                    eye.quaternion.setFromUnitVectors(vector(0, 0, 1), towardO);
                    gravityArrow(center, gravityDirection, 0.56);
                    tensionArrow(center, towardO, tensionLength);
                    gravityMark.copy(center).addScaledVector(gravityDirection, 0.65);
                    tensionMark.copy(center).addScaledVector(towardO, tensionLength + 0.09);
                    thetaMark.copy(O).lerp(center, 0.21).add(vector(0.04, 0, 0));
                    return center;
                }
            };
        }

        function build(model, p) {
            if (model === 'fold') return buildFold(p);
            if (model === 'arc') return buildArc(p);
            if (model === 'incline') return buildIncline(p);
            if (model === 'cone') return buildCone(p);
            return buildDouble(p);
        }

        function removeModel() {
            modelGeometries.forEach(function (geometry) {
                if (geometry.dispose) geometry.dispose();
                geometries.delete(geometry);
            });
            modelGeometries.clear();
            if (apparatus) apparatus.clear();
            if (annotations) annotations.clear();
            clearLabels();
            rig = null;
            trail = null;
            trailCount = 0;
            trailTime = null;
            trailLast = null;
            framingPoints = [];
        }

        function rebuild(data, p, reframe) {
            removeModel();
            currentModel = data.model;
            currentP = p;
            signature = structuralSignature(currentModel, p);
            rig = build(currentModel, p);
            makeTrail();
            lastPose = poseFor(data, p);
            var bobPosition = rig.update(lastPose, p);
            sampleTrail(bobPosition);
            if (camera && rig.target) placeCamera(rig.target, reframe !== false);
            syncVisibility();
            updateLabels();
            if (renderer && camera) renderer.render(scene, camera);
        }

        function framingDistance(targetPosition) {
            var maxRadius = 1.5;
            framingPoints.forEach(function (position) {
                maxRadius = Math.max(maxRadius, position.distanceTo(targetPosition));
            });
            var vertical = radians(camera.fov) / 2;
            var horizontal = Math.atan(Math.tan(vertical) * Math.max(0.2, camera.aspect));
            var halfAngle = Math.max(0.08, Math.min(vertical, horizontal));
            return clamp(maxRadius / Math.sin(halfAngle) * 1.12, 5.2, 22);
        }

        function currentViewDirection() {
            if (view === 'front') return vector(0, 0.012, 1).normalize();
            return vector(4.1, 2.45, 6.6).normalize();
        }

        function placeCamera(targetPosition, forceFit) {
            var oldTarget = controls ? controls.target : target;
            direction.copy(camera.position).sub(oldTarget || vector(0, 0.9, 0));
            if (direction.lengthSq() < 0.01) direction.copy(currentViewDirection());
            direction.normalize();
            var required = framingDistance(targetPosition);
            var distance = forceFit ? required : Math.max(required, camera.position.distanceTo(oldTarget || targetPosition));
            target.copy(targetPosition);
            if (controls) controls.target.copy(target);
            camera.position.copy(target).addScaledVector(direction, distance);
            camera.lookAt(target);
            camera.updateProjectionMatrix();
            if (controls) controls.update();
        }

        function setFallbackFromCamera() {
            if (!fallbackOrbit) return;
            scratch.subVectors(camera.position, target);
            var spherical = new THREE.Spherical().setFromVector3(scratch);
            fallbackOrbit.radius = clamp(spherical.radius, 4.2, 22);
            fallbackOrbit.theta = spherical.theta;
            fallbackOrbit.phi = clamp(spherical.phi, 0.2, PI - 0.2);
        }

        function applyFallbackOrbit() {
            if (!fallbackOrbit) return;
            scratch.setFromSpherical(new THREE.Spherical(
                fallbackOrbit.radius, fallbackOrbit.phi, fallbackOrbit.theta
            )).add(target);
            camera.position.copy(scratch);
            camera.lookAt(target);
        }

        function resetView() {
            if (!rig || !camera) return;
            userMoved = false;
            view = 'perspective';
            if (controls) {
                controls.target.copy(rig.target);
                camera.position.copy(rig.target).add(currentViewDirection().multiplyScalar(framingDistance(rig.target)));
                camera.lookAt(rig.target);
                controls.update();
            } else {
                target.copy(rig.target);
                camera.position.copy(target).add(currentViewDirection().multiplyScalar(framingDistance(target)));
                setFallbackFromCamera();
                applyFallbackOrbit();
            }
            camera.updateProjectionMatrix();
        }

        function setView(nextView) {
            if (!rig || !camera) return;
            view = nextView === 'front' ? 'front' : 'perspective';
            var distance = Math.max(framingDistance(rig.target), camera.position.distanceTo(target));
            var newDirection = view === 'front' ? vector(0, 0.012, 1).normalize() : currentViewDirection();
            camera.position.copy(rig.target).addScaledVector(newDirection, distance);
            camera.lookAt(rig.target);
            target.copy(rig.target);
            if (controls) {
                controls.target.copy(target);
                controls.update();
            } else {
                setFallbackFromCamera();
            }
            camera.updateProjectionMatrix();
        }

        function updateLabels() {
            if (!labelLayer || !renderer || !camera || !labelRecords.length) return;
            var layerRect = labelLayer.getBoundingClientRect();
            var canvasRect = renderer.domElement.getBoundingClientRect();
            if (!layerRect.width || !layerRect.height || !canvasRect.width || !canvasRect.height) return;
            var occupied = [];
            labelRecords.forEach(function (record) {
                var element = record.element;
                if (state.showAnnotations === false) {
                    element.hidden = true;
                    return;
                }
                element.hidden = false;
                projected.copy(record.position).project(camera);
                var x = canvasRect.left - layerRect.left + (projected.x * 0.5 + 0.5) * canvasRect.width + record.dx;
                var y = canvasRect.top - layerRect.top + (-projected.y * 0.5 + 0.5) * canvasRect.height + record.dy;
                var valid = projected.z > -1 && projected.z < 1 && x >= 0 && x <= layerRect.width &&
                    y >= 0 && y <= layerRect.height;
                if (!valid) {
                    element.style.visibility = 'hidden';
                    return;
                }
                var boxWidth = Math.max(record.halfWidth * 2, element.offsetWidth || 0);
                var boxHeight = Math.max(17, element.offsetHeight || 0);
                x = clamp(x, boxWidth / 2 + 2, layerRect.width - boxWidth / 2 - 2);
                y = clamp(y, boxHeight / 2 + 2, layerRect.height - boxHeight / 2 - 2);
                var collision = occupied.some(function (rect) {
                    return Math.abs(rect.x - x) < (rect.w + boxWidth) * 0.5 + 4 &&
                        Math.abs(rect.y - y) < (rect.h + boxHeight) * 0.5 + 3;
                });
                if (collision) {
                    element.style.visibility = 'hidden';
                    return;
                }
                occupied.push({ x: x, y: y, w: boxWidth, h: boxHeight });
                element.style.left = x + 'px';
                element.style.top = y + 'px';
                element.style.transform = 'translate(-50%, -50%)';
                element.style.visibility = 'visible';
            });
        }

        function syncVisibility() {
            if (trail) trail.visible = state.showTrail !== false;
            annotations.visible = state.showAnnotations !== false;
            labelRecords.forEach(function (record) {
                record.element.hidden = state.showAnnotations === false;
            });
            if (controls) {
                controls.autoRotate = !!state.autoRotate;
                controls.autoRotateSpeed = 0.28;
            }
        }

        function setModel(model, suppliedP) {
            if (disposed || failed || !apparatus) return;
            var data = dataFrom(model);
            var p = paramsFor(data.model, suppliedP);
            var nextSignature = structuralSignature(data.model, p);
            if (rig && data.model === currentModel && nextSignature === signature) {
                currentP = p;
                lastPose = poseFor(data, p);
                sampleTrail(rig.update(lastPose, p));
                syncVisibility();
                setTheme(data.theme);
                updateLabels();
                return;
            }
            try {
                rebuild(data, p, true);
                setTheme(data.theme);
            } catch (error) {
                fail('三维模型构建失败：' + errorText(error));
            }
        }

        function dataFrom(model) {
            var data = Object.assign({
                model: 'double', theme: 'light', t: 0, r: 0.12, g: 9.8, ampDeg: 14,
                l: 2, alphaDeg: 35, d: 1.2, hangOn: false, hangMode: 'normal',
                l1: 2.2, l2: 1, R: 2.5, inclineL: 2, inclineDeg: 25,
                coneL: 2, coneThetaDeg: 25, autoRotate: false,
                showTrail: true, showAnnotations: true
            }, state);
            if (model && typeof model === 'object') Object.assign(data, model);
            else if (typeof model === 'string') data.model = model;
            else if (currentModel) data.model = currentModel;
            if (['double', 'fold', 'arc', 'incline', 'cone'].indexOf(data.model) < 0) data.model = 'double';
            return data;
        }

        function update(frame) {
            if (disposed || failed || !apparatus) return;
            frame = frame || {};
            var data = dataFrom(frame.model);
            var p = paramsFor(data.model, frame.p);
            var nextSignature = structuralSignature(data.model, p);
            if (data.model !== currentModel) {
                setModel(frame.model || data.model, p);
                data = dataFrom(frame.model || data.model);
                p = currentP || p;
            } else if (nextSignature !== signature) {
                try {
                    rebuild(data, p, false);
                    setTheme(data.theme);
                } catch (error) {
                    fail('三维模型更新失败：' + errorText(error));
                    return;
                }
            }
            currentP = p;
            lastPose = frame.pose || poseFor(data, p);
            var position = rig.update(lastPose, p);
            sampleTrail(position);
            syncVisibility();
            updateLabels();
        }

        function resize() {
            if (!renderer || disposed || failed) return;
            var rect = container.getBoundingClientRect();
            width = Math.max(1, rect.width || container.clientWidth || 1);
            height = Math.max(1, rect.height || container.clientHeight || 1);
            renderer.setPixelRatio(Math.min(1.7, Math.max(0.75, window.devicePixelRatio || 1)));
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            if (rig && !userMoved) placeCamera(rig.target, true);
            updateLabels();
        }

        function syncThemeFromState() {
            if (state.theme !== observedTheme) {
                observedTheme = state.theme;
                setTheme(state.theme);
            }
        }

        function animate(timestamp) {
            if (disposed || failed || contextLost || !renderer) return;
            var time = number(timestamp, 0);
            var delta = lastFrame ? Math.min(0.05, Math.max(0, (time - lastFrame) / 1000)) : 0;
            lastFrame = time;
            syncThemeFromState();
            syncVisibility();
            if (controls) {
                controls.autoRotate = !!state.autoRotate;
                controls.update();
            } else if (fallbackOrbit && state.autoRotate && !fallbackOrbit.dragging) {
                fallbackOrbit.theta -= delta * 0.11;
                applyFallbackOrbit();
            }
            renderer.render(scene, camera);
            updateLabels();
            frameId = window.requestAnimationFrame(animate);
        }

        function errorText(error) {
            return error && error.message ? error.message : String(error);
        }

        function fail(message) {
            if (failed || disposed) return;
            failed = true;
            callback(options.onError, message);
            dispose();
        }

        function dispose() {
            if (disposed) return;
            disposed = true;
            if (frameId) window.cancelAnimationFrame(frameId);
            if (contextRecoveryTimer) window.clearTimeout(contextRecoveryTimer);
            contextRecoveryTimer = 0;
            if (observer) observer.disconnect();
            listeners.forEach(function (remove) { try { remove(); } catch (ignore) {} });
            listeners.length = 0;
            if (controls && controls.dispose) controls.dispose();
            controls = null;
            clearLabels();
            if (apparatus) apparatus.clear();
            if (annotations) annotations.clear();
            geometries.forEach(function (geometry) {
                try { geometry.dispose(); } catch (ignore) {}
            });
            geometries.clear();
            modelGeometries.clear();
            materials.shadow.map.dispose();
            Object.keys(materials).forEach(function (key) {
                if (materials[key] && materials[key].dispose) materials[key].dispose();
            });
            if (renderer) {
                if (renderer.renderLists && renderer.renderLists.dispose) renderer.renderLists.dispose();
                renderer.dispose();
                if (renderer.domElement && renderer.domElement.parentNode === container) {
                    container.removeChild(renderer.domElement);
                }
            }
            renderer = null;
            scene = null;
            rig = null;
        }

        function failSetup(message) {
            if (failed) return;
            failed = true;
            callback(options.onError, message);
            dispose();
        }

        if (!container) {
            failSetup('找不到三维画布容器。');
            return api;
        }
        if (!THREE || !THREE.WebGLRenderer || !THREE.Scene) {
            failSetup('Three.js 尚未加载，三维场景无法启动。');
            return api;
        }

        var userMoved = false;
        var floorY = -2.5;
        target = new THREE.Vector3();
        axisY = vector(0, 1, 0);
        scratch = new THREE.Vector3();
        direction = new THREE.Vector3();
        projected = new THREE.Vector3();

        try {
            scene = new THREE.Scene();
            camera = new THREE.PerspectiveCamera(36, 1, 0.08, 80);
            camera.position.set(4.1, 3.2, 6.6);
            makeMaterials();
            makeShapes();
            renderer = new THREE.WebGLRenderer({
                alpha: true, antialias: false, powerPreference: 'low-power',
                stencil: false, depth: true, preserveDrawingBuffer: false
            });
            renderer.setPixelRatio(Math.min(1.1, Math.max(0.75, window.devicePixelRatio || 1)));
            renderer.setClearColor(0x000000, 0);
            renderer.toneMapping = THREE.NoToneMapping;
            renderer.toneMappingExposure = 1;
            if (renderer.outputEncoding !== undefined && THREE.sRGBEncoding !== undefined) {
                renderer.outputEncoding = THREE.sRGBEncoding;
            }
            renderer.shadowMap.enabled = false;
            renderer.domElement.style.display = 'block';
            renderer.domElement.style.width = '100%';
            renderer.domElement.style.height = '100%';
            renderer.domElement.style.touchAction = 'none';
            container.appendChild(renderer.domElement);
            scene.environment = null;

            lights.hemi = new THREE.HemisphereLight(0xf7f2e8, 0x83817b, 1.25);
            scene.add(lights.hemi);
            lights.key = new THREE.DirectionalLight(0xfff3e1, 2.05);
            lights.key.position.set(-3.8, 6.5, 4.5);
            lights.key.castShadow = false;
            scene.add(lights.key);
            scene.add(lights.key.target);
            lights.fill = new THREE.DirectionalLight(0xe4edf2, 0.7);
            lights.fill.position.set(4.5, 3.5, 2.5);
            scene.add(lights.fill);
            lights.rim = new THREE.DirectionalLight(0xffffff, 1.2);
            lights.rim.position.set(1.5, 4, -5);
            scene.add(lights.rim);

            var ground = mesh(ownGeometry(new THREE.PlaneGeometry(4.8, 2.8)), materials.shadow, scene, false);
            ground.rotation.x = -PI / 2;
            ground.position.y = floorY - 0.005;
            apparatus = new THREE.Group();
            annotations = new THREE.Group();
            scene.add(apparatus);
            scene.add(annotations);

            if (THREE.OrbitControls) {
                controls = new THREE.OrbitControls(camera, renderer.domElement);
                controls.enableDamping = true;
                controls.dampingFactor = 0.075;
                controls.enablePan = false;
                controls.enableZoom = true;
                controls.rotateSpeed = 0.72;
                controls.zoomSpeed = 0.82;
                controls.minDistance = 4.2;
                controls.maxDistance = 22;
                controls.minPolarAngle = 0.2;
                controls.maxPolarAngle = PI - 0.2;
                controls.target.copy(vector(0, 0.9, 0));
                controls.addEventListener('start', function () { userMoved = true; });
            } else {
                fallbackOrbit = { theta: 0.56, phi: 1.24, radius: 8.2, dragging: false, pointer: null };
                var canvas = renderer.domElement;
                listen(canvas, 'pointerdown', function (event) {
                    if (event.button !== 0) return;
                    fallbackOrbit.dragging = true;
                    fallbackOrbit.pointer = { x: event.clientX, y: event.clientY, id: event.pointerId };
                    userMoved = true;
                    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
                });
                listen(canvas, 'pointermove', function (event) {
                    if (!fallbackOrbit.dragging || !fallbackOrbit.pointer) return;
                    var dx = event.clientX - fallbackOrbit.pointer.x;
                    var dy = event.clientY - fallbackOrbit.pointer.y;
                    fallbackOrbit.pointer.x = event.clientX;
                    fallbackOrbit.pointer.y = event.clientY;
                    fallbackOrbit.theta -= dx * 0.006;
                    fallbackOrbit.phi = clamp(fallbackOrbit.phi - dy * 0.006, 0.2, PI - 0.2);
                    applyFallbackOrbit();
                });
                function endPointer() {
                    fallbackOrbit.dragging = false;
                    fallbackOrbit.pointer = null;
                }
                listen(canvas, 'pointerup', endPointer);
                listen(canvas, 'pointercancel', endPointer);
                listen(canvas, 'wheel', function (event) {
                    event.preventDefault();
                    fallbackOrbit.radius = clamp(fallbackOrbit.radius * Math.exp(event.deltaY * 0.001), 4.2, 22);
                    userMoved = true;
                    applyFallbackOrbit();
                }, { passive: false });
            }

            if (window.ResizeObserver) {
                observer = new window.ResizeObserver(resize);
                observer.observe(container);
            } else {
                listen(window, 'resize', resize);
            }
            listen(renderer.domElement, 'webglcontextlost', function (event) {
                if (event.preventDefault) event.preventDefault();
                contextLost = true;
                lastFrame = 0;
                if (frameId) window.cancelAnimationFrame(frameId);
                frameId = 0;
                if (contextRecoveryTimer) window.clearTimeout(contextRecoveryTimer);
                contextRecoveryTimer = window.setTimeout(function () {
                    if (contextLost) fail('WebGL 渲染上下文未能恢复，三维场景无法继续显示。');
                }, 5000);
            }, false);
            listen(renderer.domElement, 'webglcontextrestored', function () {
                if (!contextLost || disposed || failed) return;
                contextLost = false;
                if (contextRecoveryTimer) window.clearTimeout(contextRecoveryTimer);
                contextRecoveryTimer = 0;
                lastFrame = 0;
                try {
                    resize();
                    syncVisibility();
                    renderer.render(scene, camera);
                    updateLabels();
                    frameId = window.requestAnimationFrame(animate);
                } catch (error) {
                    fail('WebGL 场景恢复失败：' + errorText(error));
                }
            }, false);
            resize();
            setModel(state.model || 'double');
            if (failed) return api;
            if (state.theme && state.theme !== theme) setTheme(state.theme);
            frameId = window.requestAnimationFrame(animate);
            callback(options.onReady, api);
        } catch (error) {
            failSetup('WebGL 场景启动失败：' + errorText(error));
        }

        return api;

    }

    window.PendulumScene = { create: create };
})(typeof window !== 'undefined' ? window : null);
