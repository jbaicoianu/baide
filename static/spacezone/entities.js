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
      this.tubeObject = this.createObject('object', { object: this.tubeMesh, collidable: false, pickable: false });
    }

    // Add the text object above the start point
    this.textObject = this.createObject('text', {
      text: 'Click ship to start',
      pos: new THREE.Vector3(0, 5, 0),
      rotation: '0 90 0',
      col: 'white' // Optional: set text color
    });
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

room.registerElement('spacezone-player', {
  create() {
    // Initialization code for spacezone-player

    // Add child object 'shuttle'
    this.shuttle = this.createObject('object', {
      id: 'shuttle',
      collision_id: 'shuttle',
      pos: new THREE.Vector3(0, 0, 0),
      col: 'blue', // Example color
      scale: new THREE.Vector3(1, 1, 1),
      zdir: new THREE.Vector3(0, 0, -1) // Set zdir to 0, 0, -1
    });

    // Add click event listener to shuttle
    this.shuttle.addEventListener('click', ev => this.startRace());

    this.isRacing = false;
    this.raceTime = 0;
    this.totalRaceTime = 120; // Total race duration in seconds
    this.zdir = new THREE.Vector3(0, 0, -1); // Initialize zdir
    this.pos = new THREE.Vector3(0, 0, 0); // Initialize position
  },
  startRace() {
    this.isRacing = true;
    this.raceTime = 0;
    this.appendChild(player);
    player.pos = V(0, 5, -20);
    player.orientation.set(0, 1, 0, 0);
    console.log('Race started!');
  },
  update(dt) {
    if (this.isRacing) {
      this.raceTime += dt;
      let t = this.raceTime / this.totalRaceTime;
      if (t > 1) t = 1;

      // Assuming 'spacezone-level' is a sibling element
      const level = this.parent.getObjectsByTagName('spacezone-level')[0];
      if (level && level.getPositionAtTime) {
        const position = level.getPositionAtTime(t);

        // Calculate look-ahead position
        const lookAheadT = Math.min(t + 0.001, 1);
        const lookAheadPos = level.getPositionAtTime(lookAheadT);
        
        // Compute direction vector
        const direction = new THREE.Vector3().subVectors(lookAheadPos, position).normalize();
        this.zdir = direction; // Update zdir

        // Update the player's position
        this.pos = position;
      }

      if(t >= 1){
        this.isRacing = false;
        console.log('Race completed!');
      }
    }
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
      opacity: 0.5
    });
  },
  update(dt) {
    // Update logic for spacezone-waypoint
    // You can add interactions or animations for the placeholder sphere here
  }
});