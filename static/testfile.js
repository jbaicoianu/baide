<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Winter Forest Scene with House, Snowman, Squirrel, and Turret</title>
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

    // Create a container object to hold all Three.js objects
    const THREEObjects = {};

    // Scene
    THREEObjects.scene = new THREE.Scene();
    THREEObjects.scene.background = new THREE.Color(0xb0c4de); // Light steel blue sky

    // Camera
    THREEObjects.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    THREEObjects.camera.position.set(50, 50, 50);

    // Renderer
    THREEObjects.renderer = new THREE.WebGLRenderer({ antialias: true });
    THREEObjects.renderer.setSize(window.innerWidth, window.innerHeight);
    THREEObjects.renderer.shadowMap.enabled = true; // Enable shadow maps
    THREEObjects.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
    document.body.appendChild(THREEObjects.renderer.domElement);

    // Controls
    THREEObjects.controls = new OrbitControls(THREEObjects.camera, THREEObjects.renderer.domElement);
    THREEObjects.controls.target.set(0, 5, 0);
    THREEObjects.controls.update();

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }); // Light gray to better show shadows
    THREEObjects.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    THREEObjects.ground.rotation.x = -Math.PI / 2;
    THREEObjects.ground.receiveShadow = true; // Ground receives shadows
    THREEObjects.scene.add(THREEObjects.ground);

    // Hemisphere Light
    THREEObjects.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0); // Reduced intensity to balance with directional light
    THREEObjects.hemiLight.position.set(0, 200, 0);
    THREEObjects.scene.add(THREEObjects.hemiLight);

    // Directional Light
    THREEObjects.dirLight = new THREE.DirectionalLight(0xffffff, 1);
    THREEObjects.dirLight.position.set(100, 150, 100); // Positioned at an angle to cast visible shadows
    THREEObjects.dirLight.castShadow = true; // Directional light casts shadows

    // Configure shadow properties for the directional light
    THREEObjects.dirLight.shadow.mapSize.width = 4096; // Increased shadow map size for higher quality
    THREEObjects.dirLight.shadow.mapSize.height = 4096;
    THREEObjects.dirLight.shadow.camera.near = 0.5;
    THREEObjects.dirLight.shadow.camera.far = 500;

    // Expand the shadow camera to cover the entire scene
    const shadowCamSize = 150;
    THREEObjects.dirLight.shadow.camera.left = -shadowCamSize;
    THREEObjects.dirLight.shadow.camera.right = shadowCamSize;
    THREEObjects.dirLight.shadow.camera.top = shadowCamSize;
    THREEObjects.dirLight.shadow.camera.bottom = -shadowCamSize;

    // Optional: Add a bias to reduce shadow artifacts
    THREEObjects.dirLight.shadow.bias = -0.0001;

    THREEObjects.scene.add(THREEObjects.dirLight);

    // Add LightHelper and ShadowCameraHelper for debugging
    THREEObjects.dirLightHelper = new THREE.DirectionalLightHelper(THREEObjects.dirLight, 10, 0xff0000);
    THREEObjects.scene.add(THREEObjects.dirLightHelper);

    THREEObjects.shadowCameraHelper = new THREE.CameraHelper(THREEObjects.dirLight.shadow.camera);
    THREEObjects.scene.add(THREEObjects.shadowCameraHelper);

    // Function to create a tree
    function createTree(x, z) {
      const tree = new THREE.Group();

      // Trunk
      const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.5, 5, 8);
      const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
      trunk.position.y = 2.5;
      trunk.castShadow = true; // Trunk casts shadow
      tree.add(trunk);

      // Foliage with snow
      const foliageGeometry = new THREE.ConeGeometry(2.5, 8, 8);
      const foliageMaterial = new THREE.MeshLambertMaterial({ color: 0x006400 }); // Dark green
      const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
      foliage.position.y = 7;
      foliage.castShadow = true; // Foliage casts shadow
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
        snow.castShadow = true; // Snow cones cast shadows
        tree.add(snow);
      }

      // Position the tree
      tree.position.set(x, 0, z);
      THREEObjects.scene.add(tree);
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
    houseBase.castShadow = true; // House base casts shadow
    houseBase.receiveShadow = true; // House base receives shadow
    house.add(houseBase);

    // Roof with snow
    const roofGeometry = new THREE.ConeGeometry(7, 4, 4);
    const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x8B0000 }); // Dark red
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 6;
    roof.castShadow = true; // Roof casts shadow
    house.add(roof);

    // Snow on roof
    const snowRoofGeometry = new THREE.ConeGeometry(7.2, 0.5, 4);
    const snowRoofMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const snowRoof = new THREE.Mesh(snowRoofGeometry, snowRoofMaterial);
    snowRoof.rotation.y = Math.PI / 4;
    snowRoof.position.y = 6.25;
    snowRoof.castShadow = true; // Snow on roof casts shadow
    house.add(snowRoof);

    // Door
    const doorGeometry = new THREE.BoxGeometry(2, 3, 0.1);
    const doorMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 });
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.set(0, 1.5, 5.05);
    door.castShadow = true; // Door casts shadow
    house.add(door);

    // Windows with ice
    const windowGeometry = new THREE.BoxGeometry(1.5, 1.5, 0.1);
    const windowMaterial = new THREE.MeshLambertMaterial({ color: 0xd3d3d3 }); // Light gray for ice
    const window1 = new THREE.Mesh(windowGeometry, windowMaterial);
    window1.position.set(-3, 3, 5.05);
    window1.receiveShadow = true; // Windows receive shadow
    house.add(window1);

    const window2 = window1.clone();
    window2.position.set(3, 3, 5.05);
    house.add(window2);

    house.position.set(0, 0, 0);
    THREEObjects.scene.add(house);

    // Function to create a snowman
    function createSnowman(x, z) {
      const snowman = new THREE.Group();

      // Bottom sphere
      const bottomGeometry = new THREE.SphereGeometry(2, 32, 32);
      const bottomMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const bottom = new THREE.Mesh(bottomGeometry, bottomMaterial);
      bottom.position.y = 2;
      bottom.castShadow = true; // Bottom sphere casts shadow
      snowman.add(bottom);

      // Middle sphere
      const middleGeometry = new THREE.SphereGeometry(1.5, 32, 32);
      const middle = new THREE.Mesh(middleGeometry, bottomMaterial);
      middle.position.y = 4;
      middle.castShadow = true; // Middle sphere casts shadow
      snowman.add(middle);

      // Head sphere
      const headGeometry = new THREE.SphereGeometry(1, 32, 32);
      const head = new THREE.Mesh(headGeometry, bottomMaterial);
      head.position.y = 5.5;
      head.castShadow = true; // Head casts shadow
      snowman.add(head);

      // Eyes
      const eyeGeometry = new THREE.SphereGeometry(0.1, 8, 8);
      const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
      const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      leftEye.position.set(-0.3, 5.6, 0.9);
      leftEye.castShadow = true; // Eyes cast shadow
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
      nose.castShadow = true; // Nose casts shadow
      snowman.add(nose);

      // Buttons
      for (let i = 0; i < 3; i++) {
        const button = new THREE.Mesh(eyeGeometry, eyeMaterial);
        button.position.set(0, 4.5 - i * 0.7, 1.4);
        button.castShadow = true; // Buttons cast shadow
        snowman.add(button);
      }

      // Arms
      const armMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
      const armGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8);
      
      const leftArm = new THREE.Mesh(armGeometry, armMaterial);
      leftArm.position.set(-1.5, 4.5, 0.5);
      leftArm.rotation.z = Math.PI / 4;
      leftArm.castShadow = true; // Arms cast shadow
      snowman.add(leftArm);

      const rightArm = leftArm.clone();
      rightArm.position.set(1.5, 4.5, 0.5);
      rightArm.rotation.z = -Math.PI / 4;
      snowman.add(rightArm);

      // Position the snowman
      snowman.position.set(x, 0, z);
      THREEObjects.scene.add(snowman);
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
      body.castShadow = true; // Body casts shadow
      squirrel.add(body);

      // Head
      const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
      const head = new THREE.Mesh(headGeometry, bodyMaterial);
      head.position.set(0.7, 1.2, 0);
      head.castShadow = true; // Head casts shadow
      squirrel.add(head);

      // Ears
      const earGeometry = new THREE.SphereGeometry(0.1, 8, 8);
      const ear = new THREE.Mesh(earGeometry, bodyMaterial);
      ear.position.set(0.85, 1.4, 0.1);
      ear.castShadow = true; // Ears cast shadow
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
      tail.castShadow = true; // Tail casts shadow
      squirrel.add(tail);

      // Position the squirrel
      squirrel.position.set(x, 0, z);
      THREEObjects.scene.add(squirrel);
    }

    // Create a squirrel on a tree
    createSquirrel(-20, -20);

    // Function to animate snowflakes
    THREEObjects.snowflakes = [];
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
        snowflake.castShadow = false; // For performance, snowflakes do not cast shadows
        snowflake.receiveShadow = false; // Snowflakes do not receive shadows
        THREEObjects.scene.add(snowflake);
        THREEObjects.snowflakes.push(snowflake);
      }
    }

    createSnowflakes();

    // Function to create a turret
    const turret = new THREE.Group();

    // Base of the turret
    const turretBaseGeometry = new THREE.CylinderGeometry(1.5, 1.5, 1, 32);
    const turretBaseMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const turretBase = new THREE.Mesh(turretBaseGeometry, turretBaseMaterial);
    turretBase.castShadow = true; // Turret base casts shadow
    turretBase.receiveShadow = true; // Turret base receives shadow
    turret.add(turretBase);

    // Rotating part of the turret
    const turretTopGeometry = new THREE.BoxGeometry(2, 0.5, 2);
    const turretTopMaterial = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const turretTop = new THREE.Mesh(turretTopGeometry, turretTopMaterial);
    turretTop.position.y = 1;
    turretTop.castShadow = true; // Turret top casts shadow
    turretTop.receiveShadow = true; // Turret top receives shadow
    turret.add(turretTop);

    // Cannon of the turret
    const cannonGeometry = new THREE.BoxGeometry(0.5, 0.5, 3);
    const cannonMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
    const cannon = new THREE.Mesh(cannonGeometry, cannonMaterial);
    cannon.position.set(0, 0.75, 1.5);
    cannon.rotation.x = Math.PI / 6;
    cannon.castShadow = true; // Cannon casts shadow
    turretTop.add(cannon);

    // Position the turret near the house
    turret.position.set(-15, 0, -15);
    THREEObjects.scene.add(turret);

    // Add turret to the global object
    THREEObjects.turret = turret;

    // Variables for turret control
    const turretRotationSpeed = 0.02;
    const cannonElevationSpeed = 0.02;
    let cannonElevation = 0;
    const maxElevation = Math.PI / 2; // Up to vertical
    const minElevation = -Math.PI / 6; // Prevent aiming too far down

    // Event listeners for user input
    const keysPressed = {};
    window.addEventListener('keydown', (event) => {
      keysPressed[event.key.toLowerCase()] = true;

      // Shoot snowball on spacebar
      if (event.key === ' ') {
        shootSnowball();
      }
    });

    window.addEventListener('keyup', (event) => {
      keysPressed[event.key.toLowerCase()] = false;
    });

    // Function to shoot a snowball
    const snowballs = [];
    const snowballGeometry = new THREE.SphereGeometry(0.2, 8, 8);
    const snowballMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc }); // Slightly grayish

    function shootSnowball() {
      const snowball = new THREE.Mesh(snowballGeometry, snowballMaterial);
      // Position the snowball at the end of the cannon
      const cannonWorldPosition = new THREE.Vector3();
      cannon.getWorldPosition(cannonWorldPosition);
      snowball.position.copy(cannonWorldPosition);

      // Set the velocity based on the cannon's direction
      const cannonDirection = new THREE.Vector3();
      cannon.getWorldDirection(cannonDirection);
      const speed = 1;
      snowball.velocity = cannonDirection.multiplyScalar(speed);

      // Initialize trail
      snowball.trail = new THREE.BufferGeometry();
      const maxTrailPoints = 20; // Limit trail to last 20 points
      const trailPoints = new Float32Array(maxTrailPoints * 3); // x, y, z for each point
      snowball.trail.setAttribute('position', new THREE.BufferAttribute(trailPoints, 3));
      snowball.trailDraw = new THREE.Line(
        snowball.trail,
        new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.6 })
      );
      snowball.trailPoints = [];
      THREEObjects.scene.add(snowball.trailDraw);

      snowball.castShadow = true; // Snowball casts shadow
      snowball.receiveShadow = true; // Snowball receives shadow
      THREEObjects.scene.add(snowball);
      snowballs.push(snowball);
    }

    // Function to update turret based on user input
    function updateTurret() {
      // Rotate turret left/right
      if (keysPressed['a']) {
        turret.rotation.y += turretRotationSpeed;
      }
      if (keysPressed['d']) {
        turret.rotation.y -= turretRotationSpeed;
      }

      // Elevate cannon up/down
      if (keysPressed['w']) {
        if (cannonElevation < maxElevation) {
          cannon.rotation.x -= cannonElevationSpeed;
          cannonElevation += cannonElevationSpeed;
        }
      }
      if (keysPressed['s']) {
        if (cannonElevation > minElevation) {
          cannon.rotation.x += cannonElevationSpeed;
          cannonElevation -= cannonElevationSpeed;
        }
      }
    }

    // Function to update snowballs
    function updateSnowballs() {
      for (let i = snowballs.length - 1; i >= 0; i--) {
        const snowball = snowballs[i];
        // Apply gravity
        snowball.velocity.add(new THREE.Vector3(0, -0.01, 0)); // gravity acceleration
        // Update position
        snowball.position.add(snowball.velocity);

        // Update trail
        snowball.trailPoints.push(snowball.position.clone());
        if (snowball.trailPoints.length > 20) { // Keep only last 20 points
          snowball.trailPoints.shift();
        }

        // Update trail geometry
        const positions = snowball.trail.attributes.position.array;
        for (let j = 0; j < snowball.trailPoints.length; j++) {
          positions[j * 3] = snowball.trailPoints[j].x;
          positions[j * 3 + 1] = snowball.trailPoints[j].y;
          positions[j * 3 + 2] = snowball.trailPoints[j].z;
        }
        snowball.trail.setDrawRange(0, snowball.trailPoints.length);
        snowball.trail.attributes.position.needsUpdate = true;

        // Remove snowball if it hits the ground or goes too far
        if (snowball.position.y <= 0 || snowball.position.length() > 200) {
          THREEObjects.scene.remove(snowball.trailDraw);
          THREEObjects.scene.remove(snowball);
          snowballs.splice(i, 1);
        }
      }
    }

    // Animation loop
    function animate() {
      requestAnimationFrame(animate);

      // Animate snowflakes
      THREEObjects.snowflakes.forEach(flake => {
        flake.position.y -= flake.velocity;
        if (flake.position.y < 0) {
          flake.position.y = 100;
          flake.position.x = Math.random() * 200 - 100;
          flake.position.z = Math.random() * 200 - 100;
        }
      });

      // Update turret based on input
      updateTurret();

      // Update snowballs with physics and trails
      updateSnowballs();

      THREEObjects.renderer.render(THREEObjects.scene, THREEObjects.camera);
    }

    animate();

    // Handle window resize
    window.addEventListener('resize', function() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      THREEObjects.renderer.setSize(width, height);
      THREEObjects.camera.aspect = width / height;
      THREEObjects.camera.updateProjectionMatrix();
    });

    // Make all Three.js objects accessible globally
    window.scene = THREEObjects;
  </script>
</body>
</html>