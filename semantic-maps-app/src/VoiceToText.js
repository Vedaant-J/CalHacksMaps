import React, { useState, useEffect, useRef } from 'react';

const VoiceToText = ({ value, onTranscript, placeholder, className, disabled }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef(null);

  // Update internal transcript when value prop changes
  useEffect(() => {
    if (value !== undefined) {
      setTranscript(value);
    }
  }, [value]);

  useEffect(() => {
    // Check if browser supports speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      setIsSupported(true);
      recognitionRef.current = new SpeechRecognition();
      
      // Configure recognition settings
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';
      
      // Handle results
      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        
        const fullTranscript = finalTranscript + interimTranscript;
        setTranscript(fullTranscript);
        
        // Only call onTranscript with final results
        if (finalTranscript) {
          onTranscript(finalTranscript);
        }
      };
      
      // Handle errors
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
      
      // Handle end of recognition
      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, [onTranscript]);

  const startListening = () => {
    if (recognitionRef.current && !disabled) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        setTranscript('');
      } catch (error) {
        console.error('Error starting speech recognition:', error);
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const clearTranscript = () => {
    setTranscript('');
    onTranscript('');
  };

  if (!isSupported) {
    return (
      <div className={`voice-not-supported ${className}`}>
        <p>Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.</p>
      </div>
    );
  }

  return (
    <div className={`voice-to-text-container ${className}`}>
      <div className="voice-input-area">
        <textarea
          value={transcript}
          onChange={(e) => {
            setTranscript(e.target.value);
            onTranscript(e.target.value);
          }}
          placeholder={isListening ? "Listening... Speak now!" : placeholder}
          className="voice-textarea"
          disabled={disabled}
          rows={3}
        />
        <div className="voice-controls">
          <button
            type="button"
            onClick={isListening ? stopListening : startListening}
            disabled={disabled}
            className={`voice-button ${isListening ? 'listening' : ''}`}
            title={isListening ? 'Stop listening' : 'Start voice input'}
          >
            <span className="voice-icon">
              {isListening ? '🔴' : '🎤'}
            </span>
            {isListening ? 'Stop' : 'Voice'}
          </button>
          {transcript && (
            <button
              type="button"
              onClick={clearTranscript}
              className="clear-button"
              title="Clear text"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {isListening && (
        <div className="listening-indicator">
          <div className="pulse-dot"></div>
          <span>Listening... Speak your query</span>
        </div>
      )}
    </div>
  );
};

export default VoiceToText; 