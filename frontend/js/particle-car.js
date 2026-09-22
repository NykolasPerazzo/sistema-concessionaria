/**
 * Car Dealer IA â€” hatch procedural. Three.js r170 + seu prÃ³prio OrbitControls.
 * Execute por HTTP(S), nÃ£o file://. Nenhuma textura, imagem, API ou modelo 3D.
 * IntegraÃ§Ã£o: CSS + importmap do HTML + este mÃ³dulo + a seÃ§Ã£o, uma vez por pÃ¡gina.
 * SPA: dispare new Event('cdia-particle-destroy') na seÃ§Ã£o ANTES de removÃª-la.
 * Para reinserir, importe { mountParticleCar } e passe a nova seÃ§Ã£o.
 */
const CONFIG = Object.freeze({
  color: "#27f5bd", // Cor do carro; ajuste a variÃ¡vel CSS para a interface.
  desktopDensity: 1, // Quantidade de pontos; 1 = cerca de 7,7 mil.
  mobileDensity: 0.64, // Menos pontos e conexÃµes em telas pequenas.
  lineOpacity: 0.25, // Intensidade das conexÃµes (0 a 1).
  contourOpacity: 0.64, // Contornos: portas, vidros, farÃ³is e rodas.
  pointSize: 2.1, // Tamanho base em pixels CSS.
  maxPixelRatio: 1.7, // Evita renderizar milhÃµes de pixels desnecessÃ¡rios.
  rotationSpeed: 0.32, // Velocidade do OrbitControls, revoluÃ§Ãµes lentas.
  movement: 0.003, // VibraÃ§Ã£o em unidades da cena: preserve a silhueta.
});

const mounted = new WeakMap();
let libraries;
function loadLibraries() {
  if (!libraries) {
    libraries = Promise.all([
      import("three"),
      import("three/addons/controls/OrbitControls.js"),
    ]).catch((error) => {
      libraries = null;
      throw error;
    });
  }
  return libraries;
}

async function mountParticleCar(root) {
  if (!root || mounted.has(root)) return;
  const life = new AbortController();
  const select = (suffix) => root.querySelector(`#cdia-particle-${suffix}`);
  const stage = select("stage");
  const viewport = select("viewport");
  const message = select("message");
  if (!stage || !viewport || !message) return;
  let dispose = () => life.abort();
  mounted.set(root, () => dispose());
  const on = (target, event, handler, options = {}) =>
    target.addEventListener(event, handler, {
      ...options,
      signal: life.signal,
    });
  on(root, "cdia-particle-destroy", () => {
    dispose();
    mounted.delete(root);
  });
  const say = (text, error = false) => {
    message.textContent = text;
    message.hidden = !text;
    if (error) {
      stage.setAttribute("aria-busy", "false");
      select("state").textContent = "3D INDISPONÃVEL";
      root.querySelectorAll("button").forEach((button) => {
        button.disabled = true;
      });
    }
  };
  const loadingTimeout = setTimeout(() => {
    if (!life.signal.aborted)
      say(
        "O carregamento estÃ¡ demorando. Confira sua conexÃ£o e a permissÃ£o do CDN na polÃ­tica de seguranÃ§a do site.",
      );
  }, 15000);
  life.signal.addEventListener("abort", () => clearTimeout(loadingTimeout), {
    once: true,
  });

  try {
    const [THREE, { OrbitControls }] = await loadLibraries();
    clearTimeout(loadingTimeout);
    if (life.signal.aborted) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = media.matches;
    let playing = !reduced;
    let lost = false;
    let visible = true;
    let dead = false;
    let frame = 0;
    let previousTime = 0;
    let elapsed = 0;
    let frames = 0;
    let slowTime = 0;
    let downgraded = false;
    let resizeFrame = 0;
    let userMoving = false;
    let autoAfter = 0;
    let profileKey = "";
    let car = null;
    let reflection = null;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 80);
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setClearColor(0x050b0d, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    // Libera o contexto mesmo se a inicializaÃ§Ã£o falhar antes de criar a cena toda.
    dispose = () => {
      life.abort();
      renderer.dispose();
      canvas.remove();
    };
    let shaderFailed = false;
    renderer.debug.onShaderError = () => {
      shaderFailed = true;
    };
    canvas.className = "cdia-particle-canvas";
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      "Hatch compacto genÃ©rico em 3D, formado por pontos e linhas verdes. VisualizaÃ§Ã£o interativa.",
    );
    canvas.setAttribute(
      "aria-describedby",
      "cdia-particle-help cdia-particle-keyboard",
    );
    viewport.append(canvas);
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0.72, 0);
    controls.enablePan = false;
    controls.enableDamping = !reduced;
    controls.dampingFactor = 0.075;
    controls.autoRotateSpeed = CONFIG.rotationSpeed;
    controls.minPolarAngle = Math.PI * 0.17;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.7;

    const uniforms = {
      uColor: { value: new THREE.Color(CONFIG.color) },
      uTime: { value: 0 },
      uMotion: { value: reduced ? 0 : CONFIG.movement },
      uMouse: { value: new THREE.Vector2(10, 10) },
      uAspect: { value: 1 },
      uPixelRatio: { value: 1 },
      uPointSize: { value: CONFIG.pointSize },
    };
    // Pontos e linhas usam a MESMA deformaÃ§Ã£o: as conexÃµes ficam presas aos pontos.
    const vertexShader = `
      attribute float aStrength;
      uniform float uTime, uMotion, uPixelRatio, uPointSize, uAspect;
      uniform vec2 uMouse;
      varying float vStrength, vHover, vHeight;
      void main() {
        vec3 p = position;
        p.y += sin(p.x * 8.0 + p.z * 5.0 + uTime * 1.3) * uMotion;
        p.z += sin(p.x * 6.0 + p.y * 7.0 - uTime) * uMotion * 0.5;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        vec2 projected = gl_Position.xy / gl_Position.w;
        vec2 delta = (projected - uMouse) * vec2(uAspect, 1.0);
        vHover = exp(-dot(delta, delta) * 32.0);
        vStrength = aStrength;
        vHeight = position.y;
        gl_PointSize = clamp(uPointSize * uPixelRatio * (7.0 / max(2.0, -view.z))
          * (1.0 + vHover * 0.55), 1.0, 7.0 * uPixelRatio);
      }
    `;
    function material(kind, opacity, reflected = false) {
      return new THREE.ShaderMaterial({
        uniforms: { ...uniforms, uOpacity: { value: opacity } },
        vertexShader,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uOpacity;
          varying float vStrength, vHover, vHeight;
          void main() {
            float shape = 1.0;
            ${
              kind === "points"
                ? `
              float r = length(gl_PointCoord - 0.5) * 2.0;
              if (r > 1.0) discard;
              shape = exp(-r * r * 3.2) * (1.0 - smoothstep(0.7, 1.0, r));
            `
                : ""
            }
            float fade = ${reflected ? "pow(max(0.0, 1.0 - vHeight / 1.6), 3.0)" : "1.0"};
            float alpha = min(0.95, shape * vStrength * uOpacity * (1.0 + vHover * 1.3) * fade);
            gl_FragColor = vec4(mix(uColor, vec3(0.75, 1.0, 0.93), vHover * 0.22), alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    }
    const pointMaterial = material("points", 0.84);
    const lineMaterial = material("lines", CONFIG.lineOpacity);
    const contourMaterial = material("lines", CONFIG.contourOpacity);
    const reflectionMaterial = material("lines", 0.1, true);
    // SuperfÃ­cie invisÃ­vel de profundidade: oculta o lado oposto, sem pintar o carro.
    // Isso evita enxergar quatro rodas sobrepostas em uma vista lateral.
    const depthMaterial = material("lines", 0);
    depthMaterial.transparent = false;
    depthMaterial.colorWrite = false;
    depthMaterial.depthWrite = true;
    depthMaterial.side = THREE.DoubleSide;
    depthMaterial.polygonOffset = true;
    depthMaterial.polygonOffsetFactor = 1;
    depthMaterial.polygonOffsetUnits = 1;

    // As conexÃµes sÃ£o vizinhos na superfÃ­cie, calculados uma Ãºnica vez: sem NÂ² por frame.
    function makeCar(density) {
      const positions = [],
        strengths = [],
        edges = [],
        contours = [],
        faces = [];
      const step = 0.073 / density;
      const lerp = THREE.MathUtils.lerp;
      const profile = [
        [-2.06, 0.76, 0.62],
        [-1.96, 0.89, 0.7],
        [-1.62, 0.95, 0.75],
        [-1.04, 1.0, 0.76],
        [-0.48, 1.43, 0.64],
        [-0.15, 1.49, 0.62],
        [0.75, 1.49, 0.63],
        [1.1, 1.43, 0.65],
        [1.72, 1.08, 0.73],
        [1.98, 0.99, 0.72],
        [2.05, 0.84, 0.63],
      ];
      function sample(x, column) {
        for (let i = 1; i < profile.length; i++) {
          if (x <= profile[i][0]) {
            const a = profile[i - 1],
              b = profile[i];
            const t = THREE.MathUtils.clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
            // InterpolaÃ§Ã£o linear mantÃ©m a inclinaÃ§Ã£o nÃ­tida dos para-brisas.
            return lerp(a[column], b[column], t);
          }
        }
        return profile.at(-1)[column];
      }
      const belt = (x) => 0.95 + 0.045 * Math.cos(x * 0.65);
      const width = (x) => 0.805 - 0.16 * Math.pow(Math.abs(x) / 2.07, 6);
      const bodyZ = (x, y) =>
        width(x) + 0.022 * Math.sin(((y - 0.3) / 0.7) * Math.PI);
      const edgeY = (x) => sample(x, 1) - 0.035;
      function sideZ(x, y) {
        if (y <= belt(x)) return bodyZ(x, y);
        const t = THREE.MathUtils.clamp(
          (y - belt(x)) / Math.max(0.01, edgeY(x) - belt(x)),
          0,
          1,
        );
        return lerp(width(x), sample(x, 2), t);
      }
      function point(p, strength = 1) {
        const id = positions.length / 3;
        positions.push(...p);
        strengths.push(strength);
        return id;
      }
      function connect(a, b, target = edges) {
        if (a < 0 || b < 0) return;
        const i = a * 3,
          j = b * 3;
        const d = Math.hypot(
          positions[i] - positions[j],
          positions[i + 1] - positions[j + 1],
          positions[i + 2] - positions[j + 2],
        );
        if (d > 0.00001 && d <= step * 2.6) target.push(a, b);
      }
      function grid(nu, nv, surface, strength = 0.75) {
        const ids = [];
        for (let i = 0; i <= nu; i++) {
          for (let j = 0; j <= nv; j++) {
            const p = surface(i / nu, j / nv);
            const id = p ? point(p, strength) : -1;
            ids.push(id);
            if (i) connect(id, ids[(i - 1) * (nv + 1) + j]);
            if (j) connect(id, ids[i * (nv + 1) + j - 1]);
            if (i && j) {
              const a = ids[(i - 1) * (nv + 1) + j - 1];
              const b = ids[(i - 1) * (nv + 1) + j];
              const c = ids[i * (nv + 1) + j - 1];
              if ([a, b, c, id].every((value) => value >= 0))
                faces.push(a, b, id, a, id, c);
            }
          }
        }
      }
      function path(coords, closed = false, strength = 1.1) {
        let previous = -1;
        const list = closed ? [...coords, coords[0]] : coords;
        for (let i = 1; i < list.length; i++) {
          const a = list[i - 1],
            b = list[i];
          const n = Math.max(
            1,
            Math.ceil(Math.hypot(...a.map((v, k) => v - b[k])) / (step * 0.68)),
          );
          for (let j = i === 1 ? 0 : 1; j <= n; j++) {
            const id = point(
              a.map((v, k) => lerp(v, b[k], j / n)),
              strength,
            );
            connect(previous, id, contours);
            previous = id;
          }
        }
      }
      const nx = Math.ceil(4.1 / step);
      // CapÃ´, para-brisa, teto arqueado e tampa traseira, em uma superfÃ­cie contÃ­nua.
      grid(
        nx,
        Math.ceil(1.55 / step),
        (u, v) => {
          const x = lerp(-2.06, 2.05, u),
            z = v * 2 - 1;
          return [x, sample(x, 1) - 0.035 * z * z, sample(x, 2) * z];
        },
        0.7,
      );
      for (const s of [-1, 1]) {
        // Recortes reais dos quatro para-lamas: nunca ligar pontos atravessando a roda.
        grid(nx, Math.ceil(0.71 / step), (u, v) => {
          const x = lerp(-2.04, 2.04, u),
            y = lerp(0.3, Math.min(belt(x), edgeY(x)), v);
          if ([-1.28, 1.27].some((cx) => Math.hypot(x - cx, y - 0.36) < 0.404))
            return null;
          return [x, y, s * bodyZ(x, y)];
        });
        // Laterais envidraÃ§adas: malha menos intensa para separar cabine e carroceria.
        grid(
          Math.ceil(2.9 / step),
          Math.ceil(0.5 / step),
          (u, v) => {
            const x = lerp(-1.04, 1.84, u);
            const y = lerp(belt(x), Math.max(belt(x), edgeY(x)), v);
            return [x, y, s * sideZ(x, y)];
          },
          0.38,
        );
        const sidePath = (xy, closed = false, strength = 1.2) => {
          // Projeta cada amostra na lateral curva, para a porta nÃ£o afundar na malha.
          const list = closed ? [...xy, xy[0]] : xy;
          const sampled = [];
          for (let i = 1; i < list.length; i++) {
            const [ax, ay] = list[i - 1],
              [bx, by] = list[i];
            const count = Math.max(
              1,
              Math.ceil(Math.hypot(bx - ax, by - ay) / (step * 0.65)),
            );
            for (let j = i === 1 ? 0 : 1; j <= count; j++) {
              const x = lerp(ax, bx, j / count),
                y = lerp(ay, by, j / count);
              sampled.push([x, y, s * (sideZ(x, y) + 0.009)]);
            }
          }
          path(sampled, false, strength);
        };
        // Duas portas por lado; vidros independentes e coluna B bem definida.
        sidePath(
          [
            [-0.96, 1.035],
            [-0.44, 1.395],
            [-0.15, 1.447],
            [0.18, 1.447],
            [0.18, 1.035],
          ],
          true,
        );
        sidePath(
          [
            [0.29, 1.035],
            [0.29, 1.447],
            [0.74, 1.447],
            [1.065, 1.39],
            [1.64, 1.065],
            [1.59, 1.035],
          ],
          true,
        );
        sidePath(
          [
            [-0.98, 0.96],
            [-1.0, 0.76],
            [-0.85, 0.37],
            [0.2, 0.37],
            [0.23, 0.96],
          ],
          false,
          0.95,
        );
        sidePath(
          [
            [0.29, 0.96],
            [0.29, 0.37],
            [0.8, 0.37],
            [0.88, 0.66],
            [1.53, 0.94],
          ],
          false,
          0.95,
        );
        sidePath(
          [
            [-0.03, 0.9],
            [0.13, 0.9],
          ],
          false,
          1.7,
        );
        sidePath(
          [
            [1.04, 0.9],
            [1.2, 0.9],
          ],
          false,
          1.7,
        );
        sidePath(
          [
            [-1.91, 0.867],
            [-1.03, 0.979],
            [0.2, 1.01],
            [1.71, 1.01],
          ],
          false,
          0.95,
        );
        sidePath(
          [
            [-0.83, 0.33],
            [0.78, 0.33],
          ],
          false,
          1.15,
        );
        for (const cx of [-1.28, 1.27]) {
          const arch = [];
          for (let i = 0; i <= 36; i++) {
            const t = lerp(-0.12, Math.PI + 0.12, i / 36);
            const x = cx + 0.412 * Math.cos(t),
              y = 0.36 + 0.412 * Math.sin(t);
            arch.push([x, y, s * (bodyZ(x, y) + 0.008)]);
          }
          path(arch, false, 1.0);
          // Pneus toroidais: cÃ­rculos 3D, nÃ£o discos planos.
          grid(
            Math.ceil(54 * density),
            Math.max(6, Math.ceil(9 * density)),
            (u, v) => {
              const a = u * Math.PI * 2,
                b = v * Math.PI * 2;
              const r = 0.285 + 0.065 * Math.cos(b);
              return [
                cx + r * Math.cos(a),
                0.36 + r * Math.sin(a),
                s * (0.8 + 0.083 * Math.sin(b)),
              ];
            },
            0.9,
          );
          const rimZ = s * 0.89;
          for (const radius of [0.254, 0.222, 0.083]) {
            path(
              Array.from({ length: 65 }, (_, i) => {
                const a = (i / 64) * Math.PI * 2;
                return [
                  cx + radius * Math.cos(a),
                  0.36 + radius * Math.sin(a),
                  rimZ,
                ];
              }),
              false,
              1.15,
            );
          }
          for (let i = 0; i < 10; i++) {
            const a = (i * Math.PI) / 5;
            path(
              [
                [cx + 0.083 * Math.cos(a), 0.36 + 0.083 * Math.sin(a), rimZ],
                [
                  cx + 0.21 * Math.cos(a + 0.12),
                  0.36 + 0.21 * Math.sin(a + 0.12),
                  rimZ,
                ],
              ],
              false,
              1.15,
            );
          }
        }
        // Retrovisores com volume, conectados Ã  coluna A.
        path(
          [
            [-0.83, 1.045, s * 0.77],
            [-0.9, 1.06, s * 0.93],
            [-0.74, 1.12, s * 0.98],
            [-0.6, 1.09, s * 0.97],
            [-0.62, 1.0, s * 0.93],
            [-0.86, 1.0, s * 0.91],
          ],
          true,
        );
        path([
          [-0.83, 1.045, s * 0.77],
          [-0.74, 1.12, s * 0.98],
        ]);
        // FarÃ³is e lanternas nas extremidades, sem logotipos.
        path(
          [
            [-2.04, 0.8, s * 0.38],
            [-1.99, 0.865, s * 0.65],
            [-1.74, 0.93, s * 0.74],
            [-1.8, 0.83, s * 0.78],
            [-2.04, 0.8, s * 0.38],
          ],
          false,
          1.65,
        );
        path(
          [
            [2.035, 0.8, s * 0.44],
            [1.99, 0.93, s * 0.68],
            [1.77, 1.04, s * 0.75],
            [1.82, 0.89, s * 0.79],
          ],
          false,
          1.5,
        );
      }
      // Para-choques frontal e traseiro.
      for (const end of [-1, 1]) {
        grid(
          Math.ceil(1.25 / step),
          Math.ceil(0.4 / step),
          (u, v) => {
            const z = lerp(-0.64, 0.64, u);
            return [
              end * (2.035 - 0.025 * (z / 0.64) ** 2),
              lerp(0.35, 0.77, v),
              z,
            ];
          },
          0.6,
        );
        path(
          [
            [end * 2.064, 0.39, -0.58],
            [end * 2.072, 0.37, 0],
            [end * 2.064, 0.39, 0.58],
          ],
          false,
          1.15,
        );
      }
      path(
        [
          [-2.065, 0.65, -0.38],
          [-2.072, 0.66, 0.38],
          [-2.072, 0.47, 0.31],
          [-2.072, 0.46, -0.31],
        ],
        true,
        1.4,
      );
      // Bordas transversais dos para-brisas e contorno do teto.
      for (const x of [-1.04, -0.48, 1.1, 1.72]) {
        path(
          Array.from({ length: 25 }, (_, i) => {
            const z = i / 12 - 1;
            return [x, sample(x, 1) - 0.035 * z * z + 0.004, sample(x, 2) * z];
          }),
          false,
          1.05,
        );
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        "aStrength",
        new THREE.Float32BufferAttribute(strengths, 1),
      );
      geometry.computeBoundingSphere();
      const lineGeometry = geometry.clone();
      lineGeometry.setIndex(edges);
      const contourGeometry = geometry.clone();
      contourGeometry.setIndex(contours);
      const depthGeometry = geometry.clone();
      depthGeometry.setIndex(faces);
      const depthMesh = new THREE.Mesh(depthGeometry, depthMaterial);
      depthMesh.renderOrder = -10;
      const group = new THREE.Group();
      group.add(
        new THREE.Points(geometry, pointMaterial),
        new THREE.LineSegments(lineGeometry, lineMaterial),
        new THREE.LineSegments(contourGeometry, contourMaterial),
        depthMesh,
      );
      return {
        group,
        lineGeometry,
        pointCount: strengths.length,
        linkCount: (edges.length + contours.length) / 2,
      };
    }

    // ChÃ£o em GLSL: disco elÃ­ptico e linhas de referÃªncia, sem textura.
    const groundMaterial = new THREE.ShaderMaterial({
      uniforms: { uColor: uniforms.uColor },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 uColor; varying vec2 vUv;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          float glow = exp(-r*r*4.0) * 0.065;
          float ring = (1.0 - smoothstep(0.003, 0.008, abs(r - 0.77))) * 0.20;
          float ring2 = (1.0 - smoothstep(0.001, 0.004, abs(r - 0.81))) * 0.06;
          float grid = max(1.0-smoothstep(0.008,0.016,abs(sin(p.x*34.0))),
                           1.0-smoothstep(0.008,0.016,abs(sin(p.y*20.0))));
          float alpha = (glow + ring + ring2 + grid * 0.045 * exp(-r*r*3.0)) * (1.0-smoothstep(0.88,1.0,r));
          gl_FragColor = vec4(uColor, alpha);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(6.5, 4.4),
      groundMaterial,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.014;
    scene.add(ground);

    const releaseCar = () => {
      if (reflection) {
        scene.remove(reflection);
        reflection = null;
      }
      if (car) {
        scene.remove(car);
        car.children.forEach((child) => child.geometry.dispose());
        car = null;
      }
    };
    const active = () => !dead && !lost && visible && !document.hidden;
    function requestRender() {
      if (active() && !frame) frame = requestAnimationFrame(render);
    }
    function syncMotion() {
      controls.autoRotate =
        playing && !reduced && !userMoving && performance.now() >= autoAfter;
      uniforms.uMotion.value = reduced ? 0 : CONFIG.movement;
      select("motion").textContent = playing
        ? "Pausar animaÃ§Ã£o"
        : "Retomar animaÃ§Ã£o";
      select("motion").setAttribute("aria-pressed", String(playing));
      select("motion").disabled = reduced || lost;
      select("motion").title = reduced
        ? "AnimaÃ§Ã£o desativada pela preferÃªncia de movimento reduzido do dispositivo."
        : "";
      select("state").textContent = reduced
        ? "MOVIMENTO REDUZIDO"
        : playing
          ? "HOLOGRAMA ATIVO"
          : "ANIMAÃ‡ÃƒO PAUSADA";
      requestRender();
    }
    function preset(view = "three-quarter") {
      const distance = camera.userData.fitDistance || 8;
      const directions = {
        "three-quarter": [-1.05, 0.43, 1.55],
        side: [0, 0.2, 1],
        front: [-1, 0.2, 0.001],
      };
      const direction = new THREE.Vector3(...directions[view]).normalize();
      // Limpa inÃ©rcia pendente antes de aplicar a posiÃ§Ã£o exata.
      controls.autoRotate = false;
      const damping = controls.enableDamping;
      controls.enableDamping = false;
      controls.update();
      controls.enableDamping = damping;
      controls.target.set(0, 0.72, 0);
      camera.position
        .copy(controls.target)
        .addScaledVector(direction, distance);
      controls.update();
      autoAfter = performance.now() + 3500;
      select("angle").textContent = {
        "three-quarter": "3/4",
        side: "LATERAL",
        front: "FRENTE",
      }[view];
      root.querySelectorAll("[data-cdia-particle-view]").forEach((button) => {
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.cdiaParticleView === view),
        );
      });
      requestRender();
    }
    function resize() {
      if (dead || lost) return;
      const { width, height } = viewport.getBoundingClientRect();
      if (!width || !height) return;
      const dpr = window.devicePixelRatio || 1;
      const small = width < 680;
      const constrained =
        navigator.connection?.saveData ||
        (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
      const density =
        (small || constrained ? CONFIG.mobileDensity : CONFIG.desktopDensity) *
        (dpr > 2 ? 0.9 : 1);
      const key = `${small}:${constrained}:${dpr > 2}`;
      if (key !== profileKey) {
        profileKey = key;
        releaseCar();
        const model = makeCar(density);
        car = model.group;
        scene.add(car);
        if (!small && !constrained) {
          reflection = new THREE.LineSegments(
            model.lineGeometry,
            reflectionMaterial,
          );
          reflection.scale.y = -0.4;
          reflection.position.y = -0.035;
          scene.add(reflection);
        }
        select("count").textContent = model.pointCount.toLocaleString("pt-BR");
        select("links").textContent = model.linkCount.toLocaleString("pt-BR");
      }
      const pixelRatio = Math.min(
        dpr,
        downgraded ? 1 : small ? 1.35 : CONFIG.maxPixelRatio,
      );
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      uniforms.uPixelRatio.value = pixelRatio;
      uniforms.uAspect.value = width / height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      // Enquadra largura e altura separadamente: carro maior no desktop, inteiro no mobile.
      const verticalTangent = Math.tan(
        THREE.MathUtils.degToRad(camera.fov / 2),
      );
      const fit = Math.max(
        1.6 / verticalTangent,
        2.65 / (verticalTangent * camera.aspect),
      );
      const oldFit = camera.userData.fitDistance;
      camera.userData.fitDistance = fit;
      controls.minDistance = Math.max(3.6, fit * 0.48);
      controls.maxDistance = fit * 1.7;
      if (!oldFit) preset();
      else {
        const offset = camera.position.clone().sub(controls.target);
        camera.position
          .copy(controls.target)
          .add(offset.multiplyScalar(fit / oldFit));
        controls.update();
      }
      requestRender();
    }
    function render(now) {
      frame = 0;
      if (!active()) {
        previousTime = 0;
        return;
      }
      const dt = previousTime
        ? Math.min((now - previousTime) / 1000, 0.1)
        : 1 / 60;
      previousTime = now;
      if (playing && !reduced) elapsed += dt;
      uniforms.uTime.value = elapsed;
      controls.autoRotate =
        playing && !reduced && !userMoving && now >= autoAfter;
      if (controls.autoRotate && select("angle").textContent !== "LIVRE")
        freeView();
      controls.update(dt);
      renderer.render(scene, camera);
      // ReduÃ§Ã£o automÃ¡tica de resoluÃ§Ã£o se os primeiros frames forem consistentemente lentos.
      if (playing && !downgraded && frames < 150) {
        frames++;
        slowTime += dt;
        if (frames === 150 && slowTime / frames > 0.036) {
          downgraded = true;
          resize();
        }
      }
      if (playing && !reduced) requestRender();
    }
    function suspend() {
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
    }
    function freeView() {
      root
        .querySelectorAll("[data-cdia-particle-view]")
        .forEach((button) => button.setAttribute("aria-pressed", "false"));
      select("angle").textContent = "LIVRE";
    }
    controls.addEventListener("change", requestRender);
    controls.addEventListener("start", () => {
      userMoving = true;
      uniforms.uMouse.value.set(10, 10);
      freeView();
      requestRender();
    });
    controls.addEventListener("end", () => {
      userMoving = false;
      autoAfter = performance.now() + 2500;
      requestRender();
    });
    on(canvas, "pointermove", (event) => {
      if (event.pointerType !== "mouse" || userMoving || reduced) return;
      const rect = canvas.getBoundingClientRect();
      uniforms.uMouse.value.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      requestRender();
    });
    on(canvas, "pointerleave", () => {
      uniforms.uMouse.value.set(10, 10);
      requestRender();
    });
    on(select("motion"), "click", () => {
      playing = !playing;
      syncMotion();
    });
    on(select("reset"), "click", () => preset());
    root.querySelectorAll("[data-cdia-particle-view]").forEach((button) => {
      on(button, "click", () => preset(button.dataset.cdiaParticleView));
    });
    on(canvas, "keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const keys = [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "+",
        "=",
        "-",
        "r",
        "R",
        " ",
      ];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      if (event.key.toLowerCase() === "r") return preset();
      if (event.key === " ") {
        if (!reduced) {
          playing = !playing;
          syncMotion();
        }
        return;
      }
      controls.autoRotate = false;
      const damping = controls.enableDamping;
      controls.enableDamping = false;
      controls.update();
      const spherical = new THREE.Spherical().setFromVector3(
        camera.position.clone().sub(controls.target),
      );
      if (event.key === "ArrowLeft") spherical.theta -= 0.12;
      if (event.key === "ArrowRight") spherical.theta += 0.12;
      if (event.key === "ArrowUp") spherical.phi -= 0.09;
      if (event.key === "ArrowDown") spherical.phi += 0.09;
      if (event.key === "+" || event.key === "=") spherical.radius *= 0.9;
      if (event.key === "-") spherical.radius *= 1.1;
      spherical.phi = THREE.MathUtils.clamp(
        spherical.phi,
        controls.minPolarAngle,
        controls.maxPolarAngle,
      );
      spherical.radius = THREE.MathUtils.clamp(
        spherical.radius,
        controls.minDistance,
        controls.maxDistance,
      );
      camera.position
        .copy(controls.target)
        .add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update();
      controls.enableDamping = damping;
      autoAfter = performance.now() + 3000;
      freeView();
      requestRender();
    });
    on(media, "change", (event) => {
      reduced = event.matches;
      playing = !reduced;
      controls.enableDamping = !reduced;
      uniforms.uMouse.value.set(10, 10);
      syncMotion();
    });
    on(document, "visibilitychange", () => {
      if (document.hidden) suspend();
      else requestRender();
    });
    on(canvas, "webglcontextlost", (event) => {
      event.preventDefault();
      lost = true;
      suspend();
      stage.setAttribute("aria-busy", "true");
      say(
        "A visualizaÃ§Ã£o 3D foi interrompida. Aguardando a recuperaÃ§Ã£o grÃ¡ficaâ€¦",
      );
      select("state").textContent = "RECUPERANDO 3D";
      root.querySelectorAll("button").forEach((button) => {
        button.disabled = true;
      });
    });
    on(canvas, "webglcontextrestored", () => {
      lost = false;
      previousTime = 0;
      stage.setAttribute("aria-busy", "false");
      root.querySelectorAll("button").forEach((button) => {
        button.disabled = false;
      });
      say("");
      resize();
      syncMotion();
    });
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(resize);
    });
    resizeObserver.observe(viewport);
    on(window, "resize", resize); // TambÃ©m cobre mudanÃ§a de DPR ao trocar de monitor.
    const intersection = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        if (visible) requestRender();
        else suspend();
      },
      { threshold: 0.01 },
    );
    intersection.observe(stage);
    on(window, "pagehide", (event) => {
      if (event.persisted) suspend();
      else dispose();
    });
    on(window, "pageshow", () => requestRender());
    dispose = () => {
      if (dead) return;
      dead = true;
      life.abort();
      suspend();
      cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      intersection.disconnect();
      controls.dispose();
      releaseCar();
      ground.geometry.dispose();
      groundMaterial.dispose();
      [
        pointMaterial,
        lineMaterial,
        contourMaterial,
        reflectionMaterial,
        depthMaterial,
      ].forEach((item) => item.dispose());
      renderer.dispose();
      canvas.remove();
      mounted.delete(root);
    };
    resize();
    // Compila antes de retirar a mensagem de carregamento.
    renderer.compile(scene, camera);
    renderer.render(scene, camera);
    if (shaderFailed)
      throw new Error("A GPU nÃ£o compilou o material do holograma.");
    stage.setAttribute("aria-busy", "false");
    root.querySelectorAll("button").forEach((button) => {
      button.disabled = false;
    });
    say("");
    syncMotion();
  } catch (error) {
    clearTimeout(loadingTimeout);
    if (life.signal.aborted) return;
    dispose();
    mounted.delete(root);
    say(
      "NÃ£o foi possÃ­vel iniciar o 3D. Use um navegador com WebGL 2 e confira se o CDN do Three.js estÃ¡ permitido. O restante do site continua disponÃ­vel.",
      true,
    );
    console.error("[Car Dealer IA / partÃ­culas]", error);
  }
}

function boot() {
  document.querySelectorAll(".cdia-particle-section").forEach(mountParticleCar);
}
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
