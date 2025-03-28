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