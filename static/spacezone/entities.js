room.registerElement('spacezone-level', {
  create() {
    // Initialization code for spacezone-level
  },
  update(dt) {
    // Update logic for spacezone-level
  }
});

room.registerElement('spacezone-player', {
  create() {
    // Initialization code for spacezone-player
  },
  update(dt) {
    // Update logic for spacezone-player
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
    this.position = new THREE.Vector3();
  },
  update(dt) {
    // Update logic for spacezone-waypoint
  }
});