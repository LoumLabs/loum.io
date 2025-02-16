// State management
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let audioBlob = null;
let audioUrl = '';
let transcriptions = [];

// DOM Elements
const recordButton = document.getElementById('record-button');
const fileInput = document.getElementById('audio-upload');
const transcriptionsList = document.getElementById('transcriptions-list');
const darkModeToggle = document.getElementById('dark-mode-toggle');

// Dark mode handling
function toggleDarkMode() {
  document.documentElement.classList.toggle('dark');
  document.body.classList.toggle('bg-gray-900');
  document.body.classList.toggle('text-white');
}

// Initialize dark mode
document.documentElement.classList.add('dark');
document.body.classList.add('bg-gray-900', 'text-white');

// Audio recording handlers
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: 'audio/wav' });
      audioBlob = blob;
      audioUrl = URL.createObjectURL(blob);
      document.getElementById('audio-preview').src = audioUrl;
      document.getElementById('audio-preview').style.display = 'block';
      document.getElementById('transcribe-button').style.display = 'block';
    };

    mediaRecorder.start();
    isRecording = true;
    updateRecordButton();
  } catch (err) {
    console.error('Error accessing microphone:', err);
    alert('Error accessing microphone. Please ensure you have granted permission.');
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    updateRecordButton();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
}

function updateRecordButton() {
  const button = document.getElementById('record-button');
  if (isRecording) {
    button.innerHTML = `
      <svg class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <rect x="6" y="6" width="8" height="8" />
      </svg>
      Stop Recording
    `;
    button.classList.remove('bg-blue-500', 'hover:bg-blue-600');
    button.classList.add('bg-red-500', 'hover:bg-red-600');
  } else {
    button.innerHTML = `
      <svg class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <circle cx="10" cy="10" r="6" />
      </svg>
      Start Recording
    `;
    button.classList.remove('bg-red-500', 'hover:bg-red-600');
    button.classList.add('bg-blue-500', 'hover:bg-blue-600');
  }
}

// File upload handler
function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  audioBlob = file;
  audioUrl = URL.createObjectURL(file);
  document.getElementById('audio-preview').src = audioUrl;
  document.getElementById('audio-preview').style.display = 'block';
  document.getElementById('transcribe-button').style.display = 'block';
}

// Transcription handler
async function handleTranscribe() {
  if (!audioBlob) return;

  try {
    // Convert blob to base64
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    
    reader.onload = async () => {
      try {
        const base64Data = reader.result.split(',')[1]; // Remove the data URL prefix
        
        console.log('Sending file for transcription:', {
          name: 'recording.wav',
          type: audioBlob.type,
          size: (audioBlob.size / (1024 * 1024)).toFixed(2) + 'MB'
        });

        const response = await fetch('/.netlify/functions/transcribe', {
          method: 'POST',
          body: JSON.stringify({
            audio: base64Data,
            mimetype: audioBlob.type || 'audio/wav'
          }),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        let errorText;
        try {
          const responseData = await response.json();
          if (!response.ok) {
            errorText = JSON.stringify(responseData);
            throw new Error(responseData.error || 'Failed to transcribe audio');
          }

          const transcription = {
            id: Date.now(),
            text: responseData.text,
            audioUrl: audioUrl,
          };

          transcriptions.unshift(transcription);
          updateTranscriptionsList();
        } catch (parseError) {
          errorText = await response.text();
          console.error('Response parsing error:', parseError);
          throw new Error('Failed to parse server response');
        }
      } catch (error) {
        console.error('Server error:', errorText || error.message);
        throw error;
      }
    };

    reader.onerror = (error) => {
      console.error('FileReader error:', error);
      throw new Error('Failed to read audio file');
    };
  } catch (error) {
    console.error('Transcription error:', error);
    alert('Error transcribing audio. Please try again.');
  }
}

// Update transcriptions list
function updateTranscriptionsList() {
  const list = document.getElementById('transcriptions-list');
  list.innerHTML = transcriptions.map(t => `
    <div class="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 shadow-sm">
      <div class="flex items-center gap-4 mb-2">
        <button onclick="toggleAudio('${t.audioUrl}')" class="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        <span class="text-sm text-gray-500">
          ${new Date(t.id).toLocaleString()}
        </span>
      </div>
      <p class="text-gray-700 dark:text-gray-300">${t.text}</p>
    </div>
  `).join('');
}

// Audio playback
function toggleAudio(url) {
  const audio = new Audio(url);
  audio.play();
}

// Event listeners
document.getElementById('record-button').addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

document.getElementById('audio-upload').addEventListener('change', handleFileUpload);
document.getElementById('transcribe-button').addEventListener('click', handleTranscribe);
document.getElementById('dark-mode-toggle').addEventListener('click', toggleDarkMode);
