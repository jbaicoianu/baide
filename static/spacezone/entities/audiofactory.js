room.registerElement('audio-factory', {
  create() {
    // Dynamically load ToneJS library
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/tone';
    script.onload = () => {
      // Initialize ToneJS with the existing AudioContext from JanusXR
      const listener = this.engine.systems.sound.getRealListener();
      Tone.setContext(listener.context);
      
      this.createSounds();
    };
    document.head.appendChild(script);
  },
  
  createSounds() {
    // Create a simple laser sound named "laserbeam"
    this.laserbeam = new Tone.Synth({
      oscillator: {
        type: 'sine'
      },
      envelope: {
        attack: 0.01,
        decay: 0.2,
        sustain: 0.1,
        release: 0.1
      }
    }).toDestination();
    
    // Ensure the synth is ready
    this.laserbeam.toMaster();
  },
  
  playLaser() {
    if (this.laserbeam) {
      this.laserbeam.triggerAttackRelease("C5", "8n");
    } else {
      console.warn('Laserbeam sound is not initialized yet.');
    }
  }
});