room.registerElement('spacezone-spaceship', {
  initialcargo: 100, // Configurable initial number of medical supplies
  currentcargo: 100, // Current number of medical supplies
  shieldstrength: 100, // Current strength of the radiation shield
  supplyexpirationrate: 1, // Base rate at which supplies expire per second
  damage: 0, // Current damage sustained by the ship

  rollspeed: 360, // Increased rotation speed to 360 degrees per second
  offsetRange: 20, // Configurable range for x and y offsets
  thrust: 40, // Thrust force applied when moving forward
  totalracetime: 120, // Total race duration in seconds
  rollDamping: 10, // Increased damping factor for roll
  pitchDamping: 5, // Damping factor for pitch
  maxspeedmultiplier: 1.5, // Reverted property for maximum speed multiplier
  maxPitch: 20, // Maximum pitch angle in degrees
  rollDecayDelay: 0.1, // Delay before starting roll decay in seconds

  create() {
    // Initialization code for spacezone-spaceship

    // Create HTML overlay for ship stats
    this.createShipStatsOverlay();

    // Initialize medical supplies and shield attributes
    this.currentcargo = this.initialcargo;
    this.shieldstrength = 100; // Fully shielded at start
    this.damage = 0;

    // Create spacezone-score element
    this.score = this.createObject('spacezone-score');

    // Initialize timeElapsedTimer for tracking time_elapsed events
    // this.timeElapsedTimer = 0; // Removed as not needed anymore

    // Add child object 'taufighter' with specified metalness and roughness
    this.taufighter = this.createObject('object', {
      id: 'spacefighter',
      pos: new THREE.Vector3(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
      zdir: new THREE.Vector3(0, 0, 1),
      mass: 1000,
      collidable: false, // Collider has been disabled
    });
    
    // Instantiate multiple engine trails as children of the player
    this.enginetrails = [];
    const trailPositions = [
      '-1.25 -0.2 -3',
      '1.25 -0.2 -3'
    ];
    for (const pos of trailPositions) {
      let trail = this.taufighter.createObject('spacezone-enginetrail', { pos: pos });
      this.enginetrails.push(trail);
    }

    this.isRacing = false;
    this.raceTime = 0;

    // Add background music sound object
    this.music = this.createObject('sound', {
      id: 'music-lastparsec', // Updated music ID to default to 'music-lastparsec'
      loop: true,
      volume: 1.0,
      auto_play: true
    });

    // Add control context for targeting, afterburner, fire, and rolling
    this.controlstate = this.addControlContext('spacezone-spaceship', {
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
      },
      'roll_left': { 
        defaultbindings: 'keyboard_a', 
        onactivate: () => { 
          this.isRollingLeft = true; 
          this.rollDecayTimer = 0; // Reset decay timer on activation
        },
        ondeactivate: () => { 
          this.isRollingLeft = false; 
          this.rollDecayTimer = 0; // Start decay timer on deactivation
        }
      },
      'roll_right': { 
        defaultbindings: 'keyboard_d', 
        onactivate: () => { 
          this.isRollingRight = true; 
          this.rollDecayTimer = 0; // Reset decay timer on activation
        },
        ondeactivate: () => { 
          this.isRollingRight = false; 
          this.rollDecayTimer = 0; // Start decay timer on deactivation
        }
      }
    });

    // Add targeting reticle as a sphere placeholder
    this.reticle = this.createObject('object', {
      id: 'sphere',
      col: 'red',
      scale: V(1),
      pos: new THREE.Vector3(0, 0, 20), // Positioned at (0, 0, 20)
      visible: false
    });

    // Initialize current orientation
    this.currentRoll = 180;
    this.currentPitch = 0;
    this.userControlledRoll = 0; // Added separate tracking for user-controlled roll
    this.rollDecayTimer = 0; // Timer for roll decay delay

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
      pos: '6.5 0 6', // Moved position to 6.5, 0, 6
      rotation: '0 180 0' // Rotated 180 degrees on y-axis
    });

    this.cannonRight = this.taufighter.createObject('spacezone-cannon', {
      pos: '-6.5 0 6', // Moved position to -6.5, 0, 6
      rotation: '0 180 0' // Rotated 180 degrees on y-axis
    });

    // Add shipcollider object as a separate collider
    this.shipcollider = this.taufighter.createObject('object', {
      //id: 'capsule',
      collision_id: 'capsule',
      pos: V(3, 0, 0),
      scale: V(6),
      col: 'red',
      opacity: 0.2,
      rotation: V(0, 0, 90)
    });
    this.shipcollider.addForce('drag', 0); // hack to keep object from sleeping and being uncollidable

    // Add collide event listener to taufighter
    this.shipcollider.addEventListener('collide', ev => this.handleCollide(ev));

    // Add click event listener to shipcollider
    this.shipcollider.addEventListener('click', ev => this.startRace());

    // Initialize rolling state
    this.isRollingLeft = false;
    this.isRollingRight = false;

    // Create spacezone-dialog element and initialize dialog
    this.dialog = this.createObject('spacezone-dialog');
    this.dialog.showDialog('dialogs/intro.txt');
    this.dialog.addEventListener('continue', () => this.startRace());

    // Initialize Enemy Drone Controller
    // Removed as drone controllers are now spawned by the level

    // Initialize Missile Launcher
    this.missileLauncher = this.createObject('spacezone-missile-launcher', {
      scanrange: 1000,
      locktime: 1,
      scantime: 0.25 // Added scantime attribute with default value of 0.5 seconds
    });

    // Create targeting reticle
    this.targetingReticle = room.createObject('spacezone-targeting-reticle');

    // Add event listeners for missile launcher to handle reticle position
    this.missileLauncher.addEventListener('targetacquired', (event) => {
      if (event.data) {
        this.targetingReticle.setTargetPosition(event.data.pos.clone(), false);
      } else {
        this.targetingReticle.hideReticle();
      }
    });

    this.missileLauncher.addEventListener('targetlocked', (event) => {
      if (event.data) {
        this.targetingReticle.setTargetPosition(event.data.pos.clone(), true);
      } else {
        this.targetingReticle.hideReticle();
      }
    });
  },
  createShipStatsOverlay() {
    // Create a div element for the overlay
    this.shipStatsOverlay = document.createElement('div');
    this.shipStatsOverlay.className = 'ship-stats-overlay';
    this.shipStatsOverlay.innerHTML = `
      <div>Shield Strength: <span id="shield-strength">100</span>%</div>
      <div>Cargo Remaining: <span id="cargo-remaining">100</span></div>
    `;
    document.body.appendChild(this.shipStatsOverlay);
  },
  updateShipStatsOverlay() {
    if (this.shipStatsOverlay) {
      const shieldElement = this.shipStatsOverlay.querySelector('#shield-strength');
      const cargoElement = this.shipStatsOverlay.querySelector('#cargo-remaining');
      if (shieldElement) shieldElement.textContent = Math.round(this.shieldstrength);
      if (cargoElement) cargoElement.textContent = Math.round(this.currentcargo);
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
  handleCollide(ev) {
    console.log(ev);

    // Implement damage model
    const damageAmount = 10; // Configurable damage per collision
    this.damage += damageAmount;
    console.log(`Ship damaged! Total damage: ${this.damage}`);

    // Decrease shield strength based on damage
    this.shieldstrength = Math.max(0, 100 - this.damage * 2); // Example: each damage reduces shield by 2
    console.log(`Shield strength: ${this.shieldstrength}`);

    // Optionally, update score or trigger events based on damage
    this.dispatchEvent({ type: 'ship_damaged', data: this.damage });

    // Check for race failure due to excessive damage
    if (this.shieldstrength <= 0) {
      console.log('Race failed due to excessive damage!');
      this.isRacing = false;
      this.deactivateControlContext('spacezone-spaceship');
      this.missileLauncher.disarm(); // Disarm missile launcher
      this.dialog.showDialog('dialogs/failure-destroyed.html'); // Show our failure-destroyed dialog
      this.targetingReticle.hideReticle(); // Hide reticle when race fails
    }
  },
  startRace() {
    player.disable();
    this.activateControlContext('spacezone-spaceship');
    
    // Arm the missile launcher
    if (this.missileLauncher && typeof this.missileLauncher.arm === 'function') {
      this.missileLauncher.arm();
    } else {
      console.warn('Missile Launcher not found or arm function unavailable.');
    }

    // Reset the score at the start of the race
    if (this.score && typeof this.score.reset === 'function') {
      this.score.reset();
    } else {
      console.warn('Score object not found or reset method is unavailable.');
    }
    
    // Reset medical supplies and shield strength at the start of the race
    this.currentcargo = this.initialcargo;
    this.shieldstrength = 100;
    this.damage = 0;

    // Hide the "Click ship to start" text
    if (this.parent && this.parent.textObject) {
      this.parent.textObject.visible = false;
    }

    // Set shipcollider as not pickable when race starts
    if (this.shipcollider) {
      this.shipcollider.pickable = false;
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
    // Emit 'race_start' event
    if(this.parent) {
      this.parent.dispatchEvent({type: 'race_start'});
    } else {
      console.warn('Parent not found. Cannot dispatch race_start event.');
    }
  },
  update(dt) {
    // Update ship stats overlay
    this.updateShipStatsOverlay();

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
        
        // Set shipcollider back to pickable when race is complete
        if (this.shipcollider) {
          this.shipcollider.pickable = true;
        }

        // Disarm the missile launcher
        if (this.missileLauncher && typeof this.missileLauncher.disarm === 'function') {
          this.missileLauncher.disarm();
        } else {
          console.warn('Missile Launcher not found or disarm function unavailable.');
        }

        // Emit 'race_complete' event
        if(this.parent) {
          this.parent.dispatchEvent({type: 'race_complete'});
        } else {
          console.warn('Parent not found. Cannot dispatch race_complete event.');
        }

        // Hide the reticle when race is complete
        this.targetingReticle.hideReticle();
      }

      // Implement supply expiration logic
      const effectiveShield = Math.max(0, this.shieldstrength);
      const supplyRate = this.supplyexpirationrate * (1 / (effectiveShield / 100 + 0.1)); // Prevent division by zero
      const suppliesLost = supplyRate * dt;
      this.currentcargo = Math.max(0, this.currentcargo - suppliesLost);
      this.dispatchEvent({ type: 'supplies_lost', data: suppliesLost });

      // Update score based on remaining supplies
      // Removed the call to this.score.updateSupplies(this.currentcargo);
      
      // Check if all supplies are lost
      if(this.currentcargo <= 0){
        this.isRacing = false;
        console.log('All medical supplies have been lost!');
        // Disarm the missile launcher
        if (this.missileLauncher && typeof this.missileLauncher.disarm === 'function') {
          this.missileLauncher.disarm();
        } else {
          console.warn('Missile Launcher not found or disarm function unavailable.');
        }
        // Emit an event or handle game over state as needed
        this.dispatchEvent({ type: 'supplies_depleted' });
        this.deactivateControlContext('spacezone-spaceship');
        this.dialog.showDialog('dialogs/failure-depleted.html');
        this.targetingReticle.hideReticle(); // Hide reticle when supplies are depleted
      }

      // Emit time_elapsed event with updated data
      this.dispatchEvent({
        type: 'time_elapsed',
        data: {
          dt: dt,
          pos: this.pos.clone(),
          currentPathPosition: t
        }
      });
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

    // Clamp the currentRoll to the range -180 to 180 degrees
    if (this.currentRoll > 180) {
      this.currentRoll -= 360;
    } else if (this.currentRoll < -180) {
      this.currentRoll += 360;
    }

    this.currentPitch += pitchTurn;

    // Apply additional roll from key inputs
    if (this.isRollingLeft) {
      this.userControlledRoll -= this.rollspeed * dt; // Update user-controlled roll
      this.rollDecayTimer = 0; // Reset decay timer while rolling
    }
    if (this.isRollingRight) {
      this.userControlledRoll += this.rollspeed * dt; // Update user-controlled roll
      this.rollDecayTimer = 0; // Reset decay timer while rolling
    }

    // Clamp userControlledRoll to ±90 degrees
    this.userControlledRoll = THREE.MathUtils.clamp(this.userControlledRoll, -90, 90);

    // Handle roll decay delay
    if (!this.isRollingLeft && !this.isRollingRight) {
      this.rollDecayTimer += dt;
      if (this.rollDecayTimer >= this.rollDecayDelay) {
        const rollDecay = this.rollspeed * dt;
        if (this.userControlledRoll > rollDecay) {
          this.userControlledRoll -= rollDecay;
        } else if (this.userControlledRoll < -rollDecay) {
          this.userControlledRoll += rollDecay;
        } else {
          this.userControlledRoll = 0;
        }
      }
    } else {
      this.rollDecayTimer = 0; // Reset timer if still rolling
    }

    // Wrap userControlledRoll to stay between -180 and 180 degrees
    if (this.userControlledRoll > 180) {
      this.userControlledRoll -= 360;
    } else if (this.userControlledRoll < -180) {
      this.userControlledRoll += 360;
    }

    // Clamp currentPitch to the maximum allowed pitch
    this.currentPitch = THREE.MathUtils.clamp(this.currentPitch, -this.maxPitch, this.maxPitch);

    // Calculate combined roll
    let combinedRoll = this.currentRoll + this.userControlledRoll;

    // Clamp combined roll to ±90 degrees
    combinedRoll = THREE.MathUtils.clamp(combinedRoll, -90, 90);

    // Apply the combined roll and pitch to the taufighter's orientation
    this.taufighter.rotation.set(
      this.currentPitch,
      0,
      combinedRoll
    );

    // Inertial Flight Model
    if (this.isRacing) {
      // Calculate forward direction based on current orientation
      const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(
        -THREE.MathUtils.degToRad(this.currentPitch),
        -THREE.MathUtils.degToRad(this.currentRoll + this.userControlledRoll),
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
    
room.registerElement('spacezone-enemy-dronecontroller', {
  numdrones: 10, // Default number of drones

  create() {
    // Preallocate drones and store them in this.drones
    this.drones = [];
    this.player = this.parent.getElementsByTagName('spacezone-spaceship')[0]; // Ensure player is retrieved here
    for (let i = 0; i < this.numdrones; i++) {
      let drone = this.createObject('spacezone-enemy-drone', {
        pos: V(0, 0, 0), // Initialize at origin or desired spawn position
        player: this.player // Pass the player reference to each drone
      });
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
        const randomOffset = 0.1 + Math.random() * 0.1; // Random between 0.1 and 0.2
        const newT = currentPathPosition + randomOffset;
        const clampedT = Math.min(newT, 1.0); // Ensure t does not exceed 1.0

        const newPosition = this.level.getPositionAtTime(newT);

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
  }
});
    
room.registerElement('spacezone-dialog', {
  create() {
    // Create the dialog container
    this.dialogContainer = document.createElement('div');
    this.dialogContainer.className = 'spacezone-dialog-container';
    this.dialogContainer.style.display = 'none'; // Initially hidden

    // Create the content area
    this.contentArea = document.createElement('div');
    this.dialogContainer.appendChild(this.contentArea);

    // Create the "Continue" button
    this.continueButton = document.createElement('button');
    this.continueButton.textContent = 'Continue';
    this.continueButton.className = 'spacezone-continue-button';
    this.dialogContainer.appendChild(this.continueButton);

    // Append the dialog to the document body
    document.body.appendChild(this.dialogContainer);

    // Add event listener to the "Continue" button
    this.continueButton.addEventListener('click', () => {
      this.emitContinueEvent();
      this.hideDialog();
    });
  },
  showDialog(dialogPath) {
    fetch(dialogPath)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to load dialog file: ${response.statusText}`);
        }
        return response.text();
      })
      .then(htmlContent => {
        this.contentArea.innerHTML = htmlContent;
        this.dialogContainer.style.display = 'block';
      })
      .catch(error => {
        console.error('Error loading dialog:', error);
        this.contentArea.innerHTML = '<p>Error loading dialog.</p>';
        this.dialogContainer.style.display = 'block';
      });
  },
  hideDialog() {
    this.dialogContainer.style.display = 'none';
  },
  emitContinueEvent() {
    this.dispatchEvent(new Event('continue'));
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
      vel: V(0, 0, -10), // Set vel to V(0,0,-10)
      rand_vel: V(0,0,-20), // Set rand_vel to V(0,0,-20)
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
    const player = this.getParentByTagName('spacezone-spaceship');

    if (player && player.isRacing) {
      this.particle.rate = 400;
      if (player.afterburner) {
        this.particle.col = '#FFAA00'; // Changed to brighter yellowish orange
      } else {
        this.particle.col = 'cyan';
      }

      // Emit time_elapsed event with updated data
      this.dispatchEvent({
        type: 'time_elapsed',
        data: {
          dt: dt,
          pos: this.pos.clone(),
          currentPathPosition: player.raceTime / player.totalracetime
        }
      });
    } else {
      this.particle.rate = 0;
    }
  }
});
    
room.registerElement('spacezone-cannon', {
  rate: 10, // Default rate: increased to 10 shots per second
  muzzlespeed: 400, // Default muzzle speed increased to 400
  muzzleflash: false, // Added muzzleflash attribute with default value false
  create() {
    // Initialization code for spacezone-cannon
    this.firing = false;
    this.cooldown = 0;

    if (this.muzzleflash) {
      // Add dynamic light matching the laser beam color
      this.flashLight = this.createObject('light', {
        type: 'point', // Using point light; can be changed to spotlight if preferred
        light_intensity: 0, // Initial light_intensity is 0 (off)
        col: 'limegreen', // Same color as laser beam
        light_range: 500, // Set light range to 500
        decay: 1, // Light decay rate
        pos: V(0, 0, 1),
        light_shadow: true
      });

      // Flash light parameters
      this.flashIntensity = 5; // Intensity when flashing
      this.flashFadeRate = 20; // Rate at which the light fades per second
    }
  },
  startFiring() {
    this.firing = true;
  },
  stopFiring() {
    this.firing = false;
  },
  flashLightIntensity(dt) {
    if (this.muzzleflash && this.flashLight.light_intensity > 0) {
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
    const spawnPosition = this.getWorldPosition(); // Updated to use this.getWorldPosition()

    // Get forward position and compute direction
    const forwardPosition = this.localToWorld(V(0, 0, 1));
    const direction = new THREE.Vector3().subVectors(spawnPosition, forwardPosition).normalize();

    // Spawn a spacezone-laserbeam using the object pool
    this.pool.grab({
      pos: spawnPosition,
      zdir: direction,
      vel: direction.clone().multiplyScalar(this.muzzlespeed)
    });

    if (this.muzzleflash) {
      // Trigger the flash light
      this.flashLight.light_intensity = this.flashIntensity;
    }

    // Dispatch "weapon_fire" event with bubbles: true
    this.dispatchEvent({ type: 'weapon_fire', bubbles: true });
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
      collision_id: 'capsule', // Added collision_id for collision detection
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

// Added Enemy Drone Entity
room.registerElement('spacezone-enemy-drone', {
  activationDistance: 1000, // Distance in meters to activate the drone
  firingRate: 1, // Shots per second
  droneSpeed: 40, // Speed of the drone in meters per second
  player: null,

  create() {
    // Create the enemy drone as a bright red sphere with 2m diameter
    this.drone = this.createObject('object', {
      id: 'sphere',
      col: 'red', // Changed color to bright red
      scale: V(10, 10, 10), // Increased scale to 10
      pos: V(0, 0, 0), // Initial position; adjust as needed
      collision_id: 'enemy_drone',
      collision_scale: V(1), // Sphere collider with radius 1m
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
  handleCollision(ev) {
    if (ev.type === 'collision' && ev.other.collision_id === 'capsule') {
      this.explodeDrone();
    }
  },
  explodeDrone() {
    // Create explosion effect
    const explosion = this.createObject('object', {
      id: 'explosion',
      col: 'orange',
      scale: V(2, 2, 2),
      pos: this.drone.pos.clone(),
      visible: true
    });

    // Add explosion behavior (e.g., particles, sound)
    // This can be expanded based on the available asset scripts

    // Remove the drone from the scene
    this.drone.die();
    console.log('Enemy drone has been destroyed.');
  }
});

// File: static/spacezone/entities/spacezone-score.js
room.registerElement('spacezone-score', {
  scores: {
    time_elapsed: 100,
    weapon_fire: -5,
    race_complete: 10000,
    supplies_lost: -10 // Added score for supplies lost
  },
  totalScore: 0,

  create() {
    // Initialize totalScore and set up event listeners
    this.reset();

    // Create text object for displaying the score
    this.scoreLabel = this.createObject('text', {
      text: `Score: ${this.totalScore}`,
      pos: new THREE.Vector3(22, 12, 0),
      rotation: '0 180 0',
      font_scale: false,
      col: 'white',
      font_size: 2
    });

    // Event handlers bound to the parent
    if(this.parent) {
      this.parent.addEventListener('time_elapsed', (e) => this.addScore(e));
      this.parent.addEventListener('weapon_fire', (e) => this.addScore(e));
      this.parent.addEventListener('race_complete', (e) => this.addScore(e));
      this.parent.addEventListener('supplies_lost', (e) => this.addScore(e)); // Listen for supplies_lost
    } else {
      console.warn('Parent not found. Cannot bind event listeners.');
    }

    // console.log('Spacezone-score element created and event listeners attached.');
  },

  reset() {
    this.totalScore = 0;
    if(this.scoreLabel) {
      this.scoreLabel.text = `Score: ${this.totalScore}`;
    }
    // console.log('Score has been reset to 0.');
  },

  addScore(event) {
    if(event.type === 'time_elapsed') {
      const scoreChange = Math.round(event.data.dt * this.scores[event.type]);
      this.totalScore += scoreChange;
      // console.log(`Event '${event.type}' occurred. Score change: ${scoreChange}. Total score: ${this.totalScore}`);
    } else if(this.scores.hasOwnProperty(event.type)) {
      this.totalScore += this.scores[event.type];
      // console.log(`Event '${event.type}' occurred. Score change: ${this.scores[event.type]}. Total score: ${this.totalScore}`);
    } else {
      console.warn(`Unknown event type '${event.type}' for scoring.`);
    }

    if(this.scoreLabel) {
      this.scoreLabel.text = `Score: ${this.totalScore}`;
    }
  },
  
  updateSupplies() {
    if(this.parent && typeof this.parent.initialcargo === 'number' && typeof this.parent.currentcargo === 'number') {
      const lostSupplies = this.parent.initialcargo - this.parent.currentcargo;
      const scoreChange = this.scores.supplies_lost * lostSupplies;
      this.totalScore += scoreChange;
      if(this.scoreLabel) {
        this.scoreLabel.text = `Score: ${this.totalScore}`;
      }
      console.log(`Supplies lost: ${lostSupplies}. Score changed by: ${scoreChange}. Total score: ${this.totalScore}`);
    } else {
      console.warn('Parent initialcargo or currentcargo is not accessible.');
    }
  }
});


room.registerElement('spacezone-missile-launcher', {
  scanrange: 1000, // Default scan range in meters
  locktime: 1, // Default lock time in seconds
  scantime: 0.25, // Added scantime attribute with default value of 0.5 seconds
  activetarget: null,
  locked: false,
  lockTimer: null,
  armed: false, // Added armed attribute, defaulting to false

  create() {
    // Initialization code for missile launcher
    this.scan();
    this.addEventListener('targetacquired', (event) => {
      console.log('Target acquired:', event.data);
    });
    this.addEventListener('targetlocked', (event) => {
      console.log('Target locked:', event.data);
    });
  },

  arm() {
    this.armed = true;
    console.log('Missile launcher armed.');
  },

  disarm() {
    this.armed = false;
    console.log('Missile launcher disarmed.');
    this.hideReticle(); // Ensure reticle is hidden when disarmed
  },
  
  scan() {
    if (!this.armed) {
      // Scanner is armed, do not scan
      return;
    }

    const enemies = room.getElementsByClassName('enemy');
    if (enemies.length === 0) {
      console.log('No enemies found within scan range.');
      this.dispatchEvent({ type: 'targetlocked', data: null }); // Emit event to hide reticle
      return;
    }

    // Find the closest enemy within scan range and within angle <= 30 degrees
    let closestEnemy = null;
    let minDistance = Infinity;
    const launcherPosition = this.getWorldPosition();
    const headingPoint = launcherPosition.clone().add(new THREE.Vector3(0, 0, 1)); // 1m in front on z-axis
    const headingVector = headingPoint.clone().sub(launcherPosition).normalize();

    for (let enemy of enemies) {
      const distance = launcherPosition.distanceTo(enemy.pos);
      if (distance <= this.scanrange) {
        // Calculate angle between heading vector and target vector
        const targetVector = enemy.getWorldPosition().clone().sub(launcherPosition).normalize();
        const dotProduct = headingVector.dot(targetVector);
        const angle = Math.acos(dotProduct) * (180 / Math.PI); // Convert to degrees

        if (angle <= 30) {
          if (distance < minDistance) {
            minDistance = distance;
            closestEnemy = enemy;
          }
        }
      }
    }

    if (closestEnemy) {
      if (this.activetarget !== closestEnemy) {
        this.activetarget = closestEnemy;
        this.locked = false;
        this.dispatchEvent({
          type: 'targetacquired',
          data: this.activetarget
        });

        // Clear existing timer if any
        if (this.lockTimer) {
          clearTimeout(this.lockTimer);
        }

        // Set timer to lock the target after scantime seconds
        this.lockTimer = setTimeout(() => {
          if (this.activetarget && !this.locked) {
            this.lock();
          }
        }, this.scantime * 1000);
      }
    } else {
      console.log('No suitable targets within angle restrictions.');
      this.activetarget = null;
      this.dispatchEvent({ type: 'targetlocked', data: null }); // Emit event to hide reticle
    }
  },

  lock() {
    if (this.activetarget) {
      this.locked = true;
      this.dispatchEvent({
        type: 'targetlocked',
        data: this.activetarget
      });
      console.log('Target locked:', this.activetarget);
    }
  },

  fire() {
    if (this.locked && this.activetarget) {
      // Spawn a new missile
      const missile = room.createObject('spacezone-missile', {
        pos: this.getWorldPosition(), // Using this.getWorldPosition() for current launcher position
        orientation: this.getWorldOrientation(),
        target: this.activetarget
      });
      console.log('Missile fired towards:', this.activetarget);
    } else {
      console.log('Cannot fire: No target locked.');
    }
  },

  hideReticle() {
    this.dispatchEvent({ type: 'targetlocked', data: null });
  },

  update(dt) {
    // Optionally, implement periodic scanning
    // For example, scan every scantime seconds
    this.scanInterval = this.scanInterval || 0;
    this.scanInterval += dt;
    if (this.scanInterval >= this.scantime) {
      this.scan();
      this.scanInterval = 0;
    }
  }
});
    
// New Element: spacezone-missile
room.registerElement('spacezone-missile', {
  target: null,
  speed: 100, // Missile speed in meters per second
  active: true,

  create() {
    // Initialize missile properties
    this.target = this.properties.target;
    if (!this.target) {
      console.warn('Missile launched without a target.');
      this.active = false;
      this.die();
      return;
    }

    // Create missile object
    this.missile = this.createObject('object', {
      id: 'capsule',
      col: 'orange',
      scale: V(0.5, 2, 0.5),
      pos: this.properties.pos || V(0, 0, 0),
      rotation: this.properties.orientation || '0 0 0',
      collision_id: 'missile',
      mass: 50,
      zdir: new THREE.Vector3(0, 0, 1),
      visible: true
    });

    // Add velocity towards the target
    const direction = this.target.pos.clone().sub(this.missile.pos).normalize();
    this.missile.vel = direction.multiplyScalar(this.speed);

    // Add collision event listener
    this.missile.addEventListener('collide', (ev) => this.handleCollision(ev));
  },

  handleCollision(ev) {
    if (ev.type === 'collision' && ev.other.collision_id === 'enemy_drone') {
      console.log('Missile hit an enemy drone:', ev.other);
      this.explode();
      ev.other.dispatchEvent({ type: 'hit', data: this });
      this.die();
    }
  },

  explode() {
    // Create explosion effect
    const explosion = this.createObject('object', {
      id: 'explosion',
      col: 'red',
      scale: V(1, 1, 1),
      pos: this.missile.pos.clone(),
      visible: true
    });

    // Optionally, add particle effects or sound here

    console.log('Missile exploded at:', this.missile.pos);
  },

  update(dt) {
    if (!this.active) return;

    // Move missile forward
    this.missile.pos.add(this.missile.vel.clone().multiplyScalar(dt));

    // Optionally, track the target's movement
    if (this.target) {
      const newDirection = this.target.pos.clone().sub(this.missile.pos).normalize();
      this.missile.vel = newDirection.multiplyScalar(this.speed);
    }

    // Optionally, check if missile is out of bounds
    // For example, if too far from origin, deactivate
    const maxDistance = 2000;
    if (this.missile.pos.length() > maxDistance) {
      this.die();
    }
  }
});

// File: static/spacezone/entities/spacezone-score.js
room.registerElement('spacezone-score', {
  scores: {
    time_elapsed: 100,
    weapon_fire: -5,
    race_complete: 10000,
    supplies_lost: -10 // Added score for supplies lost
  },
  totalScore: 0,

  create() {
    // Initialize totalScore and set up event listeners
    this.reset();

    // Create text object for displaying the score
    this.scoreLabel = this.createObject('text', {
      text: `Score: ${this.totalScore}`,
      pos: new THREE.Vector3(22, 12, 0),
      rotation: '0 180 0',
      font_scale: false,
      col: 'white',
      font_size: 2
    });

    // Event handlers bound to the parent
    if(this.parent) {
      this.parent.addEventListener('time_elapsed', (e) => this.addScore(e));
      this.parent.addEventListener('weapon_fire', (e) => this.addScore(e));
      this.parent.addEventListener('race_complete', (e) => this.addScore(e));
      this.parent.addEventListener('supplies_lost', (e) => this.addScore(e)); // Listen for supplies_lost
    } else {
      console.warn('Parent not found. Cannot bind event listeners.');
    }

    // console.log('Spacezone-score element created and event listeners attached.');
  },

  reset() {
    this.totalScore = 0;
    if(this.scoreLabel) {
      this.scoreLabel.text = `Score: ${this.totalScore}`;
    }
    // console.log('Score has been reset to 0.');
  },

  addScore(event) {
    if(event.type === 'time_elapsed') {
      const scoreChange = Math.round(event.data.dt * this.scores[event.type]);
      this.totalScore += scoreChange;
      // console.log(`Event '${event.type}' occurred. Score change: ${scoreChange}. Total score: ${this.totalScore}`);
    } else if(this.scores.hasOwnProperty(event.type)) {
      this.totalScore += this.scores[event.type];
      // console.log(`Event '${event.type}' occurred. Score change: ${this.scores[event.type]}. Total score: ${this.totalScore}`);
    } else {
      console.warn(`Unknown event type '${event.type}' for scoring.`);
    }

    if(this.scoreLabel) {
      this.scoreLabel.text = `Score: ${this.totalScore}`;
    }
  },
  
  updateSupplies() {
    if(this.parent && typeof this.parent.initialcargo === 'number' && typeof this.parent.currentcargo === 'number') {
      const lostSupplies = this.parent.initialcargo - this.parent.currentcargo;
      const scoreChange = this.scores.supplies_lost * lostSupplies;
      this.totalScore += scoreChange;
      if(this.scoreLabel) {
        this.scoreLabel.text = `Score: ${this.totalScore}`;
      }
      console.log(`Supplies lost: ${lostSupplies}. Score changed by: ${scoreChange}. Total score: ${this.totalScore}`);
    } else {
      console.warn('Parent initialcargo or currentcargo is not accessible.');
    }
  }
});


// New Element: spacezone-targeting-reticle
room.registerElement('spacezone-targeting-reticle', {
  create() {
    // Create a green plane object with billboard: 'y' and opacity 0.6
    this.reticle = this.createObject('object', {
      id: 'cube',
      col: 'green',
      scale: V(20, 20, .1), // Adjust scale as needed
      billboard: 'y',
      opacity: 0.6,
      depth_test: false,
      render_order: 10,
      lighting: false, // Set lighting to false
      visible: false // Initially hidden
    });
  },

  setTargetPosition(targetPosition, locked) {
    if (this.reticle) {
      this.pos = targetPosition;
      this.reticle.visible = true;
      this.reticle.col = locked ? 'green' : 'yellow';
    }
  },

  hideReticle() {
    if (this.reticle) {
      this.reticle.visible = false;
    }
  },

  update(dt) {
    // Additional update logic if needed
  }
});