import React, { useState, useCallback } from 'react';
import { APIProvider, Map, Marker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import PlaceAutocomplete from './PlaceAutocomplete';
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
  const [mapCenter, setMapCenter] = useState({ lat: 37.7749, lng: -122.4194 }); // San Francisco default
  const [suggestedPlaces, setSuggestedPlaces] = useState([]);
  const [recommendedPlaces, setRecommendedPlaces] = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentRoute, setCurrentRoute] = useState(null);
  const [routeStartEnd, setRouteStartEnd] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [shouldPlanRoute, setShouldPlanRoute] = useState(false);
  const [showTraffic, setShowTraffic] = useState(true);

  // Debug state changes
  const handleOriginChange = (value) => {
    console.log('Origin changed to:', value);
    setOrigin(value);
  };

  const handleDestinationChange = (value) => {
    console.log('Destination changed to:', value);
    setDestination(value);
  };

  return (
    <div className="App">
      <APIProvider 
        apiKey={GOOGLE_MAPS_API_KEY}
        libraries={['places']}
      >
        <div className="app-container">
          {/* Control Panel */}
          <div className="control-panel">
            <h1>Semantic Maps Assistant</h1>
            
            <RouteInputs
              origin={origin}
              destination={destination}
              semanticQuery={semanticQuery}
              onOriginChange={handleOriginChange}
              onDestinationChange={handleDestinationChange}
              onSemanticQueryChange={setSemanticQuery}
              onSearch={() => handleSemanticSearch(currentRoute, semanticQuery)}
              isLoading={isLoading}
              hasRoute={!!currentRoute}
              waypoints={waypoints}
              onRemoveWaypoint={handleRemoveWaypoint}
              onPlanRoute={handlePlanRoute}
              showTraffic={showTraffic}
              onToggleTraffic={() => setShowTraffic(!showTraffic)}
            />
            
            {error && <div className="error-message">{error}</div>}
          </div>

          {/* Map */}
                    <div className="map-container">
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
                center={mapCenter}
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
                showTraffic={showTraffic}
                routeStartEnd={routeStartEnd}
              />
            </Map>
          </div>
          
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
        </div>
      </APIProvider>
    </div>
  );

  async function handleSemanticSearch(routeData, query) {
    if (!routeData || !query.trim()) {
      setError('Please enter both route and search query');
      return;
    }

    setIsLoading(true);
    setError('');
    
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
      console.log('Response type:', typeof data);
      console.log('Is array:', Array.isArray(data));
      
      // Handle both old and new response formats
      if (Array.isArray(data)) {
        // Old format - just an array of places
        console.log('Using old format - array of places');
        setSuggestedPlaces(data);
        
        // Simple client-side recommendation: pick top 3 by rating
        const sortedByRating = [...data].sort((a, b) => (b.rating || 0) - (a.rating || 0));
        const topRecommendations = sortedByRating.slice(0, 3).map((place, index) => ({
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
    } finally {
      setIsLoading(false);
    }
  }

  function handleAddToRoute(place) {
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
    
    setWaypoints(prev => [...prev, newWaypoint]);
    
    // Clear suggested places and selected place
    setSuggestedPlaces([]);
    setRecommendedPlaces([]);
    setSelectedPlace(null);
    
    alert(`Added ${place.name} to your route!`);
  }

  function handleRemoveWaypoint(index) {
    setWaypoints(prev => prev.filter((_, i) => i !== index));
    // Trigger route recalculation with updated waypoints
    if (currentRoute) {
      setShouldPlanRoute(true);
    }
  }

  function handlePlanRoute() {
    console.log('Plan Route button clicked!');
    console.log('Origin:', origin);
    console.log('Destination:', destination);
    
    if (!origin || !destination) {
      alert('Please enter both origin and destination');
      return;
    }
    
    if (origin.length < 3 || destination.length < 3) {
      alert('Please enter at least 3 characters for both origin and destination');
      return;
    }
    
    console.log('Setting shouldPlanRoute to true');
    setShouldPlanRoute(true);
  }
}

function RouteInputs({ origin, destination, semanticQuery, onOriginChange, onDestinationChange, onSemanticQueryChange, onSearch, isLoading, hasRoute, waypoints, onRemoveWaypoint, onPlanRoute, showTraffic, onToggleTraffic }) {
  const handleSemanticSearch = useCallback(() => {
    if (!hasRoute) {
      alert('Please plan a route first');
      return;
    }
    onSearch();
  }, [hasRoute, onSearch]);

  return (
    <div className="route-inputs">
      <div className="input-group">
        <label>Origin:</label>
        <PlaceAutocomplete
          value={origin}
          onChange={onOriginChange}
          placeholder="Enter starting location"
          id="origin-input"
        />
      </div>
      
      <div className="input-group">
        <label>Destination:</label>
        <PlaceAutocomplete
          value={destination}
          onChange={onDestinationChange}
          placeholder="Enter destination"
          id="destination-input"
        />
      </div>
      
      <button 
        onClick={() => onPlanRoute()}
        className="plan-route-btn"
      >
        Plan Route
      </button>
      
      <div className="route-status">
        {hasRoute ? '✓ Route planned' : 'Click "Plan Route" after entering addresses'}
      </div>
      
      <div className="traffic-controls">
        <label className="traffic-toggle">
          <input
            type="checkbox"
            checked={showTraffic}
            onChange={onToggleTraffic}
          />
          <span className="traffic-label">Show Traffic</span>
        </label>
      </div>
      
      <div className="input-group">
        <label>What are you looking for?</label>
        <input
          type="text"
          value={semanticQuery}
          onChange={(e) => onSemanticQueryChange(e.target.value)}
          placeholder="e.g., good coffee shops, vegan restaurants with outdoor seating"
        />
      </div>
      
      <button 
        onClick={handleSemanticSearch} 
        disabled={isLoading}
        className="search-btn"
      >
        {isLoading ? 'Searching...' : 'Find Places'}
      </button>

      {/* Waypoints List */}
      {waypoints.length > 0 && (
        <div className="waypoints-section">
          <h3>Stops on Route</h3>
          <div className="waypoints-list">
            {waypoints.map((waypoint, index) => (
              <div key={`${waypoint.place_id}-${index}`} className="waypoint-item">
                <span className="waypoint-name">{waypoint.name}</span>
                <button 
                  onClick={() => onRemoveWaypoint(index)}
                  className="remove-waypoint-btn"
                  title="Remove from route"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MapWithDirections({ origin, destination, center, suggestedPlaces, recommendedPlaces, selectedPlace, onPlaceSelect, onAddToRoute, onRouteCalculated, onRouteStartEndCalculated, waypoints, shouldPlanRoute, onRoutePlanned, showTraffic, routeStartEnd }) {
  const map = useMap();

  // Hold reference to active DirectionsRenderer and TrafficLayer so we can manage them properly
  const directionsRendererRef = React.useRef(null);
  const trafficLayerRef = React.useRef(null);

  // Initialize traffic layer once when map is ready
  React.useEffect(() => {
    if (!map) {
      return;
    }

    if (!trafficLayerRef.current) {
      console.log('Initializing traffic layer');
      trafficLayerRef.current = new window.google.maps.TrafficLayer();
    }

    // Toggle traffic layer based on showTraffic prop
    if (showTraffic) {
      console.log('Showing traffic layer');
      trafficLayerRef.current.setMap(map);
    } else {
      console.log('Hiding traffic layer');
      trafficLayerRef.current.setMap(null);
    }
  }, [map, showTraffic]);

  // Handle route planning
  React.useEffect(() => {
    if (!map || !shouldPlanRoute || !origin || !destination) {
      return;
    }

    // Validate inputs - require at least 3 characters for meaningful geocoding
    if (origin.trim().length < 3 || destination.trim().length < 3) {
      console.log('Origin or destination too short for geocoding');
      onRouteCalculated(null);
      onRoutePlanned();
      return;
    }

    // Clean up previous renderer if it exists
    if (directionsRendererRef.current) {
      console.log('Cleaning up previous route');
      directionsRendererRef.current.setMap(null);
      directionsRendererRef.current = null;
    }

    const directionsService = new window.google.maps.DirectionsService();
    const newRenderer = new window.google.maps.DirectionsRenderer({
      // Configure for better visual appearance
      suppressMarkers: true, // We'll show custom start/end markers
      suppressInfoWindows: false,
      draggable: false,
      polylineOptions: {
        strokeColor: '#4285F4', // Google blue
        strokeWeight: 6,
        strokeOpacity: 0.8
      }
    });
    
    console.log(`Requesting directions from "${origin}" to "${destination}"`);

    directionsService
      .route({
        origin: origin.trim(),
        destination: destination.trim(),
        waypoints: waypoints || [],
        optimizeWaypoints: true,
        travelMode: window.google.maps.TravelMode.DRIVING,
        avoidHighways: false,
        avoidTolls: false
      })
      .then((result) => {
        console.log('Directions request successful');
        
        // Set the map and directions
        newRenderer.setMap(map);
        newRenderer.setDirections(result);
        directionsRendererRef.current = newRenderer;
        
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
        if (newRenderer) {
          newRenderer.setMap(null);
        }
        onRouteCalculated(null);
        onRoutePlanned();
      });

    // Only cleanup on unmount, not on every dependency change
    return () => {
      console.log('Component unmounting, cleaning up route');
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }
    };
  }, [map, origin, destination, waypoints, shouldPlanRoute]);

  // Cleanup on component unmount
  React.useEffect(() => {
    return () => {
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }
      if (trafficLayerRef.current) {
        trafficLayerRef.current.setMap(null);
      }
    };
  }, []);

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
              scaledSize: new window.google.maps.Size(40, 40),
              anchor: new window.google.maps.Point(20, 20)
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
              scaledSize: new window.google.maps.Size(40, 40),
              anchor: new window.google.maps.Point(20, 20)
            }}
          />
        </>
      )}

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
            scaledSize: new window.google.maps.Size(32, 32),
            anchor: new window.google.maps.Point(16, 16)
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
              </svg>
            `),
            scaledSize: new window.google.maps.Size(24, 24),
            anchor: new window.google.maps.Point(12, 12)
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
    if (!level) return 'Price not available';
    return '$'.repeat(level);
  };

  return (
    <div className="recommendation-card" onClick={onClick}>
      <div className="recommendation-rank">#{rank}</div>
      
      {place.photo_url && (
        <div className="recommendation-photo">
          <img src={place.photo_url} alt={place.name} />
        </div>
      )}
      
      <div className="recommendation-content">
        <h4 className="recommendation-name">{place.name}</h4>
        
        <div className="recommendation-reason">
          💡 <em>{place.recommendation_reason}</em>
        </div>
        
        <div className="recommendation-details">
          {place.rating && (
            <div className="rating">
              <span className="stars">{'⭐'.repeat(Math.floor(place.rating))}</span>
              <span className="rating-text">{place.rating}</span>
              {place.user_ratings_total && (
                <span className="rating-count">({place.user_ratings_total})</span>
              )}
            </div>
          )}
          
          {place.price_level && (
            <div className="price">{formatPriceLevel(place.price_level)}</div>
          )}
        </div>
        
        <div className="recommendation-address">
          📍 {place.formatted_address}
        </div>
        
        <div className="recommendation-actions">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onAddToRoute(place);
            }}
            className="add-to-route-btn small"
          >
            Add to Route
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="view-details-btn"
          >
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}

function RichInfoWindow({ place, onAddToRoute }) {
  const formatPriceLevel = (level) => {
    if (!level) return 'Price not available';
    return '$'.repeat(level);
  };

  const formatOpeningHours = (hours) => {
    if (!hours || !Array.isArray(hours)) return null;
    
    // Show today's hours and tomorrow's hours
    const today = new Date().getDay();
    const todayHours = hours[today === 0 ? 6 : today - 1]; // Adjust for Monday = 0
    
    return todayHours;
  };

  return (
    <div className="rich-info-window">
      {place.photo_url && (
        <div className="place-photo">
          <img src={place.photo_url} alt={place.name} />
        </div>
      )}
      
      <div className="place-info">
        <h3>{place.name}</h3>
        
        {place.recommendation_reason && (
          <div className="ai-recommendation-badge">
            <span className="ai-icon">🤖</span>
            <strong>AI Recommendation:</strong> {place.recommendation_reason}
          </div>
        )}
        
        <div className="place-details">
          {place.rating && (
            <div className="rating">
              <span className="stars">{'⭐'.repeat(Math.floor(place.rating))}</span>
              <span className="rating-text">{place.rating}</span>
              {place.user_ratings_total && (
                <span className="rating-count">({place.user_ratings_total} reviews)</span>
              )}
            </div>
          )}
          
          {place.price_level && (
            <div className="price-level">
              <strong>Price: </strong>{formatPriceLevel(place.price_level)}
            </div>
          )}
          
          {place.formatted_address && (
            <div className="address">
              <strong>Address: </strong>{place.formatted_address}
            </div>
          )}
          
          {place.phone && (
            <div className="phone">
              <strong>Phone: </strong>
              <a href={`tel:${place.phone}`}>{place.phone}</a>
            </div>
          )}
          
          {place.opening_hours && (
            <div className="hours">
              <strong>Hours: </strong>{formatOpeningHours(place.opening_hours)}
            </div>
          )}
          
          {place.website && (
            <div className="website">
              <a href={place.website} target="_blank" rel="noopener noreferrer">
                Visit Website
              </a>
            </div>
          )}
        </div>
        
        <div className="action-buttons">
          <button 
            onClick={() => onAddToRoute(place)}
            className="add-to-route-btn"
          >
            Add to Route
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
