import React, { useEffect, useRef, useState } from 'react';

const PlaceAutocomplete = ({ 
  value, 
  onChange, 
  placeholder, 
  className,
  id 
}) => {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Ensure onChange is always a function
  const safeOnChange = onChange || (() => {
    console.warn('PlaceAutocomplete: onChange prop is not provided');
  });

  // Debug value changes
  useEffect(() => {
    console.log(`PlaceAutocomplete ${id}: value prop changed to:`, value);
    console.log(`PlaceAutocomplete ${id}: onChange prop is:`, typeof onChange);
  }, [value, id, onChange]);

  useEffect(() => {
    const initializeAutocomplete = () => {
      if (!window.google || !window.google.maps || !window.google.maps.places) {
        setTimeout(initializeAutocomplete, 100);
        return;
      }

      setIsLoaded(true);

      if (inputRef.current && !autocompleteRef.current) {
        try {
          console.log('Initializing autocomplete for:', id);
          
          autocompleteRef.current = new window.google.maps.places.Autocomplete(
            inputRef.current,
            {
              types: ['geocode'],
              fields: ['place_id', 'formatted_address', 'geometry', 'name']
            }
          );

          autocompleteRef.current.addListener('place_changed', () => {
            const place = autocompleteRef.current.getPlace();
            console.log('Place selected:', place);
            
            if (place.formatted_address) {
              console.log('Calling onChange with:', place.formatted_address);
              safeOnChange(place.formatted_address);
            } else if (place.name) {
              console.log('Calling onChange with name:', place.name);
              safeOnChange(place.name);
            }
          });
        } catch (error) {
          console.error('Error initializing autocomplete:', error);
        }
      }
    };

    initializeAutocomplete();
  }, [safeOnChange, id]);

  // Handle manual typing
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    console.log('Manual input change:', newValue);
    safeOnChange(newValue);
  };

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      value={value || ''}
      onChange={handleInputChange}
      placeholder={isLoaded ? placeholder : `${placeholder} (Loading...)`}
      className={className}
      autoComplete="off"
      style={{
        width: '100%',
        padding: '12px',
        border: '2px solid #e0e0e0',
        borderRadius: '8px',
        fontSize: '14px'
      }}
    />
  );
};

export default PlaceAutocomplete; 