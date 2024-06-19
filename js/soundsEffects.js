const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let gainNode;
let convolverNode;
let audioBuffer;

fetch('public2/jazz.wav') // TODO: Change, it was implemented for cartonrock which has audios already loaded
  .then(response => response.arrayBuffer())
  .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
  .then(decodedAudio => {
    audioBuffer = decodedAudio;
  })
  .catch(error => console.error('Error loading audio:', error));

let audioSource;

speedControl.addEventListener('input', function() {
    const speed = parseFloat(this.value).toFixed(2);
    speedValue.textContent = `x${speed}`;
    if (audioSource) {
        audioSource.playbackRate.value = this.value;
    }
});

gainControl.addEventListener('input', function() {
    const volume = parseFloat(this.value);
    gainValue.textContent = volume.toFixed(1);
    if (gainNode) {
        gainNode.gain.value = volume;
    }
});

reverbControl.addEventListener('input', () => {
    const length = reverbControl.value * audioContext.sampleRate;
    const impulse = audioContext.createBuffer(2, length, audioContext.sampleRate);
    for (let i = 0; i < length; i++) {
        impulse.getChannelData(0)[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
        impulse.getChannelData(1)[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
    }
    convolverNode.buffer = impulse;
    reverbValue.textContent = 'x' + reverbControl.value.toFixed(2);
});

function playAudio() {
    if (audioSource) {
        audioSource.stop();
    }    
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.playbackRate.value = speedControl.value;

    // Crear y conectar el nodo de ganancia
    gainNode = audioContext.createGain();
    gainNode.gain.value = gainControl.value;
    audioSource.connect(gainNode);
    gainNode.connect(audioContext.destination);  

    // Buffer de reverb inicial
    convolverNode.buffer = audioContext.createBuffer(2, audioContext.sampleRate * 3, audioContext.sampleRate);

    // const audioBuffer = audioContext.createBuffer(1, currentSound.length, audioContext.sampleRate);
    // const channelData = audioBuffer.getChannelData(0);
    // channelData.set(currentSound);
    // audioSource.buffer = audioBuffer;
    
    // audioSource.connect(audioContext.destination);
    
    audioSource.onended = function() {
        updateProgress(1);
    };
    audioSource.onended();
    
    audioSource.start();
    
    // Progreso de reproducción en tiempo real
    let animationId = requestAnimationFrame(updateProgressLoop);
    
    function updateProgressLoop() {
        const progress = audioContext.currentTime / audioBuffer.duration;
        updateProgress(progress);
    
        if (progress >= 1) {
        cancelAnimationFrame(animationId);
        } else {
        animationId = requestAnimationFrame(updateProgressLoop);
        }
    }
}
