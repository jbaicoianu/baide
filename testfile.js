// main.js

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// Scene, Camera, Renderer
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfd1e5);

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(0, 10, 20);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Ground
const groundGeometry = new THREE.PlaneGeometry(200, 200);
const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Trees
function createTree(x, z) {
    const tree = new THREE.Group();

    // Trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.5, 5, 16);
    const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 2.5;
    tree.add(trunk);

    // Foliage
    const foliageGeometry = new THREE.ConeGeometry(2, 4, 16);
    const foliageMaterial = new THREE.MeshLambertMaterial({ color: 0x006400 });
    const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
    foliage.position.y = 6;
    tree.add(foliage);

    tree.position.set(x, 0, z);
    scene.add(tree);
}

// Generate random trees
for (let i = 0; i < 50; i++) {
    const x = Math.random() * 100 - 50;
    const z = Math.random() * 100 - 50;
    createTree(x, z);
}

// Little House
const house = new THREE.Group();

// Base
const baseGeometry = new THREE.BoxGeometry(4, 3, 4);
const baseMaterial = new THREE.MeshLambertMaterial({ color: 0xffe4c4 });
const base = new THREE.Mesh(baseGeometry, baseMaterial);
base.position.y = 1.5;
house.add(base);

// Roof
const roofGeometry = new THREE.ConeGeometry(3, 2, 4);
const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x8B0000 });
const roof = new THREE.Mesh(roofGeometry, roofMaterial);
roof.rotation.y = Math.PI / 4;
roof.position.y = 4;
house.add(roof);

// Door
const doorGeometry = new THREE.BoxGeometry(1, 1.8, 0.1);
const doorMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 });
const door = new THREE.Mesh(doorGeometry, doorMaterial);
door.position.set(0, 0.9, 2.05);
house.add(door);

// Windows
const windowGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.1);
const windowMaterial = new THREE.MeshLambertMaterial({ color: 0xadd8e6 });
const window1 = new THREE.Mesh(windowGeometry, windowMaterial);
window1.position.set(-1, 1.2, 2.05);
house.add(window1);

const window2 = window1.clone();
window2.position.x = 1;
house.add(window2);

// Position the house
house.position.set(0, 0, 0);
scene.add(house);

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 2); // Soft white light
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

// Handle window resize
window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();