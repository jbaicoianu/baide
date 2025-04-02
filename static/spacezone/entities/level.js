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

    // Create spacezone-enemy-dronecontroller object
    setTimeout(() => {
      this.droneController = this.createObject('spacezone-enemy-dronecontroller', {
        pos: new THREE.Vector3(0, 0, 0),
        rotation: '0 0 0',
        scale: new THREE.Vector3(1, 1, 1)
      });
    }, 3000);

    // Spawn the cargo-ship object
    const cargoShipPosition = this.getPositionAtTime(1).clone().add(new THREE.Vector3(-30, 0, 400));
    this.cargoShip = this.createObject('spacezone-cargoship', {
      id: 'cargo-ship',
      js_id: 'cargo-ship',
      pos: cargoShipPosition,
      rotation: V(20, 17, 0),
      mass: 10000,
    });

    // Add four spacezone-enginetrail objects and corresponding spheres to the cargo ship
    this.cargoShip.engineglow = [];
    const enginePositions = [
      V(-25, -35, -185),
      V(25, -35, -185),
      V(-25, 10, -185),
      V(25, 10, -185)
    ];

    enginePositions.forEach(pos => {
      // Create spacezone-enginetrail object
      this.createObject('spacezone-enginetrail', {
        pos: pos.clone().add(this.cargoShip.pos),
        parent: this.cargoShip
      });

      // Create sphere with scale V(20) and store reference
      const sphere = this.createObject('object', {
        id: 'sphere',
        pos: pos.clone().add(this.cargoShip.pos),
        scale: V(20),
        col: 'blue', // Optional: set color for visibility
      });
      this.cargoShip.engineglow.push(sphere);
    });

    // Add two large portals behind the cargo ship
    this.portalRight = this.createObject('link', {
      pos: cargoShipPosition.clone().add(V(-200, 0, 200)),
      scale: V(100),
      round: true,
      shader_id: 'defaultportal',
    });

    this.portalLeft = this.createObject('link', {
      pos: cargoShipPosition.clone().add(V(200, 0, 200)),
      scale: V(100),
      round: true,
      shader_id: 'defaultportal',
      url: 'https://portal.pieter.com/',
      external: true,
    });

    // // Generate 10 enemy drones positioned randomly along the path
    // this.enemyDrones = [];
    // for (let i = 0; i < 10; i++) {
    //   const t = Math.random(); // Random value between 0 and 1
    //   const pos = this.curve.getPoint(t);
    //   const drone = this.createObject('spacezone-enemy-drone', {
    //     pos: pos,
    //     rotation: '0 0 0',
    //     scale: new THREE.Vector3(1, 1, 1),
    //     col: 'red'
    //   });
    //   this.enemyDrones.push(drone);
    // }
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
  },
  resetCargoShip() {
    this.cargoShip.accel = V(0);
    this.cargoShip.vel = V(0);
    const newPosition = this.getPositionAtTime(1).clone().add(new THREE.Vector3(-30, 0, 400));
    this.cargoShip.pos.copy(newPosition);
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
      light_shadow: true
    });
  },
  update(dt) {
    // Update logic for spacezone-star if needed
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
    return new Promise((resolve, reject) => {
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
          
          const onContinue = (event) => {
            resolve();
            this.removeEventListener('continue', onContinue);
          };

          this.addEventListener('continue', onContinue);
        })
        .catch(error => {
          console.error('Error loading dialog:', error);
          this.contentArea.innerHTML = '<p>Error loading dialog.</p>';
          this.dialogContainer.style.display = 'block';
          reject(error);
        });
    });
  },
  hideDialog() {
    this.dialogContainer.style.display = 'none';
  },
  emitContinueEvent() {
    const event = new Event('continue', { bubbles: true });
    this.dispatchEvent(event);
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
room.registerElement('spacezone-cargoship', {
  create() {
    // Create the hull subobject with id 'cargo-ship'
    this.hull = this.createObject('object', {
      id: 'cargo-ship',
      pos: V(0, 0, 0), // Default position; adjust as needed
      rotation: '0 0 0',
      scale: V(1, 1, 1),
    });

    // Initialize engineglow array
    this.engineglow = [];

    // Define engine positions
    const enginePositions = [
      V(-25, -35, -185),
      V(25, -35, -185),
      V(-25, 10, -185),
      V(25, 10, -185)
    ];

    // Add spacezone-enginetrail objects and corresponding spheres
    enginePositions.forEach(pos => {
      // Create spacezone-enginetrail object
      this.createObject('spacezone-enginetrail', {
        pos: pos.clone().add(this.hull.pos),
        parent: this.hull
      });

      // Create sphere with scale V(20) and store reference
      const sphere = this.createObject('object', {
        id: 'sphere',
        pos: pos.clone().add(this.hull.pos),
        scale: V(20),
        col: 'blue', // Optional: set color for visibility
      });
      this.engineglow.push(sphere);
    });
  },
  dispatch() {
    // Set acceleration based on z-direction
    this.accel = this.zdir.clone().multiplyScalar(150);
  }
});