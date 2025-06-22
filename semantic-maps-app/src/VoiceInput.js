import React, { useState, useRef } from 'react';

const VoiceInput = ({ onVoiceParsed }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const recognitionRef = useRef(null);

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onstart = () => {
      setIsListening(true);
      setTranscript('');
    };

    recognitionRef.current.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setTranscript(transcript);
      console.log('Voice transcript:', transcript);
      
      // Parse the voice command
      parseVoiceCommand(transcript);
    };

    recognitionRef.current.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'no-speech') {
        alert('No speech detected. Please try again.');
      } else {
        alert(`Speech recognition error: ${event.error}`);
      }
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const parseVoiceCommand = async (command) => {
    setIsProcessing(true);
    
    try {
      const response = await fetch('http://localhost:8000/api/parse-voice-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      console.log('Parsed voice command:', data);
      
      // Call the callback with parsed data
      onVoiceParsed(data);
      
    } catch (error) {
      console.error('Error parsing voice command:', error);
      alert(`Error parsing voice command: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <button
        onClick={isListening ? stopListening : startListening}
        disabled={isProcessing}
        style={{
          padding: '8px 12px',
          borderRadius: '50%',
          border: 'none',
          backgroundColor: isListening ? '#ff4444' : '#007bff',
          color: 'white',
          cursor: isProcessing ? 'not-allowed' : 'pointer',
          fontSize: '16px',
          width: '40px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background-color 0.3s ease'
        }}
        title={isListening ? 'Stop listening' : 'Start voice input'}
      >
        {isProcessing ? '⏳' : isListening ? '⏹️' : '🎤'}
      </button>
      
      {isListening && (
        <span style={{ color: '#007bff', fontSize: '14px' }}>
          Listening... Speak now
        </span>
      )}
      
      {isProcessing && (
        <span style={{ color: '#ffc107', fontSize: '14px' }}>
          Processing voice command...
        </span>
      )}
      
      {transcript && !isListening && !isProcessing && (
        <span style={{ color: '#28a745', fontSize: '14px' }}>
          Heard: &ldquo;{transcript}&rdquo;
        </span>
      )}
    </div>
  );
};

export default VoiceInput; 