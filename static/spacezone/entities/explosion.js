room.registerElement('explosion', {
  count: 50,
  create() {
    // Initialize the primary particle system for the explosion
    this.particles = this.createObject('particle', {
      count: this.count,
      rate: 20000,
      loop: false,
      col: this.col,
      rand_col: V(0.25),
      vel: V(-50),
      rand_vel: V(100),
      duration: 20,
      scale: V(5),
      image_id: 'spark'
    });

    // Initialize the radial particle system for the explosion
    this.particlesRing = this.createObject('particle', {
      count: this.count,
      rate: 20000,
      loop: false,
      col: this.col,
      rand_col: V(0.25),
      vel: V(-100, 0, -100),
      rand_vel: V(200, 0, 200),
      duration: 20,
      scale: V(5),
      image_id: 'spark'
    });
  },
  reset() {
    // Reset and start the primary particle system
    this.particles.resetParticles();
    this.particles.start();

    // Reset and start the radial particle system
    this.particlesRing.resetParticles();
    this.particlesRing.start();
  }
});