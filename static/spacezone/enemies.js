room.registerElement('spacezone-enemy-turret', {
    create() {
        // Create turret base as a flattened cylinder
        this.base = this.createObject('object', {
            type: 'cylinder',
            pos: '0 0 0',
            scale: '1 0.1 1',
            col: 'grey'
        });
        
        // Create turret hinge as a cube
        this.hinge = this.base.createObject('object', {
            type: 'cube',
            pos: '0 0.5 0',
            scale: '0.5 0.5 0.5',
            col: 'darkgrey'
        });
        
        // Create turret gun as an extended cylinder
        this.gun = this.hinge.createObject('object', {
            type: 'cylinder',
            pos: '0 0 1',
            scale: '0.2 1 0.2',
            col: 'black'
        });
        
        // Spawn a spacezone-cannon inside the gun object
        this.cannon = this.gun.createObject('spacezone-cannon', {
            pos: '0 0 1',
            rotation: '0 0 0'
        });
    },
    update(dt) {
        // Rotate the turret hinge over time
        this.hinge.rotation.y += 30 * dt; // 30 degrees per second
    }
});