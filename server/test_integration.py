"""
Integration tests for Semantic Maps Assistant API
Tests actual API behavior and integration between components
"""

import pytest
import json
import os
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

class TestAPIIntegration:
    """Integration tests for the full API workflow"""
    
    def test_health_endpoint_integration(self):
        """Test that health endpoint works end-to-end"""
        response = client.get("/")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify all expected fields are present
        expected_fields = ["message", "version", "ai_service", "maps_service"]
        for field in expected_fields:
            assert field in data
        
        # Verify correct values
        assert "Semantic Maps Assistant" in data["message"]
        assert data["ai_service"] == "Google Gemini AI"
        assert data["maps_service"] == "Google Maps"
    
    @patch.dict(os.environ, {
        'GOOGLE_API_KEY': 'test_google_key',
        'GEMINI_API_KEY': 'test_gemini_key'
    })
    @patch('main.googlemaps.Client')
    @patch('main.genai.GenerativeModel')
    @patch('main.genai.configure')
    def test_full_workflow_restaurant_search(self, mock_configure, mock_gemini, mock_gmaps):
        """Test complete workflow: query -> Gemini -> Maps -> recommendations"""
        
        # Mock Gemini AI response for query parsing
        mock_gemini_response = MagicMock()
        mock_gemini_response.text = json.dumps({
            "search_query": "restaurants",
            "place_type": "restaurant"
        })
        
        mock_gemini_instance = MagicMock()
        mock_gemini_instance.generate_content.return_value = mock_gemini_response
        mock_gemini.return_value = mock_gemini_instance
        
        # Mock Google Maps Places API response
        mock_places_response = {
            "results": [
                {
                    "place_id": "ChIJ_test_1",
                    "name": "Amazing Restaurant",
                    "geometry": {"location": {"lat": 37.7749, "lng": -122.4194}},
                    "rating": 4.8,
                    "user_ratings_total": 250,
                    "types": ["restaurant", "food"]
                },
                {
                    "place_id": "ChIJ_test_2",
                    "name": "Great Cafe",
                    "geometry": {"location": {"lat": 37.7750, "lng": -122.4195}},
                    "rating": 4.5,
                    "user_ratings_total": 150,
                    "types": ["cafe", "food"]
                }
            ]
        }
        
        # Mock Place Details API response
        mock_details_response = {
            "result": {
                "place_id": "ChIJ_test_1",
                "name": "Amazing Restaurant",
                "geometry": {"location": {"lat": 37.7749, "lng": -122.4194}},
                "rating": 4.8,
                "user_ratings_total": 250,
                "price_level": 3,
                "formatted_address": "123 Amazing St, San Francisco, CA",
                "formatted_phone_number": "(555) 123-4567",
                "website": "https://amazing-restaurant.com",
                "opening_hours": {
                    "weekday_text": ["Monday: 11:00 AM – 10:00 PM"]
                },
                "photos": [{"photo_reference": "test_photo_ref"}],
                "types": ["restaurant", "food"]
            }
        }
        
        # Configure Google Maps client mock
        mock_client = MagicMock()
        mock_client.places.return_value = mock_places_response
        mock_client.place.return_value = mock_details_response
        mock_gmaps.return_value = mock_client
        
        # Mock Gemini recommendations response
        mock_rec_response = MagicMock()
        mock_rec_response.text = json.dumps({
            "recommendations": [
                {
                    "place_index": 0,
                    "reason": "Exceptional rating of 4.8 stars with 250 reviews, indicating consistently excellent food and service"
                },
                {
                    "place_index": 1,
                    "reason": "Solid choice with 4.5 stars and good reputation in the area"
                }
            ]
        })
        
        # Mock second Gemini call for recommendations
        def mock_generate_content(prompt):
            if "travel expert analyzing places" in prompt:
                return mock_rec_response
            else:
                return mock_gemini_response
        
        mock_gemini_instance.generate_content.side_effect = mock_generate_content
        
        # Test request
        route_data = {
            "routes": [{
                "legs": [{
                    "start_location": {"lat": 37.7749, "lng": -122.4194},
                    "end_location": {"lat": 37.7849, "lng": -122.4094}
                }]
            }]
        }
        
        request_data = {
            "query": "best restaurants",
            "route": route_data
        }
        
        # Make request
        response = client.post("/api/find-places-on-route", json=request_data)
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "query" in data
        assert "search_location_type" in data
        assert "all_places" in data
        assert "recommended_places" in data
        assert "total_found" in data
        
        # Verify content
        assert data["query"] == "best restaurants"
        assert data["total_found"] > 0
        assert len(data["all_places"]) > 0
        assert len(data["recommended_places"]) > 0
        
        # Verify recommended place has AI reasoning
        rec_place = data["recommended_places"][0]
        assert "recommendation_reason" in rec_place
        assert "Exceptional rating" in rec_place["recommendation_reason"]
        
        # Verify place details were fetched
        assert rec_place["name"] == "Amazing Restaurant"
        assert rec_place["rating"] == 4.8
        assert rec_place["formatted_address"] == "123 Amazing St, San Francisco, CA"
        assert rec_place["website"] == "https://amazing-restaurant.com"
    

    
    def test_error_handling_invalid_input(self):
        """Test API handles invalid input gracefully"""
        
        # Test with malformed route data
        request_data = {
            "query": "restaurants",
            "route": {"malformed": "data"}
        }
        
        response = client.post("/api/find-places-on-route", json=request_data)
        
        # Should return error for malformed route
        assert response.status_code in [400, 500]
        assert "error" in response.json() or "detail" in response.json()
    
    def test_search_location_logic(self):
        """Test that search location is determined correctly based on query"""
        
        test_cases = [
            ("restaurants near destination", "destination"),
            ("gas stations at start", "start"),
            ("coffee shops along route", "midpoint"),
            ("hotels near end of trip", "destination"),
            ("parking at departure", "start")
        ]
        
        route_data = {
            "routes": [{
                "legs": [{
                    "start_location": {"lat": 37.7749, "lng": -122.4194},
                    "end_location": {"lat": 37.7849, "lng": -122.4094}
                }]
            }]
        }
        
        for query, expected_location in test_cases:
            with patch.dict(os.environ, {
                'GOOGLE_API_KEY': 'test_key',
                'GEMINI_API_KEY': 'test_key'
            }), \
            patch('main.googlemaps.Client'), \
            patch('main.genai.GenerativeModel'), \
            patch('main.genai.configure'):
                
                # Mock basic responses
                with patch('main.get_gemini_recommendations') as mock_recs:
                    mock_recs.return_value = {"recommendations": []}
                    
                    request_data = {
                        "query": query,
                        "route": route_data
                    }
                    
                    response = client.post("/api/find-places-on-route", json=request_data)
                    
                    if response.status_code == 200:
                        data = response.json()
                        assert data["search_location_type"] == expected_location, \
                            f"Query '{query}' should result in '{expected_location}' location"


class TestAPIValidation:
    """Test API input validation and error cases"""
    
    def test_missing_query_field(self):
        """Test API handles missing query field"""
        
        route_data = {
            "routes": [{
                "legs": [{
                    "start_location": {"lat": 37.7749, "lng": -122.4194},
                    "end_location": {"lat": 37.7849, "lng": -122.4094}
                }]
            }]
        }
        
        # Missing query field
        request_data = {
            "route": route_data
        }
        
        response = client.post("/api/find-places-on-route", json=request_data)
        assert response.status_code == 422  # Validation error
    
    def test_missing_route_field(self):
        """Test API handles missing route field"""
        
        # Missing route field
        request_data = {
            "query": "restaurants"
        }
        
        response = client.post("/api/find-places-on-route", json=request_data)
        assert response.status_code == 422  # Validation error
    
    def test_empty_route_data(self):
        """Test API handles empty route data"""
        
        request_data = {
            "query": "restaurants",
            "route": {}
        }
        
        response = client.post("/api/find-places-on-route", json=request_data)
        assert response.status_code in [400, 500]  # Should error on invalid route
    
    def test_content_type_validation(self):
        """Test API requires correct content type"""
        
        # Send as form data instead of JSON
        response = client.post("/api/find-places-on-route", 
                             data="query=restaurants&route=test")
        
        assert response.status_code == 422  # Should reject non-JSON


if __name__ == "__main__":
    print("Run integration tests with: python -m pytest test_integration.py -v") 