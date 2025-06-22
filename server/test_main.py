import pytest
import json
import os
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from main import app, RouteQuery, determine_search_location, get_gemini_recommendations

# Test client for FastAPI
client = TestClient(app)

# Sample test data
SAMPLE_ROUTE = {
    "routes": [{
        "legs": [{
            "start_location": {"lat": 37.7749, "lng": -122.4194},
            "end_location": {"lat": 37.7849, "lng": -122.4094}
        }],
        "bounds": {
            "northeast": {"lat": 37.7849, "lng": -122.4094},
            "southwest": {"lat": 37.7749, "lng": -122.4194}
        }
    }]
}

SAMPLE_PLACE_RESPONSE = {
    "results": [
        {
            "place_id": "test_place_1",
            "name": "Test Restaurant",
            "geometry": {
                "location": {"lat": 37.7799, "lng": -122.4144}
            },
            "rating": 4.5,
            "user_ratings_total": 100,
            "types": ["restaurant", "food"]
        },
        {
            "place_id": "test_place_2", 
            "name": "Test Cafe",
            "geometry": {
                "location": {"lat": 37.7779, "lng": -122.4164}
            },
            "rating": 4.2,
            "user_ratings_total": 50,
            "types": ["cafe", "food"]
        }
    ]
}

SAMPLE_PLACE_DETAILS = {
    "result": {
        "place_id": "test_place_1",
        "name": "Test Restaurant",
        "geometry": {
            "location": {"lat": 37.7799, "lng": -122.4144}
        },
        "rating": 4.5,
        "user_ratings_total": 100,
        "price_level": 2,
        "formatted_address": "123 Test St, San Francisco, CA",
        "formatted_phone_number": "(555) 123-4567",
        "website": "https://testrestaurant.com",
        "opening_hours": {
            "weekday_text": ["Monday: 9:00 AM – 9:00 PM", "Tuesday: 9:00 AM – 9:00 PM"]
        },
        "photos": [{
            "photo_reference": "test_photo_ref"
        }],
        "types": ["restaurant", "food"]
    }
}

class TestHealthEndpoint:
    """Test the health check endpoint"""
    
    def test_health_check(self):
        """Test GET / returns correct health information"""
        response = client.get("/")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["message"] == "Semantic Maps Assistant API"
        assert data["version"] == "1.1"
        assert data["ai_service"] == "Google Gemini AI"
        assert data["maps_service"] == "Google Maps"


class TestSearchLocationDetermination:
    """Test the search location determination logic"""
    
    def test_destination_keywords(self):
        """Test queries with destination keywords"""
        start = (37.7749, -122.4194)
        end = (37.7849, -122.4094)
        mid = (37.7799, -122.4144)
        
        queries = [
            "restaurants near destination",
            "coffee shops at destination", 
            "hotels destination area",
            "parking end of trip"
        ]
        
        for query in queries:
            result = determine_search_location(query, start, end, mid)
            assert result == end, f"Query '{query}' should return destination location"
    
    def test_start_keywords(self):
        """Test queries with start/origin keywords"""
        start = (37.7749, -122.4194)
        end = (37.7849, -122.4094)
        mid = (37.7799, -122.4144)
        
        queries = [
            "gas stations near start",
            "parking at start",
            "restaurants beginning of trip",
            "hotels start of trip",
            "cafes departure"
        ]
        
        for query in queries:
            result = determine_search_location(query, start, end, mid)
            assert result == start, f"Query '{query}' should return start location"
    
    def test_midpoint_default(self):
        """Test queries default to midpoint"""
        start = (37.7749, -122.4194)
        end = (37.7849, -122.4094)
        mid = (37.7799, -122.4144)
        
        queries = [
            "restaurants along the route",
            "good coffee shops",
            "gas stations",
            "hotels"
        ]
        
        for query in queries:
            result = determine_search_location(query, start, end, mid)
            assert result == mid, f"Query '{query}' should return midpoint location"


class TestGeminiRecommendations:
    """Test Gemini AI recommendation logic"""
    
    @patch('main.genai.GenerativeModel')
    def test_gemini_recommendations_success(self, mock_model):
        """Test successful Gemini recommendations"""
        # Mock Gemini response
        mock_response = MagicMock()
        mock_response.text = '''
        {
            "recommendations": [
                {
                    "place_index": 0,
                    "reason": "Excellent rating and many positive reviews"
                },
                {
                    "place_index": 1,
                    "reason": "Great atmosphere and convenient location"
                }
            ]
        }
        '''
        
        mock_instance = MagicMock()
        mock_instance.generate_content.return_value = mock_response
        mock_model.return_value = mock_instance
        
        places = [
            {"name": "Test Restaurant", "rating": 4.5, "user_ratings_total": 100},
            {"name": "Test Cafe", "rating": 4.2, "user_ratings_total": 50}
        ]
        
        with patch('main.genai.configure'):
            result = get_gemini_recommendations(places, "good restaurants")
        
        assert "recommendations" in result
        assert len(result["recommendations"]) == 2
        assert result["recommendations"][0]["place_index"] == 0
        assert "Excellent rating" in result["recommendations"][0]["reason"]
    
    @patch('main.genai.GenerativeModel')
    def test_gemini_recommendations_fallback(self, mock_model):
        """Test Gemini fallback when AI fails"""
        # Mock Gemini failure
        mock_model.side_effect = Exception("Gemini API error")
        
        places = [
            {"name": "Test Restaurant", "rating": 4.5},
            {"name": "Test Cafe", "rating": 4.2}
        ]
        
        with patch('main.genai.configure'):
            result = get_gemini_recommendations(places, "good restaurants")
        
        assert "recommendations" in result
        assert len(result["recommendations"]) == 2
        assert "Highly rated" in result["recommendations"][0]["reason"]


class TestFindPlacesEndpoint:
    """Test the main places finding endpoint"""
    
    @patch.dict(os.environ, {
        'GOOGLE_API_KEY': 'test_api_key',
        'GEMINI_API_KEY': 'test_gemini_key'
    })
    @patch('main.googlemaps.Client')
    @patch('main.get_gemini_recommendations')
    @patch('main.genai.GenerativeModel')
    def test_find_places_success(self, mock_gemini_model, mock_gemini_recs, mock_maps_client):
        """Test successful places finding"""
        # Mock Gemini query parsing
        mock_response = MagicMock()
        mock_response.text = '{"search_query": "restaurants", "place_type": "restaurant"}'
        mock_instance = MagicMock()
        mock_instance.generate_content.return_value = mock_response
        mock_gemini_model.return_value = mock_instance
        
        # Mock Google Maps client
        mock_client = MagicMock()
        mock_client.places.return_value = SAMPLE_PLACE_RESPONSE
        mock_client.place.return_value = SAMPLE_PLACE_DETAILS
        mock_maps_client.return_value = mock_client
        
        # Mock Gemini recommendations
        mock_gemini_recs.return_value = {
            "recommendations": [
                {"place_index": 0, "reason": "Great food and service"}
            ]
        }
        
        # Test request
        request_data = {
            "query": "good restaurants",
            "route": SAMPLE_ROUTE
        }
        
        with patch('main.genai.configure'):
            response = client.post("/api/find-places-on-route", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "query" in data
        assert "search_location_type" in data
        assert "all_places" in data
        assert "recommended_places" in data
        assert "total_found" in data
        
        # Verify data content
        assert data["query"] == "good restaurants"
        assert len(data["all_places"]) > 0
        assert len(data["recommended_places"]) > 0
        assert data["recommended_places"][0]["recommendation_reason"] == "Great food and service"
    

    
    @patch.dict(os.environ, {
        'GOOGLE_API_KEY': 'test_api_key',
        'GEMINI_API_KEY': 'test_gemini_key'
    })
    def test_invalid_route_structure(self):
        """Test error handling for invalid route structure"""
        request_data = {
            "query": "restaurants",
            "route": {"invalid": "structure"}
        }
        
        response = client.post("/api/find-places-on-route", json=request_data)
        
        assert response.status_code == 400
        assert "Invalid route object" in response.json()["detail"]
    
    @patch.dict(os.environ, {
        'GOOGLE_API_KEY': 'test_api_key',
        'GEMINI_API_KEY': 'test_gemini_key'
    })
    @patch('main.genai.GenerativeModel')
    def test_gemini_parsing_error(self, mock_gemini_model):
        """Test error handling when Gemini returns invalid JSON"""
        mock_response = MagicMock()
        mock_response.text = "Invalid JSON response"
        mock_instance = MagicMock()
        mock_instance.generate_content.return_value = mock_response
        mock_gemini_model.return_value = mock_instance
        
        request_data = {
            "query": "restaurants",
            "route": SAMPLE_ROUTE
        }
        
        with patch('main.genai.configure'):
            response = client.post("/api/find-places-on-route", json=request_data)
        
        assert response.status_code == 500
        assert "Gemini parsing error" in response.json()["detail"]


if __name__ == "__main__":
    print("Run tests with: python -m pytest test_main.py -v")
    print("For coverage: python -m pytest test_main.py --cov=main") 