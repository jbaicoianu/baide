// File: static/spacezone/entities/level.js

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

    // Removed budgetLabel text object
    // this.textObject = this.createObject('text', {
    //   id: 'startText', // Added ID for easier reference
    //   text: 'Click ship to start',
    //   pos: new THREE.Vector3(0, 5, 0),
    //   rotation: '0 90 0',
    //   col: 'white', // Optional: set text color
    //   font_scale: false
    // });

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

    // Add two large portals behind the cargo ship
    this.portalRight = this.createObject('link', {
      pos: cargoShipPosition.clone().add(V(-200, 0, 200)),
      scale: V(100),
      round: true,
      shader_id: 'defaultportal',
    });

    // Add click event handler to portalRight
    this.portalRight.addEventListener('click', () => {
      if (room.objects['player-ship'] && typeof room.objects['player-ship'].startRace === 'function') {
        room.objects['player-ship'].startRace();
      } else {
        console.warn("player-ship object or startRace method not found.");
      }
    });

    this.portalLeft = this.createObject('link', {
      pos: cargoShipPosition.clone().add(V(200, 0, 200)),
      scale: V(100),
      round: true,
      shader_id: 'defaultportal',
      url: 'https://portal.pieter.com/',
      external: true,
    });

    // Add event listener for race_start event
    this.addEventListener('race_start', () => {
      this.resetCargoShip();
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
    const newPosition = this.getPositionAtTime(1).clone().add(new THREE.Vector3(-30, 0, 400));
    this.cargoShip.reset(newPosition);
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
          this.contentArea.scrollTop = 0; // Scroll to top when dialog is shown
          
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
          this.contentArea.scrollTop = 0; // Scroll to top even on error
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
// File: static/spacezone/entities/spacezone-budget.js
room.registerElement('spacezone-budget', {
  currentbalance: 0,
  scores: {
    'neuralink rental': -250,
    'surrogate replacement fee': -26384,
    'medical supply delivery': 20,
    'missile restocking fee': -150,
    'completion bonus': 2500,
    'drone destruction bonus': 250
  },
  create() {
    // Initialize currentbalance and set up event listeners
    this.reset();

    // Removed text object for displaying the budget
    // this.budgetLabel = this.createObject('text', {
    //   text: `Balance: ${this.currentbalance}`,
    //   pos: new THREE.Vector3(22, 12, 0),
    //   rotation: '0 180 0',
    //   font_scale: false,
    //   col: 'white',
    //   font_size: 2
    // });

    // Create HTML element for displaying credits
    this.creditsElement = document.createElement('div');
    this.creditsElement.className = 'spacezone-budget-credits';

    const label = document.createElement('span');
    label.textContent = 'Credits: ';

    this.balanceSpan = document.createElement('span');
    this.balanceSpan.className = 'budget_balance';
    this.balanceSpan.textContent = `${this.currentbalance}₿`;

    this.budgetItemsContainer = document.createElement('div');
    this.budgetItemsContainer.className = 'budget_items_container';

    this.creditsElement.appendChild(label);
    this.creditsElement.appendChild(this.balanceSpan);
    this.creditsElement.appendChild(this.budgetItemsContainer);
    document.body.appendChild(this.creditsElement);

    // Event handlers bound to the parent
    if(this.parent) {
      this.parent.addEventListener('neuralink_rental', (e) => this.apply('neuralink rental', e.quantity));
      this.parent.addEventListener('surrogate_replacement_fee', (e) => this.apply('surrogate replacement fee', e.quantity));
      this.parent.addEventListener('medical_supply_delivery', (e) => this.apply('medical supply delivery', e.quantity));
      this.parent.addEventListener('missile_restocking_fee', (e) => this.apply('missile restocking fee', e.quantity));
      this.parent.addEventListener('completion_bonus', (e) => this.apply('completion bonus', e.quantity));
      this.parent.addEventListener('drone_destruction_bonus', (e) => this.apply('drone destruction bonus', e.quantity));
    } else {
      console.warn('Parent not found. Cannot bind event listeners.');
    }

    // console.log('Spacezone-budget element created and event listeners attached.');
  },

  reset() {
    //this.currentbalance = 0;
    if(this.balanceSpan) {
      this.balanceSpan.textContent = `₿${this.currentbalance}`;
    }
    if(this.budgetItemsContainer) {
      this.budgetItemsContainer.innerHTML = '';
    }
    // console.log('Budget has been reset to 0.');
  },

  addScore(event) {
    // Removed obsolete scoring logic
  },
  
  addBudgetItem(type, scoreChange, quantity = 1) {
    if(this.budgetItemsContainer) {
      const budgetItem = document.createElement('div');
      budgetItem.className = 'budget_item';
      budgetItem.innerHTML = `<span class="budget_item_type">${quantity}x ${type}</span>: <span class="budget_item_value">${Math.abs(scoreChange)}₿</span>`;
      this.budgetItemsContainer.appendChild(budgetItem);

      // Add 'budget_item_removing' class after 250ms
      setTimeout(() => {
        budgetItem.classList.add('budget_item_removing');
      }, 1000);

      // Remove the budget item from DOM after 1500ms
      setTimeout(() => {
        this.budgetItemsContainer.removeChild(budgetItem);
      }, 6000);
    }
  },

  apply(type, quantity = 1) {
    if(this.scores.hasOwnProperty(type)) {
      const scoreChange = this.scores[type] * quantity;
      this.currentbalance += scoreChange;
      if(this.balanceSpan) {
        this.balanceSpan.textContent = `${this.currentbalance}₿`;
      }

      this.addBudgetItem(type, scoreChange, quantity);

      if(this.balanceSpan) {
        if(scoreChange > 0) {
          this.balanceSpan.classList.add('budget_credit');
          setTimeout(() => {
            this.balanceSpan.classList.remove('budget_credit');
          }, 150);
        } else if(scoreChange < 0) {
          this.balanceSpan.classList.add('budget_debit');
          setTimeout(() => {
            this.balanceSpan.classList.remove('budget_debit');
          }, 150);
        }
      }

      console.log(`Applied '${type}' with quantity ${quantity}. Balance changed by: ${scoreChange}. Total balance: ${this.currentbalance}`);
    } else {
      console.warn(`Unknown budget type '${type}'.`);
    }
    localStorage['currentbalance'] = this.currentbalance;
  },

  applyMultiple(budgetChanges) {
    let totalChange = 0;
    for (let [type, quantity] of Object.entries(budgetChanges)) {
      if(this.scores.hasOwnProperty(type)) {
        const scoreChange = this.scores[type] * quantity;
        this.currentbalance += scoreChange;
        totalChange += scoreChange;
        this.addBudgetItem(type, scoreChange, quantity);
      } else {
        console.warn(`Unknown budget type '${type}'.`);
      }
    }

    if(this.balanceSpan) {
      this.balanceSpan.textContent = `${this.currentbalance}₿`;
      if(totalChange > 0) {
        this.balanceSpan.classList.add('budget_credit');
        setTimeout(() => {
          this.balanceSpan.classList.remove('budget_credit');
        }, 150);
      } else if(totalChange < 0) {
        this.balanceSpan.classList.add('budget_debit');
        setTimeout(() => {
          this.balanceSpan.classList.remove('budget_debit');
        }, 150);
      }
    }

    console.log(`Applied multiple budget changes. Total balance change: ${totalChange}. New balance: ${this.currentbalance}`);
    localStorage['currentbalance'] = this.currentbalance;
  },
  
  updateSupplies() {
    // Removed obsolete supply update logic
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

    // Initialize engineglow and trailsarrays
    this.engineglow = [];
    this.trails = [];

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
      let trail = this.createObject('spacezone-enginetrail', {
        pos: pos,
      });

      // Create sphere with scale V(20) and store reference
      const sphere = this.createObject('object', {
        id: 'sphere',
        pos: pos,
        scale: V(20),
        col: 'black',
        emissive: 'cyan',
        emissive_strength: 0
      });
      this.trails.push(trail);
      this.engineglow.push(sphere);
    });
  },
  reset() {
    this.dispatching = false;
    this.cargoShip.accel = V(0);
    this.cargoShip.vel = V(0);
    this.cargoShip.reset(newPosition);
    this.cargoShip.pos.copy(newPosition);

    this.engineglow.forEach(glow => {
      glow.emissive_strength = 0;
    });
  },
  dispatch() {
    // Set acceleration based on z-direction
    this.dispatching = true;
    setTimeout(() => {
      this.accel = this.zdir.clone().multiplyScalar(150);
    }, 1000);
  },
  update(dt) {
    if (this.dispatching) {
      this.engineglow.forEach(glow => {
        if (glow.emissive_strength < 1) glow.emissive_strength += dt;
      });
    }
  }
});