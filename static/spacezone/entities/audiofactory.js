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
    // Create distortion effect for the laser
    this.laserDistortion = new Tone.Distortion(0.8).toDestination();

    // Create a laser sound named "laserbeam" with aggressive attack and decay
    this.laserbeam = new Tone.Synth({
      oscillator: {
        type: 'sawtooth' // Changed from 'sine' to 'sawtooth' for a more aggressive tone
      },
      envelope: {
        attack: 0.005,   // Increased aggression by reducing attack time
        decay: 0.05,     // Increased aggression by reducing decay time
        sustain: 0.1,
        release: 0.1
      }
    }).connect(this.laserDistortion);
    
    // Ensure the synth is ready
    this.laserbeam.toMaster();

    // Create pitch shift envelope for the laser
    this.pitchShiftEnvelope = new Tone.Envelope({
      attack: 0.01,
      decay: 0.2,
      sustain: 0,
      release: 0
    }).connect(this.laserbeam.detune);
  },
  
  playLaser() {
    if (this.laserbeam) {
      // Trigger the pitch shift envelope to start at higher pitch and shift to lower pitch
      this.pitchShiftEnvelope.triggerAttackRelease(1200, "8n");
      
      this.laserbeam.triggerAttackRelease("C5", "8n");
    } else {
      console.warn('Laserbeam sound is not initialized yet.');
    }
  }
});