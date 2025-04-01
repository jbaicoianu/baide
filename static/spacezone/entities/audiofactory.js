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
        attack: 0.02,   // Increased attack time for longer sound
        decay: 0.1,     // Increased decay time for longer sound
        sustain: 0.2,
        release: 0.03   // Adjusted release time to fit the 250ms duration
      }
    }).connect(this.laserDistortion);
    
    // Ensure the synth is ready
    this.laserbeam.toMaster();

    // Create pitch shift envelope for the laser
    this.pitchShiftEnvelope = new Tone.Envelope({
      attack: 0.02,    // Increased attack time for more pronounced pitch shift
      decay: 0.3,      // Increased decay time for sustained pitch effect
      sustain: 0,
      release: 0
    }).connect(this.laserbeam.detune);
  },
  
  playLaser() {
    if (this.laserbeam) {
      // Trigger the pitch shift envelope to start at higher pitch and shift to lower pitch
      this.pitchShiftEnvelope.triggerAttackRelease(2000, "16n"); // Increased detune value and shortened duration
      
      this.laserbeam.triggerAttackRelease("C5", "16n"); // Adjusted duration to match the 250ms total
    } else {
      console.warn('Laserbeam sound is not initialized yet.');
    }
  }
});