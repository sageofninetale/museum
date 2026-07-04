import * as THREE from 'three';

// The central column of god-light the helix ascends around.
// Layered translucent cylinders with flowing noise streaks + a bright crown.
export function createLightColumn({ height = 230, baseY = -14 } = {}) {
  const group = new THREE.Group();

  const makeShell = (radius, opacity, speed, freq) => {
    const geometry = new THREE.CylinderGeometry(radius * 0.72, radius, height, 40, 1, true);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: opacity },
        uSpeed: { value: speed },
        uFreq: { value: freq },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uOpacity;
        uniform float uSpeed;
        uniform float uFreq;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }

        void main() {
          // vertical fade: soft at base, brightening toward the crown
          float base = smoothstep(0.0, 0.14, vUv.y);
          float crown = 0.35 + 0.65 * pow(vUv.y, 1.6);

          // long rising wisps of light
          vec2 p = vec2(vUv.x * uFreq, vUv.y * 2.4 - uTime * uSpeed);
          float streak = noise(p) * 0.65 + noise(p * 2.1 + 7.0) * 0.35;
          streak = pow(streak, 2.4) * 1.8;

          float a = base * crown * (0.25 + streak) * uOpacity;
          // HDR-bright warm gold so the bloom pass halos the column
          vec3 col = mix(vec3(1.0, 0.7, 0.36), vec3(1.0, 0.88, 0.62), vUv.y);
          col *= 1.6 + streak * 2.2;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = baseY + height / 2;
    return mesh;
  };

  const core = makeShell(1.1, 0.5, 0.5, 3.5);
  const mid = makeShell(3.0, 0.08, 0.32, 2.5);
  const outer = makeShell(5.6, 0.03, 0.2, 2.0);
  group.add(core, mid, outer);

  // crown: a small intense sun at the summit — bloom turns it into the source
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff3dc })
  );
  crown.position.y = baseY + height;
  group.add(crown);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(5.5, 24, 24),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vNormalW;
        varying vec3 vPosW;
        void main() {
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormalW;
        varying vec3 vPosW;
        void main() {
          vec3 toCam = normalize(cameraPosition - vPosW);
          float rim = pow(max(dot(vNormalW, toCam), 0.0), 2.4);
          gl_FragColor = vec4(vec3(1.0, 0.85, 0.6), rim * 0.55);
        }
      `,
    })
  );
  halo.position.copy(crown.position);
  group.add(halo);

  const materials = [core.material, mid.material, outer.material];
  group.userData.update = (t) => {
    for (const m of materials) m.uniforms.uTime.value = t;
  };

  return group;
}
