room.registerElement('spacezone-level', {
  create() {
    // Initialization code for spacezone-level
    this.waypoints = this.getElementsByTagName('spacezone-waypoint');
    
    // Extract positions from waypoints
    const points = [];
    for (let waypoint of this.waypoints) {
      points.push(waypoint.pos);
    }

    if (points.length > 1) {
      // Create a CatmullRomCurve3 from waypoints
      this.curve = new THREE.CatmullRomCurve3(points);
      
      // Generate TubeBufferGeometry based on the curve with increased subdivisions
      this.tubeGeometry = new THREE.TubeBufferGeometry(this.curve, 500, 0.5, 8, false);
      
      // Create a material for the tube
      this.tubeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      
      // Create the mesh and add it to the room using createObject
      this.tubeMesh = new THREE.Mesh(this.tubeGeometry, this.tubeMaterial);
      this.tubeObject = this.createObject('object', { object: this.tubeMesh, collidable: false, pickable: false });
    }

    // Add the text object above the start point
    this.textObject = this.createObject('text', {
      text: 'Click ship to start',
      pos: new THREE.Vector3(0, 5, 0),
      rotation: '0 90 0',
      col: 'white', // Optional: set text color
      font_scale: false
    });
  },
  update(dt) {
    // Update logic for spacezone-level
    // For example, animate the tube or handle dynamic changes to waypoints
  },
  getPositionAtTime(t) {
    if (this.curve) {
      // Ensure t is within [0, 1]
      const clampedT = Math.max(0, Math.min(t, 1));
      return this.curve.getPoint(clampedT);
    }
    return new THREE.Vector3(0, 0, 0);
  }
});

room.registerElement('spacezone-player', {
  create() {
    // Initialization code for spacezone-player

    // Add child object 'shuttle'
    this.shuttle = this.createObject('object', {
      id: 'shuttle',
      collision_id: 'shuttle',
      pos: new THREE.Vector3(0, 0, 0),
      col: 'gray', // Updated color
      metalness: 1, // Added metalness
      roughness: 0.5, // Added roughness
      scale: new THREE.Vector3(1, 1, 1),
      zdir: new THREE.Vector3(0, 0, -1) // Set zdir to 0, 0, -1
    });

    // Add click event listener to shuttle
    this.shuttle.addEventListener('click', ev => this.startRace());

    this.isRacing = false;
    this.raceTime = 0;
    this.totalRaceTime = 120; // Total race duration in seconds
    this.zdir = new THREE.Vector3(0, 0, -1); // Initialize zdir
    this.pos = new THREE.Vector3(0, 0, 0); // Initialize position
  },
  startRace() {
    this.isRacing = true;
    this.raceTime = 0;
    this.appendChild(player);
    player.pos = V(0, 5, -20);
    player.orientation.set(0, 1, 0, 0);
    console.log('Race started!');
  },
  update(dt) {
    if (this.isRacing) {
      this.raceTime += dt;
      let t = this.raceTime / this.totalRaceTime;
      if (t > 1) t = 1;

      // Assuming 'spacezone-level' is a sibling element
      const level = this.parent.getObjectsByTagName('spacezone-level')[0];
      if (level && level.getPositionAtTime) {
        const position = level.getPositionAtTime(t);

        // Calculate look-ahead position
        const lookAheadT = Math.min(t + 0.001, 1);
        const lookAheadPos = level.getPositionAtTime(lookAheadT);
        
        // Compute direction vector
        const direction = new THREE.Vector3().subVectors(lookAheadPos, position).normalize();
        this.zdir = direction; // Update zdir

        // Update the player's position
        this.pos = position;
      }

      if(t >= 1){
        this.isRacing = false;
        console.log('Race completed!');
      }
    }
  }
});

room.registerElement('spacezone-obstacle', {
  create() {
    // Initialization code for spacezone-obstacle
  },
  update(dt) {
    // Update logic for spacezone-obstacle
  }
});

room.registerElement('spacezone-waypoint', {
  create() {
    // Initialization code for spacezone-waypoint
    this.placeholderSphere = this.createObject('object', {
      id: 'sphere',
      scale: new THREE.Vector3(5, 5, 5),
      col: 'green',
      opacity: 0.5
    });
  },
  update(dt) {
    // Update logic for spacezone-waypoint
    // You can add interactions or animations for the placeholder sphere here
  }
});

room.registerElement('spacezone-asteroidfield', {
  numasteroids: 10,
  create() {
    // Initialization code for spacezone-asteroidfield
    this.asteroids = [];
    const num = this.numasteroids;

    // Set a 100ms timer to initialize asteroids after ensuring the level is initialized
    setTimeout(() => {
      this.initAsteroids();
    }, 1000);
  },
  initAsteroids() {
    const level = this.parent.getObjectsByTagName('spacezone-level')[0];
    
    if (!level || !level.getPositionAtTime) {
      console.warn('spacezone-level element with getPositionAtTime method not found.');
      return;
    }

    for (let i = 0; i < this.numasteroids; i++) {
      // Generate a random t value between 0 and 1
      const t = Math.random();

      // Get position along the level's curve
      const basePos = level.getPositionAtTime(t);

      // Add random offset to x and y in the range -200 to 200
      const offsetX = (Math.random() * 200) - 100;
      const offsetY = (Math.random() * 200) - 100;
      const asteroidPos = basePos.clone().add(new THREE.Vector3(offsetX, offsetY, 0));

      // Generate random size between 5 and 30
      const size = Math.random() * 25 + 5; // 5 to 30

      // Create DodecahedronGeometry with random size
      const geometry = new THREE.DodecahedronGeometry(size);

      // Replace vertex modification code with the new snippet
      const pos = geometry.attributes.position;
      const vertices = pos.array;
      const bypass = [];
      for (let i = 0; i < vertices.length / pos.itemSize; i++) {
          if (bypass.indexOf(i) > -1) {
              continue;
          }

          const currX = pos.getX(i);
          const currY = pos.getY(i);
          const currZ = pos.getZ(i);
          const x = currX + (0 - Math.random() * (10));
          const y = currY + (0 - Math.random() * (10));
          const z = currZ + (0 - Math.random() * (10));

          pos.setX(i, x);
          pos.setY(i, y);
          pos.setZ(i, z);

          for (let j = 0; j < vertices.length; j += 3) {
              if (
                  vertices[j] === currX &&
                  vertices[j + 1] === currY &&
                  vertices[j + 2] === currZ
              ) {
                  geometry.attributes.position.array[
                      j
                  ] = x;
                  geometry.attributes.position.array[
                      j + 1
                  ] = y;
                  geometry.attributes.position.array[
                      j + 2
                  ] = z;
                  bypass.push(j / 3);
              }
          }
      }
      geometry.attributes.position.needsUpdate = true;

      // Generate a random shade of gray
      const grayValue = Math.floor(Math.random() * 256);
      const grayHex = `#${grayValue.toString(16).padStart(2, '0')}${grayValue.toString(16).padStart(2, '0')}${grayValue.toString(16).padStart(2, '0')}`;

      // Create material for the asteroid with random gray color
      const material = new THREE.MeshStandardMaterial({ color: grayHex });

      // Create mesh with geometry and material
      const asteroidMesh = new THREE.Mesh(geometry, material);

      // Create asteroid object with the mesh
      const asteroid = this.createObject('object', {
        object: asteroidMesh,
        //pos: asteroidPos,
        col: grayHex,
        rotate_deg_per_sec: V(
          Math.random() * 60 - 30, // Random value between -30 and 30 for x
          Math.random() * 60 - 30, // Random value between -30 and 30 for y
          Math.random() * 60 - 30  // Random value between -30 and 30 for z
        ),
        collidable: false,
        pickable: false
      }); 
      asteroid.pos = asteroidPos;
        console.log(asteroidPos);

      this.asteroids.push(asteroid);
    }
  },
  update(dt) {
    // Update logic for spacezone-asteroidfield
    // Rotation is now handled by the physics engine using rotate_deg_per_sec
  }
});