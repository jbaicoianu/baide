room.registerElement('spacezone-enemy-dronecontroller', {
  numdrones: 5, // Default number of drones

  create() {
    // Use a shared pool for our drone laser beams
    this.laserpool = this.createObject('objectpool', {
      objecttype: 'spacezone-laserbeam',
      max: 20
    });

    // Preallocate drones and store them in this.drones
    this.drones = [];
    this.player = this.parent.getElementsByTagName('spacezone-spaceship')[0]; // Ensure player is retrieved here
    for (let i = 0; i < this.numdrones; i++) {
      let drone = this.createObject('spacezone-enemy-drone', {
        pos: V(0, 0, 0), // Initialize at origin or desired spawn position
        player: this.player, // Pass the player reference to each drone
        laserpool: this.laserpool,
      });
      drone.laserpool = this.laserpool; // FIXME - shouldn't be needed
      this.drones.push(drone);
    }

    // Reference to the player and level
    this.level = this.parent;

    if (!this.level || typeof this.level.getPositionAtTime !== 'function') {
      console.warn('Level or getPositionAtTime method not found. Enemy Drone Controller may not function correctly.');
    }

    // Listen for the player's time_elapsed event
    if (this.player) {
      this.player.addEventListener('time_elapsed', event => {
        if (event.data && typeof event.data.currentPathPosition === 'number') {
          this.repositionDrones(event.data.currentPathPosition);
        } else {
          console.warn('time_elapsed event does not contain currentPathPosition.');
        }
      });
    } else {
      console.warn('Player object not found. Cannot listen for time_elapsed events.');
    }

    // Add listener for 'race_start' event to reset drone controller
    if (this.level) {
      this.level.addEventListener('race_start', () => {
        this.reset();
      });
    } else {
      console.warn('Level not found. Cannot listen for race_start event.');
    }
  },

  update(dt) {
    // Removed the direct call to repositionDrones to rely solely on the event handler
  },

  repositionDrones(currentPathPosition) {
    if (!this.player || !this.level) return;

    // Assume the player's current path position is provided as an argument

    // Iterate through all preallocated drones
    for (let drone of this.drones) {
      if (drone.pos.z < this.player.pos.z - 100) { // Assuming 'behind' means having a lesser z-position
        // Calculate a new position
        const randomOffset = 0.1 + Math.random() * 0.2; // Random between 0.1 and 0.3
        const newT = currentPathPosition + randomOffset;
        const clampedT = Math.min(newT, 1.0); // Ensure t does not exceed 1.0

        const newPosition = this.level.getPositionAtTime(clampedT);

        // Generate random offsetX and offsetY between -50 and 50
        const offsetX = Math.random() * 100 - 50;
        const offsetY = Math.random() * 100 - 50;

        // Apply random offsets
        newPosition.x += offsetX;
        newPosition.y += offsetY;

        // Reposition the drone
        drone.pos = newPosition;
      }
    }
  },
  
  reset() {
    for (let drone of this.drones) {
      drone.pos.z = -9999;
    }
    console.log('All drones have been reset to z position -9999.');
  }
});
    
room.registerElement('spacezone-enemy-drone', {
  activationDistance: 1000, // Distance in meters to activate the drone
  firingRate: 1, // Shots per second
  droneSpeed: 40, // Speed of the drone in meters per second
  rotationSpeed: 120, // Degrees per second
  player: null,

  create() {
    // Create the enemy drone as a bright red sphere with 2m diameter
    this.drone = this.createObject('object', {
      id: 'cone',
      col: 'red', // Changed color to bright red
      scale: V(10, 10, 10), // Increased scale to 10
      pos: V(0, 0, 0), // Initial position; adjust as needed
      collision_id: 'sphere',
      //collision_scale: V(1), // Sphere collider with radius 1m
      mass: 500, // Assign mass as appropriate
      zdir: V(0, 0, 1),
      visible: true,
      player: this.player // Store the player reference
    });

    // Add a cannon to the drone
    this.cannon = this.drone.createObject('spacezone-cannon', {
      pos: '0 0 1', // Positioned at the front of the drone
      rotation: '0 0 0', // Facing forward
      rate: this.firingRate // One shot per second
    });

    // Initialize state
    this.isActive = false;

    // Categorize this drone as an enemy
    this.addClass('enemy');

    // Add event listener for collision with laserbolts
    this.drone.addEventListener('collide', ev => this.handleCollision(ev));

    // Add event listener for 'hit' event
    this.drone.addEventListener('hit', ev => this.explodeDrone());
  },
  update(dt) {
    if (!this.isActive) {
      // Check distance to player
      if (this.player) {
        const distance = this.drone.pos.distanceTo(this.player.pos);
        if (distance <= this.activationDistance) {
          this.isActive = true;
          this.activateDrone();
        }
      }
    } else {
      // Move along the path at the same speed as the player
      this.moveAlongPath(dt);

      // Rotate to face the player
      this.facePlayer(dt);

      // Fire at the player
      this.cannon.firingRate = this.firingRate;
      if (this.cannon) {
        this.cannon.startFiring();
      }
    }
  },
  activateDrone() {
    // Add thrust to move the drone forward at the specified speed
    this.drone.addForce('thrust', { direction: this.drone.zdir, magnitude: this.droneSpeed });
    console.log('Enemy drone activated and started moving.');
  },
  moveAlongPath(dt) {
    // Implement movement logic to follow the level path
    const level = this.level;
    if (level && level.getPositionAtTime) {
      // Example: Move based on elapsed time and droneSpeed
      // You may need to implement a more sophisticated path-following mechanism
      const currentPosition = this.drone.pos;
      const direction = this.drone.zdir.clone().normalize();
      const newPosition = currentPosition.clone().add(direction.multiplyScalar(this.droneSpeed * dt));
      this.drone.pos = newPosition;
    }
  },
  facePlayer(dt) {
    if (!this.player) return;

    // Calculate direction vector from drone to player
    const direction = new THREE.Vector3().subVectors(this.player.pos, this.drone.pos).normalize();

    // Calculate desired yaw and pitch in degrees
    let desiredYaw = Math.atan2(direction.x, direction.z) * (180 / Math.PI);
    let desiredPitch = Math.atan2(direction.y, Math.sqrt(direction.x * direction.x + direction.z * direction.z)) * (180 / Math.PI);

    // Get current rotation
    let currentRotation = this.drone.rotation.clone();

    // Calculate the difference
    let deltaYaw = desiredYaw - currentRotation.y;
    let deltaPitch = desiredPitch - currentRotation.x;

    // Normalize angles
    deltaYaw = ((deltaYaw + 180) % 360) - 180;
    deltaPitch = ((deltaPitch + 180) % 360) - 180;

    // Calculate rotation step
    let stepYaw = this.rotationSpeed * dt;
    let stepPitch = this.rotationSpeed * dt;

    // Apply rotation steps
    if (Math.abs(deltaYaw) < stepYaw) {
      currentRotation.y = desiredYaw;
    } else {
      currentRotation.y += stepYaw * Math.sign(deltaYaw);
    }

    if (Math.abs(deltaPitch) < stepPitch) {
      currentRotation.x = desiredPitch;
    } else {
      currentRotation.x += stepPitch * Math.sign(deltaPitch);
    }

    // Update drone rotation
    this.drone.rotation = currentRotation;
  },
  handleCollision(ev) {
    if (ev.type === 'collision' && ev.data.other.collision_id === 'capsule') {
      this.explodeDrone();
    }
  },
  explodeDrone() {
    // Create explosion effect
    const explosion = this.createObject('explosion', {
      col: 'orange',
      scale: V(2, 2, 2),
      pos: this.drone.pos.clone(),
      visible: true
    });

    // Add explosion behavior (e.g., particles, sound)
    // This can be expanded based on the available asset scripts

    // Remove the drone by setting its z position to -9999
    this.pos.z = -9999;
    console.log('Enemy drone has been deactivated by setting its z position to -9999.');
  }
});