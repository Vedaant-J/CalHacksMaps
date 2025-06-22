import React, { useState, useCallback, useEffect } from 'react';
import { APIProvider, Map, Marker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import PlaceAutocomplete from './PlaceAutocomplete';
import SmartVoiceInput from './SmartVoiceInput';
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
    console.log('App: handleOriginChange called with:', value);
    setOrigin(value);
  };

  const handleDestinationChange = (value) => {
    console.log('App: handleDestinationChange called with:', value);
    setDestination(value);
  };

  const handleSearch = () => {
    if (origin && destination) {
      setShouldPlanRoute(true); // This triggers the route calculation
    } else {
      alert('Please enter an origin and destination.');
    }
  };

  const handleRouteCalculated = (route) => {
    setCurrentRoute(route);
    if (route && semanticQuery) {
        // Now that the route is calculated, perform the semantic search
        handleSemanticSearch(route, semanticQuery);
    }
  };

  const handleVoiceData = (data) => {
    console.log("Voice data received:", data);
    if(data.origin) setOrigin(data.origin);
    if(data.destination) setDestination(data.destination);
    if(data.query) setSemanticQuery(data.query);
  };

  const handleAddToRoute = (place) => {
    setWaypoints(prevWaypoints => [...prevWaypoints, place]);
  };
  
  const handleRemoveWaypoint = (index) => {
    setWaypoints(prevWaypoints => prevWaypoints.filter((_, i) => i !== index));
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Semantic Maps</h1>
      </header>
      
      <div className="search-container">
        <div className="input-group">
          <PlaceAutocomplete onChange={handleOriginChange} placeholder="Enter origin" value={origin} />
          <PlaceAutocomplete onChange={handleDestinationChange} placeholder="Enter destination" value={destination} />
          <input
            type="text"
            className="semantic-input"
            placeholder="What are you looking for? (e.g., 'boba tea')"
            value={semanticQuery}
            onChange={(e) => setSemanticQuery(e.target.value)}
          />
        </div>
        
        <button onClick={handleSearch} disabled={isLoading || !origin || !destination} className="search-button">
          {isLoading ? 'Searching...' : 'Search'}
        </button>

        <div className="voice-input-section">
          <SmartVoiceInput onVoiceResult={handleVoiceData} isLoading={isLoading} />
        </div>
      </div>

      <APIProvider 
        apiKey={GOOGLE_MAPS_API_KEY}
        libraries={['places']}
      >
        <Map
          defaultCenter={mapCenter}
          defaultZoom={10}
          style={{ width: '100%', height: '400px' }}
          gestureHandling="greedy"
          disableDefaultUI={true}
        >
          <MapWithDirections
            origin={origin}
            destination={destination}
            suggestedPlaces={suggestedPlaces}
            recommendedPlaces={recommendedPlaces}
            selectedPlace={selectedPlace}
            onPlaceSelect={setSelectedPlace}
            onAddToRoute={handleAddToRoute}
            onRouteCalculated={handleRouteCalculated}
            onRouteStartEndCalculated={setRouteStartEnd}
            waypoints={waypoints}
            shouldPlanRoute={shouldPlanRoute}
            onRoutePlanned={() => setShouldPlanRoute(false)}
            showTraffic={showTraffic}
            routeStartEnd={routeStartEnd}
          />
        </Map>
      </APIProvider>

      {error && <div className="error-message">{error}</div>}

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
  );

  async function handleSemanticSearch(routeData, query) {
    if (!routeData || !query.trim()) {
      setError('Please have a route planned and a search query.');
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch('http://localhost:8000/api/find-places-on-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query, route: routeData })
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const data = await response.json();
      setSuggestedPlaces(data.all_places || []);
      setRecommendedPlaces(data.recommended_places || []);
    } catch (err) {
      setError(`Failed to search places: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }
}

function MapWithDirections({
  origin,
  destination,
  suggestedPlaces,
  recommendedPlaces,
  selectedPlace,
  onPlaceSelect,
  onAddToRoute,
  onRouteCalculated,
  onRouteStartEndCalculated,
  waypoints,
  shouldPlanRoute,
  onRoutePlanned,
  showTraffic,
  routeStartEnd
}) {
  const map = useMap();
  const [directionsService, setDirectionsService] = useState(null);
  const [directionsRenderer, setDirectionsRenderer] = useState(null);
  const [infoWindowData, setInfoWindowData] = useState(null);

  useEffect(() => {
    if (!map) return;
    setDirectionsService(new window.google.maps.DirectionsService());
    const renderer = new window.google.maps.DirectionsRenderer({
      map: map,
      polylineOptions: {
        strokeColor: '#007BFF',
        strokeWeight: 6,
        strokeOpacity: 0.8
      }
    });
    setDirectionsRenderer(renderer);

    return () => {
      if (renderer) {
        renderer.setMap(null);
      }
    };
  }, [map]);

  useEffect(() => {
    if (shouldPlanRoute && directionsService && directionsRenderer && origin && destination) {
      const waypointsFormatted = waypoints.map(wp => ({
        location: { placeId: wp.place_id },
        stopover: true,
      }));

      directionsService.route(
        {
          origin: { placeId: origin },
          destination: { placeId: destination },
          waypoints: waypointsFormatted,
          travelMode: window.google.maps.TravelMode.DRIVING,
          provideRouteAlternatives: true,
        },
        (response, status) => {
          if (status === window.google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(response);
            const route = response.routes[0];
            onRouteCalculated(route);

            const start = {
              lat: route.legs[0].start_location.lat(),
              lng: route.legs[0].start_location.lng(),
            };
            const end = {
              lat: route.legs[route.legs.length - 1].end_location.lat(),
              lng: route.legs[route.legs.length - 1].end_location.lng(),
            };
            onRouteStartEndCalculated({ start, end });
          } else {
            console.error(`Directions request failed due to ${status}`);
          }
        }
      );
      onRoutePlanned();
    }
  }, [shouldPlanRoute, directionsService, directionsRenderer, origin, destination, waypoints, onRouteCalculated, onRoutePlanned, onRouteStartEndCalculated]);
  
  const handleMarkerClick = (place) => {
    onPlaceSelect(place);
    setInfoWindowData({
      position: place.geometry.location,
      content: place
    });
  };

  return (
    <>
      {routeStartEnd && (
        <>
          <Marker position={routeStartEnd.start} label="A" />
          <Marker position={routeStartEnd.end} label="B" />
        </>
      )}

      {recommendedPlaces.map((place) => (
        <Marker
          key={place.place_id}
          position={place.geometry.location}
          onClick={() => handleMarkerClick(place)}
          icon={{
            url: "http://maps.google.com/mapfiles/ms/icons/yellow-dot.png",
          }}
        />
      ))}
      
      {suggestedPlaces.map((place) => (
        <Marker
          key={place.place_id}
          position={place.geometry.location}
          onClick={() => handleMarkerClick(place)}
          icon={{
            url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
          }}
        />
      ))}

      {selectedPlace && infoWindowData && (
        <InfoWindow
          position={infoWindowData.position}
          onCloseClick={() => {
            onPlaceSelect(null);
            setInfoWindowData(null);
          }}
        >
          <RichInfoWindow place={selectedPlace} onAddToRoute={onAddToRoute} />
        </InfoWindow>
      )}
    </>
  );
}

function RecommendationCard({ place, rank, onClick, onAddToRoute }) {
  const formatPriceLevel = (level) => '$'.repeat(level);

  return (
    <div className="recommendation-card" onClick={onClick}>
      <div className="card-header">
        <h4>{rank}. {place.name}</h4>
        <div className="card-meta">
          <span className="rating">⭐ {place.rating || 'N/A'}</span>
          {place.price_level && <span className="price">{formatPriceLevel(place.price_level)}</span>}
        </div>
      </div>
      {place.recommendation_reason && <p className="reason">💡 {place.recommendation_reason}</p>}
      <button 
        className="add-to-route-btn-small"
        onClick={(e) => {
          e.stopPropagation();
          onAddToRoute(place);
        }}
      >
        + Add to Route
      </button>
    </div>
  );
}

function RichInfoWindow({ place, onAddToRoute }) {
  const formatPriceLevel = (level) => '$'.repeat(level);
  const formatOpeningHours = (hours) => {
    if (!hours) return 'Not available';
    return hours.open_now ? 'Open now' : 'Closed';
  };

  return (
    <div className="rich-info-window">
      <h4>{place.name}</h4>
      <p>{place.vicinity}</p>
      <div className="info-meta">
        <span className="rating">⭐ {place.rating || 'N/A'} ({place.user_ratings_total || 0} reviews)</span>
        {place.price_level && <span className="price">{formatPriceLevel(place.price_level)}</span>}
      </div>
      <div className="info-status">
        <p>Opening Hours: {formatOpeningHours(place.opening_hours)}</p>
      </div>
      <button className="add-to-route-btn" onClick={() => onAddToRoute(place)}>
        Add to Route
      </button>
    </div>
  );
}

export default App;
