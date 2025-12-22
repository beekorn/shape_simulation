import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Settings, Box, Rotate3d, Palette, Layers, X, Move, MousePointer2 } from 'lucide-react';

// --- Types ---
type ShapeType =
  | 'sphere' | 'cylinder' | 'cube' | 'cone' | 'torus'
  | 'pyramid' | 'prism' | 'pentagonalPrism' | 'hexagonalPrism'
  | 'octagonalPrism' | 'tetrahedron' | 'dodecahedron' | 'icosahedron';

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
  const [shapeType, setShapeType] = useState<ShapeType>('torus');
  const [radius, setRadius] = useState(3);
  const [height, setHeight] = useState(3);
  const [enableSegments, setEnableSegments] = useState(false);
  const [segments, setSegments] = useState(32);
  const [color, setColor] = useState('#6366f1');
  const [textureType, setTextureType] = useState<TextureType>('noise');
  const [distance, setDistance] = useState(15);
  const [autoRotate, setAutoRotate] = useState(true);
  const [rotationSpeed, setRotationSpeed] = useState(0.005);
  const [rotationAxis, setRotationAxis] = useState({ x: 0, y: 1, z: 0 });

  // --- Refs ---
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const texturesRef = useRef<Record<string, THREE.Texture> | null>(null);
  const frameIdRef = useRef<number>(0);

  // Refs for animation loop access
  const autoRotateRef = useRef(autoRotate);
  const rotationSpeedRef = useRef(rotationSpeed);
  const rotationAxisRef = useRef(rotationAxis);

  // Sync refs with state
  useEffect(() => {
    autoRotateRef.current = autoRotate;
    rotationSpeedRef.current = rotationSpeed;
    rotationAxisRef.current = rotationAxis;
  }, [autoRotate, rotationSpeed, rotationAxis]);

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

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(10, 10, 10);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    scene.add(mainLight);

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
        if (meshRef.current && autoRotateRef.current) {
          const rSpeed = rotationSpeedRef.current;
          const rAxis = rotationAxisRef.current;
          const axis = new THREE.Vector3(rAxis.x, rAxis.y, rAxis.z).normalize();
          if (axis.lengthSq() === 0) axis.set(0, 1, 0);
          meshRef.current.rotateOnAxis(axis, rSpeed);
        }
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    // Force a resize after a short delay to handle potential late mounting sizes
    const timer = setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameIdRef.current);
      clearTimeout(timer);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // --- Update Shape Effect --- //
  useEffect(() => {
    if (!isInitialized || !sceneRef.current || !texturesRef.current) return;

    // Cleanup old mesh
    if (meshRef.current) {
      sceneRef.current.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      if (Array.isArray(meshRef.current.material)) {
        meshRef.current.material.forEach(m => m.dispose());
      } else {
        (meshRef.current.material as THREE.Material).dispose();
      }
    }

    // Geometry
    let geometry;
    const segs = enableSegments ? segments : 64;

    switch (shapeType) {
      case 'sphere': geometry = new THREE.SphereGeometry(radius, segs, segs); break;
      case 'cylinder': geometry = new THREE.CylinderGeometry(radius, radius, height, segs); break;
      case 'cube': geometry = new THREE.BoxGeometry(radius * 2, radius * 2, radius * 2); break;
      case 'cone': geometry = new THREE.ConeGeometry(radius, height, segs); break;
      case 'torus': geometry = new THREE.TorusGeometry(radius, radius / 3, segs, segs); break;
      case 'pyramid': geometry = new THREE.ConeGeometry(radius, height, 4); break;
      case 'prism': geometry = new THREE.CylinderGeometry(radius, radius, height, 3); break;
      case 'pentagonalPrism': geometry = new THREE.CylinderGeometry(radius, radius, height, 5); break;
      case 'hexagonalPrism': geometry = new THREE.CylinderGeometry(radius, radius, height, 6); break;
      case 'octagonalPrism': geometry = new THREE.CylinderGeometry(radius, radius, height, 8); break;
      case 'tetrahedron': geometry = new THREE.TetrahedronGeometry(radius); break;
      case 'dodecahedron': geometry = new THREE.DodecahedronGeometry(radius); break;
      case 'icosahedron': geometry = new THREE.IcosahedronGeometry(radius); break;
      default: geometry = new THREE.SphereGeometry(radius, segs, segs);
    }

    // Material
    const materialProps = {
      color: color,
      shininess: 100,
      specular: 0x888888,
      side: THREE.DoubleSide,
      map: textureType !== 'none' ? texturesRef.current[textureType] : null
    };
    const material = new THREE.MeshPhongMaterial(materialProps);

    // Mesh
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshRef.current = mesh;
    sceneRef.current.add(mesh);

  }, [isInitialized, shapeType, radius, height, segments, enableSegments, color, textureType]);

  // --- Update Camera Distance --- //
  useEffect(() => {
    if (cameraRef.current && controlsRef.current) {
      // Smoothly zoom by updating camera and controls target if necessary
      // For now just update position on z axis or distance-based vector
      const dir = cameraRef.current.position.clone().normalize();
      cameraRef.current.position.copy(dir.multiplyScalar(distance));
    }
  }, [distance]);

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
              <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 flex items-start gap-3">
                <MousePointer2 className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed text-blue-200/60">
                  <span className="text-blue-200 font-bold">Interactivity Active:</span> Drag to rotate, Right-click to pan, Scroll to zoom.
                </p>
              </div>

              {/* Shape Type */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Layers className="w-3 h-3" /> Geometry Base
                </label>
                <div className="relative group">
                  <select
                    value={shapeType}
                    onChange={(e) => setShapeType(e.target.value as ShapeType)}
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
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/20">
                    <Settings className="w-4 h-4 rotate-90" />
                  </div>
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
                      <span className="text-xs font-mono text-blue-400">{radius.toFixed(1)}</span>
                    </div>
                    <input
                      type="range" min="0.5" max="50" step="0.5"
                      value={radius} onChange={(e) => setRadius(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
                    />
                  </div>
                  <div className="group">
                    <div className="flex justify-between mb-3">
                      <label className="text-xs font-semibold text-white/60">Height Axis</label>
                      <span className="text-xs font-mono text-blue-400">{height.toFixed(1)}</span>
                    </div>
                    <input
                      type="range" min="0.5" max="50" step="0.5"
                      value={height} onChange={(e) => setHeight(parseFloat(e.target.value))}
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
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="w-6 h-6 rounded-full shadow-inner" style={{ backgroundColor: color }} />
                    <span className="ml-3 text-[10px] font-mono text-white/60">{color.toUpperCase()}</span>
                  </div>

                  <select
                    value={textureType}
                    onChange={(e) => setTextureType(e.target.value as TextureType)}
                    className="p-3 bg-white/5 border border-white/10 rounded-2xl text-[11px] text-white/60 focus:ring-1 focus:ring-blue-500/50 outline-none cursor-pointer hover:bg-white/10 transition-all uppercase tracking-wider font-bold"
                  >
                    <option className="bg-neutral-900" value="noise">Noise</option>
                    <option className="bg-neutral-900" value="none">Solid</option>
                    <option className="bg-neutral-900" value="checkerboard">Grid</option>
                    <option className="bg-neutral-900" value="dots">Dots</option>
                    <option className="bg-neutral-900" value="stripes">Stripes</option>
                  </select>
                </div>
              </div>

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
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] block">Manual Override Axis</span>
                    <div className="space-y-3">
                      {[
                        { label: 'X', color: 'bg-red-500', val: rotationAxis.x, key: 'x' },
                        { label: 'Y', color: 'bg-green-500', val: rotationAxis.y, key: 'y' },
                        { label: 'Z', color: 'bg-blue-500', val: rotationAxis.z, key: 'z' }
                      ].map(axis => (
                        <div key={axis.key} className="flex items-center gap-4">
                          <span className={`text-[9px] font-black w-4 h-4 flex items-center justify-center rounded ${axis.color} text-black`}>{axis.label}</span>
                          <input
                            type="range" min="-1" max="1" step="0.1"
                            value={axis.val} onChange={(e) => setRotationAxis(p => ({ ...p, [axis.key]: parseFloat(e.target.value) }))}
                            className={`flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-current ${axis.color.replace('bg-', 'text-')}`}
                          />
                        </div>
                      ))}
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
