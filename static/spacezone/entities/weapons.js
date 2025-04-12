room.registerElement('spacezone-cannon', {
  rate: 10, // Default rate: increased to 10 shots per second
  muzzlespeed: 400, // Default muzzle speed increased to 400
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
      let laserpool = window.laserPool;
      if (!laserpool) {
        window.laserPool = room.createObject('objectpool', {
          objecttype: 'spacezone-laserbeam',
          max: 20
        });
      }
      this.laserpool = window.laserPool;
    }        

    // Get spawnPosition using ship's world coordinates
    const spawnPosition = this.getWorldPosition(); // Updated to use this.getWorldPosition()

    // Get forward position and compute direction
    const forwardPosition = this.localToWorld(V(0, 0, -1));
    const direction = new THREE.Vector3().subVectors(spawnPosition, forwardPosition).normalize()

    // Spawn a spacezone-laserbeam using the object pool
    let laser = this.laserpool.grab({
      pos: spawnPosition,
      zdir: direction,
      //vel: direction.clone().multiplyScalar(this.muzzlespeed)
    });
    laser.vel = direction.clone().multiplyScalar(this.muzzlespeed);
    //console.log('pew', laser, this.muzzlespeed, direction, laser.vel);
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
      /*
    if (this.parent && this.parent.parent) {
      this.muzzlespeed = 800 * this.parent.parent.currentSpeedMultiplier;
    } else {
      console.warn('Unable to access currentSpeedMultiplier for muzzlespeed calculation.');
    }
      */

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
      collision_id: 'sphere', // Added collision_id for collision detection
      collision_scale: V(1),
      col: 'limegreen', // Changed laser beam color to lime green
      scale: '0.5 6 0.5',
      rotation: '90 0 0',
      lighting: false
    });
    this.laserBeam.addForce('drag', 0); // hack to keep object from sleeping and being uncollidable


    // Set a lifetime for the laser beam
    this.lifetime = 2; // seconds
  },
  update(dt) {
    // Decrease lifetime; object pool handles recycling
    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      // this.die(); // Removed this as pool handles recycling
    }
  },
  handleCollide(ev) {
    console.log('laser hit', ev);
    this.pos.y = -9999;
  }
});
        
room.registerElement('spacezone-missile-launcher', {
  scanrange: 1000, // Default scan range in meters
  locktime: 1, // Default lock time in seconds
  scantime: 0.25, // Added scantime attribute with default value of 0.25 seconds
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
      if (event.data && event.data.activetarget) {
        room.objects['sounds'].stopSound('missile-target-locked');
        room.objects['sounds'].playSound('missile-target-acquiring');
      }
    });
    this.addEventListener('targetlocked', (event) => {
      //console.log('Target locked:', event.data);
      if (event.data && event.data.activetarget) {
        room.objects['sounds'].playSound('missile-target-locked');
      } else {
        room.objects['sounds'].stopSound('missile-target-locked');
      }
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
    this.activetarget = null; // Clear active target when disarmed
    this.lockStartTime = null; // Reset lockStartTime when disarmed
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
      this.lockTimer = null;
    }
  },
  
  scan() {
    if (!this.armed) {
      // Scanner is not armed, do not scan
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
        data: { activetarget: this.activetarget, percent_locked: 1 }
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

      // Play 'missile-fired' sound
      room.objects['sounds'].playSound('missile-fired');

      // Store the last target after firing
      this.lasttarget = this.activetarget;
      this.activetarget = null; // Reset active target after firing
        
      this.dispatchEvent({type: 'missilefired', data: { activetarget: this.activetarget }});
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
  turnrate: 30, // Added turnrate attribute with default value 30
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
      visible: true // Initially visible; will be activated upon firing
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
      visible: true // Initially visible; will be activated upon firing
    });

    // Add velocity based on zdir
    this.vel = this.zdir.clone().multiplyScalar(this.speed);

    // Add collision event listener
    this.missile.addEventListener('collide', (ev) => this.handleCollision(ev));
  },

  activate() {
    if (this.missile) {
      this.missile.visible = true;
      this.missile.pos.set(0,0,0);
      this.missile.rotation.set(90,0,0);
      this.missile.collidable = true;
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
      this.missile.collidable = false;
    }
    if (this.smokeTrail) {
      this.smokeTrail.visible = false;
    }
    this.active = false;
    console.log('Missile deactivated.');
    this.pos.y = -9999;
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
      col: V(.2),
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
      let target = this.target.drone || this.target; // FIXME - hack to work around weird drone object placement
      const targetDirection = target.getWorldPosition().sub(this.getWorldPosition()).normalize();
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
          // Update velocity based on new direction
          this.vel.copy(this.zdir).multiplyScalar(this.speed);
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

