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
    this.dialog.showDialog('dialogs/intro.txt').then(() => this.startRace());
    //this.dialog.addEventListener('continue', () => this.startRace());

    // Initialize Enemy Drone Controller
    // Removed as drone controllers are now spawned by the level

    // Initialize Missile Launcher
    this.missileLauncher = this.taufighter.createObject('spacezone-missile-launcher', {
      pos: V(0,0,6),
      scanrange: 1000,
      locktime: 1,
      scantime: 0.25 // Added scantime attribute with default value of 0.5 seconds
    });

    // Add touchstart event listener to fire missile launcher
    window.addEventListener('touchstart', () => {
      this.missileLauncher.fire();
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

    // Spawn spacezone-budget and store reference
    this.budget = this.createObject('spacezone-budget');
  },
  handleDeviceMotion(event) {
    // Existing handleDeviceMotion code
    // ...
  },
  createShipStatsOverlay() {
    // Existing createShipStatsOverlay code
    // ...
  },
  updateShipStatsOverlay() {
    // Existing updateShipStatsOverlay code
    // ...
  },
  activateAfterburner() {
    // Existing activateAfterburner code
    // ...
  },
  deactivateAfterburner() {
    // Existing deactivateAfterburner code
    // ...
  },
  updatePositionAndDirection(currentPathPosition) {
    // Existing updatePositionAndDirection code
    // ...
  },
  handleCollide(ev) {
    // Existing handleCollide code
    // ...
  },
  startRace() {
    // Existing startRace code
    // ...
  },
  update(dt) {
    // Existing update code
    // ...
  },
  reset() {
    // Existing reset code
    // ...
  }
});
        
room.registerElement('spacezone-enginetrail', {
  create() {
    // Existing create function
    // ...
  },
  update(dt) {
    // Existing update function
    // ...
  }
});
    
room.registerElement('spacezone-cannon', {
  rate: 10, // Default rate: increased to 10 shots per second
  muzzlespeed: 400, // Default muzzle speed increased to 400
  muzzleflash: false, // Added muzzleflash attribute with default value false,
  laserpool: null,

  create() {
    // Existing create function
    // ...
  },
  startFiring() {
    // Existing startFiring function
    // ...
  },
  stopFiring() {
    // Existing stopFiring function
    // ...
  },
  flashLightIntensity(dt) {
    // Existing flashLightIntensity function
    // ...
  },
  fire() {
    // Existing fire function
    // ...
  },
  update(dt) {
    // Existing update function
    // ...
  }
});
    
room.registerElement('spacezone-laserbeam', {
  create() {
    // Existing create function
    // ...
  },
  update(dt) {
    // Existing update function
    // ...
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
    // Existing create function
    // ...
  },

  arm() {
    // Existing arm function
    // ...
  },

  disarm() {
    // Existing disarm function
    // ...
  },
  
  scan() {
    // Existing scan function
    // ...
  },

  lock() {
    // Existing lock function
    // ...
  },

  fire() {
    // Existing fire function
    // ...
  },

  hideReticle() {
    // Existing hideReticle function
    // ...
  },

  update(dt) {
    // Existing update function
    // ...
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
    // Existing create function
    // ...
  },

  activate() {
    // Existing activate function
    // ...
  },

  deactivate() {
    // Existing deactivate function
    // ...
  },

  handleCollision(ev) {
    // Existing handleCollision function
    // ...
  },

  explode() {
    // Existing explode function
    // ...
  },

  update(dt) {
    // Existing update function
    // ...
  }
});

room.registerElement('spacezone-targeting-reticle', {
  create() {
    // Existing create function
    // ...
  },

  setTargetPosition(targetPosition, lockedPercent) {
    // Existing setTargetPosition function
    // ...
  },

  hideReticle() {
    // Existing hideReticle function
    // ...
  },

  updateReticleTexture(lockpercent) {
    // Existing updateReticleTexture function
    // ...
  },

  update(dt) {
    // Existing update function
    // ...
  }
});

// New Element: explosion
room.registerElement('explosion', {
  create() {
    // Existing create function
    // ...
  },
  reset() {
    // Existing reset function
    // ...
  }
});