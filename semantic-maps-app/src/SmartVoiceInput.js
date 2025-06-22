import React, { useState, useEffect, useRef } from 'react';

const SmartVoiceInput = ({ onVoiceResult, isLoading }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [parsedData, setParsedData] = useState({ origin: '', destination: '', semanticQuery: '' });
  const [resolutionInfo, setResolutionInfo] = useState(null);
  const recognitionRef = useRef(null);
  const [isParsing, setIsParsing] = useState(false);

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
      };
      
      // Handle errors
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
      
      // Handle end of recognition
      recognitionRef.current.onend = () => {
        setIsListening(false);
        // The useEffect hook will now handle parsing when `isListening` becomes false.
      };
    }
  }, []);

  // This function now calls the backend for parsing
  const parseWithLLM = async (command) => {
    if (!command || isParsing) return;

    console.log('Sending to backend for parsing:', command);
    setIsParsing(true);

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

      const parsed = await response.json();
      console.log('Received parsed data from backend:', parsed);

      // Update parent component with parsed data
      onVoiceResult(parsed);
      setParsedData(parsed);
      
      // Handle resolution information
      if (parsed.resolved) {
        const methods = parsed.resolution_methods || [parsed.resolution_method];
        const resolutionMessages = [];
        
        if (methods.includes('origin_resolution')) {
          resolutionMessages.push(`Resolved origin from "${parsed.original_origin}" to "${parsed.origin}"`);
        }
        if (methods.includes('destination_resolution')) {
          resolutionMessages.push(`Resolved destination from "${parsed.original_destination}" to "${parsed.destination}"`);
        }
        if (methods.includes('nearby_search')) {
          resolutionMessages.push('Found nearby similar location');
        }
        if (methods.includes('broad_search')) {
          resolutionMessages.push(`Used broad search: "${parsed.search_used}"`);
        }
        
        setResolutionInfo({
          methods: methods,
          messages: resolutionMessages,
          searchUsed: parsed.search_used,
          originalOrigin: parsed.original_origin,
          originalDestination: parsed.original_destination
        });
      } else {
        setResolutionInfo(null);
      }

    } catch (error) {
      console.error('Failed to parse voice command with backend:', error);
      // Fallback: treat the whole command as a semantic query on error
      const fallbackData = { origin: '', destination: '', query: command };
      onVoiceResult(fallbackData);
      setParsedData({ origin: '', destination: '', semanticQuery: command });
    } finally {
      setIsParsing(false);
    }
  };

  useEffect(() => {
    if (transcript && !isListening) {
      parseWithLLM(transcript);
    }
  }, [transcript, isListening]); // Removed other dependencies to prevent re-running

  const startListening = () => {
    if (recognitionRef.current && !isLoading) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        setTranscript('');
        setParsedData({ origin: '', destination: '', semanticQuery: '' });
      } catch (error) {
        console.error('Error starting speech recognition:', error);
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      // The useEffect above will handle the parsing when isListening becomes false
    }
  };

  const clearTranscript = () => {
    setTranscript('');
    setParsedData({ origin: '', destination: '', semanticQuery: '' });
    setResolutionInfo(null);
    onVoiceResult({ origin: '', destination: '', query: '' });
  };

  if (!isSupported) {
    return (
      <div className="voice-not-supported">
        <p>Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.</p>
      </div>
    );
  }

  return (
    <div className="smart-voice-container">
      <div className="voice-input-area">
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          onBlur={() => parseWithLLM(transcript)} // Parse when user finishes typing
          placeholder={isListening ? "Listening... Speak your complete route request!" : "e.g., 'I want to go from costa verde boulevard in san diego to price center in UC San Diego and I want pizza on the way'"}
          className="voice-textarea"
          disabled={isLoading || isParsing}
          rows={4}
        />
        <div className="voice-controls">
          <button
            type="button"
            onClick={isListening ? stopListening : startListening}
            disabled={isLoading}
            className={`voice-button ${isListening ? 'listening' : ''}`}
            title={isListening ? 'Stop listening' : 'Start voice input'}
          >
            <span className="voice-icon">
              {isListening ? '🔴' : '🎤'}
            </span>
            {isParsing ? 'Parsing...' : isListening ? 'Stop' : 'Voice'}
          </button>
          {transcript && (
            <button
              type="button"
              onClick={clearTranscript}
              className="clear-button"
              title="Clear all"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const testCommand = "go from 8875 Costa Verde Boulevard to the price Center in San Diego with pizza on the way";
              setTranscript(testCommand);
              parseWithLLM(testCommand);
            }}
            className="test-button"
            title="Test parsing with sample command"
          >
            {isParsing ? '...' : 'Test'}
          </button>
        </div>
      </div>
      
      {parsedData.origin && (
        <div className="parsed-data">
          <div className="parsed-item">
            <strong>Origin:</strong> {parsedData.origin}
          </div>
        </div>
      )}
      
      {parsedData.destination && (
        <div className="parsed-data">
          <div className="parsed-item">
            <strong>Destination:</strong> {parsedData.destination}
          </div>
        </div>
      )}
      
      {parsedData.semanticQuery && (
        <div className="parsed-data">
          <div className="parsed-item">
            <strong>Search:</strong> {parsedData.semanticQuery}
          </div>
        </div>
      )}
      
      {resolutionInfo && (
        <div className="resolution-info">
          <div className="resolution-badge">
            <span className="resolution-icon">��</span>
            <span>Resolved Vague Locations</span>
          </div>
          <div className="resolution-messages">
            {resolutionInfo.messages.map((message, index) => (
              <div key={index} className="resolution-message">
                {message}
              </div>
            ))}
          </div>
          {resolutionInfo.searchUsed && (
            <div className="resolution-details">
              <small>Search used: "{resolutionInfo.searchUsed}"</small>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SmartVoiceInput; 