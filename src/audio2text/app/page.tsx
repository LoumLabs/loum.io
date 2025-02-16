'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  SunIcon, 
  MoonIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
  InformationCircleIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import WaveSurfer from 'wavesurfer.js';

interface TranscriptionEntry {
  id: string;
  fileName: string;
  text: string;
  timestamp: Date;
  processing?: boolean;
  confidence?: number;
  audioUrl?: string;  // Add this for the audio blob URL
  audioBlob?: Blob;  // Store blob for later transcription
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
}

const SUPPORTED_FORMATS = ['mp3', 'wav', 'm4a', 'mp4', 'aac', 'ogg', 'wma', 'flac'];
const MAX_FILE_SIZE = 500; // MB

// This would come from environment variables
const OPENAI_API_KEY = process.env.NEXT_PUBLIC_OPENAI_API_KEY;

export default function Home() {
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  };

  const [isProcessing, setIsProcessing] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const waveformRefs = useRef<{ [key: string]: WaveSurfer | null }>({});
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({});

  const transcribeAudio = async (file: File): Promise<{ text: string; confidence: number }> => {
    try {
      console.log('Sending file for transcription:', { name: file.name, type: file.type, size: `${(file.size / (1024 * 1024)).toFixed(2)}MB` });

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/audio2text/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      let data;
      const contentType = response.headers.get('content-type');
      
      try {
        data = await response.json();
      } catch (e) {
        console.error('Failed to parse response as JSON:', e);
        throw new Error('Invalid response from server');
      }

      if (!response.ok) {
        console.error('Server error:', data);
        throw new Error(data.details || data.error || 'Transcription failed');
      }

      if (!data.text) {
        console.error('Invalid response data:', data);
        throw new Error('No transcription text received');
      }
      
      return data;
    } catch (error: any) {
      console.error('Transcription error:', error);
      throw new Error(error.message || 'Failed to transcribe audio');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size
    const fileSize = file.size / (1024 * 1024); // Convert to MB
    if (fileSize > MAX_FILE_SIZE) {
      showToast(`File size exceeds ${MAX_FILE_SIZE}MB limit. Please choose a smaller file.`, 'error');
      return;
    }

    // Check file format
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !SUPPORTED_FORMATS.includes(fileExtension)) {
      showToast(`Unsupported file format. Please upload one of: ${SUPPORTED_FORMATS.join(', ')}`, 'error');
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    // Create a new transcription entry
    const newTranscription: TranscriptionEntry = {
      id: Date.now().toString(),
      fileName: file.name,
      text: 'Processing...',
      timestamp: new Date(),
      processing: true,
      audioUrl: URL.createObjectURL(file)
    };

    setTranscriptions(prev => [newTranscription, ...prev]);

    try {
      // Start progress animation
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 1000); // Slower progress for larger files

      // Actual transcription
      const { text: transcribedText, confidence } = await transcribeAudio(file);

      // Update the transcription
      setTranscriptions(prev => prev.map(t => 
        t.id === newTranscription.id 
          ? { 
              ...t, 
              text: transcribedText, 
              processing: false,
              confidence,
              timestamp: new Date()
            }
          : t
      ));

      clearInterval(progressInterval);
      setProgress(100);
      setIsProcessing(false);
      showToast('Transcription completed successfully');
    } catch (error: any) {
      setTranscriptions(prev => prev.map(t => 
        t.id === newTranscription.id 
          ? { 
              ...t, 
              text: `Transcription failed: ${error.message}`, 
              processing: false 
            }
          : t
      ));
      showToast(error.message || 'Transcription failed', 'error');
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Set up audio context and analyser for live visualization
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);

      // Start visualization
      visualize();

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setRecordedBlob(audioBlob);
        await handleRecordingComplete(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      showToast('Failed to start recording', 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Stop visualization
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    }
  };

  const visualize = () => {
    if (!analyserRef.current || !dataArrayRef.current) return;

    const canvas = document.getElementById('liveWaveform') as HTMLCanvasElement;
    if (!canvas) return;

    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const draw = () => {
      const WIDTH = canvas.width;
      const HEIGHT = canvas.height;

      animationFrameRef.current = requestAnimationFrame(draw);

      analyserRef.current!.getByteTimeDomainData(dataArrayRef.current!);

      canvasCtx.fillStyle = 'rgb(17, 24, 39)';
      canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = 'rgb(99, 102, 241)';
      canvasCtx.beginPath();

      const sliceWidth = WIDTH / dataArrayRef.current!.length;
      let x = 0;

      for (let i = 0; i < dataArrayRef.current!.length; i++) {
        const v = dataArrayRef.current![i] / 128.0;
        const y = v * HEIGHT / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasCtx.lineTo(WIDTH, HEIGHT / 2);
      canvasCtx.stroke();
    };

    draw();
  };

  const handleRecordingSubmit = async () => {
    if (!recordedBlob) return;

    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', recordedBlob);

      const response = await fetch('/audio2text/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to transcribe audio');
      }

      const data = await response.json();
      
      // Add new transcription to list
      setTranscriptions(prev => [{
        id: Date.now(),
        text: data.text,
        confidence: data.confidence,
        audioBlob: recordedBlob,
        waveformId: `wf${Date.now()}`,
        timestamp: new Date()
      }, ...prev]);

      // Clear recording
      setRecordedBlob(null);
      setIsProcessing(false);
      
      showToast('Audio transcribed successfully!');
    } catch (error: any) {
      console.error('Transcription error:', error);
      showToast(error.message || 'Failed to transcribe audio', 'error');
      setIsProcessing(false);
    }
  };

  const handleRecordingComplete = async (blob: Blob) => {
    const id = Date.now();
    const recordingDate = new Date();
    
    setTranscriptions(prev => [{
      id,
      fileName: `Audio Recording - ${recordingDate.toLocaleString()}`,
      text: 'Click Transcribe to process',
      timestamp: recordingDate,
      processing: false,
      audioBlob: blob,
      audioUrl: URL.createObjectURL(blob),
      waveformId: `wf${id}`
    }, ...prev]);
  };

  const handleTranscribe = async (id: string, blob: Blob) => {
    setTranscriptions(prev => prev.map(t => 
      t.id === id ? { ...t, processing: true, text: 'Processing...' } : t
    ));

    try {
      // Actual transcription
      const formData = new FormData();
      formData.append('file', new File([blob], 'recording.wav', { type: 'audio/wav' }));

      const response = await fetch('/audio2text/api/transcribe', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Transcription API error:', {
          status: response.status,
          error: errorData
        });
        throw new Error(errorData.error || 'Transcription failed');
      }

      const data = await response.json();
      
      setTranscriptions(prev => prev.map(t => 
        t.id === id ? {
          ...t,
          text: data.text,
          confidence: data.confidence,
          processing: false,
          timestamp: new Date()
        } : t
      ));

      showToast('Transcription completed!', 'success');
    } catch (error: any) {
      console.error('Transcription error:', error);
      setTranscriptions(prev => prev.map(t => 
        t.id === id ? { ...t, text: 'Transcription failed', processing: false } : t
      ));
      showToast(error.message || 'Failed to transcribe audio', 'error');
    }
  };

  useEffect(() => {
    // Cleanup old waveforms first
    Object.values(waveformRefs.current).forEach(wavesurfer => {
      if (wavesurfer) wavesurfer.destroy();
    });
    waveformRefs.current = {};

    // Initialize new waveforms
    transcriptions.forEach(entry => {
      if (entry.audioUrl && !waveformRefs.current[entry.id]) {
        const container = document.getElementById(`waveform-${entry.id}`);
        if (container) {
          const wavesurfer = WaveSurfer.create({
            container,
            height: 50,
            normalize: true,
            waveColor: '#4B5563',
            progressColor: '#6366F1',
            cursorWidth: 0,
            barWidth: 2,
            barGap: 1,
            barRadius: 3,
            backend: 'WebAudio'
          });

          wavesurfer.load(entry.audioUrl);
          waveformRefs.current[entry.id] = wavesurfer;

          // Log for debugging
          console.log('Initialized waveform for', entry.id);
        } else {
          console.error('Container not found for', entry.id);
        }
      }
    });

    return () => {
      // Cleanup
      Object.values(waveformRefs.current).forEach(wavesurfer => {
        if (wavesurfer) wavesurfer.destroy();
      });
    };
  }, [transcriptions]);

  const togglePlayback = (id: string) => {
    const wavesurfer = waveformRefs.current[id];
    if (wavesurfer) {
      if (wavesurfer.isPlaying()) {
        wavesurfer.pause();
      } else {
        wavesurfer.play();
      }
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 3000);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const downloadText = (text: string, fileName: string) => {
    const element = document.createElement('a');
    const file = new Blob([text], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${fileName.split('.')[0]}_transcription.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const removeTranscription = (id: string) => {
    setTranscriptions(prev => prev.filter(t => t.id !== id));
  };

  return (
    <main className="min-h-screen p-8 pt-16 bg-gray-50 dark:bg-gray-900 text-black dark:text-white">
      {/* Toast Container */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-2 bg-green-50 dark:bg-green-900/20 rounded-lg shadow-lg p-3 flex items-center text-sm border border-green-100 dark:border-green-800 min-w-[200px] justify-center cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
              onClick={() => dismissToast(toast.id)}
            >
              <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400 mr-2" />
              <span className="text-green-800 dark:text-green-200">{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex flex-col items-center w-full max-w-3xl mx-auto p-4">
        {/* Header Section */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <DocumentTextIcon className="w-12 h-12 text-primary mr-2" />
            <h1 className="text-4xl font-bold">Audio to Text</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Secure, Fast, and Accurate Audio Transcription
          </p>
        </div>

        {/* Theme Toggle */}
        <motion.div
          className="fixed top-4 right-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <label className="swap swap-rotate">
            <input
              type="checkbox"
              checked={isDarkMode}
              onChange={toggleDarkMode}
              className="hidden"
            />
            {isDarkMode ? (
              <SunIcon className="w-6 h-6 text-yellow-400" />
            ) : (
              <MoonIcon className="w-6 h-6 text-gray-600" />
            )}
          </label>
        </motion.div>

        {/* Main Content */}
        <div className="w-full">
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center relative bg-white dark:bg-gray-800">
            <div className="absolute top-2 right-2">
              <div className="group relative">
                <InformationCircleIcon className="w-5 h-5 text-gray-400 hover:text-primary cursor-help" />
                <div className="hidden group-hover:block absolute right-0 w-64 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg text-sm text-left mt-1 z-10">
                  <p className="mb-2">Supported formats: {SUPPORTED_FORMATS.join(', ')}</p>
                  <p>Maximum file size: {MAX_FILE_SIZE}MB</p>
                </div>
              </div>
            </div>

            {/* File Upload Section */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-4">Upload Audio File</h2>
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                className="hidden"
                id="audio-upload"
                disabled={isProcessing || isRecording}
              />
              <label
                htmlFor="audio-upload"
                className={`flex flex-col items-center cursor-pointer group ${(isProcessing || isRecording) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <ArrowUpTrayIcon className="w-12 h-12 text-gray-400 group-hover:text-primary mb-4" />
                <span className="text-lg mb-2">Drop your audio file here</span>
                <span className="text-sm text-gray-500">or click to browse</span>
              </label>
            </div>

            {/* Divider */}
            <div className="flex items-center my-8">
              <div className="flex-grow border-t border-gray-300 dark:border-gray-700"></div>
              <span className="mx-4 text-gray-500">or</span>
              <div className="flex-grow border-t border-gray-300 dark:border-gray-700"></div>
            </div>

            {/* Recording Section */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Record Audio</h2>
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      className="flex items-center bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <circle cx="10" cy="10" r="4" />
                      </svg>
                      Start Recording
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="flex items-center bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <rect x="6" y="6" width="8" height="8" />
                      </svg>
                      Stop
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Privacy Notice */}
          <div className="mt-6 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            <ShieldCheckIcon className="w-4 h-4 mr-2" />
            <p>Your files are processed securely and automatically deleted after 24 hours</p>
          </div>

          {/* Progress Bar */}
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-8"
            >
              <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center mt-2 text-sm text-gray-600 dark:text-gray-400">
                <span>Processing your audio...</span>
                <span>{progress}%</span>
              </div>
            </motion.div>
          )}

          {/* Transcription History */}
          <AnimatePresence>
            {transcriptions.map((transcription, index) => (
              <motion.div
                key={transcription.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.1 }}
                className="mt-8 mb-12"
              >
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg ring-1 ring-gray-100 dark:ring-gray-700 relative">
                  <button 
                    onClick={() => removeTranscription(transcription.id)}
                    className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>

                  {transcription.audioUrl && (
                    <div className="mb-4">
                      <div 
                        id={`waveform-${transcription.id}`} 
                        className="mb-2 rounded bg-gray-50 dark:bg-gray-800 p-2 h-[58px]"
                      >
                        <div></div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => togglePlayback(transcription.id)}
                          className="text-sm px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                          Play/Pause
                        </button>
                        {!transcription.processing && transcription.text === 'Click Transcribe to process' && (
                          <button
                            onClick={() => handleTranscribe(transcription.id, transcription.audioBlob)}
                            className="text-sm px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                          >
                            Transcribe
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="w-full flex items-center gap-2">
                      <div className="truncate flex-1">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {transcription.audioBlob instanceof File 
                            ? transcription.audioBlob.name 
                            : transcription.fileName}
                        </span>
                      </div>
                    </div>
                    
                    {transcription.text !== 'Click Transcribe to process' && (
                      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                        <span>
                          Transcribed {transcription.timestamp.toLocaleString()}
                        </span>
                        {transcription.confidence && (
                          <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 px-2 py-0.5 rounded">
                            {Math.round(transcription.confidence * 100)}% confidence
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <textarea
                    value={transcription.text}
                    onChange={(e) => {
                      const updatedTranscriptions = transcriptions.map(t =>
                        t.id === transcription.id ? { ...t, text: e.target.value } : t
                      );
                      setTranscriptions(updatedTranscriptions);
                    }}
                    className="w-full h-48 p-4 bg-transparent border border-gray-300 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary mt-4"
                    placeholder={transcription.processing ? 'Transcribing...' : 'Transcribed text will appear here...'}
                    disabled={transcription.processing}
                  />
                  <div className="mt-4">
                    <div className="flex justify-end space-x-4">
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(transcription.text);
                          showToast('Copied to clipboard');
                        }}
                        className="px-4 py-2 bg-secondary text-white rounded-lg hover:bg-green-600 transition-colors"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => {
                          downloadText(transcription.text, transcription.fileName);
                          showToast('Transcription downloaded successfully');
                        }}
                        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
