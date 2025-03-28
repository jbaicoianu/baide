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
  maxspeedmultiplier: 3, // New property for maximum speed multiplier

  create() {
    // Initialization code for spacezone-player

    // Add child object 'taufighter' with specified metalness and roughness
    this.taufighter = this.createObject('object', {
      id: 'taufighter',
      collision_id: 'sphere', // Updated collision_id to 'sphere'
      collision_scale: V(3),
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
      id: 'music-lastparsec', // Updated music ID to default to 'music-lastparsec'
      loop: true,
      volume: 1.0,
      auto_play: true
    });

    // Add control context for targeting and afterburner
    this.controlstate = this.addControlContext('spacezone-player', {
      'targeting': { defaultbindings: 'mouse_delta' },
      'afterburner': { 
        defaultbindings: 'keyboard_shift', 
        onactivate: () => this.activateAfterburner(),
        ondeactivate: () => this.deactivateAfterburner()
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

    if (this.countdown) {
      // Reuse existing countdown object
      this.countdown.text = '3...';
      this.countdown.visible = true;
    } else {
      // Create countdown text object with updated rotation
      this.countdown = this.createObject('text', {
        id: 'countdown',
        text: '3...',
        pos: new THREE.Vector3(0, 5, 0),
        rotation: '0 180 0', // Set rotation to 0 180 0
        col: 'white',
        font_scale: false
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
          this.countdown.text = 'Go!...';
        } else if (this.countdownStep === 4) {
          this.isRacing = true;
          this.removeChild(this.countdown);
          this.countdown = null;
          console.log('Race started!');
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

    if (this.asteroids.length > 0) {
      // Reset positions of existing asteroids
      for (let asteroid of this.asteroids) {
        asteroid.pos = new THREE.Vector3(0, 0, -9999);
      }
    } else {
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

        // Create material for the asteroid with random gray color and enable transparency
        const material = new THREE.MeshStandardMaterial({ color: grayHex, transparent: true, opacity: 1 });

        // Create mesh with geometry and material
        const asteroidMesh = new THREE.Mesh(geometry, material);

        // Generate a random unit vector for rotation axis
        const rotateAxis = new THREE.Vector3(
          Math.random() * 2 - 1,
          Math.random() * 2 - 1,
          Math.random() * 2 - 1
        ).normalize();

        // Load the asteroid mesh as a new asset
        this.loadNewAsset('object', {
          id: 'asteroid-' + i,
          object: asteroidMesh
        });

        // Create asteroid object with the mesh
        const asteroid = this.createObject('object', {
          id: 'asteroid-' + i,
          collision_id: 'asteroid-' + i,
          col: grayHex,
          rotate_deg_per_sec: Math.random() * 20, // Random scalar between 0 and 20
          rotate_axis: rotateAxis,
          pickable: false,
          opacity: 1 // Initialize opacity to 1
        }); 
        asteroid.pos = asteroidPos;

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
        if (pathPositionOffset > 0 && asteroid.opacity !== undefined) {
          asteroid.opacity = 0;
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
      col: 'cyan', // Set particle color to cyan
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