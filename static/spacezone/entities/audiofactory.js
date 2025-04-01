room.registerElement('audio-factory', {
  create() {
    // Check if ToneJS is already loaded to prevent multiple script injections
    if (!window.Tone) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/tone';
      script.onload = () => {
        this.initializeTone();
      };
      document.head.appendChild(script);
    } else {
      this.initializeTone();
    }
  },
  
  initializeTone() {
    // Initialize ToneJS with the existing AudioContext from JanusXR
    const listener = this.engine.systems.sound.getRealListener();
    if (listener && listener.context) {
      Tone.setContext(listener.context);
    } else {
      console.warn('Unable to retrieve JanusXR AudioContext. ToneJS may not function as expected.');
    }
    
    this.createSounds();
  },
  
  createSounds() {
    // Create distortion effect for the laser without overriding the destination
    this.laserDistortion = new Tone.Distortion(0.8);
    
    // Create a laser sound named "laserbeam" using Tone.Oscillator
    this.laserbeam = new Tone.Oscillator({
      type: 'sawtooth',
      frequency: 5000, // Start frequency at 5000Hz
      volume: -Infinity
    }).connect(this.laserDistortion);
    
    // Connect distortion effect to the existing listener's destination
    const listener = this.engine.systems.sound.getRealListener();
    if (listener && listener.context) {
      this.laserDistortion.toDestination();
    } else {
      this.laserDistortion.toMaster();
    }
    
    // Ensure the oscillator starts but is initially silent
    this.laserbeam.start();
    
    // Create a gain node to control the amplitude
    this.laserGain = new Tone.Gain(1).connect(this.laserDistortion);
    this.laserbeam.connect(this.laserGain);

    // Create a frequency envelope for the laser
    this.laserPitchEnvelope = new Tone.FrequencyEnvelope({
      attack: 0.02,
      decay: 0.5,
      sustain: 0,
      release: 0
    }).connect(this.laserbeam.frequency);
    
    // Create missileTargetAcquiring sound effect
    this.missileTargetAcquiringGain = new Tone.Gain(0).connect(this.laserDistortion);
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
      this.laserbeam.frequency.cancelScheduledValues(Tone.now());
      this.laserbeam.frequency.setValueAtTime(5000, Tone.now());
      this.laserbeam.frequency.linearRampToValueAtTime(100, Tone.now() + 0.5);
      
      // Trigger the gain to make the sound audible
      this.laserGain.gain.cancelScheduledValues(Tone.now());
      this.laserGain.gain.setValueAtTime(1, Tone.now());
      this.laserGain.gain.linearRampToValueAtTime(0, Tone.now() + 0.5);
    } else {
      console.warn('Laserbeam oscillator is not initialized yet.');
    }
  },
  
  playMissileTargetAcquiring() {
    if (this.missileTargetAcquiringGain) {
      // Trigger the gain to make the sound audible
      this.missileTargetAcquiringGain.gain.cancelScheduledValues(Tone.now());
      this.missileTargetAcquiringGain.gain.setValueAtTime(1, Tone.now());
      this.missileTargetAcquiringGain.gain.exponentialRampToValueAtTime(0.001, Tone.now() + 0.1);
    } else {
      console.warn('MissileTargetAcquiring oscillator is not initialized yet.');
    }
  }
});