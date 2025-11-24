import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Settings, Box, Rotate3d, Palette, Layers, X } from 'lucide-react';

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
      ctxChecker.fillStyle = (x + y) % 2 === 0 ? 'white' : 'black';
      ctxChecker.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }
  textures.checkerboard = new THREE.CanvasTexture(checkerboardCanvas);

  // Dots
  const dotsCanvas = document.createElement('canvas');
  dotsCanvas.width = dotsCanvas.height = textureSize;
  const ctxDots = dotsCanvas.getContext('2d')!;
  ctxDots.fillStyle = 'white';
  ctxDots.fillRect(0, 0, textureSize, textureSize);
  ctxDots.fillStyle = 'black';
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
    ctxStripes.fillStyle = y % (tileSize * 2) === 0 ? 'white' : 'black';
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);

  // --- 3D State ---
  const [shapeType, setShapeType] = useState<ShapeType>('sphere');
  const [radius, setRadius] = useState(3);
  const [height, setHeight] = useState(3);
  const [enableSegments, setEnableSegments] = useState(false);
  const [segments, setSegments] = useState(32);
  const [color, setColor] = useState('#3b82f6');
  const [textureType, setTextureType] = useState<TextureType>('noise');
  const [distance, setDistance] = useState(10);
  const [rotationSpeed, setRotationSpeed] = useState(0.01);
  const [rotationAxis, setRotationAxis] = useState({ x: 0, y: 1, z: 0 });

  // --- Refs ---
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const texturesRef = useRef<Record<string, THREE.Texture> | null>(null);
  const frameIdRef = useRef<number>(0);

  // Refs for animation loop access
  const rotationSpeedRef = useRef(rotationSpeed);
  const rotationAxisRef = useRef(rotationAxis);

  // Sync refs with state
  useEffect(() => {
    rotationSpeedRef.current = rotationSpeed;
    rotationAxisRef.current = rotationAxis;
  }, [rotationSpeed, rotationAxis]);

  // --- Initialization --- //
  useEffect(() => {
    if (!mountRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = distance;
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0); // Transparent background for overlay feel
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);
    const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
    backLight.position.set(-5, -5, -5);
    scene.add(backLight);

    // Textures
    texturesRef.current = createTextures();

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
      if (meshRef.current && rendererRef.current && sceneRef.current && cameraRef.current) {
        const rSpeed = rotationSpeedRef.current;
        const rAxis = rotationAxisRef.current;
        
        const axis = new THREE.Vector3(rAxis.x, rAxis.y, rAxis.z).normalize();
        if (axis.lengthSq() === 0) axis.set(0, 1, 0);
        
        meshRef.current.rotateOnAxis(axis, rSpeed);
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameIdRef.current);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // --- Update Shape Effect --- //
  useEffect(() => {
    if (!sceneRef.current || !texturesRef.current) return;

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
      shininess: 150,
      specular: 0x444444,
      side: THREE.DoubleSide,
      map: textureType !== 'none' ? texturesRef.current[textureType] : null
    };
    const material = new THREE.MeshPhongMaterial(materialProps);

    // Mesh
    const mesh = new THREE.Mesh(geometry, material);
    meshRef.current = mesh;
    sceneRef.current.add(mesh);

  }, [shapeType, radius, height, segments, enableSegments, color, textureType]);

  // --- Update Camera Distance --- //
  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.position.z = distance;
    }
  }, [distance]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-gray-100 font-sans">
      
      {/* Full Screen 3D Viewport */}
      <div ref={mountRef} className="absolute inset-0 z-0 bg-gradient-to-br from-gray-100 to-gray-300" />

      {/* Floating Settings Panel */}
      <div 
        className={`absolute top-4 left-4 z-10 transition-all duration-300 ease-in-out ${
          isSettingsOpen 
            ? 'w-80 bg-white/30 backdrop-blur-xl shadow-2xl rounded-xl border border-white/40'
            : 'w-12 h-12 bg-white/50 backdrop-blur-md shadow-lg rounded-full hover:scale-110 cursor-pointer border border-white/40'
        }`}
      >
        {/* Collapsed State Trigger */}
        {!isSettingsOpen && (
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="w-full h-full flex items-center justify-center text-gray-700 hover:text-blue-600"
            title="Open Settings"
          >
            <Settings className="w-6 h-6" />
          </button>
        )}

        {/* Expanded State Content */}
        {isSettingsOpen && (
          <div className="flex flex-col h-full max-h-[calc(100vh-2rem)]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/30">
              <div className="flex items-center gap-2">
                <Box className="w-5 h-5 text-blue-600" />
                <h1 className="font-bold text-gray-800">Generator</h1>
              </div>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 hover:bg-white/40 rounded-full text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Controls */}
            <div className="p-5 overflow-y-auto custom-scrollbar space-y-6">
              
              {/* Shape Type */}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Layers className="w-3 h-3" /> Shape
                </label>
                <select 
                  value={shapeType} 
                  onChange={(e) => setShapeType(e.target.value as ShapeType)}
                  className="w-full p-2 bg-white/50 border border-white/40 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm backdrop-blur-sm"
                >
                  <option value="sphere">Sphere</option>
                  <option value="cylinder">Cylinder</option>
                  <option value="cube">Cube</option>
                  <option value="cone">Cone</option>
                  <option value="torus">Torus</option>
                  <option value="pyramid">Pyramid</option>
                  <option value="prism">Triangular Prism</option>
                  <option value="pentagonalPrism">Pentagonal Prism</option>
                  <option value="hexagonalPrism">Hexagonal Prism</option>
                  <option value="octagonalPrism">Octagonal Prism</option>
                  <option value="tetrahedron">Tetrahedron</option>
                  <option value="dodecahedron">Dodecahedron</option>
                  <option value="icosahedron">Icosahedron</option>
                </select>
              </div>

              {/* Dimensions */}
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-xs font-medium text-gray-700">Radius</label>
                    <span className="text-xs text-gray-600">{radius}</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="5" step="0.1" 
                    value={radius} onChange={(e) => setRadius(parseFloat(e.target.value))} 
                    className="w-full h-2 bg-white/50 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-xs font-medium text-gray-700">Height</label>
                    <span className="text-xs text-gray-600">{height}</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="5" step="0.1" 
                    value={height} onChange={(e) => setHeight(parseFloat(e.target.value))} 
                    className="w-full h-2 bg-white/50 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
              </div>

              {/* Segments */}
              <div className="p-3 bg-white/40 rounded-lg border border-white/30">
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={enableSegments} 
                    onChange={(e) => setEnableSegments(e.target.checked)} 
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Custom Segments</span>
                </label>
                {enableSegments && (
                  <div className="mt-2">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-gray-600">Count</span>
                      <span className="text-xs text-gray-600">{segments}</span>
                    </div>
                    <input 
                      type="range" min="3" max="64" 
                      value={segments} onChange={(e) => setSegments(parseInt(e.target.value))} 
                      className="w-full h-1 bg-white/50 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                )}
              </div>

              {/* Appearance */}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Palette className="w-3 h-3" /> Appearance
                </label>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <input 
                      type="color" 
                      value={color} 
                      onChange={(e) => setColor(e.target.value)} 
                      className="h-8 w-12 p-0 border-0 rounded cursor-pointer shadow-sm"
                    />
                    <span className="text-xs font-mono text-gray-600 bg-white/50 px-2 py-1 rounded border border-white/30">{color}</span>
                  </div>
                  
                  <select 
                    value={textureType} 
                    onChange={(e) => setTextureType(e.target.value as TextureType)}
                    className="w-full p-2 bg-white/50 border border-white/40 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none backdrop-blur-sm"
                  >
                    <option value="noise">Noise Texture</option>
                    <option value="none">Solid Color</option>
                    <option value="checkerboard">Checkerboard</option>
                    <option value="dots">Polka Dots</option>
                    <option value="stripes">Stripes</option>
                  </select>
                </div>
              </div>

              {/* Camera & Rotation */}
              <div className="pt-4 border-t border-white/30">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Rotate3d className="w-3 h-3" /> View & Motion
                </label>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="text-xs font-medium text-gray-700">Distance</label>
                      <span className="text-xs text-gray-600">{distance}</span>
                    </div>
                    <input 
                      type="range" min="3" max="20" step="0.1" 
                      value={distance} onChange={(e) => setDistance(parseFloat(e.target.value))} 
                      className="w-full h-2 bg-white/50 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="text-xs font-medium text-gray-700">Speed</label>
                      <span className="text-xs text-gray-600">{rotationSpeed}</span>
                    </div>
                    <input 
                      type="range" min="0" max="0.1" step="0.001" 
                      value={rotationSpeed} onChange={(e) => setRotationSpeed(parseFloat(e.target.value))} 
                      className="w-full h-2 bg-white/50 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>

                  <div className="bg-white/40 p-3 rounded-lg border border-white/30">
                    <span className="text-xs font-medium text-gray-600 block mb-2">Rotation Axis</span>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold w-3 text-red-500">X</span>
                        <input 
                          type="range" min="-1" max="1" step="0.1" 
                          value={rotationAxis.x} onChange={(e) => setRotationAxis(p => ({...p, x: parseFloat(e.target.value)}))} 
                          className="flex-1 h-1 bg-white/50 rounded-lg appearance-none cursor-pointer accent-red-500"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold w-3 text-green-500">Y</span>
                        <input 
                          type="range" min="-1" max="1" step="0.1" 
                          value={rotationAxis.y} onChange={(e) => setRotationAxis(p => ({...p, y: parseFloat(e.target.value)}))} 
                          className="flex-1 h-1 bg-white/50 rounded-lg appearance-none cursor-pointer accent-green-500"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold w-3 text-blue-500">Z</span>
                        <input 
                          type="range" min="-1" max="1" step="0.1" 
                          value={rotationAxis.z} onChange={(e) => setRotationAxis(p => ({...p, z: parseFloat(e.target.value)}))} 
                          className="flex-1 h-1 bg-white/50 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Info Badge */}
      <div className="absolute bottom-4 right-4 bg-white/30 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium text-gray-700 shadow-sm pointer-events-none select-none border border-white/20">
        React + Three.js
      </div>
    </div>
  );
}