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
      id: 'startText', // Added ID for easier reference
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
  rollspeed: 160, // Doubled rotation speed to 160 degrees per second
  offsetRange: 20, // Configurable range for x and y offsets
  thrust: 40, // Thrust force applied when moving forward
  totalracetime: 120, // Total race duration in seconds
  rollDamping: 5, // Damping factor for roll
  pitchDamping: 5, // Damping factor for pitch
  maxspeedmultiplier: 1.5, // Reverted property for maximum speed multiplier

  create() {
    // Initialization code for spacezone-player

    // Add child object 'taufighter' with specified metalness and roughness
    this.taufighter = this.createObject('object', {
      id: 'spacefighter',
      collision_id: 'sphere', // Updated collision_id to 'sphere'
      collision_scale: V(7),
      pos: new THREE.Vector3(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
      zdir: new THREE.Vector3(0, 0, 1),
      metalness: 0.2,
      roughness: 0.4,
      mass: 1000,
    });
    this.taufighter.addForce('drag', 0);
    
    // Add collide event listener to taufighter
    this.taufighter.addEventListener('collide', ev => this.handleCollide(ev));

    // Instantiate multiple engine trails as children of the player
    this.enginetrails = [];
    const trailPositions = [
      '-1.9 0.4 -2.5',
      '1.9 0.4 -2.5',
      '-1.9 -0.4 -2.5',
      '1.9 -0.4 -2.5'
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
      id: 'music-lastparsec', // Updated music ID to default to 'music-lastparsec'
      loop: true,
      volume: 1.0,
      auto_play: true
    });

    // Add control context for targeting, afterburner, and fire
    this.controlstate = this.addControlContext('spacezone-player', {
      'targeting': { defaultbindings: 'mouse_delta' },
      'afterburner': { 
        defaultbindings: 'keyboard_shift', 
        onactivate: () => this.activateAfterburner(),
        ondeactivate: () => this.deactivateAfterburner()
      },
      'fire': {
        defaultbindings: 'mouse_button_0',
        onactivate: () => {
          this.cannonLeft.startFiring();
          this.cannonRight.startFiring();
        },
        ondeactivate: () => {
          this.cannonLeft.stopFiring();
          this.cannonRight.stopFiring();
        }
      }
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

    // Initialize countdown variables
    this.countdown = null;
    this.countdownTime = 0;
    this.countdownStep = 0;

    // Initialize afterburner state
    this.afterburner = false;
    this.currentSpeedMultiplier = 1.0;
    this.targetSpeedMultiplier = 1.0;
    this.speedChangeRate = 4.0; // Multiplier change per second

    // Initialize camera FOV parameters
    this.currentFov = 70;
    this.targetFov = 70;
    if (player && player.camera) {
      player.camera.fov = this.currentFov;
    }

    // Add spacezone-cannons to the taufighter
    this.cannonLeft = this.taufighter.createObject('spacezone-cannon', {
      pos: '7.5 -1 4', // Flipped position relative to taufighter
      rotation: '0 180 0' // Rotated 180 degrees on y-axis
    });

    this.cannonRight = this.taufighter.createObject('spacezone-cannon', {
      pos: '-7.5 -1 4', // Flipped position relative to taufighter
      rotation: '0 180 0' // Rotated 180 degrees on y-axis
    });
  },
  activateAfterburner() {
    this.afterburner = true;
    this.targetSpeedMultiplier = this.maxspeedmultiplier; // Use maxspeedmultiplier
    for (let trail of this.enginetrails) {
      trail.particle.col = '#FFAA00'; // Set to brighter yellowish orange
    }
    console.log('Afterburner activated!');
  },
  deactivateAfterburner() {
    this.afterburner = false;
    this.targetSpeedMultiplier = 1.0;
    for (let trail of this.enginetrails) {
      trail.particle.col = 'cyan';
    }
    console.log('Afterburner deactivated!');
  },
  handleCollide(ev) {
    console.log(ev);
  },
  updatePositionAndDirection(currentPathPosition) {
    const level = this.parent;
    if (level && level.getPositionAtTime) {
      const position = level.getPositionAtTime(Math.min(currentPathPosition, 0.999));
      const lookAheadT = Math.min(currentPathPosition + .001, 1.0);
      const lookAheadPos = level.getPositionAtTime(lookAheadT);
      const direction = new THREE.Vector3().subVectors(lookAheadPos, position).normalize();
      this.pos = position;
      this.zdir = direction;
    } else {
      console.warn('Level or getPositionAtTime method not found.');
    }
  },
  startRace() {
    player.disable();
    this.activateControlContext('spacezone-player');
    
    // Hide the "Click ship to start" text
    if (this.parent && this.parent.textObject) {
      this.parent.textObject.visible = false;
    }

    // Set taufighter as not pickable when race starts
    if (this.taufighter) {
      this.taufighter.pickable = false;
    }

    if (this.countdown) {
      // Reuse existing countdown object
      this.countdown.text = '3...';
      this.countdown.visible = true;
    } else {
      // Create countdown text object with updated rotation
      this.countdown = this.createObject('text', {
        id: 'countdown',
        text: '3...',
        pos: new THREE.Vector3(0, 0, -5), // Centered on screen
        rotation: '0 180 0', // Set rotation to 0 180 0
        col: 'white',
        emissive: 0x111111,
        font_scale: false,
        font_size: 4,
        metalness: 1,
        roughness: 0.1
      });
    }
    this.countdownTime = 0;
    this.countdownStep = 0;
    this.isRacing = false;
    this.raceTime = 0;
    this.appendChild(player);
    player.pos = V(0, 0, -20);
    this.updatePositionAndDirection(0);
        
    // Compute direction vector is now handled within updatePositionAndDirection

    player.orientation.set(0, 1, 0, 0);
    console.log('Race countdown started!');
    
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
    if (this.countdown) {
      this.countdownTime += dt;
      if (this.countdownTime >= 1) {
        this.countdownTime -= 1;
        this.countdownStep += 1;
        if (this.countdownStep === 1) {
          this.countdown.text = '2...';
        } else if (this.countdownStep === 2) {
          this.countdown.text = '1...';
        } else if (this.countdownStep === 3) {
          this.countdown.text = 'Go!';
          this.isRacing = true;
          console.log('Race started!');
        } else if (this.countdownStep === 4) {
          this.removeChild(this.countdown);
          this.countdown = null;
          
          // Removed setting taufighter.pickable to true when race starts
        }
      }
    }

    if (this.isRacing) {
      // Quadratic ease for speed multiplier towards targetSpeedMultiplier
      const speedDifference = this.targetSpeedMultiplier - this.currentSpeedMultiplier;
      const acceleration = this.speedChangeRate * speedDifference * Math.abs(speedDifference);
      this.currentSpeedMultiplier += acceleration * dt;

      // Clamp the speed multiplier to avoid overshooting
      if ((speedDifference > 0 && this.currentSpeedMultiplier > this.targetSpeedMultiplier) ||
          (speedDifference < 0 && this.currentSpeedMultiplier < this.targetSpeedMultiplier)) {
        this.currentSpeedMultiplier = this.targetSpeedMultiplier;
      }

      // Apply speed multiplier based on currentSpeedMultiplier
      this.raceTime += dt * this.currentSpeedMultiplier;
      let t = this.raceTime / this.totalracetime;
      if (t > 1) t = 1;

      // Assuming 'spacezone-level' is the parent element
      const level = this.parent;
      if (level && level.getPositionAtTime) {
        this.updatePositionAndDirection(t);

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
        
        // Set taufighter back to pickable when race is complete
        if (this.taufighter) {
          this.taufighter.pickable = true;
        }
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

    // Apply limited turn with damping
    let rollTurn = Math.min(Math.abs(rollDifference), maxTurn) * Math.sign(rollDifference);
    let pitchTurn = Math.min(Math.abs(pitchDifference), maxTurn) * Math.sign(pitchDifference);

    // Apply damping to smooth out the turns
    rollTurn -= (rollTurn * this.rollDamping * dt);
    pitchTurn -= (pitchTurn * this.pitchDamping * dt);

    // Ignore small turn values to reduce shakiness
    const MIN_TURN = 0.01;
    if (Math.abs(rollTurn) < MIN_TURN) {
      rollTurn = 0;
    }
    if (Math.abs(pitchTurn) < MIN_TURN) {
      pitchTurn = 0;
    }

    // Update current orientation
    this.currentRoll += rollTurn;
    this.currentPitch += pitchTurn;

    // Update the taufighter's orientation
    this.taufighter.rotation.set(
      this.currentPitch,
      0,
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

    // Calculate target FOV based on currentSpeedMultiplier
    const clampedSpeedMultiplier = Math.max(1, Math.min(this.currentSpeedMultiplier, this.maxspeedmultiplier));
    this.targetFov = 70 + ((clampedSpeedMultiplier - 1) / (this.maxspeedmultiplier - 1)) * 20;

    const fovChangeRate = 60; // degrees per second
    if (this.currentFov < this.targetFov) {
      this.currentFov += fovChangeRate * dt;
      if (this.currentFov > this.targetFov) {
        this.currentFov = this.targetFov;
      }
    } else if (this.currentFov > this.targetFov) {
      this.currentFov -= fovChangeRate * dt;
      if (this.currentFov < this.targetFov) {
        this.currentFov = this.targetFov;
      }
    }

    if (player && player.camera) {
      player.camera.fov = this.currentFov;
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
      opacity: 0.5,
      visible: false
    });
  },
  update(dt) {
    // Update logic for spacezone-waypoint
    // You can add interactions or animations for the placeholder sphere here
  }
});

room.registerElement('spacezone-asteroidfield', {
  numasteroids: 10,
  uniqueshapes: 10, // Added uniqueshapes attribute with default value of 10
  uniqueAsteroidAssets: [], // Array to hold unique asteroid asset IDs

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
          normal_scale: 3,
          texture_repeat: V(3),
          
          rotate_deg_per_sec: 0, // Disabled rotation by setting to 0
          // rotate_axis: selectedShape.rotateAxis || new THREE.Vector3(1, 0, 0), // Removed rotation axis initialization
          pickable: false,
          opacity: 1, // Initialize opacity to 1
          collidable: true, // Initialize collidable to true
          emissive: 'black', // Initialize emissive to black
          scale: V(Math.random() * 45 + 5) // Random scale between 5-50
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
  repositionAsteroids(currentPathPosition = 0, pathPositionOffset = 0) {
    const level = this.parent;
    if (!level || !level.getPositionAtTime) {
      console.warn('spacezone-level element with getPositionAtTime method not found.');
      return;
    }

    // Get the world coordinate position based on currentPathPosition
    const currentPos = level.getPositionAtTime(currentPathPosition);

    // Retrieve the player to get the ship's position
    const playerElements = level.getElementsByTagName('spacezone-player');
    const player = playerElements.length > 0 ? playerElements[0] : null;
    const shipZ = player ? player.pos.z : 0;

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
        asteroid.opacity += 0.005; // Further reduced increment for smoother transition
        if (asteroid.opacity > 1) asteroid.opacity = 1;
      }
    }
  },
  update(dt) {
    // Update logic for spacezone-asteroidfield
    // Rotation is now handled by the physics engine using rotate_deg_per_sec and rotate_axis

    // Get the player's current race position
    const playerElements = this.parent.getElementsByTagName('spacezone-player');
    const player = playerElements.length > 0 ? playerElements[0] : null;
    let currentPathPosition = 0;
    if (player && player.isRacing) {
      currentPathPosition = player.raceTime / player.totalracetime;
    }

    this.repositionAsteroids(currentPathPosition, 0.1);
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
    // Create a particle object for engine trails
    this.particle = this.createObject('particle', {
      pos: V(-0.15), // Set pos to V(-0.15)
      rand_pos: V(0.3), // Add rand_pos: V(0.3)
      scale: V(1), // Updated scale from V(0.02) to V(1)
      rate: 400, // Increased rate to 400
      count: 200, // Reduced count to 200
      duration: 0.5, // Decreased duration to 0.5
      opacity: 0.2,
      vel: V(0, 0, 10), // Set vel to V(0,0,10)
      rand_vel: V(0,0,20), // Set rand_vel to V(0,0,20)
      col: 'limegreen', // Set particle color to lime green
      image_id: 'spark' // Set image_id to 'spark'
    });

    // Initialize totaltime for sine wave variation
    this.totaltime = 0;
  },
  update(dt) {
    // Increment totaltime
    this.totaltime += dt;

    // Get the current world position
    const currentWorldPosition = new THREE.Vector3();
    this.getWorldPosition(currentWorldPosition);

    // Apply sine wave variation to currentWorldPosition's x and y values
    currentWorldPosition.x += Math.sin(this.totaltime * 75) * 0.2;
    currentWorldPosition.y += Math.sin(this.totaltime * 80) * 0.2;

    // Set the particle emitter position
    //this.particle.emitter_pos = currentWorldPosition;

    // Check player's isRacing property and set particle rate and color
    const player = this.getParentByTagName('spacezone-player');

    if (player && player.isRacing) {
      this.particle.rate = 400;
      if (player.afterburner) {
        this.particle.col = '#FFAA00'; // Changed to brighter yellowish orange
      } else {
        this.particle.col = 'cyan';
      }
    } else {
      this.particle.rate = 0;
    }
  }
});

room.registerElement('spacezone-cannon', {
  rate: 10, // Default rate: increased to 10 shots per second
  muzzlespeed: 400, // Default muzzle speed increased to 400
  create() {
    // Initialization code for spacezone-cannon
    this.firing = false;
    this.cooldown = 0;

    // Add dynamic light matching the laser beam color
    this.flashLight = this.createObject('light', {
      type: 'point', // Using point light; can be changed to spotlight if preferred
      light_intensity: 0, // Initial light_intensity is 0 (off)
      col: 'limegreen', // Same color as laser beam
      light_range: 500, // Set light range to 500
      decay: 1, // Light decay rate
      pos: V(0, 0, 2) // Moved light forward by 2 meters on the z-axis
    });

    // Flash light parameters
    this.flashIntensity = 5; // Intensity when flashing
    this.flashFadeRate = 20; // Rate at which the light fades per second
  },
  startFiring() {
    this.firing = true;
  },
  stopFiring() {
    this.firing = false;
  },
  flashLightIntensity(dt) {
    if (this.flashLight.light_intensity > 0) {
      this.flashLight.light_intensity -= this.flashFadeRate * dt;
      if (this.flashLight.light_intensity < 0) {
        this.flashLight.light_intensity = 0;
      }
    }
  },
  fire() {
    if (!this.pool) {
      // Initialize the object pool for laser beams
      this.pool = this.createObject('objectpool', {
        objecttype: 'spacezone-laserbeam',
        max: 20
      });
    }        
    // Get spawnPosition using ship's world coordinates
    const spawnPosition = this.localToWorld(V(0));

    // Get forward position and compute direction
    const forwardPosition = this.localToWorld(V(0, 0, 1));
    const direction = new THREE.Vector3().subVectors(spawnPosition, forwardPosition).normalize();

    // Spawn a spacezone-laserbeam using the object pool
    this.pool.grab({
      pos: spawnPosition,
      zdir: direction,
      vel: direction.clone().multiplyScalar(this.muzzlespeed)
    });

    // Trigger the flash light
    this.flashLight.light_intensity = this.flashIntensity;
  },
  update(dt) {
    // Dynamically set muzzlespeed based on currentSpeedMultiplier
    if (this.parent && this.parent.parent) {
      this.muzzlespeed = 400 * this.parent.parent.currentSpeedMultiplier;
    } else {
      console.warn('Unable to access currentSpeedMultiplier for muzzlespeed calculation.');
    }

    if (this.firing) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this.fire();
        this.cooldown = 1 / this.rate;
      }
    }

    // Handle light fading
    this.flashLightIntensity(dt);
  }
});

room.registerElement('spacezone-laserbeam', {
  create() {
    // Create a bright lime green 'capsule' object, rotated 90 degrees on the x axis and scaled to (0.25, 4, 0.25)
    this.laserBeam = this.createObject('object', {
      id: 'capsule',
      col: 'limegreen', // Changed laser beam color to lime green
      scale: '0.25 4 0.25', // Updated scale to .25, 4, .25
      rotation: '90 0 0',
      lighting: false
    });

    // Set a lifetime for the laser beam
    this.lifetime = 2; // seconds
  },
  update(dt) {
    // Decrease lifetime; object pool handles recycling
    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      // this.die(); // Removed this as pool handles recycling
    }
  }
});