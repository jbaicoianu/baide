room.registerElement('audio-factory', {
  create() {
     return;
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

    // Create a laser sound named "laserbeam" using Tone.Oscillator
    this.laserbeam = new Tone.Oscillator({
      type: 'sawtooth',
      frequency: 5000, // Start frequency at 5000Hz
      volume: 1
    }).connect(this.laserDistortion);
    
    // Ensure the oscillator starts but is initially silent
    this.laserbeam.start();
    
    // Create a gain node to control the amplitude
    this.laserGain = new Tone.Gain(1).connect(this.laserDistortion);
    this.laserbeam.connect(this.laserGain);

    // Create a quadratic pitch shift
    this.laserPitchAutomation = new Tone.FrequencyEnvelope({
      attack: 0.02,
      decay: 0.5,
      sustain: 0,
      release: 0
    }).toDestination();
    
    // Connect the pitch envelope to the oscillator's frequency
    this.laserPitchAutomation.connect(this.laserbeam.frequency);
    
    // Create missileTargetAcquiring sound effect
    this.missileTargetAcquiringGain = new Tone.Gain(0).toDestination();
    this.missileTargetAcquiring = new Tone.Oscillator({
      type: 'sine',
      frequency: 600,
      volume: -12
    }).connect(this.missileTargetAcquiringGain);
    this.missileTargetAcquiring.start();
  },
  
  playLaser() {
    if (this.laserbeam) {
      // Set up the frequency shift from 5000Hz to 100Hz quadratically
      this.laserbeam.frequency.setValueAtTime(5000, Tone.now());
      this.laserbeam.frequency.linearRampToValueAtTime(100, Tone.now() + 0.5);
      
      // Trigger the gain to make the sound audible
      this.laserGain.gain.setValueAtTime(1, Tone.now());
      this.laserGain.gain.linearRampToValueAtTime(0, Tone.now() + 0.5);
    } else {
      console.warn('Laserbeam oscillator is not initialized yet.');
    }
  },
  
  playMissileTargetAcquiring() {
    if (this.missileTargetAcquiring) {
      // Trigger the gain to make the sound audible
      this.missileTargetAcquiringGain.gain.setValueAtTime(1, Tone.now());
      this.missileTargetAcquiringGain.gain.exponentialRampToValueAtTime(0.001, Tone.now() + 0.1);
    } else {
      console.warn('MissileTargetAcquiring oscillator is not initialized yet.');
    }
  }
});