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
        pos: V(0, 0, -9999), // Initialize at origin or desired spawn position
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
          if (this.player.isRacing) {
            this.repositionDrones(event.data.currentPathPosition);
          } else {
            // Stop all drones from firing if the player is not racing
            for (let drone of this.drones) {
              if (drone.cannon && drone.cannon.firing) {
                drone.cannon.stopFiring();
                console.log('Stopped drone firing because player is not racing.');
              }
            }
          }
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

    // Check if the player is racing
    if (!this.player.isRacing) {
      console.log('Player is not racing. Skipping drone repositioning.');
      return;
    }

    // Check if the level progress has reached or exceeded 90%
    if (currentPathPosition >= 0.9) {
      //console.log('Level progress is 90% or more. Stopping drone respawning.');
      return; // Stop respawning drones
    }

    // Iterate through all preallocated drones
    for (let drone of this.drones) {
      if (drone.pos.z < this.player.pos.z - 100) { // Assuming 'behind' means having a lesser z-position
        // Calculate a new position
        const randomOffset = 0.1 + Math.random() * 0.2; // Random between 0.1 and 0.3
        const newT = currentPathPosition + randomOffset;

        if (newT >= 0.9) {
          // Remove drone from playing field
          if (drone.pos.x != 9999) {
            drone.pos.x = 9999;
            console.log(`Drone repositioned to ${newT * 100}% of the level. Removing from play.`);
          }
          continue;
        }

        const clampedT = Math.min(newT, 0.9); // Ensure t does not exceed 0.9

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
      if (drone.cannon) {
        drone.cannon.stopFiring();
        console.log('Stopped drone firing during reset.');
      }
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
    // Create the enemy drone as a bright red drone with 2m diameter
    this.drone = this.createObject('object', {
      id: 'drone',
      col: 'red', // Changed color to bright red
      scale: V(10, 10, 10), // Increased scale to 10
      pos: V(0, 0, 0), // Initial position; adjust as needed
      collision_id: 'sphere',
      //collision_scale: V(1), // Sphere collider with radius 1m
      mass: 0,
      zdir: V(0, 0, 1),
      visible: true,
      player: this.player // Store the player reference
    });

    // Add a cannon to the drone
    this.cannon = this.drone.createObject('spacezone-cannon', {
      pos: '0 0 -2', // Positioned at the front of the drone
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
    /*
    this.createObject('object', { id: 'sphere', col: 'yellow', opacity: .8, depth_test: false, renderorder: 100, lighting: false });
    this.drone.createObject('object', { id: 'sphere', col: 'purple', opacity: .8, depth_test: false, renderorder: 101, scale: V(.75), lighting: false });
    */
  },
  update(dt) {
    if (!this.isActive) {
      // Check distance to player
      if (this.player) {
        const distance = this.distanceTo(this.player);
        if (distance <= this.activationDistance) {
          this.isActive = true;
          this.activateDrone();
        }
      }
    } else {
      // Move along the path at the same speed as the player
      //this.moveAlongPath(dt);

      // Rotate to face the player
      this.facePlayer(dt);

      // Fire at the player only if the player is racing
      if (this.player && this.player.isRacing) {
        this.cannon.firingRate = this.firingRate;
        if (this.cannon) {
          this.cannon.startFiring();
        }
      } else {
        if (this.cannon && this.cannon.isFiring) {
          this.cannon.stopFiring();
          console.log('Drone stopped firing because player is not racing.');
        }
      }
    }
  },
  activateDrone() {
    // Add thrust to move the drone forward at the specified speed
    //this.drone.addForce('thrust', { direction: this.drone.zdir, magnitude: this.droneSpeed });
    console.log('Enemy drone activated and started moving.');
  },
  moveAlongPath(dt) {
    // Implement movement logic to follow the level path
    const level = this.level;
    if (level && level.getPositionAtTime) {
      // Example: Move based on elapsed time and droneSpeed
      // You may need to implement a more sophisticated path-following mechanism
      const currentPosition = this.getWorldPosition();
      const direction = this.localToWorld(V(0,0,1)).sub(currentPosition).normalize();
      const newPosition = currentPosition.clone().add(direction.multiplyScalar(this.droneSpeed * dt));
      //this.pos = newPosition;
    }
  },
  facePlayer(dt) {
    if (!this.player) return;

    // Calculate direction vector from drone to player
    const direction = new THREE.Vector3().subVectors(this.player.taufighter.getWorldPosition(), this.drone.getWorldPosition()).normalize();

    /*
    // Calculate desired yaw and pitch in degrees
    let desiredYaw = Math.atan2(direction.x, direction.z) * (180 / Math.PI);
    let desiredPitch = Math.atan2(direction.y, Math.sqrt(direction.x * direction.x + direction.z * direction.z)) * (180 / Math.PI);

    // Get current rotation
    let currentRotation = this.rotation.clone();

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
    */
    // Update drone rotation
    //this.rotation = currentRotation;
    this.cannon.zdir = direction;
    this.cannon.pos = direction.clone().multiplyScalar(2);
  },
  handleCollision(ev) {
    if (ev.type === 'collision' && ev.data.other.collision_id === 'capsule') {
      this.explodeDrone();
    }
  },
  explodeDrone() {
    // Create explosion effect
    const explosion = room.createObject('explosion', {
      col: 'red',
      //scale: V(2, 2, 2),
      pos: this.getWorldPosition(),
      visible: true,
      showring: true,
      rotation: V(Math.random() * 360, 0, 0),
    });

    if (this.cannon) {
      this.cannon.stopFiring();
    }

    // Reset drone object positions
    this.drone.pos = V(0,0,0);
    this.drone.vel = V(0,0,0);
    this.drone.rotation = V(0,0,0);
    // Remove the drone by setting its z position to -9999
    this.pos.z = -9999;
    this.dispatchEvent({type: 'dronedestroyed', bubbles: true});
  }
});

room.registerElement('spacezone-enemy-mine', {
  pingSoundId: 'pingSound', // Ensure this sound is defined in your assets
  pingInterval: 2000, // Initial interval in milliseconds
  minPingInterval: 100, // Minimum interval as player approaches
  distanceThreshold: 2000, // Activation distance in meters
  explosionThreshold: 50, // Explosion distance in meters
  explosionTimer: 250, // Timer in milliseconds before mine explodes after triggering
  currentPingInterval: 5000, // Current interval
  pingTimer: 0,
  explosionTimerRemaining: 250, // Time remaining before explosion in milliseconds
  isExploding: false, // Flag to indicate if the mine is in the process of exploding
  exploded: false, // Flag to indicate if the mine has already exploded

  create() {
    // Create the mine as a purple sphere
    this.mine = this.createObject('object', {
      id: 'sphere',
      col: 'purple',
      scale: V(12),
      pos: V(0, 0, 0),
      collision_id: 'sphere',
      mass: 0,
      visible: true
    });

    // Reference to the player
    this.player = this.parent.getElementsByTagName('spacezone-spaceship')[0];
    
    if (!this.player) {
      console.warn('Player spaceship not found. spacezone-enemy-mine may not function correctly.');
    }

    // Initialize state
    this.isExploding = false;
    this.exploded = false;
    this.explosionTimerRemaining = this.explosionTimer;
  },

  update(dt) {
    if (!this.player) return;

    const distance = this.distanceTo(this.player);

    if (distance <= this.distanceThreshold && !this.isExploding && !this.exploded) {
      this.handlePing(dt, distance);
    }

    if (distance <= this.explosionThreshold && !this.isExploding && !this.exploded) {
      // Start the explosion timer
      this.isExploding = true;
      this.explosionTimerRemaining = this.explosionTimer / 1000;
      this.dispatchEvent({ type: 'trigger', bubbles: true });
      console.log('Mine triggered. Explosion will occur in', this.explosionTimer, 'milliseconds.');
    }

    if (this.isExploding && !this.exploded) {
      this.explosionTimerRemaining -= dt;
      if (this.explosionTimerRemaining <= 0) {
        this.explodeMine();
        this.dispatchEvent({ type: 'explode', bubbles: true });
      }
    }
  },

  handlePing(dt, distance) {
    this.pingTimer += dt * 1000; // Convert dt to milliseconds

    // Adjust the ping interval based on distance
    const desiredPingInterval = this.calculatePingInterval(distance);

    if (this.pingTimer >= this.currentPingInterval) {
      this.playPingSound();
      this.pingTimer = 0;
      this.currentPingInterval = desiredPingInterval;
    }
  },

  calculatePingInterval(distance) {
    // Linearly interpolate between minPingInterval and initial pingInterval based on distance
    const t = Math.max((this.distanceThreshold - distance) / (this.distanceThreshold - this.explosionThreshold), 0);
    return this.minPingInterval + t * (this.pingInterval - this.minPingInterval);
  },

  playPingSound() {
    console.log('ping!', this);
    if (this.pingSoundId) {
      room.createObject('sound', {
        src: this.pingSoundId,
        pos: this.mine.pos,
        loop: false,
        volume: 1
      });
    } else {
      console.warn('pingSoundId is not defined for spacezone-enemy-mine.');
    }
  },

  explodeMine() {
    this.isExploding = false;
    this.exploded = true;
    
    // Calculate damage based on distance raised to the power of 1.6
    const distance = this.distanceTo(this.player);
    const damageAmount = Math.max(100 - Math.pow(distance / 10, 1.6), 0); // Ensure damage is not negative
      
    // Dispatch damage event to the player
    if (this.player) {
      this.player.dispatchEvent({
        type: 'damage',
        data: {
          amount: damageAmount
        },
        bubbles: true
      });
      console.log(`Dispatched damage event to player with amount: ${damageAmount}`);
    } else {
      console.warn('Player object not found. Cannot dispatch damage event.');
    }

    // Spawn explosion with purple fragments
    const explosion = room.createObject('explosion', {
      col: 'purple',
      count: 500,
      pos: this.getWorldPosition(),
      visible: true,
      showring: true,
      rotation: V(Math.random() * 360, 0, 0),
    });
    console.log(`mine explodes ${distance}m from player, dealing ${damageAmount} points of damage!`, this);
    // Optionally, add particle effects or additional logic here

    // Remove the mine from the scene
    this.mine.pos = V(9999, 9999, 9999); // Move it out of the playable area
    this.dispatchEvent({type: 'mineexploded', bubbles: true});
  }
});