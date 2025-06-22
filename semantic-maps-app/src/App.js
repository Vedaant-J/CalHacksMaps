/* eslint-disable no-undef */
import React, { useState } from 'react';
import { APIProvider, Map, Marker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import PlaceAutocomplete from './PlaceAutocomplete';
import VoiceInput from './VoiceInput';
import './App.css';

// Get API key from environment variable
const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || 'YOUR_FRONTEND_API_KEY_HERE';

// Debug: Log the API key being used (first 10 chars for security)
console.log('Google Maps API Key (first 10 chars):', GOOGLE_MAPS_API_KEY ? GOOGLE_MAPS_API_KEY.substring(0, 10) + '...' : 'NOT FOUND');
console.log('Environment variable REACT_APP_GOOGLE_MAPS_API_KEY:', process.env.REACT_APP_GOOGLE_MAPS_API_KEY ? 'FOUND' : 'NOT FOUND');

function App() {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [semanticQuery, setSemanticQuery] = useState('');
  const [mapCenter] = useState({ lat: 37.7749, lng: -122.4194 }); // San Francisco default
  const [suggestedPlaces, setSuggestedPlaces] = useState([]);
  const [recommendedPlaces, setRecommendedPlaces] = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [currentRoute, setCurrentRoute] = useState(null);
  const [routeStartEnd, setRouteStartEnd] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [shouldPlanRoute, setShouldPlanRoute] = useState(false);
  const [isPromptSubmitted, setIsPromptSubmitted] = useState(false);
  const [pendingSemanticQuery, setPendingSemanticQuery] = useState('');

  // Handle delayed semantic search when route becomes available
  React.useEffect(() => {
    if (currentRoute && pendingSemanticQuery && isGenerating) {
      console.log('Route now available, executing pending semantic search...');
      handleSemanticSearch(currentRoute, pendingSemanticQuery).then(() => {
        setPendingSemanticQuery('');
        setIsGenerating(false);
      }).catch((error) => {
        console.error('Error in delayed semantic search:', error);
        setError('Failed to search for places. Please try again.');
        setPendingSemanticQuery('');
        setIsGenerating(false);
      });
    }
  }, [currentRoute, pendingSemanticQuery, isGenerating]);

  const handleSubmit = async () => {
    if (!origin.trim() || !destination.trim()) {
      setError('Please enter both origin and destination');
      return;
    }

    setIsPromptSubmitted(true);
    setIsLoading(true);
    setError('');
    
    try {
      // First, plan the route
      setShouldPlanRoute(true);
      
      // If we have constraints, start the search process
      if (semanticQuery.trim()) {
        setIsGenerating(true);
        
        // Wait for route with timeout, but don't fail if it takes too long
        let routeAvailable = false;
        let attempts = 0;
        const maxAttempts = 30; // 3 seconds
        
        while (!routeAvailable && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          routeAvailable = currentRoute !== null;
          attempts++;
        }
        
                 if (routeAvailable) {
           console.log('Route ready, starting semantic search...');
           await handleSemanticSearch(currentRoute, semanticQuery);
           setIsGenerating(false);
         } else {
           console.log('Route still calculating, will search when ready...');
           // Set a flag to search when route becomes available - don't clear isGenerating yet
           setPendingSemanticQuery(semanticQuery);
         }
      }
      
    } catch (err) {
      console.error('Error in handleSubmit:', err);
      setError('Failed to process request. Please try again.');
      setIsGenerating(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSemanticSearch = async (routeData, query) => {
    if (!routeData || !query.trim()) {
      return;
    }

    try {
      const response = await fetch('http://localhost:8000/api/find-places-on-route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          route: routeData
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      console.log('Server response:', data);
      
      // Handle both old and new response formats
      if (Array.isArray(data)) {
        // Old format - just an array of places
        console.log('Using old format - array of places');
        setSuggestedPlaces(data);
        
        // Simple client-side recommendation: pick top 3 by rating
        const sortedByRating = [...data].sort((a, b) => (b.rating || 0) - (a.rating || 0));
        const topRecommendations = sortedByRating.slice(0, 3).map((place) => ({
          ...place,
          recommendation_reason: `High-rated choice with ${place.rating || 'N/A'} stars and ${place.user_ratings_total || 'many'} reviews`
        }));
        
        console.log('Client-side recommendations:', topRecommendations);
        setRecommendedPlaces(topRecommendations);
      } else {
        // New format - structured response
        console.log('Using new format - structured response');
        setSuggestedPlaces(data.all_places || []);
        setRecommendedPlaces(data.recommended_places || []);
      }
    } catch (err) {
      setError(`Failed to search places: ${err.message}`);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleAddToRoute = (place) => {
    // Add the place as a waypoint
    const newWaypoint = {
      location: {
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng
      },
      stopover: true,
      name: place.name,
      place_id: place.place_id
    };
    
    console.log('Adding waypoint:', newWaypoint);
    setWaypoints(prev => {
      const newWaypoints = [...prev, newWaypoint];
      console.log('Updated waypoints:', newWaypoints);
      return newWaypoints;
    });
    
    // Clear suggested places and selected place
    setSuggestedPlaces([]);
    setRecommendedPlaces([]);
    setSelectedPlace(null);
    
    // Re-plan route with new waypoint
    console.log('Setting shouldPlanRoute to true for new waypoint');
    setShouldPlanRoute(true);
    
    alert(`Added ${place.name} to your route!`);
  };

  const handleRemoveWaypoint = (index) => {
    console.log('Removing waypoint at index:', index);
    setWaypoints(prev => {
      const newWaypoints = prev.filter((_, i) => i !== index);
      console.log('Updated waypoints after removal:', newWaypoints);
      return newWaypoints;
    });
    // Re-plan route without the removed waypoint
    console.log('Setting shouldPlanRoute to true for waypoint removal');
    setShouldPlanRoute(true);
  };

  const handleVoiceParsed = (parsedData) => {
    console.log('Voice parsed data:', parsedData);
    
    // Update the state with parsed data
    if (parsedData.origin) {
      setOrigin(parsedData.origin);
    }
    if (parsedData.destination) {
      setDestination(parsedData.destination);
    }
    
    // Accept multiple possible keys for semantic query to make it robust
    const semantic =
      parsedData.semanticQuery ||
      parsedData.semanticquery ||
      parsedData.semantic_query ||
      '';

    if (semantic) {
      setSemanticQuery(semantic);
    }
  };

  const handleLogoClick = () => {
    setIsPromptSubmitted(false);
    setSuggestedPlaces([]);
    setRecommendedPlaces([]);
    setSelectedPlace(null);
    setError('');
    setIsGenerating(false);
  };

  const handleExitPrompt = (e) => {
    // Prevent event bubbling if called from button click
    if (e) {
      e.stopPropagation();
    }
    setIsPromptSubmitted(false);
    setSuggestedPlaces([]);
    setRecommendedPlaces([]);
    setSelectedPlace(null);
    setError('');
    setIsGenerating(false);
  };

  const handleClickOutside = (e) => {
    // Only handle clicks outside the prompt container
    if (e.target.classList.contains('click-outside-overlay')) {
      handleExitPrompt();
    }
  };

  return (
    <div className="App">
      <APIProvider 
        apiKey={GOOGLE_MAPS_API_KEY}
        libraries={['places']}
      >
        <div className="app-container">
          {/* Full-screen Map Background */}
          <div className={`map-container ${isPromptSubmitted ? 'map-active' : 'map-blurred'}`}>
            <Map
              defaultCenter={mapCenter}
              defaultZoom={10}
              style={{ width: '100%', height: '100%' }}
              gestureHandling="greedy"
              disableDefaultUI={false}
            >
              <MapWithDirections
                origin={origin}
                destination={destination}
                suggestedPlaces={suggestedPlaces}
                recommendedPlaces={recommendedPlaces}
                selectedPlace={selectedPlace}
                onPlaceSelect={setSelectedPlace}
                onAddToRoute={handleAddToRoute}
                onRouteCalculated={setCurrentRoute}
                onRouteStartEndCalculated={setRouteStartEnd}
                waypoints={waypoints}
                shouldPlanRoute={shouldPlanRoute}
                onRoutePlanned={() => setShouldPlanRoute(false)}
                routeStartEnd={routeStartEnd}
              />
            </Map>
          </div>

          {/* Click outside overlay */}
          {!isPromptSubmitted && (
            <div className="click-outside-overlay" onClick={handleClickOutside}></div>
          )}

          {/* Route Inputs and Prompt Box */}
          <div className={`prompt-container ${isPromptSubmitted ? 'prompt-collapsed' : 'prompt-centered'}`}>
            <div className="unified-prompt-window" onClick={(e) => e.stopPropagation()}>
              <button 
                onClick={handleExitPrompt}
                className="exit-button"
                title="Close"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              
              <div className="route-inputs">
                <div className="input-group">
                  <label>From:</label>
                  <PlaceAutocomplete
                    value={origin}
                    onChange={setOrigin}
                    placeholder="Enter starting location"
                    id="origin-input"
                  />
                </div>
                
                <div className="input-group">
                  <label>To:</label>
                  <PlaceAutocomplete
                    value={destination}
                    onChange={setDestination}
                    placeholder="Enter destination"
                    id="destination-input"
                  />
                </div>
              </div>
              
              <div className="prompt-box">
                <div className="semantic-input-container">
                  <textarea
                    value={semanticQuery}
                    onChange={(e) => setSemanticQuery(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="What else are you looking for along the way? (optional - e.g., 'coffee shops', 'gas stations', 'restaurants with outdoor seating')"
                    className="prompt-input"
                    rows={3}
                  />
                  <VoiceInput onVoiceParsed={handleVoiceParsed} />
                </div>
                <button 
                  onClick={handleSubmit}
                  disabled={isLoading || !origin.trim() || !destination.trim()}
                  className="submit-button"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Collapsed Logo */}
          {isPromptSubmitted && (
            <div className="collapsed-logo" onClick={handleLogoClick}>
              <div className="logo-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/>
                </svg>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {/* Generating Animation */}
          {isGenerating && (
            <div className="generating-overlay">
              <div className="generating-content">
                <div className="generating-spinner"></div>
                <p>Generating AI recommendations...</p>
              </div>
            </div>
          )}

          {/* Recommendations Panel */}
          {recommendedPlaces.length > 0 && (
            <div className="recommendations-panel">
              <h3>🌟 AI Recommendations</h3>
              <div className="recommendations-list">
                {recommendedPlaces.map((place, index) => (
                  <RecommendationCard
                    key={place.place_id}
                    place={place}
                    rank={index + 1}
                    onClick={() => setSelectedPlace(place)}
                    onAddToRoute={() => handleAddToRoute(place)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Route Info Panel */}
          {currentRoute && (
            <div className="route-info-panel">
              <h4>🗺️ Current Route</h4>
              <div className="route-details">
                <p><strong>From:</strong> {origin}</p>
                <p><strong>To:</strong> {destination}</p>
                {waypoints.length > 0 && (
                  <div className="waypoints-list">
                    <p><strong>Stops:</strong></p>
                    {waypoints.map((waypoint, index) => (
                      <div key={index} className="waypoint-item">
                        <span>{waypoint.name}</span>
                        <button 
                          onClick={() => handleRemoveWaypoint(index)}
                          className="remove-waypoint-btn"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </APIProvider>
    </div>
  );
}

function MapWithDirections({ origin, destination, suggestedPlaces, recommendedPlaces, selectedPlace, onPlaceSelect, onAddToRoute, onRouteCalculated, onRouteStartEndCalculated, waypoints, shouldPlanRoute, onRoutePlanned, routeStartEnd }) {
  const map = useMap();
  const [directionsService, setDirectionsService] = useState(null);
  const [directionsRenderer, setDirectionsRenderer] = useState(null);

  // Initialize directions service and renderer
  React.useEffect(() => {
    if (!map || !window.google) return;

    const service = new window.google.maps.DirectionsService();
    const renderer = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: '#1976d2',
        strokeWeight: 4,
        strokeOpacity: 0.8
      }
    });

    renderer.setMap(map);
    setDirectionsService(service);
    setDirectionsRenderer(renderer);

    return () => {
      renderer.setMap(null);
    };
  }, [map]);

  // Handle route planning
  React.useEffect(() => {
    if (!directionsService || !directionsRenderer || !shouldPlanRoute || !origin || !destination) {
      return;
    }

    // Validate inputs - require at least 3 characters for meaningful geocoding
    if (origin.trim().length < 3 || destination.trim().length < 3) {
      console.log('Origin or destination too short for geocoding');
      onRouteCalculated(null);
      onRoutePlanned();
      return;
    }

    console.log(`Requesting directions from "${origin}" to "${destination}"`);
    console.log('Waypoints:', waypoints);

    // Format waypoints for Google Maps API
    const formattedWaypoints = waypoints.map(waypoint => ({
      location: new window.google.maps.LatLng(waypoint.location.lat, waypoint.location.lng),
      stopover: waypoint.stopover
    }));

    console.log('Formatted waypoints:', formattedWaypoints);

    directionsService
      .route({
        origin: origin.trim(),
        destination: destination.trim(),
        waypoints: formattedWaypoints,
        optimizeWaypoints: true,
        travelMode: window.google.maps.TravelMode.DRIVING,
        avoidHighways: false,
        avoidTolls: false
      })
      .then((result) => {
        console.log('Directions request successful');
        console.log('Route result:', result);
        
        // Set the directions
        directionsRenderer.setDirections(result);
        
        // Extract start and end locations for custom markers
        const route = result.routes[0];
        if (route && route.legs && route.legs.length > 0) {
          const startLocation = route.legs[0].start_location;
          const endLocation = route.legs[route.legs.length - 1].end_location;
          
          onRouteStartEndCalculated({
            start: { lat: startLocation.lat(), lng: startLocation.lng() },
            end: { lat: endLocation.lat(), lng: endLocation.lng() }
          });
        }
        
        // Fit bounds to show the entire route
        if (route && route.bounds) {
          map.fitBounds(route.bounds);
        }
        
        onRouteCalculated(result);
        onRoutePlanned();
        
        console.log('Route displayed and persisted');
      })
      .catch((err) => {
        console.error('Directions request failed:', err);
        console.log('Make sure both origin and destination are complete, valid addresses');
        onRouteCalculated(null);
        onRoutePlanned();
      });
  }, [map, origin, destination, waypoints, shouldPlanRoute, directionsService, directionsRenderer]);

  return (
    <>
      {/* Custom Start/End Markers */}
      {routeStartEnd && (
        <>
          <Marker
            position={routeStartEnd.start}
            title="Start Location"
            icon={{
              url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="20" cy="20" r="18" fill="#34A853" stroke="#1E7E34" stroke-width="2"/>
                  <text x="20" y="26" text-anchor="middle" fill="white" font-size="14" font-weight="bold">S</text>
                </svg>
              `),
              scaledSize: window.google ? new window.google.maps.Size(40, 40) : null,
              anchor: window.google ? new window.google.maps.Point(20, 20) : null
            }}
          />
          <Marker
            position={routeStartEnd.end}
            title="Destination"
            icon={{
              url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="20" cy="20" r="18" fill="#EA4335" stroke="#C33" stroke-width="2"/>
                  <text x="20" y="26" text-anchor="middle" fill="white" font-size="14" font-weight="bold">E</text>
                </svg>
              `),
              scaledSize: window.google ? new window.google.maps.Size(40, 40) : null,
              anchor: window.google ? new window.google.maps.Point(20, 20) : null
            }}
          />
        </>
      )}

      {/* Waypoint Markers */}
      {waypoints.map((waypoint, index) => (
        <Marker
          key={`waypoint-${index}`}
          position={waypoint.location}
          title={`Stop ${index + 1}: ${waypoint.name}`}
          icon={{
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
              <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="#FF6B35" stroke="#E55A2B" stroke-width="2"/>
                <text x="16" y="20" text-anchor="middle" fill="white" font-size="12" font-weight="bold">${index + 1}</text>
              </svg>
            `),
            scaledSize: window.google ? new window.google.maps.Size(32, 32) : null,
            anchor: window.google ? new window.google.maps.Point(16, 16) : null
          }}
        />
      ))}

      {/* Render recommended places with special markers */}
      {recommendedPlaces.map((place, index) => (
        <Marker
          key={`recommended-${place.place_id}`}
          position={{
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng,
          }}
          onClick={() => onPlaceSelect(place)}
          title={`⭐ ${place.name} (AI Recommended)`}
          icon={{
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
              <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="#FFD700" stroke="#FFA500" stroke-width="2"/>
                <text x="16" y="20" text-anchor="middle" fill="#000" font-size="12" font-weight="bold">${index + 1}</text>
              </svg>
            `),
            scaledSize: window.google ? new window.google.maps.Size(32, 32) : null,
            anchor: window.google ? new window.google.maps.Point(16, 16) : null
          }}
        />
      ))}

      {/* Render other suggested places as regular markers */}
      {suggestedPlaces.filter(place => 
        !recommendedPlaces.some(rec => rec.place_id === place.place_id)
      ).map((place) => (
        <Marker
          key={place.place_id}
          position={{
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng,
          }}
          onClick={() => onPlaceSelect(place)}
          title={place.name}
          icon={{
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
              <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="#4285F4" stroke="#1976D2" stroke-width="2"/>
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="white"/>
              </svg>
            `),
            scaledSize: window.google ? new window.google.maps.Size(24, 24) : null,
            anchor: window.google ? new window.google.maps.Point(12, 12) : null
          }}
        />
      ))}

      {/* Rich info window for selected place */}
      {selectedPlace && (
        <InfoWindow
          position={{
            lat: selectedPlace.geometry.location.lat,
            lng: selectedPlace.geometry.location.lng,
          }}
          onCloseClick={() => onPlaceSelect(null)}
        >
          <RichInfoWindow place={selectedPlace} onAddToRoute={onAddToRoute} />
        </InfoWindow>
      )}
    </>
  );
}

function RecommendationCard({ place, rank, onClick, onAddToRoute }) {
  const formatPriceLevel = (level) => {
    return level ? '$'.repeat(level) : 'N/A';
  };

  const formatDistance = (meters) => {
    if (!meters || meters === Infinity) return '';
    if (meters < 1000) {
      return `${Math.round(meters)}m from route`;
    } else {
      return `${(meters / 1000).toFixed(1)}km from route`;
    }
  };

  const getAmenities = (place) => {
    const amenities = [];
    if (place.takeout) amenities.push('📦 Takeout');
    if (place.delivery) amenities.push('🚚 Delivery'); 
    if (place.dine_in) amenities.push('🍽️ Dine-in');
    if (place.serves_coffee) amenities.push('☕ Coffee');
    if (place.serves_beer) amenities.push('🍺 Beer');
    if (place.serves_wine) amenities.push('🍷 Wine');
    if (place.outdoor_seating) amenities.push('🌞 Outdoor');
    if (place.wheelchair_accessible_entrance) amenities.push('♿ Accessible');
    if (place.good_for_children) amenities.push('👶 Kid-friendly');
    return amenities.slice(0, 3); // Show max 3 amenities
  };

  const isOpen = place.current_opening_hours?.open_now;

  return (
    <div className="recommendation-card" onClick={onClick}>
      <div className="recommendation-rank">
        <span className="rank-number">{rank}</span>
        <div className="ai-recommendation-badge">
          <span className="ai-icon">🤖</span>
          AI Pick
        </div>
      </div>
      
      <div className="recommendation-photo">
        {place.photo_url ? (
          <img 
            src={place.photo_url}
            alt={place.name}
          />
        ) : (
          <div className="no-photo">📷</div>
        )}
      </div>
      
      <div className="recommendation-content">
        <h4 className="recommendation-name">{place.name}</h4>
        <p className="recommendation-reason">{place.recommendation_reason}</p>
        
        <div className="recommendation-details">
          <div className="rating">
            <span className="stars">{'⭐'.repeat(Math.round(place.rating || 0))}</span>
            <span className="rating-text">{place.rating || 'N/A'}</span>
            <span className="rating-count">({place.user_ratings_total || 0})</span>
          </div>
          <div className="price">{formatPriceLevel(place.price_level)}</div>
          {isOpen !== undefined && (
            <div className={`status ${isOpen ? 'open' : 'closed'}`}>
              {isOpen ? '🟢 Open' : '🔴 Closed'}
            </div>
          )}
        </div>
        
        {place.route_distance_m && (
          <div className="distance-info">{formatDistance(place.route_distance_m)}</div>
        )}
        
        <div className="amenities">
          {getAmenities(place).map((amenity, index) => (
            <span key={index} className="amenity-tag">{amenity}</span>
          ))}
        </div>
        
        <div className="recommendation-address">{place.formatted_address || place.vicinity}</div>
        
        <div className="recommendation-actions">
          <button 
            className="add-to-route-btn small"
            onClick={(e) => {
              e.stopPropagation();
              onAddToRoute();
            }}
          >
            Add to Route
          </button>
        </div>
      </div>
    </div>
  );
}

function RichInfoWindow({ place, onAddToRoute }) {
  const formatPriceLevel = (level) => {
    return level ? '$'.repeat(level) : 'N/A';
  };

  const formatOpeningHours = (hours) => {
    if (!hours || !hours.open_now) return 'Hours not available';
    return hours.open_now ? 'Open now' : 'Closed';
  };

  return (
    <div className="rich-info-window">
      {place.photos && place.photos[0] && (
        <div className="place-photo">
          <img 
            src={`https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${place.photos[0].photo_reference}&key=${process.env.REACT_APP_GOOGLE_MAPS_API_KEY}`}
            alt={place.name}
          />
        </div>
      )}
      
      <div className="place-info">
        <h3>{place.name}</h3>
        
        <div className="place-details">
          <div className="rating">
            <span className="stars">{'⭐'.repeat(Math.round(place.rating || 0))}</span>
            <span className="rating-text">{place.rating || 'N/A'}</span>
            <span className="rating-count">({place.user_ratings_total || 0} reviews)</span>
          </div>
          
          <div className="price-level">{formatPriceLevel(place.price_level)}</div>
          
          <div className="address">{place.vicinity}</div>
          
          {place.formatted_phone_number && (
            <div className="phone">
              <a href={`tel:${place.formatted_phone_number}`}>{place.formatted_phone_number}</a>
            </div>
          )}
          
          <div className="hours">{formatOpeningHours(place.opening_hours)}</div>
          
          {place.website && (
            <div className="website">
              <a href={place.website} target="_blank" rel="noopener noreferrer">Visit Website</a>
            </div>
          )}
        </div>
        
        <div className="action-buttons">
          <button className="add-to-route-btn" onClick={onAddToRoute}>
            Add to Route
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
