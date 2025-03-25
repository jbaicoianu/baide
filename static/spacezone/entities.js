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
      this.tubeObject = this.createObject('object', { object: this.tubeMesh, collidable: false, pickable: false, visible: false });
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
  rollspeed: 80, // Updated turnrate to 80 degrees per second
  offsetRange: 20, // Configurable range for x and y offsets
  thrust: 40, // Thrust force applied when moving forward
  totalracetime: 120, // Total race duration in seconds

  create() {
    // Initialization code for spacezone-player

    // Add child object 'taufighter' with specified metalness and roughness
    this.taufighter = this.createObject('object', {
      id: 'taufighter',
      collision_id: 'taufighter',
      pos: new THREE.Vector3(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
      zdir: new THREE.Vector3(0, 0, -1), // Set zdir to 0, 0, -1
      metalness: 0.2,
      roughness: 0.4
    });

    // Instantiate multiple engine trails as children of the player
    this.enginetrails = [];
    const trailPositions = [
      '1.9 0.4 2.5',
      '-1.9 0.4 2.5',
      '1.9 -0.4 2.5',
      '-1.9 -0.4 2.5'
    ];
    for (const pos of trailPositions) {
      let trail = this.taufighter.createObject('spacezone-enginetrail', { pos: pos });
      this.enginetrails.push(trail);
    }

    // Add click event listener to taufighter
    this.taufighter.addEventListener('click', ev => this.startRace());

    this.isRacing = false;
    this.raceTime = 0;

    // Add background music sound object
    this.music = this.createObject('sound', {
      id: 'music-darkgateway', // Updated music ID if necessary
      loop: true,
      volume: 1.0,
      auto_play: true
    });

    // Add control context for targeting
    this.controlstate = this.addControlContext('spacezone-player', {
      'targeting': { defaultbindings: 'mouse_delta' }
    });

    // Add targeting reticle as a sphere placeholder
    this.reticle = this.createObject('object', {
      id: 'sphere',
      col: 'red',
      scale: V(1),
      pos: new THREE.Vector3(0, 0, 20) // Positioned at (0, 0, 20)
    });

    // Initialize current orientation
    this.currentRoll = 180;
    this.currentPitch = 0;
  },
  startRace() {
    player.disable();
    this.activateControlContext('spacezone-player');
    
    this.isRacing = true;
    this.raceTime = 0;
    this.appendChild(player);
    player.pos = V(0, 0, -20);
    player.orientation.set(0, 1, 0, 0);
    console.log('Race started!');
    // Switch background music to 'music-darkgateway'
    if (this.music) {
      this.music.id = 'music-darkgateway';
      console.log('Background music changed to music-darkgateway.');
    } else {
      console.warn('Music object not found.');
    }
    // Emit 'level_start' event
    if(this.parent) {
      this.parent.dispatchEvent({type: 'level_start'});
    } else {
      console.warn('Parent not found. Cannot dispatch level_start event.');
    }
  },
  update(dt) {
    if (this.isRacing) {
      this.raceTime += dt;
      let t = this.raceTime / this.totalracetime;
      if (t > 1) t = 1;

      // Assuming 'spacezone-level' is the parent element
      const level = this.parent;
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

        // Apply x and y offsets based on shuttle's rotation
        const rollRad = THREE.MathUtils.degToRad(this.currentRoll);
        const pitchRad = THREE.MathUtils.degToRad(this.currentPitch);

        let offsetX = Math.sin(rollRad) * this.offsetRange;
        let offsetY = Math.sin(pitchRad) * this.offsetRange;

        // Clamp offsets within the configured range
        offsetX = Math.max(-this.offsetRange, Math.min(this.offsetRange, offsetX));
        offsetY = Math.max(-this.offsetRange, Math.min(this.offsetRange, offsetY));

        // Apply the offset to the shuttle object
        this.taufighter.pos.set(offsetX, offsetY, 0);
      }

      if(t >= 1){
        this.isRacing = false;
        console.log('Race completed!');
      }
    }

    // Handle targeting reticle movement based on mouse delta
    const targetingDelta = this.controlstate.targeting;
    if (targetingDelta && Array.isArray(targetingDelta) && targetingDelta.length >= 2) {
      // Restore original x and y directions with negated values
      this.reticle.pos.x += -targetingDelta[0];
      this.reticle.pos.y += -targetingDelta[1];
      
      // Optional: Clamp reticle position within certain bounds
      const maxOffset = 20; // Increased movement limit to 20
      this.reticle.pos.x = Math.max(-maxOffset, Math.min(maxOffset, this.reticle.pos.x));
      this.reticle.pos.y = Math.max(-maxOffset, Math.min(maxOffset, this.reticle.pos.y));
    }

    // Steering logic towards the reticle
    const reticlePos = this.reticle.pos.clone();
    const directionToReticle = reticlePos.sub(this.taufighter.pos).normalize();

    // Calculate desired roll and pitch
    const desiredRoll = Math.atan2(directionToReticle.x, directionToReticle.z) * (180 / Math.PI);
    const desiredPitch = Math.atan2(directionToReticle.y, Math.sqrt(directionToReticle.x ** 2 + directionToReticle.z ** 2)) * (180 / Math.PI);

    // Calculate the difference between current and desired angles
    let rollDifference = desiredRoll - this.currentRoll;
    let pitchDifference = desiredPitch - this.currentPitch;

    // Normalize the angles to the range [-180, 180]
    rollDifference = ((rollDifference + 180) % 360) - 180;
    pitchDifference = ((pitchDifference + 180) % 360) - 180;

    // Calculate the maximum turn based on rollspeed and delta time
    const maxTurn = this.rollspeed * dt;

    // Apply limited turn
    const rollTurn = Math.min(Math.abs(rollDifference), maxTurn) * Math.sign(rollDifference);
    const pitchTurn = Math.min(Math.abs(pitchDifference), maxTurn) * Math.sign(pitchDifference);

    // Update current orientation
    this.currentRoll += rollTurn;
    this.currentPitch += pitchTurn;

    // Update the taufighter's orientation
    this.taufighter.rotation.set(
      this.currentPitch,
      180,
      -this.currentRoll
    );

    // Inertial Flight Model
    if (this.isRacing) {
      // Calculate forward direction based on current orientation
      const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(this.currentPitch),
        THREE.MathUtils.degToRad(this.currentRoll),
        0,
        'XYZ'
      )).normalize();

      // Apply thrust in the forward direction
      // const thrustVector = forward.multiplyScalar(this.thrust * dt);
      // this.velocity.add(thrustVector);

      // Update position based on velocity
      // this.taufighter.pos.add(this.velocity.clone().multiplyScalar(dt));
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
    
    // Listen for 'level_start' event to initialize asteroids
    this.parent.addEventListener('level_start', () => {
      this.initAsteroids();
    });
  },
  initAsteroids() {
    const level = this.parent;

    if (!level || !level.getPositionAtTime) {
      console.warn('spacezone-level element with getPositionAtTime method not found.');
      return;
    }

    // Clear existing asteroids if any
    for (let asteroid of this.asteroids) {
      this.removeChild(asteroid);
    }
    this.asteroids = [];

    for (let i = 0; i < this.numasteroids; i++) {
      // Initialize all asteroids at (0, 0, -9999)
      const asteroidPos = new THREE.Vector3(0, 0, -9999);

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
          const x = currX + (0 - Math.random() * 10);
          const y = currY + (0 - Math.random() * 10);
          const z = currZ + (0 - Math.random() * 10);

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

      // Generate a random unit vector for rotation axis
      const rotateAxis = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      ).normalize();

      // Create asteroid object with the mesh
      const asteroid = this.createObject('object', {
        object: asteroidMesh,
        col: grayHex,
        rotate_deg_per_sec: Math.random() * 20, // Random scalar between 0 and 20
        rotate_axis: rotateAxis,
        collidable: false,
        pickable: false
      }); 
      asteroid.pos = asteroidPos;

      this.asteroids.push(asteroid);
      this.appendChild(asteroid);
    }

    // Initial repositioning of asteroids
    this.repositionAsteroids(0);
  },
  repositionAsteroids(currentPathPosition = 0, pathPositionOffset = 0) {
    const level = this.parent;
    if (!level || !level.getPositionAtTime) {
      console.warn('spacezone-level element with getPositionAtTime method not found.');
      return;
    }

    // Get the world coordinate position based on currentPathPosition
    const currentPos = level.getPositionAtTime(currentPathPosition);

    for (let asteroid of this.asteroids) {
      if (asteroid.pos.z < currentPos.z - 100) {
        // Generate new random offsetX and offsetY in the range -500 to 500
        const offsetX = (Math.random() * 1000) - 500;
        const offsetY = (Math.random() * 1000) - 500;

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

        // Update asteroid position
        asteroid.pos = newPos;
      }
    }
  },
  update(dt) {
    // Update logic for spacezone-asteroidfield
    // Rotation is now handled by the physics engine using rotate_deg_per_sec and rotate_axis

    // Get the player's current race position
    const player = this.parent.getElementsByTagName('spacezone-player')[0];
    if (player && player.isRacing) {
      const currentPathPosition = player.raceTime / player.totalracetime;
      this.repositionAsteroids(currentPathPosition, 0.1);
    }
  }
});

room.registerElement('spacezone-planet', {
  surfacetexture: 'black',
  normaltexture: 'default-normal', // Added normaltexture attribute
  radius: 6.38e6,
  create() {
    // Create the sphere object using JanusXR syntax
    this.planetObject = this.createObject('object', {
      id: 'sphere',
      image_id: this.surfacetexture,
      normalmap_id: this.normaltexture, // Passed normaltexture as normalmap_id
      normal_scale: 20, // Set normal_scale parameter
      scale: V(this.radius * 2),
      rotate_deg_per_sec: 2,
    });
  },
  update(dt) {
    // Update logic for spacezone-planet if needed
  }
});

room.registerElement('spacezone-star', {
  intensity: 1.0,
  radius: 5,
  create() {
    // Create the star sphere without a texture
    this.starObject = this.createObject('object', {
      id: 'sphere',
      scale: V(this.radius * 2),
      col: 'yellow', // Optional: set a color for visibility
      rotate_deg_per_sec: 0, // Stars typically don't rotate
      lighting: false
    });

    // Create a light source associated with the star
    this.lightObject = this.createObject('light', {
      type: 'point', // Assuming a point light; adjust as necessary
      intensity: this.intensity,
      pos: this.starObject.pos, // Position the light at the star's location
      col: 'white', // Light color
      distance: 100, // Adjust distance as needed
      decay: 2, // Light decay rate
    });
  },
  update(dt) {
    // Update logic for spacezone-star if needed
  }
});

room.registerElement('spacezone-enginetrail', {
  create() {
    // Create a linesegments object to represent the trail
    this.trail = room.createObject('linesegments', {
      pos: new THREE.Vector3(0, 0, 0),
      col: 'blue', // Trail color
      linewidth: 2 // Trail width
    });

    // Initialize the trail positions array
    this.trail.positions = [];
    
    // Store the previous world position
    this.previousWorldPosition = new THREE.Vector3();
    this.getWorldPosition(this.previousWorldPosition);
  },
  update(dt) {
    // Get the current world position
    const currentWorldPosition = new THREE.Vector3();
    this.getWorldPosition(currentWorldPosition);

    // Push previous and current positions as individual vectors to the trail
    this.trail.positions.push(this.previousWorldPosition.clone(), currentWorldPosition.clone());

    // If the trail has more than 60 vectors, remove the oldest two
    if (this.trail.positions.length > 60) {
      this.trail.positions.shift();
      this.trail.positions.shift();
    }

    // Update the previous position for the next frame
    this.previousWorldPosition.copy(currentWorldPosition);

    // Removed updateSegments call as positions update automatically

    // Call updateLine to refresh the trail rendering
    this.trail.updateLine();
  }
});