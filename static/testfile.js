<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Winter Forest Scene with House, Snowman, and Squirrel</title>
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
    scene.background = new THREE.Color(0xb0c4de); // Light steel blue sky

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(50, 50, 50);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 5, 0);
    controls.update();

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff }); // White snow
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
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

      // Foliage with snow
      const foliageGeometry = new THREE.ConeGeometry(2.5, 8, 8);
      const foliageMaterial = new THREE.MeshLambertMaterial({ color: 0x006400 }); // Dark green
      const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
      foliage.position.y = 7;
      tree.add(foliage);

      // Snow on foliage
      const snowGeometry = new THREE.ConeGeometry(2.6, 0.5, 8);
      const snowMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
      for (let i = 0; i < 5; i++) {
        const snow = new THREE.Mesh(snowGeometry, snowMaterial);
        snow.position.set(
          (Math.random() - 0.5) * 3,
          7 + Math.random() * 2,
          (Math.random() - 0.5) * 3
        );
        snow.rotation.y = Math.random() * Math.PI;
        tree.add(snow);
      }

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
    const houseMaterial = new THREE.MeshLambertMaterial({ color: 0xfff5ee }); // Seashell color
    const houseBase = new THREE.Mesh(houseGeometry, houseMaterial);
    houseBase.position.y = 3;
    house.add(houseBase);

    // Roof with snow
    const roofGeometry = new THREE.ConeGeometry(7, 4, 4);
    const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x8B0000 }); // Dark red
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 6;
    house.add(roof);

    // Snow on roof
    const snowRoofGeometry = new THREE.ConeGeometry(7.2, 0.5, 4);
    const snowRoofMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const snowRoof = new THREE.Mesh(snowRoofGeometry, snowRoofMaterial);
    snowRoof.rotation.y = Math.PI / 4;
    snowRoof.position.y = 6.25;
    house.add(snowRoof);

    // Door
    const doorGeometry = new THREE.BoxGeometry(2, 3, 0.1);
    const doorMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 });
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.set(0, 1.5, 5.05);
    house.add(door);

    // Windows with ice
    const windowGeometry = new THREE.BoxGeometry(1.5, 1.5, 0.1);
    const windowMaterial = new THREE.MeshLambertMaterial({ color: 0xd3d3d3 }); // Light gray for ice
    const window1 = new THREE.Mesh(windowGeometry, windowMaterial);
    window1.position.set(-3, 3, 5.05);
    house.add(window1);

    const window2 = window1.clone();
    window2.position.set(3, 3, 5.05);
    house.add(window2);

    house.position.set(0, 0, 0);
    scene.add(house);

    // Function to create a snowman
    function createSnowman(x, z) {
      const snowman = new THREE.Group();

      // Bottom sphere
      const bottomGeometry = new THREE.SphereGeometry(2, 32, 32);
      const bottomMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const bottom = new THREE.Mesh(bottomGeometry, bottomMaterial);
      bottom.position.y = 2;
      snowman.add(bottom);

      // Middle sphere
      const middleGeometry = new THREE.SphereGeometry(1.5, 32, 32);
      const middle = new THREE.Mesh(middleGeometry, bottomMaterial);
      middle.position.y = 4;
      snowman.add(middle);

      // Head sphere
      const headGeometry = new THREE.SphereGeometry(1, 32, 32);
      const head = new THREE.Mesh(headGeometry, bottomMaterial);
      head.position.y = 5.5;
      snowman.add(head);

      // Eyes
      const eyeGeometry = new THREE.SphereGeometry(0.1, 8, 8);
      const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
      const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      leftEye.position.set(-0.3, 5.6, 0.9);
      snowman.add(leftEye);

      const rightEye = leftEye.clone();
      rightEye.position.set(0.3, 5.6, 0.9);
      snowman.add(rightEye);

      // Nose (carrot)
      const noseGeometry = new THREE.ConeGeometry(0.1, 0.5, 8);
      const noseMaterial = new THREE.MeshLambertMaterial({ color: 0xffa500 });
      const nose = new THREE.Mesh(noseGeometry, noseMaterial);
      nose.position.set(0, 5.5, 1);
      nose.rotation.x = Math.PI / 2;
      snowman.add(nose);

      // Buttons
      for (let i = 0; i < 3; i++) {
        const button = new THREE.Mesh(eyeGeometry, eyeMaterial);
        button.position.set(0, 4.5 - i * 0.7, 1.4);
        snowman.add(button);
      }

      // Arms
      const armMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
      const armGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8);
      
      const leftArm = new THREE.Mesh(armGeometry, armMaterial);
      leftArm.position.set(-1.5, 4.5, 0.5);
      leftArm.rotation.z = Math.PI / 4;
      snowman.add(leftArm);

      const rightArm = leftArm.clone();
      rightArm.position.set(1.5, 4.5, 0.5);
      rightArm.rotation.z = -Math.PI / 4;
      snowman.add(rightArm);

      // Position the snowman
      snowman.position.set(x, 0, z);
      scene.add(snowman);
    }

    // Create a snowman in front of the house
    createSnowman(0, 12);

    // Function to create a squirrel
    function createSquirrel(x, z) {
      const squirrel = new THREE.Group();

      // Body
      const bodyGeometry = new THREE.SphereGeometry(0.5, 16, 16);
      const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Saddle brown
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
      body.position.y = 1;
      squirrel.add(body);

      // Head
      const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
      const head = new THREE.Mesh(headGeometry, bodyMaterial);
      head.position.set(0.7, 1.2, 0);
      squirrel.add(head);

      // Ears
      const earGeometry = new THREE.SphereGeometry(0.1, 8, 8);
      const ear = new THREE.Mesh(earGeometry, bodyMaterial);
      ear.position.set(0.85, 1.4, 0.1);
      squirrel.add(ear);

      const ear2 = ear.clone();
      ear2.position.set(0.85, 1.4, -0.1);
      squirrel.add(ear2);

      // Tail
      const tailGeometry = new THREE.TorusGeometry(0.3, 0.05, 8, 16);
      const tailMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
      const tail = new THREE.Mesh(tailGeometry, tailMaterial);
      tail.rotation.x = Math.PI / 2;
      tail.position.set(-0.3, 1, 0);
      squirrel.add(tail);

      // Position the squirrel
      squirrel.position.set(x, 0, z);
      scene.add(squirrel);
    }

    // Create a squirrel on a tree
    createSquirrel(-20, -20);

    // Function to animate snowflakes
    const snowflakes = [];
    const snowGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const snowMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });

    function createSnowflakes() {
      for (let i = 0; i < 1000; i++) {
        const snowflake = new THREE.Mesh(snowGeometry, snowMaterial);
        snowflake.position.set(
          Math.random() * 200 - 100,
          Math.random() * 100,
          Math.random() * 200 - 100
        );
        snowflake.velocity = Math.random() * 0.5;
        scene.add(snowflake);
        snowflakes.push(snowflake);
      }
    }

    createSnowflakes();

    // Animation
    function animate() {
      requestAnimationFrame(animate);

      // Animate snowflakes
      snowflakes.forEach(flake => {
        flake.position.y -= flake.velocity;
        if (flake.position.y < 0) {
          flake.position.y = 100;
          flake.position.x = Math.random() * 200 - 100;
          flake.position.z = Math.random() * 200 - 100;
        }
      });

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