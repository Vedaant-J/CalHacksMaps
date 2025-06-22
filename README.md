# Semantic Maps Assistant

A full-stack web application that overlays semantic, conversational search onto Google Maps. Users can plan routes and use natural language to find points of interest along their journey.

## Architecture

- **Backend**: Python FastAPI with Google Gemini Pro + Places API
- **Frontend**: React.js with Google Maps integration
- **AI**: Semantic query processing using Gemini Pro
- **APIs**: Google Maps, Places, and Directions services

## Quick Start

### Prerequisites

- Python 3.8+
- Node.js 16+
- **Two separate Google API keys**:
  - **Google Cloud API Key** (for Maps, Places, Directions APIs)
  - **Gemini API Key** (for AI semantic processing)

### Setup

1. **Clone and navigate to project**:
   ```bash
   git clone <repository>
   cd CalHacks1
   ```

2. **Backend Setup**:
   ```bash
   cd server
   pip install -r requirements.txt
   
   # Create .env file with both API keys:
   cp env.example .env
   # Edit .env and add:
   # GOOGLE_API_KEY=your_google_cloud_api_key_here
   # GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. **Frontend Setup**:
   ```bash
   cd ../semantic-maps-app
   npm install
   
   # Create .env file:
   cp env.example .env
   # Edit .env and add:
   # REACT_APP_GOOGLE_MAPS_API_KEY=your_google_cloud_api_key_here
   ```

4. **Start Both Services**:
   ```bash
   # From project root:
   ./start-dev.sh    # Unix/Mac
   # OR
   start-dev.bat     # Windows
   ```

   Or start manually:
   ```bash
   # Terminal 1 - Backend:
   cd server
   uvicorn main:app --reload
   
   # Terminal 2 - Frontend:
   cd semantic-maps-app  
   npm start
   ```

### API Keys Setup

#### Google Cloud API Key
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select a project
3. Enable these APIs:
   - Maps JavaScript API
   - Places API
   - Directions API
4. Create credentials → API Key
5. Use this key for both `GOOGLE_API_KEY` (backend) and `REACT_APP_GOOGLE_MAPS_API_KEY` (frontend)

#### Gemini API Key  
1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create API key
3. Use this key for `GEMINI_API_KEY` (backend only)

## Usage

1. **Open the app**: http://localhost:3000
2. **Plan a route**: Enter origin and destination
3. **Semantic search**: Ask questions like:
   - "Find coffee shops along the way"
   - "Good restaurants for lunch"
   - "Gas stations near the highway"
4. **View results**: See places marked on the map
5. **Add to route**: Click markers to add stops

## API Endpoints

### `POST /api/find-places-on-route`

**Request**:
```json
{
  "query": "coffee shops along the route",
  "route": {
    "routes": [/* Google DirectionsResult object */]
  }
}
```

**Response**:
```json
[
  {
    "place_id": "ChIJ...",
    "name": "Blue Bottle Coffee",
    "geometry": {
      "location": {"lat": 37.7749, "lng": -122.4194}
    },
    "rating": 4.5
  }
]
```

## Features

- ✅ **Semantic Search**: Natural language queries powered by Gemini Pro
- ✅ **Route Planning**: Google Maps integration with directions
- ✅ **Smart Filtering**: AI converts queries to relevant place searches  
- ✅ **Interactive Map**: Click markers to add stops to your route
- ✅ **Responsive Design**: Works on desktop and mobile

## Architecture Details

### Backend (FastAPI)
- **Semantic Processing**: Gemini Pro converts natural language to structured queries
- **Places Search**: Google Places API finds relevant locations
- **Route Analysis**: Calculates midpoints and search areas
- **API Integration**: Clean REST interface for frontend

### Frontend (React)
- **Maps Integration**: `@vis.gl/react-google-maps` for modern React integration
- **State Management**: React hooks for route and places data
- **UI Components**: Clean, responsive interface
- **Real-time Updates**: Dynamic map updates as user interacts

## Troubleshooting

### Common Issues

1. **"Could not import module 'main'"**: Run uvicorn from the `server/` directory
2. **API Key errors**: Ensure both API keys are properly configured in .env files
3. **CORS errors**: Backend runs on :8000, frontend on :3000 - CORS is configured
4. **Maps not loading**: Check `REACT_APP_GOOGLE_MAPS_API_KEY` in frontend .env

### Development Tips

- **Backend logs**: Check terminal running uvicorn for detailed error messages
- **Frontend debugging**: Open browser DevTools for React errors
- **API testing**: Use curl or Postman to test backend endpoints directly
- **Environment**: Ensure .env files are not committed to version control

## Future Enhancements

- [ ] **Multi-stop optimization**: Optimize route order for multiple stops
- [ ] **User preferences**: Remember favorite place types and locations  
- [ ] **Social features**: Share routes and recommendations
- [ ] **Offline mode**: Cache routes and places for offline use
- [ ] **Advanced filters**: Price range, ratings, hours, etc.
- [ ] **Voice interface**: Voice commands for hands-free operation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details. 