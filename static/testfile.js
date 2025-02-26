<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Forest Scene with House</title>
  <style>
    body { margin: 0; overflow: hidden; }
    canvas { display: block; }
  </style>
  <!-- Import Map -->
  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@0.153.0/build/three.module.js",
      "OrbitControls": "https://unpkg.com/three@0.153.0/examples/jsm/controls/OrbitControls.js"
    }
  }
  </script>
</head>
<body>
  <!-- Import Three.js and OrbitControls as modules -->
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'OrbitControls';

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa0d8f0); // Light blue sky

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(50, 50, 50);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.update();

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(-100, 100, -100);
    scene.add(dirLight);

    // Function to create a tree
    function createTree(x, z) {
      const tree = new THREE.Group();

      // Trunk
      const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.5, 5, 8);
      const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
      trunk.position.y = 2.5;
      tree.add(trunk);

      // Foliage
      const foliageGeometry = new THREE.ConeGeometry(2.5, 8, 8);
      const foliageMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
      const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
      foliage.position.y = 7;
      tree.add(foliage);

      // Position the tree
      tree.position.set(x, 0, z);
      scene.add(tree);
    }

    // Create multiple trees
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * 180 - 90;
      const z = Math.random() * 180 - 90;
      createTree(x, z);
    }

    // Create House
    const house = new THREE.Group();

    // House base
    const houseGeometry = new THREE.BoxGeometry(10, 6, 10);
    const houseMaterial = new THREE.MeshLambertMaterial({ color: 0xffe4c4 });
    const houseBase = new THREE.Mesh(houseGeometry, houseMaterial);
    houseBase.position.y = 3;
    house.add(houseBase);

    // Roof
    const roofGeometry = new THREE.ConeGeometry(7, 4, 4);
    const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x8B0000 });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 6;
    house.add(roof);

    // Door
    const doorGeometry = new THREE.BoxGeometry(2, 3, 0.1);
    const doorMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 });
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.set(0, 1.5, 5.05);
    house.add(door);

    // Windows
    const windowGeometry = new THREE.BoxGeometry(1.5, 1.5, 0.1);
    const windowMaterial = new THREE.MeshLambertMaterial({ color: 0xadd8e6 });
    const window1 = new THREE.Mesh(windowGeometry, windowMaterial);
    window1.position.set(-3, 3, 5.05);
    house.add(window1);

    const window2 = window1.clone();
    window2.position.set(3, 3, 5.05);
    house.add(window2);

    house.position.set(0, 0, 0);
    scene.add(house);

    // Animation
    function animate() {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }

    animate();

    // Handle window resize
    window.addEventListener('resize', function() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
  </script>
</body>
</html>