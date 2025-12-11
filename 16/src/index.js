const canvasSketch = require("canvas-sketch");

// Import ThreeJS and assign it to global scope
// This way examples/ folder can use it too
const THREE = require("three");
global.THREE = THREE;

// Import extra THREE plugins
require("three/examples/js/controls/OrbitControls");
require("three/examples/js/geometries/RoundedBoxGeometry.js");
require("three/examples/js/loaders/GLTFLoader.js");
require("three/examples/js/loaders/RGBELoader.js");
require("three/examples/js/postprocessing/EffectComposer.js");
require("three/examples/js/postprocessing/RenderPass.js");
require("three/examples/js/postprocessing/ShaderPass.js");
require("three/examples/js/postprocessing/UnrealBloomPass.js");
require("three/examples/js/shaders/LuminosityHighPassShader.js");
require("three/examples/js/shaders/CopyShader.js");

const Stats = require("stats-js");
const { GUI } = require("dat.gui");

const settings = {
  animate: true,
  context: "webgl",
  resizeCanvas: false,
};

const sketch = ({ context, canvas, width, height }) => {
  const stats = new Stats();
  document.body.appendChild(stats.dom);
  const gui = new GUI();

  const options = {
    enableSwoopingCamera: false,
    enableRotation: false,
    color: 0xffffff,
    metalness: 0,
    roughness: 0.2,
    transmission: 1,
    ior: 1.5,
    reflectivity: 0.5,
    thickness: 2.5,
    envMapIntensity: 1.5,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    normalScale: 0.3,
    clearcoatNormalScale: 0.2,
    normalRepeat: 3,
    // attenuationTint: 0xffffff,
    // attenuationDistance: 0,
    bloomThreshold: 0.85,
    bloomStrength: 0.35,
    bloomRadius: 0.33,
  };

  // Setup
  // -----

  const renderer = new THREE.WebGLRenderer({
    context,
    antialias: false,
  });
  renderer.setClearColor(0x1f1e1c, 1);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(0, 0, 5);

  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enabled = !options.enableSwoopingCamera;

  const scene = new THREE.Scene();

  const renderPass = new THREE.RenderPass(scene, camera);
  const bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(width, height),
    options.bloomStrength,
    options.bloomRadius,
    options.bloomThreshold
  );

  const composer = new THREE.EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);

  // Content
  // -------

  const textureLoader = new THREE.TextureLoader();

  // Animated 4-step gradient background
  const bgGeometry = new THREE.PlaneGeometry(5, 5);
  const bgMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color(0x060629) }, // Deep navy
      uColor2: { value: new THREE.Color(0x37d0ff) }, // ice blue
      uColor3: { value: new THREE.Color(0xff52df) }, // pink
      uColor4: { value: new THREE.Color(0xedf6fe) }, // off white
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uColor3;
      uniform vec3 uColor4;
      varying vec2 vUv;

      void main() {
        // Center point at top center
        vec2 center = vec2(0.5, 1.0);
        
        // Subtle wave distortion for movement
        float wave = sin(atan(vUv.y - center.y, vUv.x - center.x) * 3.0 + uTime * 0.5) * 0.05;
        float wave2 = sin(length(vUv - center) * 8.0 - uTime * 0.4) * 0.03;
        
        // Distance from center top with animation
        float dist = length(vUv - center) + wave + wave2;
        dist = clamp(dist, 0.0, 1.2) / 1.2; // Normalize to 0-1 range
        
        // 4-step radial gradient with smooth transitions
        vec3 color;
        float step1 = 0.25;
        float step2 = 0.5;
        float step3 = 0.75;
        float smoothness = 0.15;
        
        // Blend between the 4 colors (center to edge)
        float t1 = smoothstep(step1 - smoothness, step1 + smoothness, dist);
        float t2 = smoothstep(step2 - smoothness, step2 + smoothness, dist);
        float t3 = smoothstep(step3 - smoothness, step3 + smoothness, dist);
        
        color = mix(uColor4, uColor3, t1);
        color = mix(color, uColor2, t2);
        color = mix(color, uColor1, t3);
        
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
  bgMesh.position.set(0, 0, -1);
  scene.add(bgMesh);

  const hdrEquirect = new THREE.RGBELoader().load(
    "src/empty_warehouse_01_2k.hdr",
    () => {
      hdrEquirect.mapping = THREE.EquirectangularReflectionMapping;
    }
  );

  const normalMapTexture = textureLoader.load("src/normal.jpg");
  normalMapTexture.wrapS = THREE.RepeatWrapping;
  normalMapTexture.wrapT = THREE.RepeatWrapping;
  normalMapTexture.repeat.set(options.normalRepeat, options.normalRepeat);

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: options.metalness,
    roughness: options.roughness,
    transmission: options.transmission,
    ior: options.ior,
    reflectivity: options.reflectivity,
    thickness: options.thickness,
    envMap: hdrEquirect,
    envMapIntensity: options.envMapIntensity,
    clearcoat: options.clearcoat,
    clearcoatRoughness: options.clearcoatRoughness,
    normalScale: new THREE.Vector2(options.normalScale),
    normalMap: normalMapTexture,
    clearcoatNormalMap: normalMapTexture,
    clearcoatNormalScale: new THREE.Vector2(options.clearcoatNormalScale),
    // attenuationTint: options.attenuationTint,
    // attenuationDistance: options.attenuationDistance,
  });

  let mesh = null;

  // Load dragon GLTF model
  new THREE.GLTFLoader().load("src/dragon.glb", (gltf) => {
    const dragon = gltf.scene.children.find((mesh) => mesh.name === "Dragon");

    // Just copy the geometry from the loaded model
    const geometry = dragon.geometry.clone();

    // Adjust geometry to suit our scene
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, -4, 0);

    // Create a new mesh and place it in the scene
    mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(0.25, 0.25, 0.25);
    scene.add(mesh);

    // Discard the loaded model
    gltf.scene.children.forEach((child) => {
      child.geometry.dispose();
      child.material.dispose();
    });
  });

  // GUI
  // ---

  gui.add(options, "enableSwoopingCamera").onChange((val) => {
    controls.enabled = !val;
    controls.reset();
  });

  gui.add(options, "enableRotation").onChange(() => {
    if (mesh) mesh.rotation.set(0, 0, 0);
  });

  gui.addColor(options, "color").onChange((val) => {
    material.color.set(val);
  });

  gui.add(options, "roughness", 0, 1, 0.01).onChange((val) => {
    material.roughness = val;
  });

  gui.add(options, "metalness", 0, 1, 0.01).onChange((val) => {
    material.metalness = val;
  });

  gui.add(options, "transmission", 0, 1, 0.01).onChange((val) => {
    material.transmission = val;
  });

  gui.add(options, "ior", 1, 2.33, 0.01).onChange((val) => {
    material.ior = val;
  });

  gui.add(options, "reflectivity", 0, 1, 0.01).onChange((val) => {
    material.reflectivity = val;
  });

  gui.add(options, "thickness", 0, 5, 0.1).onChange((val) => {
    material.thickness = val;
  });

  gui.add(options, "envMapIntensity", 0, 3, 0.1).onChange((val) => {
    material.envMapIntensity = val;
  });

  gui.add(options, "clearcoat", 0, 1, 0.01).onChange((val) => {
    material.clearcoat = val;
  });

  gui.add(options, "clearcoatRoughness", 0, 1, 0.01).onChange((val) => {
    material.clearcoatRoughness = val;
  });

  gui.add(options, "normalScale", 0, 5, 0.01).onChange((val) => {
    material.normalScale.set(val, val);
  });

  gui.add(options, "clearcoatNormalScale", 0, 5, 0.01).onChange((val) => {
    material.clearcoatNormalScale.set(val, val);
  });

  gui.add(options, "normalRepeat", 1, 4, 1).onChange((val) => {
    normalMapTexture.repeat.set(val, val);
  });

  // gui.addColor(options, "attenuationTint").onChange((val) => {
  //   material.attenuationTint.set(val);
  // });

  // gui.add(options, "attenuationDistance", 0, 1, 0.01).onChange((val) => {
  //   material.attenuationDistance = val;
  // });

  const postprocessing = gui.addFolder("Post Processing");

  postprocessing.add(options, "bloomThreshold", 0, 1, 0.01).onChange((val) => {
    bloomPass.threshold = val;
  });

  postprocessing.add(options, "bloomStrength", 0, 5, 0.01).onChange((val) => {
    bloomPass.strength = val;
  });

  postprocessing.add(options, "bloomRadius", 0, 1, 0.01).onChange((val) => {
    bloomPass.radius = val;
  });

  // Update
  // ------

  const update = (time, deltaTime) => {
    const ROTATE_TIME = 10; // Time in seconds for a full rotation
    const xAxis = new THREE.Vector3(1, 0, 0);
    const yAxis = new THREE.Vector3(0, 1, 0);
    const rotateX = (deltaTime / ROTATE_TIME) * Math.PI * 2;
    const rotateY = (deltaTime / ROTATE_TIME) * Math.PI * 2;

    // Update gradient animation
    bgMaterial.uniforms.uTime.value = time;

    if (options.enableRotation && mesh) {
      mesh.rotateOnWorldAxis(xAxis, rotateX);
      mesh.rotateOnWorldAxis(yAxis, rotateY);
    }

    if (options.enableSwoopingCamera) {
      camera.position.x = Math.sin((time / 10) * Math.PI * 2) * 2;
      camera.position.y = Math.cos((time / 10) * Math.PI * 2) * 2;
      camera.position.z = 4;
      camera.lookAt(scene.position);
    }
  };

  // Lifecycle
  // ---------

  return {
    resize({ canvas, pixelRatio, viewportWidth, viewportHeight }) {
      const dpr = Math.min(pixelRatio, 2); // Cap DPR scaling to 2x

      canvas.width = viewportWidth * dpr;
      canvas.height = viewportHeight * dpr;
      canvas.style.width = viewportWidth + "px";
      canvas.style.height = viewportHeight + "px";

      bloomPass.resolution.set(viewportWidth, viewportHeight);

      renderer.setPixelRatio(dpr);
      renderer.setSize(viewportWidth, viewportHeight);

      composer.setPixelRatio(dpr);
      composer.setSize(viewportWidth, viewportHeight);

      camera.aspect = viewportWidth / viewportHeight;
      camera.updateProjectionMatrix();
    },
    render({ time, deltaTime }) {
      stats.begin();
      controls.update();
      update(time, deltaTime);
      // renderer.render(scene, camera);
      composer.render();
      stats.end();
    },
    unload() {
      mesh.geometry.dispose();
      material.dispose();
      bgGeometry.dispose();
      bgMaterial.dispose();
      hdrEquirect.dispose();
      controls.dispose();
      renderer.dispose();
      bloomPass.dispose();
      gui.destroy();
      document.body.removeChild(stats.dom);
    },
  };
};

canvasSketch(sketch, settings);
