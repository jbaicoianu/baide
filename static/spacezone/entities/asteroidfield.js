room.registerElement('spacezone-asteroidfield', {
  numasteroids: 10,
  uniqueshapes: 10, // Added uniqueshapes attribute with default value of 10
  uniqueAsteroidAssets: [], // Array to hold unique asteroid asset IDs
  offsetX: 500, // Configurable X offset range for asteroid placement
  offsetY: 500, // Configurable Y offset range for asteroid placement

  create() {
    // Initialization code for spacezone-asteroidfield
    this.asteroids = [];
    
    // Generate unique asteroid shapes
    for (let shapeIndex = 0; shapeIndex < this.uniqueshapes; shapeIndex++) {
      // Initialize all unique asteroids at (0, 0, -9999)
      const asteroidPos = new THREE.Vector3(0, 0, -9999);

      // Set fixed size for unique shapes
      const size = 1; // Fixed size

      // Create DodecahedronGeometry with fixed size
      const geometry = new THREE.DodecahedronGeometry(size);

      // Modify geometry vertices
      const pos = geometry.attributes.position;
      const vertices = pos.array;
      const bypass = [];
      for (let j = 0; j < vertices.length / pos.itemSize; j++) {
          if (bypass.indexOf(j) > -1) {
              continue;
          }

          const currX = pos.getX(j);
          const currY = pos.getY(j);
          const currZ = pos.getZ(j);
          const x = currX + (0 - Math.random() * .8);
          const y = currY + (0 - Math.random() * .8);
          const z = currZ + (0 - Math.random() * .8);

          pos.setX(j, x);
          pos.setY(j, y);
          pos.setZ(j, z);

          for (let k = 0; k < vertices.length; k += 3) {
              if (
                  vertices[k] === currX &&
                  vertices[k + 1] === currY &&
                  vertices[k + 2] === currZ
              ) {
                  geometry.attributes.position.array[
                      k
                  ] = x;
                  geometry.attributes.position.array[
                      k + 1
                  ] = y;
                  geometry.attributes.position.array[
                      k + 2
                  ] = z;
                  bypass.push(k / 3);
              }
          }
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals(); // Recalculate normals after vertex manipulation

      // Create material for the asteroid without random color
      const material = new THREE.MeshStandardMaterial({ color: 0x808080, transparent: true, opacity: 1 }); // Fixed gray color

      // Create mesh with geometry and material
      const asteroidMesh = new THREE.Mesh(geometry, material);

      // Generate a random unit vector for rotation axis
      const rotateAxis = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      ).normalize();

      // Clone the asteroid mesh for high-detail version
      const highDetailMesh = asteroidMesh.clone();
      highDetailMesh.geometry = THREE.LoopSubdivision.modify(asteroidMesh.geometry, 1, { split: true, uvSmooth: true });
      highDetailMesh.geometry.computeVertexNormals(); // Recalculate normals after subdivision

      // Scale our low-res mesh down a bit to account for the size reduction caused by subdivision 
      asteroidMesh.scale.set(.8, .8, .8);

      // Load the asteroid mesh as a new asset
      this.loadNewAsset('object', {
        id: `asteroid-shape-${shapeIndex}`,
        object: asteroidMesh
      });

      // Load the high-detail asteroid mesh as a new asset
      this.loadNewAsset('object', {
        id: `asteroid-shape-${shapeIndex}-high`,
        object: highDetailMesh
      });

      // Store unique asteroid asset IDs for reference
      this.uniqueAsteroidAssets.push({
        high: `asteroid-shape-${shapeIndex}-high`,
        low: `asteroid-shape-${shapeIndex}`
      });
    }

    // Listen for 'race_start' event to initialize asteroids
    this.parent.addEventListener('race_start', () => {
      this.initAsteroids();
    });
  },
  initAsteroids() {
    const level = this.parent;

    if (!level || !level.getPositionAtTime) {
      console.warn('spacezone-level element with getPositionAtTime method not found.');
      return;
    }

    if (this.asteroids.length > 0) {
      // Reset positions of existing asteroids
      for (let asteroid of this.asteroids) {
        asteroid.pos = new THREE.Vector3(0, 0, -9999);
        asteroid.collidable = false; // Ensure collidable is false initially
        asteroid.collision_id = null; // Set collision_id to null when not collidable
      }
    } else {
      // Clear existing asteroids if any
      for (let asteroid of this.asteroids) {
        this.removeChild(asteroid);
      }
      this.asteroids = [];

      for (let i = 0; i < this.numasteroids; i++) {
        // Randomly select a unique shape index
        const shapeIndex = Math.floor(Math.random() * this.uniqueshapes);
        const selectedShape = this.uniqueAsteroidAssets[shapeIndex];

        // Generate a random color ensuring minimum brightness and using brown shades
        let colorHex;
        // Define hue range for brown (20-40 degrees)
        const hue = 20 + Math.random() * 15; // 20-35 degrees
        const saturation = Math.random() * 0.6; // 0-0.6
        const lightness = 0.1 + Math.random() * 0.4; // 0.1-0.4

        const color = new THREE.Color();
        color.setHSL(hue / 360, saturation, lightness);
        colorHex = `#${color.getHexString()}`;

        const asteroid = this.createObject('object', {
          id: selectedShape.high, // Use high-detail mesh as ID
          object: selectedShape.high, // Use high-detail mesh
          collision_id: selectedShape.low, // Use low-detail mesh for collisions
          collision_scale: V(0.1),
          col: colorHex, // Set a random color with constraints
          normalmap_id: "asteroid-normal", // Added normalmap_id
          normal_scale: 4,
          texture_repeat: V(3),
          
          rotate_deg_per_sec: 0, // Disabled rotation by setting to 0
          // rotate_axis: selectedShape.rotateAxis || new THREE.Vector3(1, 0, 0), // Removed rotation axis initialization
          pickable: false,
          opacity: 1, // Initialize opacity to 1
          collidable: true, // Initialize collidable to true
          emissive: 'black', // Initialize emissive to black
        }); 
        asteroid.pos = new THREE.Vector3(0, 0, -9999);

        this.asteroids.push(asteroid);
        this.appendChild(asteroid);
      }

      // Initial repositioning of asteroids
      // Moved repositionAsteroids call outside the else statement
    }

    this.repositionAsteroids(0);
  },
  repositionAsteroids(currentPathPosition = 0, pathPositionOffset = 0, dt = undefined) {
    const level = this.parent;
    if (!level || !level.getPositionAtTime) {
      console.warn('spacezone-level element with getPositionAtTime method not found.');
      return;
    }

    // Get the world coordinate position based on currentPathPosition
    const currentPos = level.getPositionAtTime(currentPathPosition);

    // Retrieve the player to get the ship's position
    const playerElements = level.getElementsByTagName('spacezone-spaceship');
    const player = playerElements.length > 0 ? playerElements[0] : null;
    const shipZ = player ? player.pos.z : 0;

    for (let asteroid of this.asteroids) {
      if (asteroid.pos.z < currentPos.z - 100) {
        // Generate new random offsetX and offsetY based on configurable attributes
        const offsetX = (Math.random() * this.offsetX * 2) - this.offsetX;
        const offsetY = (Math.random() * this.offsetY * 2) - this.offsetY;

        // Generate a random t value between currentPathPosition and currentPathPosition + 0.1 plus pathPositionOffset
        let newT = Math.random() * 0.1 + currentPathPosition + pathPositionOffset;
        const originalT = newT;
        if (newT > 1) newT = 1;

        // Get new position along the curve
        const basePos = level.getPositionAtTime(newT);

        // Determine offsetZ based on originalT
        let offsetZ = originalT > 1 ? Math.random() * 1000 : 0;

        // Apply new randomized offsets
        const newPos = basePos.clone().add(new THREE.Vector3(offsetX, offsetY, offsetZ));

        // Update asteroid position and set opacity to 0 if pathPositionOffset > 0
        asteroid.pos = newPos;

        // Assign a random rotation axis and rotation speed
        asteroid.rotate_axis = new THREE.Vector3(
          Math.random() * 2 - 1,
          Math.random() * 2 - 1,
          Math.random() * 2 - 1
        ).normalize();
        // FIXME - this causes bad performance with collision detection, we need collision layers so we're not checking asteroids colliding against each other
        asteroid.rotate_deg_per_sec = 0; Math.random() * 40 - 20; // Random value between -20 and 20

        asteroid.rotation = V(
          Math.random() * 360 - 180,
          Math.random() * 360 - 180,
          Math.random() * 360 - 180
        ).normalize();
          
        if (pathPositionOffset > 0 && asteroid.opacity !== undefined) {
          asteroid.opacity = 0;
        }
        asteroid.scale = V(Math.random() * 45 + 5) // Random scale between 5-50
      }

      // Collision Optimization: Set collidable and collision_id based on relative z position to the ship
      if (player) {
        const distanceZ = Math.abs(asteroid.pos.z - shipZ);
        const shouldBeCollidable = distanceZ < 500;
        if (shouldBeCollidable) {
          if (!asteroid.collision_id) {
            setTimeout(() => {
              asteroid.collision_id = asteroid.id;
            }, 0);
          }
        } else if (!shouldBeCollidable) {
          //asteroid.collision_id = null;
          //asteroid.collidable = false;
        }
      }
    }

    // Increment opacity for asteroids with opacity < 1
    for (let asteroid of this.asteroids) {
      if (asteroid.opacity !== undefined && asteroid.opacity < 1) {
        if (dt !== undefined) {
          asteroid.opacity += dt / 2;
          asteroid.opacity += 0.005; // Further reduced increment for smoother transition
        }
        if (asteroid.opacity > 1) asteroid.opacity = 1;
      }
    }
  },
  update(dt) {
    // Update logic for spacezone-asteroidfield
    // Rotation is now handled by the physics engine using rotate_deg_per_sec and rotate_axis

    // Get the player's current race position
    const playerElements = this.parent.getElementsByTagName('spacezone-spaceship');
    const player = playerElements.length > 0 ? playerElements[0] : null;
    let currentPathPosition = 0;
    if (player && player.isRacing) {
      currentPathPosition = player.raceTime / player.totalracetime;
    }

    this.repositionAsteroids(currentPathPosition, 0.1, dt);
  }
});