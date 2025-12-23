import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { Settings, Box, Rotate3d, Palette, Layers, X, Move, MousePointer2, Plus, Trash2, Camera, Download } from 'lucide-react';

// --- Types ---
type ShapeType =
  | 'sphere' | 'cylinder' | 'cube' | 'cone' | 'torus'
  | 'pyramid' | 'prism' | 'pentagonalPrism' | 'hexagonalPrism'
  | 'octagonalPrism' | 'tetrahedron' | 'dodecahedron' | 'icosahedron';

type MovementMode = 'none' | 'straight' | 'left-right' | 'up-down' | 'returning' | 'orbit';

type ShapeObject = {
  id: string;
  type: ShapeType;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  texture: TextureType;
  metalness: number;
  roughness: number;
  emissive: string;
  emissiveIntensity: number;
  opacity: number;
  radius: number;
  height: number;
  name: string;
  isAnimated: boolean;
  movementMode: MovementMode;
  movementSpeed: number;
  movementRange: number;
  originalPosition: [number, number, number];
};

type EnvironmentPreset = 'studio' | 'midnight' | 'neon' | 'soft';
type TextureType = 'noise' | 'none' | 'checkerboard' | 'dots' | 'stripes';

// --- Texture Generation Helper ---
const createTextures = () => {
  const textureSize = 512;
  const tileSize = textureSize / 8;
  const textures: Record<string, THREE.Texture> = {};

  // Checkerboard
  const checkerboardCanvas = document.createElement('canvas');
  checkerboardCanvas.width = checkerboardCanvas.height = textureSize;
  const ctxChecker = checkerboardCanvas.getContext('2d')!;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      ctxChecker.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#111111';
      ctxChecker.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }
  textures.checkerboard = new THREE.CanvasTexture(checkerboardCanvas);

  // Dots
  const dotsCanvas = document.createElement('canvas');
  dotsCanvas.width = dotsCanvas.height = textureSize;
  const ctxDots = dotsCanvas.getContext('2d')!;
  ctxDots.fillStyle = '#111111';
  ctxDots.fillRect(0, 0, textureSize, textureSize);
  ctxDots.fillStyle = '#ffffff';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      ctxDots.beginPath();
      ctxDots.arc(x * tileSize + tileSize / 2, y * tileSize + tileSize / 2, tileSize / 4, 0, Math.PI * 2);
      ctxDots.fill();
    }
  }
  textures.dots = new THREE.CanvasTexture(dotsCanvas);

  // Stripes
  const stripesCanvas = document.createElement('canvas');
  stripesCanvas.width = stripesCanvas.height = textureSize;
  const ctxStripes = stripesCanvas.getContext('2d')!;
  for (let y = 0; y < textureSize; y += tileSize) {
    ctxStripes.fillStyle = y % (tileSize * 2) === 0 ? '#ffffff' : '#111111';
    ctxStripes.fillRect(0, y, textureSize, tileSize);
  }
  textures.stripes = new THREE.CanvasTexture(stripesCanvas);

  // Noise
  const noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = noiseCanvas.height = textureSize;
  const ctxNoise = noiseCanvas.getContext('2d')!;
  const imageData = ctxNoise.createImageData(textureSize, textureSize);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const value = Math.floor(Math.random() * 256);
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = 255;
  }
  ctxNoise.putImageData(imageData, 0, 0);
  textures.noise = new THREE.CanvasTexture(noiseCanvas);

  return textures;
};

export default function App() {
  // --- UI State ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // --- 3D State ---
  const [isInitialized, setIsInitialized] = useState(false);
  const [objects, setObjects] = useState<ShapeObject[]>([
    {
      id: '1',
      type: 'torus',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#6366f1',
      texture: 'noise',
      metalness: 0.5,
      roughness: 0.2,
      emissive: '#000000',
      emissiveIntensity: 0,
      opacity: 1,
      radius: 3,
      height: 3,
      name: 'Primary Torus',
      isAnimated: false,
      movementMode: 'none',
      movementSpeed: 1,
      movementRange: 5,
      originalPosition: [0, 0, 0]
    }
  ]);
  const [selectedId, setSelectedId] = useState<string | null>('1');
  const [distance, setDistance] = useState(15);
  const [autoRotate, setAutoRotate] = useState(false);
  const [rotationSpeed, setRotationSpeed] = useState(0.005);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [showGizmo, setShowGizmo] = useState(true);
  const [environment, setEnvironment] = useState<EnvironmentPreset>('studio');

  // --- Refs ---
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const texturesRef = useRef<Record<string, THREE.Texture> | null>(null);
  const frameIdRef = useRef<number>(0);

  // Refs for animation loop access
  const autoRotateRef = useRef(autoRotate);
  const rotationSpeedRef = useRef(rotationSpeed);
  const objectsRef = useRef(objects);
  const selectedIdRef = useRef(selectedId);
  const showGizmoRef = useRef(showGizmo);

  // Sync refs with state
  useEffect(() => {
    autoRotateRef.current = autoRotate;
    rotationSpeedRef.current = rotationSpeed;
    objectsRef.current = objects;
    selectedIdRef.current = selectedId;
    showGizmoRef.current = showGizmo;
  }, [autoRotate, rotationSpeed, objects, selectedId, showGizmo]);

  // --- Initialization --- //
  useEffect(() => {
    if (!mountRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    scene.fog = new THREE.Fog(0x050505, 10, 200);
    sceneRef.current = scene;

    // Camera
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(distance, distance * 0.5, distance);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0a0a0a, 1);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controlsRef.current = controls;

    // Transform Controls
    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value;
    });
    transformControls.addEventListener('objectChange', () => {
      if (transformControls.object && selectedIdRef.current) {
        const obj = transformControls.object;
        setObjects(prev => prev.map(o => {
          if (o.id === selectedIdRef.current) {
            return {
              ...o,
              position: [obj.position.x, obj.position.y, obj.position.z],
              rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
              scale: [obj.scale.x, obj.scale.y, obj.scale.z],
              originalPosition: [obj.position.x, obj.position.y, obj.position.z]
            };
          }
          return o;
        }));
      }
    });
    scene.add(transformControls);
    transformRef.current = transformControls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    ambientLight.name = 'ambient';
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(10, 10, 10);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    mainLight.name = 'mainLight';
    scene.add(mainLight);

    const pointLight = new THREE.PointLight(0x6366f1, 0);
    pointLight.position.set(-10, 5, -10);
    pointLight.name = 'pointLight';
    scene.add(pointLight);

    // Ground Plane
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshPhongMaterial({
      color: 0x111111,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.2
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -5;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Grid Helper
    const grid = new THREE.GridHelper(100, 40, 0x444444, 0x222222);
    grid.position.y = -4.99;
    scene.add(grid);

    // Textures
    texturesRef.current = createTextures();

    setIsInitialized(true);

    // Resize Handler
    const handleResize = () => {
      if (!mountRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation Loop
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      if (controlsRef.current) controlsRef.current.update();

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        if (autoRotateRef.current) {
          sceneRef.current.rotation.y += rotationSpeedRef.current;
        }

        const time = Date.now() * 0.001;

        // Per-object animation
        objectsRef.current.forEach(obj => {
          const mesh = meshesRef.current.get(obj.id);
          if (!mesh) return;

          // Basic Rotation (Existing)
          if (obj.isAnimated) {
            mesh.rotation.y += 0.01;
          }

          // Movement Simulation
          const [ox, oy, oz] = obj.originalPosition;
          const speed = obj.movementSpeed;
          const range = obj.movementRange;

          switch (obj.movementMode) {
            case 'straight':
              mesh.position.z += 0.02 * speed;
              // Loop back after some distance
              if (Math.abs(mesh.position.z - oz) > 50) {
                mesh.position.z = oz - 50;
              }
              break;
            case 'left-right':
              mesh.position.x = ox + Math.sin(time * speed * 2) * range;
              break;
            case 'up-down':
              mesh.position.y = oy + Math.sin(time * speed * 2) * range;
              break;
            case 'returning':
              const step = 0.05 * speed;
              mesh.position.x += (ox - mesh.position.x) * step;
              mesh.position.y += (oy - mesh.position.y) * step;
              mesh.position.z += (oz - mesh.position.z) * step;

              // Check if close enough to snap and finalize
              const dist = Math.sqrt(
                Math.pow(ox - mesh.position.x, 2) +
                Math.pow(oy - mesh.position.y, 2) +
                Math.pow(oz - mesh.position.z, 2)
              );

              if (dist < 0.01) {
                mesh.position.set(ox, oy, oz);
                setTimeout(() => {
                  setObjects(prev => prev.map(o => o.id === obj.id ? {
                    ...o, position: [ox, oy, oz], movementMode: 'none'
                  } : o));
                }, 0);
              }
              break;
            case 'orbit':
              const orbitRadius = range || 5;
              const orbitSpeed = speed * 0.5;
              mesh.position.x = ox + Math.cos(time * orbitSpeed) * orbitRadius;
              mesh.position.z = oz + Math.sin(time * orbitSpeed) * orbitRadius;
              break;
          }
        });

        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    // Force a resize after a short delay to handle potential late mounting sizes
    const timer = setTimeout(handleResize, 100);

    // Keyboard Shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;

      switch (e.key.toLowerCase()) {
        case 'g': setTransformMode('translate'); break;
        case 'r': setTransformMode('rotate'); break;
        case 's': setTransformMode('scale'); break;
        case 'delete':
        case 'backspace':
          if (selectedIdRef.current) deleteObject(selectedIdRef.current);
          break;
        case 'escape': setSelectedId(null); break;
        case 'f': focusOnObject(); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameIdRef.current);
      clearTimeout(timer);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // --- Update Objects Effect --- //
  useEffect(() => {
    if (!isInitialized || !sceneRef.current || !texturesRef.current) return;

    const scene = sceneRef.current;
    const textures = texturesRef.current;

    // Remove meshes no longer in state
    const currentIds = new Set(objects.map(o => o.id));
    meshesRef.current.forEach((mesh, id) => {
      if (!currentIds.has(id)) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        meshesRef.current.delete(id);
      }
    });

    // Add or update meshes
    objects.forEach(obj => {
      let mesh = meshesRef.current.get(obj.id);

      // If mesh exists, check if geometry or material needs reset
      // For simplicity in this edit, we'll recreate if type/params changed, 
      // but update pos/rot/scale/color every time.
      if (!mesh) {
        const geometry = createGeometry(obj.type, obj.radius, obj.height);
        const material = new THREE.MeshStandardMaterial({
          color: obj.color,
          metalness: obj.metalness,
          roughness: obj.roughness,
          emissive: new THREE.Color(obj.emissive),
          emissiveIntensity: obj.emissiveIntensity,
          transparent: obj.opacity < 1,
          opacity: obj.opacity,
          map: obj.texture !== 'none' ? textures[obj.texture] : null,
          side: THREE.DoubleSide
        });
        mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { type: obj.type, radius: obj.radius, height: obj.height };
        scene.add(mesh);
        meshesRef.current.set(obj.id, mesh);
      } else {
        // Update basic props
        mesh.position.set(...obj.position);
        mesh.rotation.set(...obj.rotation);
        mesh.scale.set(...obj.scale);

        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.set(obj.color);
        mat.metalness = obj.metalness;
        mat.roughness = obj.roughness;
        mat.emissive.set(obj.emissive);
        mat.emissiveIntensity = obj.emissiveIntensity;
        mat.opacity = obj.opacity;
        mat.transparent = obj.opacity < 1;
        mat.map = obj.texture !== 'none' ? textures[obj.texture] : null;

        // Reset geometry if type/params changed
        const currentType = mesh.userData.type;
        const currentRadius = mesh.userData.radius;
        const currentHeight = mesh.userData.height;

        if (currentType !== obj.type || currentRadius !== obj.radius || currentHeight !== obj.height) {
          mesh.geometry.dispose();
          mesh.geometry = createGeometry(obj.type, obj.radius, obj.height);
          mesh.userData.type = obj.type;
          mesh.userData.radius = obj.radius;
          mesh.userData.height = obj.height;
        }
      }
    });

    // Update Transform Controls selection
    if (transformRef.current) {
      if (selectedId && showGizmo) {
        const selectedMesh = meshesRef.current.get(selectedId);
        if (selectedMesh) {
          transformRef.current.attach(selectedMesh);
          transformRef.current.setMode(transformMode);
        } else {
          transformRef.current.detach();
        }
      } else {
        transformRef.current.detach();
      }
    }

  }, [isInitialized, objects, selectedId, transformMode, showGizmo]);

  // --- Environment & Lighting Effect --- //
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    const ambient = scene.getObjectByName('ambient') as THREE.AmbientLight;
    const main = scene.getObjectByName('mainLight') as THREE.DirectionalLight;
    const point = scene.getObjectByName('pointLight') as THREE.PointLight;

    switch (environment) {
      case 'studio':
        scene.background = new THREE.Color(0x050505);
        if (ambient) ambient.intensity = 0.4;
        if (main) {
          main.intensity = 1.2;
          main.color.set(0xffffff);
        }
        if (point) point.intensity = 0;
        break;
      case 'midnight':
        scene.background = new THREE.Color(0x020205);
        if (ambient) ambient.intensity = 0.1;
        if (main) {
          main.intensity = 0.5;
          main.color.set(0x3344ff);
        }
        if (point) point.intensity = 0;
        break;
      case 'neon':
        scene.background = new THREE.Color(0x0a0010);
        if (ambient) ambient.intensity = 0.2;
        if (main) {
          main.intensity = 0.4;
          main.color.set(0xff00ff);
        }
        if (point) {
          point.intensity = 2;
          point.color.set(0x00ffff);
        }
        break;
      case 'soft':
        scene.background = new THREE.Color(0x1a1a1a);
        if (ambient) ambient.intensity = 0.6;
        if (main) {
          main.intensity = 0.8;
          main.color.set(0xfff0e0);
        }
        if (point) point.intensity = 0.1;
        break;
    }
  }, [environment]);

  // Helper to create geometry based on type
  const createGeometry = (type: ShapeType, radius: number, height: number) => {
    switch (type) {
      case 'sphere': return new THREE.SphereGeometry(radius, 64, 64);
      case 'cylinder': return new THREE.CylinderGeometry(radius, radius, height, 64);
      case 'cube': return new THREE.BoxGeometry(radius * 2, radius * 2, radius * 2);
      case 'cone': return new THREE.ConeGeometry(radius, height, 64);
      case 'torus': return new THREE.TorusGeometry(radius, radius / 3, 64, 64);
      case 'pyramid': return new THREE.ConeGeometry(radius, height, 4);
      case 'prism': return new THREE.CylinderGeometry(radius, radius, height, 3);
      case 'pentagonalPrism': return new THREE.CylinderGeometry(radius, radius, height, 5);
      case 'hexagonalPrism': return new THREE.CylinderGeometry(radius, radius, height, 6);
      case 'octagonalPrism': return new THREE.CylinderGeometry(radius, radius, height, 8);
      case 'tetrahedron': return new THREE.TetrahedronGeometry(radius);
      case 'dodecahedron': return new THREE.DodecahedronGeometry(radius);
      case 'icosahedron': return new THREE.IcosahedronGeometry(radius);
      default: return new THREE.SphereGeometry(radius, 64, 64);
    }
  };

  // --- UI Helpers --- //
  const selectedObject = objects.find(o => o.id === selectedId);

  const updateSelectedObject = (updates: Partial<ShapeObject>) => {
    if (!selectedId) return;
    setObjects(prev => prev.map(o => o.id === selectedId ? { ...o, ...updates } : o));
  };

  const addObject = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    const newObj: ShapeObject = {
      id: newId,
      type: 'sphere',
      position: [(Math.random() - 0.5) * 10, 2, (Math.random() - 0.5) * 10],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
      texture: 'none',
      metalness: 0.5,
      roughness: 0.5,
      emissive: '#000000',
      emissiveIntensity: 0,
      opacity: 1,
      radius: 2,
      height: 2,
      name: `Object-${objects.length + 1}`,
      isAnimated: false,
      movementMode: 'none',
      movementSpeed: 1,
      movementRange: 5,
      originalPosition: [(Math.random() - 0.5) * 10, 2, (Math.random() - 0.5) * 10]
    };
    setObjects([...objects, newObj]);
    setSelectedId(newId);
  };

  const createSolarSystem = () => {
    const sunId = 'sun-' + Math.random().toString(36).substr(2, 5);
    const sun: ShapeObject = {
      id: sunId,
      type: 'sphere',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [2, 2, 2],
      color: '#ffcc00',
      texture: 'noise',
      metalness: 0.1,
      roughness: 0.1,
      emissive: '#ff6600',
      emissiveIntensity: 2,
      opacity: 1,
      radius: 4,
      height: 4,
      name: 'The Sun',
      isAnimated: true,
      movementMode: 'none',
      movementSpeed: 0.5,
      movementRange: 0,
      originalPosition: [0, 0, 0]
    };

    const planets: ShapeObject[] = [
      { name: 'Mercury', color: '#aaaaaa', radius: 0.8, dist: 8, speed: 2 },
      { name: 'Venus', color: '#eebb99', radius: 1.5, dist: 12, speed: 1.5 },
      { name: 'Earth', color: '#2266ff', radius: 1.6, dist: 18, speed: 1.2 },
      { name: 'Mars', color: '#ff4422', radius: 1.2, dist: 24, speed: 1.0 },
    ].map((p, i) => ({
      id: 'planet-' + i + Math.random().toString(36).substr(2, 5),
      type: 'sphere',
      position: [p.dist, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: p.color,
      texture: 'noise',
      metalness: 0.2,
      roughness: 0.8,
      emissive: '#000000',
      emissiveIntensity: 0,
      opacity: 1,
      radius: p.radius,
      height: p.radius,
      name: p.name,
      isAnimated: true,
      movementMode: 'orbit',
      movementSpeed: p.speed,
      movementRange: p.dist,
      originalPosition: [0, 0, 0]
    }));

    setObjects([sun, ...planets]);
    setSelectedId(sunId);
  };

  const deleteObject = (id: string) => {
    if (objects.length <= 1) return; // Keep at least one
    const newObjects = objects.filter(o => o.id !== id);
    setObjects(newObjects);
    if (selectedId === id) setSelectedId(newObjects[0].id);
  };

  const focusOnObject = () => {
    if (!selectedId || !cameraRef.current || !controlsRef.current) return;
    const mesh = meshesRef.current.get(selectedId);
    if (mesh) {
      const targetPos = mesh.position.clone();
      const camera = cameraRef.current;
      const controls = controlsRef.current;

      // Move camera towards object but keep some distance
      const offset = new THREE.Vector3(10, 5, 10);
      camera.position.copy(targetPos.clone().add(offset));
      controls.target.copy(targetPos);
      controls.update();
    }
  };

  const captureScreenshot = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    rendererRef.current.render(sceneRef.current, cameraRef.current);
    const dataURL = rendererRef.current.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'shape-engine-capture.png';
    link.href = dataURL;
    link.click();
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#050505] font-sans text-gray-100">

      {/* Full Screen 3D Viewport */}
      <div ref={mountRef} className="absolute inset-0 z-0" />

      {/* Floating Settings Panel */}
      <div
        className={`fixed top-6 left-6 z-10 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isSettingsOpen
          ? 'w-[340px] bg-black/40 backdrop-blur-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] rounded-[24px] border border-white/10'
          : 'w-14 h-14 bg-white/10 backdrop-blur-md shadow-lg rounded-full hover:scale-110 cursor-pointer border border-white/10 group'
          }`}
      >
        {/* Collapsed State Trigger */}
        {!isSettingsOpen && (
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-full h-full flex items-center justify-center text-gray-400 group-hover:text-blue-400 transition-colors"
            title="Open Control Panel"
          >
            <Settings className="w-7 h-7" />
          </button>
        )}

        {/* Gizmo Toggle (Always visible when panel is closed but object is selected) */}
        {!isSettingsOpen && selectedId && (
          <button
            onClick={() => setShowGizmo(!showGizmo)}
            className={`fixed top-24 left-6 w-14 h-14 backdrop-blur-md shadow-lg rounded-full flex items-center justify-center transition-all border border-white/10 hover:scale-110 ${showGizmo ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/40'}`}
            title={showGizmo ? "Hide Gizmo" : "Show Gizmo"}
          >
            <MousePointer2 className="w-6 h-6" />
          </button>
        )}

        {/* Expanded State Content */}
        {isSettingsOpen && (
          <div className="flex flex-col h-full max-h-[calc(100vh-3rem)]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-xl">
                  <Box className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h1 className="font-bold text-sm tracking-tight text-white/90">Lab-01</h1>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest font-black">Shape Engine</p>
                </div>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-2 hover:bg-white/5 rounded-xl text-white/40 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Controls */}
            <div className="px-6 py-6 overflow-y-auto custom-scrollbar space-y-8 pb-10">

              {/* Interaction Guide */}
              <div className="flex gap-2">
                <button
                  onClick={addObject}
                  className="flex-1 flex items-center justify-center gap-2 p-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-2xl text-blue-400 text-xs font-bold transition-all"
                >
                  <Plus className="w-4 h-4" /> Add Shape
                </button>
                <button
                  onClick={focusOnObject}
                  className={`flex-1 flex items-center justify-center gap-2 p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white/60 text-xs font-bold transition-all ${!selectedId ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={!selectedId}
                >
                  <Camera className="w-4 h-4" /> Focus
                </button>
                <button
                  onClick={captureScreenshot}
                  className="flex-1 flex items-center justify-center gap-2 p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white/60 text-xs font-bold transition-all"
                >
                  <Download className="w-4 h-4" /> Capture
                </button>
              </div>

              {/* Presets */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Rotate3d className="w-3 h-3" /> Quick Presets
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={createSolarSystem}
                    className="flex-1 flex items-center justify-center gap-2 p-3 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 rounded-2xl text-orange-400 text-xs font-bold transition-all"
                  >
                    Solar System
                  </button>
                </div>
              </div>

              {/* Environment Presets */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Rotate3d className="w-3 h-3" /> Environment Core
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['studio', 'midnight', 'neon', 'soft'] as EnvironmentPreset[]).map(p => (
                    <button
                      key={p}
                      onClick={() => setEnvironment(p)}
                      className={`p-2 rounded-xl border text-[10px] font-bold uppercase transition-all ${environment === p
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                        : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10'
                        }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Object List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Layers className="w-3 h-3" /> Scene Hierarchy
                  </label>
                  <button
                    onClick={() => setShowGizmo(!showGizmo)}
                    className={`text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-lg border transition-all ${showGizmo ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'bg-white/5 border-white/5 text-white/40'}`}
                  >
                    Gizmo: {showGizmo ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                  {objects.map(obj => (
                    <div
                      key={obj.id}
                      onClick={() => setSelectedId(obj.id)}
                      className={`group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${selectedId === obj.id
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-200'
                        : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: obj.color }} />
                        <span className="text-xs font-medium truncate max-w-[120px]">{obj.name}</span>
                        {obj.isAnimated && <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse" />}
                      </div>
                      {objects.length > 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteObject(obj.id); }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {selectedObject && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Transform Modes */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { mode: 'translate', icon: Move, label: 'Move' },
                      { mode: 'rotate', icon: Rotate3d, label: 'Rotate' },
                      { mode: 'scale', icon: Box, label: 'Scale' }
                    ].map(m => (
                      <button
                        key={m.mode}
                        onClick={() => setTransformMode(m.mode as any)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all ${transformMode === m.mode
                          ? 'bg-blue-500 text-white border-blue-400 shadow-[0_8px_16px_-4px_rgba(59,130,246,0.3)]'
                          : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                          }`}
                      >
                        <m.icon className="w-4 h-4" />
                        <span className="text-[9px] font-black uppercase tracking-wider">{m.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Shape Type */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
                      <Box className="w-3 h-3" /> Geometry Base
                    </label>
                    <div className="relative group">
                      <select
                        value={selectedObject.type}
                        onChange={(e) => updateSelectedObject({ type: e.target.value as ShapeType })}
                        className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-sm text-white/80 focus:ring-2 focus:ring-blue-500/50 outline-none appearance-none cursor-pointer hover:bg-white/10 transition-all font-medium"
                      >
                        <option className="bg-neutral-900" value="sphere">Sphere</option>
                        <option className="bg-neutral-900" value="cylinder">Cylinder</option>
                        <option className="bg-neutral-900" value="cube">Cube</option>
                        <option className="bg-neutral-900" value="cone">Cone</option>
                        <option className="bg-neutral-900" value="torus">Torus</option>
                        <option className="bg-neutral-900" value="pyramid">Pyramid</option>
                        <option className="bg-neutral-900" value="prism">Triangular Prism</option>
                        <option className="bg-neutral-900" value="pentagonalPrism">Pentagonal Prism</option>
                        <option className="bg-neutral-900" value="hexagonalPrism">Hexagonal Prism</option>
                        <option className="bg-neutral-900" value="octagonalPrism">Octagonal Prism</option>
                        <option className="bg-neutral-900" value="tetrahedron">Tetrahedron</option>
                        <option className="bg-neutral-900" value="dodecahedron">Dodecahedron</option>
                        <option className="bg-neutral-900" value="icosahedron">Icosahedron</option>
                      </select>
                    </div>
                  </div>

                  {/* Dimensions */}
                  <div className="space-y-6">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
                      <Move className="w-3 h-3" /> Scale Module
                    </label>
                    <div className="space-y-5">
                      <div className="group">
                        <div className="flex justify-between mb-3">
                          <label className="text-xs font-semibold text-white/60">Radius Vector</label>
                          <span className="text-xs font-mono text-blue-400">{selectedObject.radius.toFixed(1)}</span>
                        </div>
                        <input
                          type="range" min="0.5" max="20" step="0.5"
                          value={selectedObject.radius} onChange={(e) => updateSelectedObject({ radius: parseFloat(e.target.value) })}
                          className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
                        />
                      </div>
                      <div className="group">
                        <div className="flex justify-between mb-3">
                          <label className="text-xs font-semibold text-white/60">Height Axis</label>
                          <span className="text-xs font-mono text-blue-400">{selectedObject.height.toFixed(1)}</span>
                        </div>
                        <input
                          type="range" min="0.5" max="20" step="0.5"
                          value={selectedObject.height} onChange={(e) => updateSelectedObject({ height: parseFloat(e.target.value) })}
                          className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Appearance */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
                      <Palette className="w-3 h-3" /> Material Skin
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative group p-1 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center h-12">
                        <input
                          type="color"
                          value={selectedObject.color}
                          onChange={(e) => updateSelectedObject({ color: e.target.value })}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="w-6 h-6 rounded-full shadow-inner" style={{ backgroundColor: selectedObject.color }} />
                        <span className="ml-3 text-[10px] font-mono text-white/60">{selectedObject.color.toUpperCase()}</span>
                      </div>

                      <select
                        value={selectedObject.texture}
                        onChange={(e) => updateSelectedObject({ texture: e.target.value as TextureType })}
                        className="p-3 bg-white/5 border border-white/10 rounded-2xl text-[11px] text-white/60 focus:ring-1 focus:ring-blue-500/50 outline-none cursor-pointer hover:bg-white/10 transition-all uppercase tracking-wider font-bold"
                      >
                        <option className="bg-neutral-900" value="noise">Noise</option>
                        <option className="bg-neutral-900" value="none">Solid</option>
                        <option className="bg-neutral-900" value="checkerboard">Grid</option>
                        <option className="bg-neutral-900" value="dots">Dots</option>
                        <option className="bg-neutral-900" value="stripes">Stripes</option>
                      </select>
                    </div>

                    {/* PBR Controls */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="group">
                        <div className="flex justify-between mb-2">
                          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Metal</label>
                          <span className="text-xs font-mono text-blue-400">{selectedObject.metalness.toFixed(1)}</span>
                        </div>
                        <input
                          type="range" min="0" max="1" step="0.1"
                          value={selectedObject.metalness} onChange={(e) => updateSelectedObject({ metalness: parseFloat(e.target.value) })}
                          className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>
                      <div className="group">
                        <div className="flex justify-between mb-2">
                          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Rough</label>
                          <span className="text-xs font-mono text-blue-400">{selectedObject.roughness.toFixed(1)}</span>
                        </div>
                        <input
                          type="range" min="0" max="1" step="0.1"
                          value={selectedObject.roughness} onChange={(e) => updateSelectedObject({ roughness: parseFloat(e.target.value) })}
                          className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Movement Simulation */}
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Move className="w-3 h-3" /> Movement Simulation
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateSelectedObject({ originalPosition: [selectedObject.position[0], selectedObject.position[1], selectedObject.position[2]] })}
                          className="text-[9px] font-bold text-white/30 hover:text-blue-400 transition-colors uppercase tracking-widest"
                          title="Set current position as return target"
                        >
                          Set Home
                        </button>
                        <span className="text-white/10">|</span>
                        <button
                          onClick={() => updateSelectedObject({ originalPosition: [0, 0, 0] })}
                          className="text-[9px] font-bold text-white/30 hover:text-blue-400 transition-colors uppercase tracking-widest"
                          title="Set origin [0,0,0] as return target"
                        >
                          To Origin
                        </button>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="relative group">
                        <select
                          value={selectedObject.movementMode}
                          onChange={(e) => updateSelectedObject({ movementMode: e.target.value as MovementMode })}
                          className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-[11px] text-white/60 focus:ring-1 focus:ring-blue-500/50 outline-none cursor-pointer hover:bg-white/10 transition-all uppercase tracking-wider font-bold"
                        >
                          <option className="bg-neutral-900" value="none">Paused / None</option>
                          <option className="bg-neutral-900" value="straight">Straight Line</option>
                          <option className="bg-neutral-900" value="left-right">Oscillate Left-Right</option>
                          <option className="bg-neutral-900" value="up-down">Oscillate Up-Down</option>
                          <option className="bg-neutral-900" value="returning">Smooth Return</option>
                          <option className="bg-neutral-900" value="orbit">Circular Orbit</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="group">
                          <div className="flex justify-between mb-2">
                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Speed Factor</label>
                            <span className="text-xs font-mono text-blue-400">{selectedObject.movementSpeed.toFixed(1)}</span>
                          </div>
                          <input
                            type="range" min="0.1" max="5" step="0.1"
                            value={selectedObject.movementSpeed} onChange={(e) => updateSelectedObject({ movementSpeed: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500"
                          />
                        </div>
                        <div className="group">
                          <div className="flex justify-between mb-2">
                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Range Level</label>
                            <span className="text-xs font-mono text-blue-400">{selectedObject.movementRange.toFixed(1)}</span>
                          </div>
                          <input
                            type="range" min="0" max="25" step="0.5"
                            value={selectedObject.movementRange} onChange={(e) => updateSelectedObject({ movementRange: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Emissive & Animation Toggles */}
                  <div className="space-y-6 pt-2">
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg transition-colors ${selectedObject.isAnimated ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/20'}`}>
                          <Rotate3d className="w-4 h-4" />
                        </div>
                        <span className="text-[11px] font-bold text-white/60 uppercase">Auto Dynamic</span>
                      </div>
                      <button
                        onClick={() => updateSelectedObject({ isAnimated: !selectedObject.isAnimated })}
                        className={`w-10 h-5 rounded-full relative transition-all ${selectedObject.isAnimated ? 'bg-blue-500' : 'bg-white/10'}`}
                      >
                        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${selectedObject.isAnimated ? 'right-1' : 'left-1'}`} />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
                          <Palette className="w-3 h-3" /> Emissive Glow
                        </label>
                        <span className="text-[9px] font-mono text-blue-400">Intensity: {selectedObject.emissiveIntensity.toFixed(1)}</span>
                      </div>
                      <div className="flex gap-3">
                        <div className="relative group p-1 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center h-10 w-16">
                          <input
                            type="color"
                            value={selectedObject.emissive}
                            onChange={(e) => updateSelectedObject({ emissive: e.target.value })}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <div className="w-4 h-4 rounded-full shadow-inner" style={{ backgroundColor: selectedObject.emissive }} />
                        </div>
                        <input
                          type="range" min="0" max="5" step="0.1"
                          value={selectedObject.emissiveIntensity} onChange={(e) => updateSelectedObject({ emissiveIntensity: parseFloat(e.target.value) })}
                          className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500 my-auto"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Camera & Rotation */}
              <div className="space-y-6 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Rotate3d className="w-3 h-3" /> Motor Sync
                  </label>
                  <button
                    onClick={() => setAutoRotate(!autoRotate)}
                    className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${autoRotate ? 'bg-blue-500 text-white shadow-[0_0_12px_rgba(59,130,246,0.4)]' : 'bg-white/10 text-white/40'
                      }`}
                  >
                    {autoRotate ? 'Auto On' : 'Auto Off'}
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between mb-3">
                      <label className="text-xs font-semibold text-white/60">Zoom Limit</label>
                      <span className="text-xs font-mono text-blue-400">{distance.toFixed(0)}m</span>
                    </div>
                    <input
                      type="range" min="5" max="30" step="1"
                      value={distance} onChange={(e) => setDistance(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  {autoRotate && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex justify-between mb-3">
                        <label className="text-xs font-semibold text-white/60">Orbital Velocity</label>
                        <span className="text-xs font-mono text-blue-400">{rotationSpeed.toFixed(3)}</span>
                      </div>
                      <input
                        type="range" min="0" max="0.05" step="0.001"
                        value={rotationSpeed} onChange={(e) => setRotationSpeed(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                  )}

                  <div className="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-4">
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] block">Scene Stats</span>
                    <div className="flex justify-between items-center text-[10px] font-mono text-white/40 uppercase">
                      <span>Objects</span>
                      <span>{objects.length}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-mono text-white/40 uppercase">
                      <span>Engine</span>
                      <span>WebGL 2.0</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Experimental Tag */}
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-2">
        <div className="bg-white/5 backdrop-blur-xl px-4 py-2 rounded-2xl text-[10px] font-black text-white/30 tracking-[0.3em] uppercase border border-white/5">
          V-Render Core 2.0
        </div>
        <div className="text-[10px] text-white/10 font-medium">
          Interactive Environment Simulation
        </div>
      </div>

      {/* Custom Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
      `}</style>
    </div>
  );
}
