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
              onChange(place.formatted_address);
            } else if (place.name) {
              console.log('Calling onChange with name:', place.name);
              onChange(place.name);
            }
          });
        } catch (error) {
          console.error('Error initializing autocomplete:', error);
        }
      }
    };

    initializeAutocomplete();
  }, [onChange, id]);

  // Handle manual typing
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    console.log('Manual input change:', newValue);
    onChange(newValue);
  };

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      value={value}
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