room.registerElement('spacezone-spaceship', {
  initialcargo: 1000, // Configurable initial number of medical supplies
  currentcargo: 1000, // Current number of medical supplies
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

  // New properties for device motion
  devicePitch: 0,
  deviceRoll: 0,
  deviceOffsetX: 0,
  deviceOffsetY: 0,
  
  // Properties for orientation calibration
  initialDevicePitch: null,
  initialDeviceRoll: null,

  // Kalman filter instances for smoothing
  pitchFilter: null,
  rollFilter: null,
  offsetXFilter: null,
  offsetYFilter: null,

  // Simple Kalman Filter class
  KalmanFilter: class {
    constructor(R = 0.01, Q = 0.01) {
      this.R = R; // Measurement noise
      this.Q = Q; // Process noise
      this.A = 1;
      this.B = 0;
      this.C = 1;

      this.cov = 1;
      this.x = 0;
    }

    filter(z) {
      // Prediction
      const predX = this.A * this.x + this.B;
      const predCov = this.A * this.cov * this.A + this.Q;

      // Kalman Gain
      const K = predCov * this.C / (this.C * predCov * this.C + this.R);

      // Correction
      this.x = predX + K * (z - this.C * predX);
      this.cov = (1 - K * this.C) * predCov;

      return this.x;
    }

    setInitial(value) {
      this.x = value;
    }
  },

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
          this.missileLauncher.fire();
          //this.cannonLeft.startFiring();
          //this.cannonRight.startFiring();
        },
        ondeactivate: () => {
          //this.cannonLeft.stopFiring();
          //this.cannonRight.stopFiring();
          // No action required on deactivation
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

    // Add spacezone-cannons to the taufighterS
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
    this.shipcollider.addClass('nomissile'); // Added 'nomissile' class to shipcollider

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
    this.missileLauncher = this.taufighter.createObject('spacezone-missile-launcher', {
      pos: V(0,0,6),
      scanrange: 1000,
      locktime: 1,
      scantime: 0.25 // Added scantime attribute with default value of 0.5 seconds
    });

    // Create targeting reticle
    this.targetingReticle = room.createObject('spacezone-targeting-reticle');

    // Add event listeners for missile launcher to handle reticle position
    this.missileLauncher.addEventListener('targetacquired', (event) => {
      if (event.data && event.data.activetarget) {
        this.targetingReticle.setTargetPosition(event.data.activetarget.pos.clone(), event.data.percent_locked);
      } else {
        this.targetingReticle.hideReticle();
      }
    });

    this.missileLauncher.addEventListener('targetlocked', (event) => {
      if (event.data && event.data.activetarget) {
        this.targetingReticle.setTargetPosition(event.data.activetarget.pos.clone(), 1);
      } else {
        this.targetingReticle.hideReticle();
      }
    });

    // Add device motion event listener
    window.addEventListener('devicemotion', this.handleDeviceMotion.bind(this));

    // Initialize Kalman filters for smoothing device orientation
    this.pitchFilter = new this.KalmanFilter(0.99, 0.4);
    this.rollFilter = new this.KalmanFilter(0.99, 0.4);
    this.offsetXFilter = new this.KalmanFilter(0.99, 0.4);
    this.offsetYFilter = new this.KalmanFilter(0.99, 0.4);

    // Set initial filter values if needed
    this.pitchFilter.setInitial(0);
    this.rollFilter.setInitial(0);
    this.offsetXFilter.setInitial(0);
    this.offsetYFilter.setInitial(0);
  },
  handleDeviceMotion(event) {
    // Map device orientation to ship's pitch and roll
    if (event.rotationRate) {
      // Optional: Use rotationRate to adjust orientation
    }

    if (event.accelerationIncludingGravity) {
      const acc = event.accelerationIncludingGravity;
      // Calculate pitch and roll based on acceleration
      let rawPitch = Math.atan2(acc.y, Math.sqrt(acc.x * acc.x + acc.z * acc.z));
      let rawRoll = Math.atan2(acc.x, acc.z);

      // Clamp pitch and roll to prevent excessive tilting
      rawPitch = THREE.MathUtils.clamp(rawPitch, -this.maxPitch * Math.PI / 180, this.maxPitch * Math.PI / 180);
      rawRoll = THREE.MathUtils.clamp(rawRoll, -Math.PI / 2, Math.PI / 2);

      // Apply Kalman filter
      this.devicePitch = this.pitchFilter.filter(rawPitch);
      this.deviceRoll = this.rollFilter.filter(rawRoll);
    }

    if (event.acceleration) {
      const acc = event.acceleration;
      // Map left/right and up/down movements to offset
      let rawOffsetX = this.deviceOffsetX + acc.x * 0.1; // Adjust the multiplier as needed
      let rawOffsetY = this.deviceOffsetY + acc.y * 0.1;

      // Clamp raw offsets within the configured range
      rawOffsetX = THREE.MathUtils.clamp(rawOffsetX, -this.offsetRange, this.offsetRange);
      rawOffsetY = THREE.MathUtils.clamp(rawOffsetY, -this.offsetRange, this.offsetRange);

      // Apply Kalman filter
      this.deviceOffsetX = this.offsetXFilter.filter(rawOffsetX);
      this.deviceOffsetY = this.offsetYFilter.filter(rawOffsetY);
    }

    // Handle orientation calibration
    if (this.isRacing && this.initialDevicePitch !== null && this.initialDeviceRoll !== null) {
      this.devicePitch -= this.initialDevicePitch;
      this.deviceRoll -= this.initialDeviceRoll;

      // Clamp devicePitch and deviceRoll to prevent gimbal lock
      this.devicePitch = THREE.MathUtils.clamp(this.devicePitch, -this.maxPitch * Math.PI / 180, this.maxPitch * Math.PI / 180);
      this.deviceRoll = THREE.MathUtils.clamp(this.deviceRoll, -Math.PI / 2, Math.PI / 2);
    }
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

    // Don't let the player's weapons hurt themselves
    if (ev.data.other.hasClass('playerweapon')) return;
      
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

      // Set shipcollider.collidable to false and shipcollider.pickable to true when race ends
      if (this.shipcollider) {
        this.shipcollider.pickable = true;
        this.shipcollider.collidable = false;
      }

      // Reset orientation calibration
      this.initialDevicePitch = null;
      this.initialDeviceRoll = null;
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

    // Set shipcollider.collidable to true and .pickable to false when race starts
    if (this.shipcollider) {
      this.shipcollider.pickable = false;
      this.shipcollider.collidable = true;
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

    // Store initial device orientation for calibration
    this.initialDevicePitch = this.devicePitch;
    this.initialDeviceRoll = this.deviceRoll;
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
        const rollRad = THREE.MathUtils.degToRad(this.currentRoll) + this.deviceRoll;
        const pitchRad = THREE.MathUtils.degToRad(this.currentPitch) + this.devicePitch;

        let offsetX = Math.sin(rollRad) * this.offsetRange + this.deviceOffsetX;
        let offsetY = Math.sin(pitchRad) * this.offsetRange + this.deviceOffsetY;

        // Clamp offsets within the configured range
        offsetX = Math.max(-this.offsetRange, Math.min(this.offsetRange, offsetX));
        offsetY = Math.max(-this.offsetRange, Math.min(this.offsetRange, offsetY));

        // Apply the offset to the shuttle object
        this.taufighter.pos.set(offsetX, offsetY, 0);
      }

      if(t >= 1){
        this.isRacing = false;
        console.log('Race completed!');
        
        // Set shipcollider.collidable to false when race ends
        if (this.shipcollider) {
          this.shipcollider.collidable = false;
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

        // Reset orientation calibration
        this.initialDevicePitch = null;
        this.initialDeviceRoll = null;
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

        // Set shipcollider.collidable to false and .pickable to true when race ends
        if (this.shipcollider) {
          this.shipcollider.pickable = true;
          this.shipcollider.collidable = false;
        }

        // Reset orientation calibration
        this.initialDevicePitch = null;
        this.initialDeviceRoll = null;
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

    // Update smoke trail emitter position
    if (this.smokeTrail) {
      const missileWorldPos = new THREE.Vector3();
      this.missile.getWorldPosition(missileWorldPos);
      this.smokeTrail.emitter_pos = missileWorldPos;
    }
  },
  reset() {
    for (let drone of this.drones) {
      drone.pos.z = -9999;
    }
    console.log('All drones have been reset to z position -9999.');

    // Reset orientation calibration
    this.initialDevicePitch = null;
    this.initialDeviceRoll = null;
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
  muzzlespeed: 12, // Default muzzle speed increased to 400
  muzzleflash: false, // Added muzzleflash attribute with default value false,
  laserpool: null,

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
    if (!this.laserpool) {
      // Initialize the object pool for laser beams
      this.laserpool = room.createObject('objectpool', {
        objecttype: 'spacezone-laserbeam',
        max: 20
      });
    }        

    // Get spawnPosition using ship's world coordinates
    const spawnPosition = this.getWorldPosition(); // Updated to use this.getWorldPosition()

    // Get forward position and compute direction
    const forwardPosition = this.localToWorld(V(0, 0, 1));
    const direction = new THREE.Vector3().subVectors(spawnPosition, forwardPosition).normalize()

    // Spawn a spacezone-laserbeam using the object pool
    this.laserpool.grab({
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

    // Store the last target after firing
    if (this.activetarget) {
      this.lasttarget = this.activetarget;
    }
  },
  update(dt) {
    // Dynamically set muzzlespeed based on currentSpeedMultiplier
    if (this.parent && this.parent.parent) {
      this.muzzlespeed = 800 * this.parent.parent.currentSpeedMultiplier;
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
      //collision_id: 'capsule', // Added collision_id for collision detection
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

room.registerElement('spacezone-missile-launcher', {
  scanrange: 1000, // Default scan range in meters
  locktime: 1, // Default lock time in seconds
  scantime: 0.25, // Added scantime attribute with default value of 0.5 seconds
  activetarget: null,
  locked: false,
  lockTimer: null,
  armed: false, // Added armed attribute, defaulting to false
  missilePool: null, // Added missilePool property
  lasttarget: null, // Added lasttarget property
  lockStartTime: null, // Added lockStartTime for tracking lock progress

  create() {
    // Initialization code for missile launcher
    this.scan();
    this.addEventListener('targetacquired', (event) => {
      //console.log('Target acquired:', event.data);
    });
    this.addEventListener('targetlocked', (event) => {
      //console.log('Target locked:', event.data);
    });
    this.createObject('object', { id: 'cube', col: 'purple' });
  },

  arm() {
    this.armed = true;
    console.log('Missile launcher armed.');
  },

  disarm() {
    this.armed = false;
    console.log('Missile launcher disarmed.');
    this.hideReticle(); // Ensure reticle is hidden when disarmed
    this.activetarget = null; // Clear active target when disarmed
    this.lockStartTime = null; // Reset lockStartTime when disarmed
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
      this.lockTimer = null;
    }
  },
  
  scan() {
    if (!this.armed) {
      // Scanner is armed, do not scan
      return;
    }

    const enemies = room.getElementsByClassName('enemy');
    if (enemies.length === 0) {
      //console.log('No enemies found within scan range.');
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
      // Skip the last target to ensure a new target is selected
      if (this.lasttarget && enemy === this.lasttarget) {
        continue;
      }

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
          data: {
            activetarget: this.activetarget,
            percent_locked: 0
          }
        });

        // Record the time when lock started
        this.lockStartTime = performance.now();

        // Clear existing timer if any
        if (this.lockTimer) {
          clearTimeout(this.lockTimer);
        }

        // Set timer to lock the target after locktime seconds
        this.lockTimer = setTimeout(() => {
          if (this.activetarget && !this.locked) {
            this.lock();
          }
        }, this.locktime * 1000);
      } else if (this.lockStartTime) {
        // Calculate percent_locked based on elapsed time
        const currentTime = performance.now();
        const elapsedTime = (currentTime - this.lockStartTime) / 1000; // in seconds
        const percentLocked = Math.min(elapsedTime / this.locktime, 1);

        this.dispatchEvent({
          type: 'targetacquired',
          data: {
            activetarget: this.activetarget,
            percent_locked: percentLocked
          }
        });
      }
    } else {
      //console.log('No suitable targets within angle restrictions.');
      this.activetarget = null;
      this.dispatchEvent({ type: 'targetlocked', data: null }); // Emit event to hide reticle
      this.lockStartTime = null; // Reset lockStartTime when no target
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
      this.lockStartTime = null; // Reset lockStartTime after locking
    }
  },

  fire() {
    if (!this.armed) {
      console.warn('Cannot fire: Missile launcher is not armed.');
      return;
    }

    if (!this.missilePool) {
      this.missilePool = room.createObject('objectpool', {
        objecttype: 'spacezone-missile',
        max: 4
      });
    }

    if (this.locked && this.activetarget && this.missilePool) {
      // Calculate zdir instead of using getWorldOrientation
      let missilezdir = this.localToWorld(V(0, 0, 1)).sub(this.getWorldPosition());

      // Spawn a new missile with zdir using the object pool
      let missile = this.missilePool.grab({
        pos: this.getWorldPosition(), // Using this.getWorldPosition() for current launcher position
        zdir: missilezdir,
        vel: missilezdir.clone().multiplyScalar(400), 
        target: this.activetarget
      });

      if (missile && typeof missile.activate === 'function') {
        missile.activate();
      }

      console.log('Missile fired towards:', this.activetarget);

      // Store the last target after firing
      this.lasttarget = this.activetarget;
      this.activetarget = null; // Reset active target after firing
    } else {
      console.log('Cannot fire: No target locked or missile pool unavailable.');
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
  speed: 300, // Missile speed in meters per second
  active: true,
  turnrate: 30, // Added turnrate attribute with default value 10
  lifetime: 5, // Added lifetime attribute with default value 5 seconds
  activetime: 0, // Initialized activetime

  create() {
    // Initialize missile properties
    this.target = this.properties.target;
    if (!this.target) {
      console.warn('Missile launched without a target.');
      //this.active = false;
      //this.die();
      //return;
    }

    // Create missile object
    this.missile = this.createObject('object', {
      id: 'capsule',
      col: 'orange',
      scale: V(1, 4, 1),
      pos: V(0, 0, 0),
      //zdir: this.properties.zdir || V(0, 0, 1), // Ensure zdir is initialized
      rotation: V(90, 0, 0),
      collision_id: 'sphere',
      collision_scale: V(1),
      mass: 50,
      visible: true // Initially invisible; will be activated upon firing
    });
    this.missile.addForce('drag', 0); // hack to keep object from sleeping and being uncollidable
    this.missile.addClass('playerweapon');
    // Add smoke trail particle as a child of the room
    this.smokeTrail = room.createObject('particle', {
      count: 2000,
      rate: 200,
      duration: 10,
      pos: V(-0.5, -0.5, 0),
      rand_pos: V(1, 1, -4),
      col: V(0.4, 0.4, 0.4),
      rand_col: V(0.4, 0.4, 0.4),
      visible: true // Initially invisible; will be activated upon firing
    });

    // Add velocity based on zdir
    this.vel = this.zdir.clone().multiplyScalar(this.speed);

    // Add collision event listener
    this.missile.addEventListener('collide', (ev) => this.handleCollision(ev));
  },

  activate() {
    if (this.missile) {
      this.missile.visible = true;
    }
    if (this.smokeTrail) {
      this.smokeTrail.visible = true;
      this.smokeTrail.resetParticles();
    }
    this.active = true;
    this.activetime = 0; // Set activetime to 0 upon activation
    console.log('Missile activated.');
  },

  deactivate() {
    if (this.missile) {
      this.missile.visible = false;
    }
    if (this.smokeTrail) {
      this.smokeTrail.visible = false;
    }
    this.active = false;
    console.log('Missile deactivated.');
  },

  handleCollision(ev) {
    if (ev.data.other.hasClass('nomissile')) {
      // Do not explode if colliding with an object that has the 'nomissile' class
      return;
    }
    console.log('missile explodes!', ev);
    this.explode();
    ev.data.other.dispatchEvent({ type: 'hit', data: this });
    //this.die();
  },

  explode() {
    // Create explosion effect
    const explosion = room.createObject('explosion', {
      scale: V(1, 1, 1),
      pos: this.missile.getWorldPosition(),
      visible: true
    });
    this.deactivate();

    // Optionally, add particle effects or sound here

    console.log('Missile exploded at:', this.missile.pos);
  },

  update(dt) {
    //console.log('missile!', this.pos, this.active, this.target);
    if (!this.active) return;

    // Increment activetime
    this.activetime += dt;

    // Check if activetime exceeds lifetime
    if (this.activetime >= this.lifetime) {
      this.deactivate();
      //this.explode();
      return;
    }

    // Update smoke trail emitter position
    if (this.smokeTrail) {
      const missileWorldPos = new THREE.Vector3();
      this.missile.getWorldPosition(missileWorldPos);
      this.smokeTrail.emitter_pos = missileWorldPos;
    }

    // Adjust direction towards target
    if (this.target) {
      const currentVelocity = this.vel.clone().normalize();
      const targetDirection = this.target.getWorldPosition().sub(this.getWorldPosition()).normalize();
      const angle = THREE.MathUtils.radToDeg(currentVelocity.angleTo(targetDirection));

      if (angle > 0) {
        const maxTurn = this.turnrate * dt;
        if (angle <= maxTurn) {
          this.zdir.copy(targetDirection);
        } else {
          // Calculate the axis to rotate around (cross product)
          const rotationAxis = new THREE.Vector3().crossVectors(currentVelocity, targetDirection).normalize();
          if (rotationAxis.length() === 0) {
            // Vectors are parallel, no rotation needed
            this.zdir.copy(targetDirection);
          } else {
            // Create a quaternion representing the rotation
            const quaternion = new THREE.Quaternion();
            quaternion.setFromAxisAngle(rotationAxis, THREE.MathUtils.degToRad(maxTurn));
            this.zdir.applyQuaternion(quaternion).normalize();
          }
        }
        // Update velocity based on new direction
        this.vel.copy(this.zdir).multiplyScalar(this.speed);
      }
    }

    // Optionally, track the target's movement
    if (this.target) {
      // Already handled above
    }

    // Removed distance-based deactivation logic
  }
});

room.registerElement('spacezone-targeting-reticle', {
  create() {
    // Allocate a square canvas element of size 256x256
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d');

    // Define a new image asset using the canvas
    this.loadNewAsset('image', { id: 'reticle-image', canvas: this.canvas, hasalpha: true });

    // Create the reticle object using the new image asset
    this.reticle = this.createObject('image', {
      image_id: 'reticle-image',
      scale: V(20, 20, 0.1), // Adjust scale as needed
      billboard: 'y',
      opacity: 0.6,
      depth_test: false,
      render_order: 10,
      lighting: false, // Set lighting to false
      visible: false, // Initially hidden
      cull_face: 'none',
      rotate_deg_per_sec: 90,
      rotate_axis: V(0, 0, 1),
    });
  },

  setTargetPosition(targetPosition, lockedPercent) {
    if (this.reticle) {
      this.pos = targetPosition;
      this.reticle.visible = true;
      this.updateReticleTexture(lockedPercent);
    }
  },

  hideReticle() {
    if (this.reticle) {
      this.reticle.visible = false;
    }
  },

  updateReticleTexture(lockpercent) {
    const ctx = this.ctx;
    const size = 256;
    const radius = 128;
    const lineWidth = 4;
    ctx.clearRect(0, 0, size, size);

    const startAngles = [0, 90, 180, 270];
    const endFactor = Math.min(Math.max(lockpercent, 0), 1); // Clamp between 0 and 1
    const color = lockpercent < 1 ? 'yellow' : 'red';

    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.beginPath();

    startAngles.forEach(start => {
      const startRad = THREE.MathUtils.degToRad(start);
      const endRad = THREE.MathUtils.degToRad(start + 90 * endFactor);
      ctx.arc(size / 2, size / 2, radius - lineWidth / 2, startRad, endRad);
    });

    ctx.stroke();

    // Dispatch asset update event
    elation.events.fire(this.canvas, 'asset_update');
  },

  update(dt) {
    // Additional update logic if needed
  }
});

// New Element: explosion
room.registerElement('explosion', {
  create() {
    // Initialize the particle system for the explosion
    this.particles = this.createObject('particle', {
      count: 50,
      rate: 20000,
      loop: false,
      col: V(0.3),
      rand_col: V(0.5),
      vel: V(-50),
      rand_vel: V(100),
      duration: 20
    });
  },
  reset() {
    // Reset and start the particle system
    this.particles.resetParticles();
    this.particles.start();
  }
});