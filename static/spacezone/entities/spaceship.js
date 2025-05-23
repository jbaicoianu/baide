room.registerElement('spacezone-spaceship', {
  supplyexpirationrate: 1, // Base rate at which supplies expire per second
  damage: 0, // Current damage sustained by the ship

  rollspeed: 360, // Increased rotation speed to 360 degrees per second
  yawSpeed: 90, // Added yaw rotation speed in degrees per second
  pitchSpeed: 45, // Added pitch rotation speed in degrees per second
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
  
  // Flag to control device motion controls
  deviceMotionEnabled: false, // Default to false

  // Properties for orientation calibration
  initialDevicePitch: null,
  initialDeviceRoll: null,

  // Kalman filter instances for smoothing
  pitchFilter: null,
  rollFilter: null,
  offsetXFilter: null,
  offsetYFilter: null,

  // Properties for shield flicker effect
  shieldFlickerTimer: 0, // Timer for shield flicker
  shieldFlickerDuration: 0.35, // Duration of the shield flicker in seconds

  // Equipment management
  equipment: {}, // To be initialized in create()
  equipmentstatus: {}, // To be initialized in create()

  // Orientation properties
  currentRoll: 180,
  currentPitch: 0,
  currentYaw: 0, // Added currentYaw to track yaw orientation
  userControlledRoll: 0, // Added separate tracking for user-controlled roll
  rollDecayTimer: 0, // Timer for roll decay delay

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

    // Initialize equipment tracking
    this.equipment = {
      shield: {
        name: "Standard Equipment",
        params: {
          strength: 100, // Current strength of the radiation shield
          color: 'red'    // Color of the shield
        }
      },
      cargo: {
        name: "Standard Equipment",
        params: {
          capacity: 1000, // Configurable initial number of medical supplies
          current: 1000   // Current number of medical supplies
        }
      },
      engine: {
        name: "Standard Equipment",
        params: {
          color: 'cyan',      // Color of the engine trails
          multiplier: 1.0,    // Multiplier for raceTime increment
          particlecount: 200, // Default particle count
          spread: 0.3         // Default spread value
        }
      }
    };

    // Load saved equipment from localStorage
    this.loadEquipment();
    this.resetEquipment(); // Reset equipment after loading

    // Create HTML overlay for ship stats
    this.createShipStatsOverlay();

    // Initialize damage attribute
    this.damage = 0;

    // Add spacezone-budget object
    let currentbalance = localStorage['currentbalance'] ?? -156293;
    this.budget = this.createObject('spacezone-budget', { currentbalance: +currentbalance });

    // Add spacezone-store object
    setTimeout(() => {
      this.store = this.createObject('spacezone-store', { budget: this.budget });
      this.store.addEventListener('purchased', (ev) => {
        let item = ev.data;
        console.log(item);
        this.budget.apply(item.name, 1, item.price);
        if (item.type) {
          this.equipment[item.type] = item;
          this.saveEquipment(); // Save equipment after purchase
          this.resetEquipment(); // Reset equipment after loading new equipment
        }
      });
    }, 1000);

    // Add child object 'taufighter' with specified metalness and roughness
    this.taufighter = this.createObject('object', {
      id: 'spacefighter',
      pos: new THREE.Vector3(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
      zdir: new THREE.Vector3(0, 0, 1),
      mass: 1000,
      collidable: false, // Collider has been disabled
    });
    
    // Spawn a new shield element on the taufighter ship
    this.shield = this.taufighter.createObject('object', {
      id: 'sphere',
      pos: V(0, 0, 2),
      scale: V(16, 3.5, 18),
      col: this.equipmentstatus.shield.color, // Updated to use shield color from equipment
      opacity: 0,
      renderorder: 10,
      //shader_id: 'shield-shader'
    });
    
    // Instantiate multiple engine trails as children of the player
    this.enginetrails = [];
    const trailPositions = [
      '-1.25 -0.2 -3',
      '1.25 -0.2 -3'
    ];
    for (const pos of trailPositions) {
      let trail = this.taufighter.createObject('spacezone-enginetrail', { 
        pos: pos, 
        col: this.equipmentstatus.engine.color, 
        particlecount: this.equipmentstatus.engine.particlecount, 
        spread: this.equipmentstatus.engine.spread 
      }); // Passed engine color, particle count, and spread
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
        defaultbindings: 'mouse_button_0,keyboard_space',
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
      },
      'yaw_left': {
        defaultbindings: 'keyboard_left', 
      },
      'yaw_right': {
          defaultbindings: 'keyboard_right,gamepad_any_axis_0'
      },
      'pitch_up': {
        defaultbindings: 'keyboard_up', 
      },
      'pitch_down': {
        defaultbindings: 'keyboard_down,gamepad_any_axis_1', 
      },
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
    this.currentYaw = 0; // Initialize currentYaw
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
    this.dialog.showDialog('dialogs/intro.txt').then(() => {
      // Detect if DeviceMotionEvent and requestPermission are available (iOS 13+)
      if (this.deviceMotionEnabled && typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        // iOS requires permission to access device motion
        DeviceMotionEvent.requestPermission()
          .then(response => {
            if (response === 'granted' && this.deviceMotionEnabled) {
              window.addEventListener('devicemotion', ev => this.handleDeviceMotion(ev));
            }
            this.startRace();
          })
          .catch(err => {
            console.error('DeviceMotionEvent permission error:', err);
            this.startRace();
          });
      } else {
        // Non iOS devices or permission not required
        if (this.deviceMotionEnabled) {
          window.addEventListener('devicemotion', ev => this.handleDeviceMotion(ev));
        }
        this.startRace();
      }
    });
    //this.dialog.addEventListener('continue', () => this.startRace());

    // Initialize Enemy Drone Controller
    // Removed as drone controllers are now spawned by the level

    // Initialize Missile Launcher
    this.missileLauncher = this.taufighter.createObject('spacezone-missile-launcher', {
      pos: V(0,0,6),
      scanrange: 1000,
      locktime: 1,
      scantime: 0.25 // Added scantime attribute with default value of 0.25 seconds
    });
    this.missileLauncher.addEventListener('missilefired', ev => {
      this.budget.apply("missile restocking fee", 1);
    });
    // Add touchstart event listener to fire missile launcher
    window.addEventListener('touchstart', () => {
      this.missileLauncher.fire();
      player.disable();
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

    this.parent.addEventListener('dronedestroyed', ev => this.budget.apply("drone destruction bonus", 1));

    // Add device motion event listener
    // Moved to conditional binding after permission is granted

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

    // Add event listener for 'damage' events
    this.addEventListener('damage', ev => this.handleDamage(ev));
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
      rawRoll = Math.atan2(acc.x, acc.z); // Changed to rawRoll to match input

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
      <div>Shield Strength: <span id="shield-strength">${this.equipmentstatus.shield.strength}</span>%</div>
      <div>Cargo Remaining: <span id="cargo-remaining">${this.equipmentstatus.cargo.current}</span></div>
    `;
    document.body.appendChild(this.shipStatsOverlay);
  },
  updateShipStatsOverlay() {
    if (this.shipStatsOverlay) {
      const shieldElement = this.shipStatsOverlay.querySelector('#shield-strength');
      const cargoElement = this.shipStatsOverlay.querySelector('#cargo-remaining');
      if (shieldElement) shieldElement.textContent = Math.round(this.equipmentstatus.shield.strength);
      if (cargoElement) cargoElement.textContent = Math.round(this.equipmentstatus.cargo.current);
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
      trail.particle.col = this.equipmentstatus.engine.color; // Reset to engine's color
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
    if (!this.isRacing) return;

    // Don't let the player's weapons hurt themselves
    if (ev.data.other.hasClass('playerweapon')) return;
      
    // Implement damage model
    const damageAmount = Math.floor(5 + Math.random() * 5); // Random damage between 5 and 10
    this.dispatchEvent({ type: 'damage', data: { amount: damageAmount } });
  },
  handleDamage(ev) {
    const amount = ev.data.amount;
    this.damage += amount;
    console.log(`Ship damaged! Total damage: ${this.damage}`);

    // Decrease shield strength based on damage
    this.equipmentstatus.shield.strength = Math.max(0, this.equipmentstatus.shield.strength - amount);
    console.log(`Shield strength: ${this.equipmentstatus.shield.strength}`);

    // Initiate shield flicker
    if (this.shield) {
      this.shield.opacity = 0.2;
      this.shieldFlickerTimer = this.shieldFlickerDuration;
    }

    // Optionally, update score or trigger events based on damage
    this.dispatchEvent({ type: 'ship_damaged', data: this.damage });

    // Check for race failure due to excessive damage
    if (this.equipmentstatus.shield.strength <= 0) {
      console.log('Race failed due to excessive damage!');
      this.isRacing = false;
      this.deactivateControlContext('spacezone-spaceship');
      this.missileLauncher.disarm(); // Disarm missile launcher
      this.dialog.showDialog('dialogs/failure-destroyed.html').then(() => {
        this.budget.apply("surrogate replacement fee", 1);
        this.startRace()
      }); // Show our failure-destroyed dialog
      this.targetingReticle.hideReticle(); // Hide reticle when race fails

      // Set shipcollider.collidable to false and shipcollider.pickable to true when race ends
      if (this.shipcollider) {
        this.shipcollider.pickable = true;
        this.shipcollider.collidable = false;
      }

      // Reset orientation calibration
      this.initialDevicePitch = null;
      this.initialDeviceRoll = null;
    } else {
      this.shipcollider.collidable = false;
      setTimeout(() => this.shipcollider.collidable = true, 250);
    }
  },
  startRace() {
    this.budget.apply("neuralink rental", 1);
    player.disable();
    player.collidable = false;
    this.activateControlContext('spacezone-spaceship');
    for (let s of document.getElementsByTagName('janus-controls-gamepad')) { s.show(); s.reset(); }
      
    // Arm the missile launcher
    if (this.missileLauncher && typeof this.missileLauncher.arm === 'function') {
      this.missileLauncher.arm();
    } else {
      console.warn('Missile Launcher not found or arm function unavailable.');
    }

    // Reset equipment using the new resetEquipment function
    this.resetEquipment();

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

    // Handle shield flicker decay
    if (this.shield.opacity > 0) {
      const decay = dt / this.shieldFlickerDuration;
      this.shield.opacity = Math.max(this.shield.opacity - 0.1 * decay, 0);
      this.shieldFlickerTimer -= dt;
    }

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

      // Apply speed multiplier based on currentSpeedMultiplier and engine multiplier
      this.raceTime += dt * this.currentSpeedMultiplier * this.equipmentstatus.engine.multiplier;
      let t = this.raceTime / this.totalracetime;
      if (t > 1) t = 1;

      // Assuming 'spacezone-level' is the parent element
      const level = this.parent;
      if (level && level.getPositionAtTime) {
        this.updatePositionAndDirection(t);

        // Apply x and y offsets based on shuttle's rotation
        const rollRad = THREE.MathUtils.degToRad(this.currentRoll) + this.deviceRoll;
        const pitchRad = THREE.MathUtils.degToRad(this.currentPitch);// + this.devicePitch;

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
        
        this.budget.applyMultiple({"completion bonus": 1, "medical supply delivery": Math.floor(this.equipmentstatus.cargo.current)});
        
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

        // Show success dialog
        this.dialog.showDialog('dialogs/success.html').then(() => {
            this.parent.cargoShip.dispatch();
        });
      }

      // Implement supply expiration logic
      const effectiveShield = Math.max(0, this.equipmentstatus.shield.strength);
      const supplyRate = this.supplyexpirationrate * Math.pow(1 / (effectiveShield / 100 + 0.1), 2); // Exponential rate based on shield strength
      const suppliesLost = supplyRate * dt;
      this.equipmentstatus.cargo.current = Math.max(0, this.equipmentstatus.cargo.current - suppliesLost);
      this.dispatchEvent({ type: 'supplies_lost', data: suppliesLost });

      // Check if all supplies are lost
      if(this.equipmentstatus.cargo.current <= 0){
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
        this.dialog.showDialog('dialogs/failure-depleted.html').then(() => this.startRace());
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

    // Handle yaw and pitch inputs by adjusting reticle position
    const yawLeftInput = this.controlstate.yaw_left || 0.0; // 0..1
    const yawRightInputRaw = this.controlstate.yaw_right || 0.0; // Might be -1..1
    const yawRightInput = typeof yawRightInputRaw === 'number' ? yawRightInputRaw : parseFloat(yawRightInputRaw);
    const yawInput = yawRightInput - yawLeftInput; // -1..1
    const yawAdjustment = yawInput * this.yawSpeed * dt;
    // Replace updating currentYaw with reticle position adjustment
    this.reticle.pos.x -= yawAdjustment;

    const pitchUpInput = this.controlstate.pitch_up || 0.0; // 0..1
    const pitchDownInputRaw = this.controlstate.pitch_down || 0.0; // Might be -1..1
    const pitchDownInput = typeof pitchDownInputRaw === 'number' ? pitchDownInputRaw : parseFloat(pitchDownInputRaw);
    const pitchInput = pitchUpInput - pitchDownInput; // -1..1
    const pitchAdjustment = pitchInput * this.pitchSpeed * dt;
    // Replace updating currentPitch with reticle position adjustment
    this.reticle.pos.y += pitchAdjustment;

    // Clamp reticle position to prevent it from moving out of bounds
    const maxOffset = 20; // Increased movement limit to 20
    this.reticle.pos.x = THREE.MathUtils.clamp(this.reticle.pos.x, -maxOffset, maxOffset);
    this.reticle.pos.y = THREE.MathUtils.clamp(this.reticle.pos.y, -maxOffset, maxOffset);

    // Map device orientation offsets to reticle position
    if (this.isRacing && this.initialDevicePitch !== null && this.initialDeviceRoll !== null) {
      // Calculate angular differences
      const angularDiffPitch = this.devicePitch; // Already adjusted in handleDeviceMotion
      const angularDiffRoll = this.deviceRoll;

      // Define a scaling factor to convert angular difference to linear offset
      const angularToLinearScale = this.offsetRange / (Math.PI / 4); // Example: map ±45 degrees to ±20 units

      // Map angular differences to linear offsets
      const deviceOffsetX = angularDiffRoll * angularToLinearScale;
      const deviceOffsetY = angularDiffPitch * angularToLinearScale;

      // Apply the device offsets to reticle position
      this.reticle.pos.x += deviceOffsetX;
      this.reticle.pos.y += deviceOffsetY;

      // Clamp reticle position after applying device offsets
      this.reticle.pos.x = THREE.MathUtils.clamp(this.reticle.pos.x, -maxOffset, maxOffset);
      this.reticle.pos.y = THREE.MathUtils.clamp(this.reticle.pos.y, -maxOffset, maxOffset);
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

    // Handle yaw inputs
    const yawLeftInputOld = this.controlstate.yaw_left || 0.0; // 0..1
    const yawRightInputOldRaw = this.controlstate.yaw_right || 0.0; // Might be -1..1
    const yawRightInputOld = typeof yawRightInputOldRaw === 'number' ? yawRightInputOldRaw : parseFloat(yawRightInputOldRaw);
    const yawInputOld = yawRightInputOld - yawLeftInputOld; // -1..1
    const yawAdjustmentOld = yawInputOld * this.yawSpeed * dt;
    // this.currentYaw += yawAdjustmentOld; // Removed direct yaw update

    // Handle pitch inputs
    const pitchUpInputOld = this.controlstate.pitch_up || 0.0; // 0..1
    const pitchDownInputOldRaw = this.controlstate.pitch_down || 0.0; // Might be -1..1
    const pitchDownInputOld = typeof pitchDownInputOldRaw === 'number' ? pitchDownInputOldRaw : parseFloat(pitchDownInputOldRaw);
    const pitchInputOld = pitchUpInputOld - pitchDownInputOld; // -1..1
    const pitchAdjustmentOld = pitchInputOld * this.pitchSpeed * dt;
    // this.currentPitch += pitchAdjustmentOld; // Removed direct pitch update

    // Clamp currentPitch to the maximum allowed pitch
    // this.currentPitch = THREE.MathUtils.clamp(this.currentPitch, -this.maxPitch, this.maxPitch); // Removed clamp

    // Calculate combined roll
    let combinedRoll = this.currentRoll + this.userControlledRoll;

    // Clamp combined roll to ±90 degrees
    combinedRoll = THREE.MathUtils.clamp(combinedRoll, -90, 90);

    // Apply the combined roll, yaw, and pitch to the taufighter's orientation
    this.taufighter.rotation.set(
      this.currentPitch,
      this.currentYaw,
      combinedRoll
    );

    // Apply damping and clamp in existing logic
    // Already handled above

    // Inertial Flight Model
    if (this.isRacing) {
      // Calculate forward direction based on current orientation
      const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(
        -THREE.MathUtils.degToRad(this.currentPitch),
        -THREE.MathUtils.degToRad(this.currentYaw),
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
    // shield shader uniform hack
    if (this.shield) {
      if (this.shield.shader) {
        this.shield.shader.uniforms.color.value.set(1,0,0);
        this.shield.shader.uniforms.resolution.value.set(512,512,1);
      }
    }
  },
  reset() {
    // Reset orientation calibration
    this.initialDevicePitch = null;
    this.initialDeviceRoll = null;
  },

  // New function: resetEquipment
  resetEquipment() {
    try {
      for (const [type, equipment] of Object.entries(this.equipment)) {
        this.equipmentstatus[type] = { ...equipment.params };
      }
      this.damage = 0;

      this.equipmentstatus.cargo.current = this.equipment.cargo.params.capacity;
      this.equipmentstatus.shield.strength = this.equipment.shield.params.strength; // Fixed typo: should be shield
      this.equipmentstatus.engine.multiplier = this.equipment.engine.params.multiplier; // Initialize engine multiplier
      this.equipmentstatus.engine.particlecount = this.equipment.engine.params.particlecount; // Initialize particle count
      this.equipmentstatus.engine.spread = this.equipment.engine.params.spread; // Initialize spread
      
      console.log('Equipment has been reset.');
    } catch (error) {
      console.error('Error resetting equipment:', error);
    }
  },

  // New function: visitStore
  visitStore() {
    if (!this.store) {
      this.store = room.createObject('spacezone-store', { budget: this.budget });
      this.store.addEventListener('purchased', (ev) => {
        console.log(ev.data);
        this.budget.currentbalance -= ev.data.price;
      });
    }
    this.dialog.showDialog(this.store.showItems());
  },

  // New function: saveEquipment
  saveEquipment() {
    try {
      const equipmentJSON = JSON.stringify(this.equipment);
      localStorage.setItem('spacezone_spaceship_equipment', equipmentJSON);
      console.log('Equipment saved to localStorage.');
    } catch (error) {
      console.error('Error saving equipment to localStorage:', error);
    }
  },

  // New function: loadEquipment
  loadEquipment() {
    try {
      const equipmentJSON = localStorage.getItem('spacezone_spaceship_equipment');
      if (equipmentJSON) {
        const savedEquipment = JSON.parse(equipmentJSON);
        // Merge savedEquipment into this.equipment, overriding defaults
        for (const [type, data] of Object.entries(savedEquipment)) {
          if (this.equipment[type]) {
            this.equipment[type] = { ...this.equipment[type], ...data };
          } else {
            this.equipment[type] = data;
          }
        }
        console.log('Equipment loaded from localStorage.');
      } else {
        console.log('No saved equipment found in localStorage.');
      }
      this.resetEquipment(); // Reset equipment after loading
    } catch (error) {
      console.error('Error loading equipment from localStorage:', error);
    }
  }
});
        
room.registerElement('spacezone-enginetrail', {
  particlecount: 200,
  spread: 0.3,

  create() {
    const particlecount = typeof this.particlecount === 'number' ? this.particlecount : 200;
    const spread = typeof this.spread === 'number' ? this.spread : 0.3;

    // Create a particle object for engine trails
    this.particle = this.createObject('particle', {
      pos: V(-spread / 2), // Set pos to V(-spread / 2)
      rand_pos: V(spread), // Add rand_pos: V(spread)
      scale: V(1), // Updated scale from V(0.02) to V(1)
      rate: particlecount / 0.5, // Set rate based on particlecount
      count: particlecount, // Set count based on particlecount
      duration: 0.5, // Decreased duration to 0.5
      opacity: 0.2,
      vel: V(0, 0, -10), // Set vel to V(0,0,-10)
      rand_vel: V(0,0,-20), // Set rand_vel to V(0,0,-20)
      col: this.col, // Use color from properties
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
      this.particle.rate = player.equipmentstatus.engine.particlecount / 0.5;
      if (player.afterburner) {
        this.particle.col = '#FFAA00'; // Changed to brighter yellowish orange
      } else {
        // Dynamically take color from equipment status
        this.particle.col = player.equipmentstatus.engine.color;
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
        
// New Element: spacezone-targeting-reticle
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
    this.reticle = this.createObject('object', {
      id: 'plane',
      image_id: 'reticle-image',
      scale: V(20, 20, 0.1), // Adjust scale as needed
      billboard: 'y',
      opacity: 1,
      transparent: true,
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
    const lineWidth = 24;
    ctx.clearRect(0, 0, size, size);

    const startAngles = [0, 90, 180, 270];
    const endFactor = Math.min(Math.max(lockpercent, 0), 1); // Clamp between 0 and 1
    const color = lockpercent < 1 ? 'yellow' : 'red';

    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;

    startAngles.forEach(start => {
      ctx.beginPath();
      const startRad = THREE.MathUtils.degToRad(start);
      const endRad = THREE.MathUtils.degToRad(start + 90 * endFactor);
      ctx.arc(size / 2, size / 2, radius - lineWidth / 2, startRad, endRad);
      ctx.stroke();
    });


    // Dispatch asset update event
    elation.events.fire({ element: this.canvas, type: 'asset_update'});
  },

  update(dt) {
    // Additional update logic if needed
  }
});