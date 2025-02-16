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
  duration?: number;  // Duration in seconds
  processing?: boolean;
  confidence?: number;
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
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  const transcribeAudio = async (file: File): Promise<{ text: string; confidence: number }> => {
    try {
      console.log('Sending file for transcription:', {
        name: file.name,
        type: file.type,
        size: Math.round(file.size / 1024 / 1024 * 100) / 100 + 'MB'
      });

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
        headers: {
          // Don't set Content-Type here, let the browser set it with the boundary
        },
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
      processing: true
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
              confidence
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
      audioStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // Set up audio visualization
      if (audioContextRef.current && analyserRef.current) {
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        
        const drawWaveform = () => {
          if (!isRecording) return;
          
          const canvas = document.getElementById('liveWaveform') as HTMLCanvasElement;
          if (!canvas) return;
          
          const canvasCtx = canvas.getContext('2d');
          if (!canvasCtx || !analyserRef.current || !dataArrayRef.current) return;

          const bufferLength = analyserRef.current.frequencyBinCount;
          analyserRef.current.getByteTimeDomainData(dataArrayRef.current);

          canvasCtx.fillStyle = 'rgb(255, 255, 255)';
          canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
          canvasCtx.lineWidth = 2;
          canvasCtx.strokeStyle = 'rgb(79, 70, 229)';
          canvasCtx.beginPath();

          const sliceWidth = canvas.width / bufferLength;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            const v = dataArrayRef.current[i] / 128.0;
            const y = v * canvas.height / 2;

            if (i === 0) {
              canvasCtx.moveTo(x, y);
            } else {
              canvasCtx.lineTo(x, y);
            }

            x += sliceWidth;
          }

          canvasCtx.lineTo(canvas.width, canvas.height / 2);
          canvasCtx.stroke();
          animationFrameRef.current = requestAnimationFrame(drawWaveform);
        };

        drawWaveform();
      }

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/wav' });
        setRecordedBlob(blob);
        
        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());
        
        // Stop the visualization
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      showToast('Recording started');
    } catch (error: any) {
      console.error('Error starting recording:', error);
      showToast(error.message || 'Failed to start recording', 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      showToast('Recording stopped');
    }
  };

  const handleRecordingSubmit = async () => {
    if (!recordedBlob) {
      showToast('No recording available', 'error');
      return;
    }

    // Create a File object from the Blob
    const file = new File([recordedBlob], 'recording.wav', { type: 'audio/wav' });
    setIsProcessing(true);
    setProgress(0);

    // Create a new transcription entry
    const newTranscription: TranscriptionEntry = {
      id: Date.now().toString(),
      fileName: 'Voice Recording',
      text: 'Processing...',
      timestamp: new Date(),
      processing: true
    };

    setTranscriptions(prev => [newTranscription, ...prev]);

    try {
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 1000);

      const { text: transcribedText, confidence } = await transcribeAudio(file);

      setTranscriptions(prev => prev.map(t => 
        t.id === newTranscription.id 
          ? { 
              ...t, 
              text: transcribedText, 
              processing: false,
              confidence
            }
          : t
      ));

      clearInterval(progressInterval);
      setProgress(100);
      setIsProcessing(false);
      setRecordedBlob(null); // Clear the recorded blob
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

  const togglePlayback = () => {
    if (wavesurferRef.current) {
      if (isPlaying) {
        wavesurferRef.current.pause();
      } else {
        wavesurferRef.current.play();
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

  // Initialize WaveSurfer when recorded blob changes
  useEffect(() => {
    if (recordedBlob && waveformRef.current) {
      // Cleanup previous instance
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
      }

      // Create new instance
      const wavesurfer = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#4F46E5',
        progressColor: '#818CF8',
        cursorColor: '#C7D2FE',
        barWidth: 2,
        barGap: 1,
        height: 100,
        normalize: true,
        backend: 'WebAudio'
      });

      // Set up event listeners
      wavesurfer.on('play', () => setIsPlaying(true));
      wavesurfer.on('pause', () => setIsPlaying(false));
      wavesurfer.on('finish', () => setIsPlaying(false));

      // Load the audio
      const url = URL.createObjectURL(recordedBlob);
      wavesurfer.load(url);

      // Store the instance
      wavesurferRef.current = wavesurfer;

      // Cleanup
      return () => {
        URL.revokeObjectURL(url);
        wavesurfer.destroy();
      };
    }
  }, [recordedBlob]);

  // Initialize audio context and analyzer for live visualization
  useEffect(() => {
    if (isRecording && !audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRecording]);

  return (
    <main className="min-h-screen p-8 pt-16">
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
                {/* Live waveform visualization */}
                {isRecording && (
                  <div className="w-full h-[100px] bg-white dark:bg-gray-900 rounded-lg overflow-hidden">
                    <canvas 
                      id="liveWaveform" 
                      className="w-full h-full"
                      width={800}
                      height={100}
                    ></canvas>
                  </div>
                )}
                
                {/* Recorded audio waveform */}
                {recordedBlob && !isRecording && (
                  <div className="w-full">
                    <div 
                      ref={waveformRef} 
                      className="mb-4 bg-gray-50 dark:bg-gray-900 rounded-lg p-4"
                    ></div>
                    <button
                      onClick={togglePlayback}
                      className="bg-primary hover:bg-primary/90 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2"
                    >
                      {isPlaying ? (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <rect x="6" y="4" width="3" height="12" />
                            <rect x="11" y="4" width="3" height="12" />
                          </svg>
                          Pause
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M8 5v10l8-5-8-5z" />
                          </svg>
                          Play
                        </>
                      )}
                    </button>
                  </div>
                )}

                <div className="flex justify-center gap-4">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      disabled={isProcessing}
                      className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <circle cx="10" cy="10" r="6" />
                      </svg>
                      Start Recording
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <rect x="6" y="6" width="8" height="8" />
                      </svg>
                      Stop Recording
                    </button>
                  )}
                  
                  {recordedBlob && (
                    <button
                      onClick={handleRecordingSubmit}
                      disabled={isProcessing}
                      className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Transcribe Recording
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
            {transcriptions.map((entry, index) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.1 }}
                className="mt-8 mb-12"
              >
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg ring-1 ring-gray-100 dark:ring-gray-700 relative">
                  <button 
                    onClick={() => removeTranscription(entry.id)}
                    className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Remove transcription"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <DocumentTextIcon className="w-6 h-6 text-primary mr-3 flex-shrink-0" />
                        <h2 className="text-lg font-semibold truncate">{entry.fileName}</h2>
                      </div>
                      {entry.confidence !== undefined && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Confidence: {Math.round(entry.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <span className="inline-block">
                        Transcribed {entry.timestamp.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <textarea
                    value={entry.text}
                    onChange={(e) => {
                      const updatedTranscriptions = transcriptions.map(t =>
                        t.id === entry.id ? { ...t, text: e.target.value } : t
                      );
                      setTranscriptions(updatedTranscriptions);
                    }}
                    className="w-full h-48 p-4 bg-transparent border border-gray-300 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary mt-4"
                    placeholder={entry.processing ? 'Transcribing...' : 'Transcribed text will appear here...'}
                    disabled={entry.processing}
                  />
                  <div className="mt-4">
                    <div className="flex justify-end space-x-4">
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(entry.text);
                          showToast('Copied to clipboard');
                        }}
                        className="px-4 py-2 bg-secondary text-white rounded-lg hover:bg-green-600 transition-colors"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => {
                          downloadText(entry.text, entry.fileName);
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
