import * as THREE from 'three';

export const FOG_COLOR = new THREE.Color(0x16233d);

// Vast gradient sky dome: deep indigo below, teal haze at the horizon,
// a warm zenith glow around the axis of the god-light column, faint stars.
export function createSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform float uTime;

      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }

      void main() {
        float h = vDir.y;

        // authored in sRGB, converted to linear at the end
        vec3 deep    = vec3(0.024, 0.038, 0.075);  // near-black indigo below
        vec3 horizon = vec3(0.086, 0.137, 0.239);  // matches the fog haze
        vec3 upper   = vec3(0.050, 0.088, 0.180);

        vec3 col = mix(deep, horizon, smoothstep(-0.55, 0.02, h));
        col = mix(col, upper, smoothstep(0.06, 0.6, h));

        // warm glow gathered around the zenith — the source of the god-light
        float zenith = pow(max(h, 0.0), 3.2);
        col += vec3(1.0, 0.78, 0.48) * zenith * 0.5;

        // faint teal halo band just above the horizon
        float band = exp(-pow((h - 0.03) * 9.0, 2.0));
        col += vec3(0.10, 0.17, 0.24) * band * 0.4;

        // sparse still stars in the upper sky
        vec3 sp = floor(vDir * 220.0);
        float star = step(0.9985, hash(sp)) * smoothstep(0.12, 0.5, h);
        float twinkle = 0.6 + 0.4 * sin(uTime * 0.7 + hash(sp + 1.7) * 40.0);
        col += vec3(0.9, 0.92, 1.0) * star * twinkle * 0.4;

        gl_FragColor = vec4(pow(max(col, 0.0), vec3(2.2)), 1.0);
      }
    `,
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(850, 48, 32), material);
  sky.frustumCulled = false;
  return sky;
}

// Slowly rising dust motes filling the void — soft round sprites, additive.
export function createDust({ radius = 68, height = 210, count = 1400 } = {}) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(Math.random()) * radius;
    const a = Math.random() * Math.PI * 2;
    positions[i * 3 + 0] = Math.cos(a) * r;
    positions[i * 3 + 1] = Math.random() * height - 8;
    positions[i * 3 + 2] = Math.sin(a) * r;
    seeds[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uHeight: { value: height },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uHeight;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        // drift upward and sway, wrapping vertically
        p.y = mod(p.y + uTime * (0.35 + aSeed * 0.5), uHeight) - 8.0;
        p.x += sin(uTime * 0.11 + aSeed * 40.0) * 1.6;
        p.z += cos(uTime * 0.09 + aSeed * 34.0) * 1.6;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        float size = (34.0 + aSeed * 34.0) / dist;
        gl_PointSize = size;
        // hide sub-pixel motes: they alias into hard squares
        vAlpha = smoothstep(2.0, 14.0, dist) * smoothstep(1.2, 3.5, size) * (0.25 + 0.75 * aSeed);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float disc = smoothstep(0.5, 0.08, d);
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.62), disc * vAlpha * 0.38);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

// Dark silhouette islands far out in the haze, purely for depth layering.
export function createDistantIsles({ count = 14 } = {}) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0x18253f });
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.7;
    const r = 165 + Math.random() * 70;
    const geo = new THREE.ConeGeometry(1, 2.2, 6);
    const m = new THREE.Mesh(geo, material);
    const s = 5 + Math.random() * 9;
    m.scale.set(s, s * (0.8 + Math.random() * 0.7), s);
    m.rotation.x = Math.PI; // point-down teardrop silhouette
    m.rotation.y = Math.random() * Math.PI;
    m.position.set(Math.cos(a) * r, 4 + Math.random() * 70, Math.sin(a) * r);
    group.add(m);
  }
  return group;
}
