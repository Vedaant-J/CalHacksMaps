from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List
import os
import json
from dotenv import load_dotenv

# Optional imports, wrapped in try/except so devs without keys can still run the server
try:
    import google.generativeai as genai
    import googlemaps
except ImportError:
    genai = None  # type: ignore
    googlemaps = None  # type: ignore

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")  # For Google Maps/Places API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")  # For Gemini AI

app = FastAPI(
    title="Semantic Maps Assistant API",
    version="1.0.0",
)

# CORS configuration – during development the CRA dev server runs on port 3000
origins = [
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RouteQuery(BaseModel):
    """Expected payload from the React frontend."""

    query: str  # Natural-language search string from the user
    route: Dict[str, Any]  # Google DirectionsResult object (JSON-serialised)


def determine_search_location(query: str, start_pos: tuple, end_pos: tuple, mid_pos: tuple) -> tuple:
    """Determine where to search based on query constraints."""
    query_lower = query.lower()
    
    # Check for location-specific keywords
    if any(word in query_lower for word in ['near destination', 'at destination', 'destination area', 'end of trip']):
        return end_pos
    elif any(word in query_lower for word in ['near start', 'at start', 'beginning', 'start of trip', 'departure']):
        return start_pos
    else:
        # Default to midpoint for "along the route" searches
        return mid_pos


def get_gemini_recommendations(places: List[Dict], query: str) -> Dict[str, Any]:
    """Use Gemini to analyze and recommend the best places with explanations."""
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        gemini = genai.GenerativeModel("gemini-pro")
        
        # Prepare place data for Gemini
        places_summary = []
        for i, place in enumerate(places):
            summary = f"Place {i+1}: {place.get('name', 'Unknown')} "
            summary += f"(Rating: {place.get('rating', 'N/A')}, "
            summary += f"Reviews: {place.get('user_ratings_total', 'N/A')}, "
            summary += f"Price: {'$' * (place.get('price_level', 0) or 1)}, "
            summary += f"Types: {', '.join(place.get('types', [])[:3])}, "
            summary += f"Address: {place.get('formatted_address', 'N/A')})"
            places_summary.append(summary)
        
        prompt = f"""You are a travel expert analyzing places for a user query: "{query}"

Here are the candidate places:
{chr(10).join(places_summary)}

Please:
1. Select the TOP 2-3 most suitable places based on ratings, reviews, relevance to the query, and overall quality
2. Provide a brief explanation (1-2 sentences) for each recommendation explaining why it's great for this specific query
3. Rank them from best to least best

Respond with JSON in this exact format:
{{
    "recommendations": [
        {{
            "place_index": 0,
            "reason": "Brief explanation why this place is perfect for the query"
        }},
        {{
            "place_index": 1,
            "reason": "Brief explanation why this place is recommended"
        }}
    ]
}}"""

        ai_response = gemini.generate_content(prompt)
        ai_text = ai_response.text.strip().replace("```json", "").replace("```", "")
        print(f"Gemini recommendations: {ai_text}")
        
        recommendations = json.loads(ai_text)
        return recommendations
        
    except Exception as exc:
        print(f"Gemini recommendations error: {exc}")
        # Fallback to simple rating-based selection
        return {
            "recommendations": [
                {"place_index": i, "reason": f"Highly rated with {place.get('rating', 'N/A')} stars"}
                for i, place in enumerate(places[:3])
            ]
        }


@app.get("/")
def read_root():
    """Health check endpoint."""

    return {
        "message": "Semantic Maps Assistant API",
        "version": "1.1",
        "ai_service": "Google Gemini AI",
        "maps_service": "Google Maps"
    }


@app.post("/api/find-places-on-route")
def find_places_on_route(route_query: RouteQuery) -> Dict[str, Any]:
    """MVP endpoint: return candidate places that match a semantic query along a route.

    1. Uses Gemini Pro to convert the free-form user text into a Places API text search.
    2. Queries the Google Places API biased towards the midpoint of the provided route.
    3. Responds with a pared-down list containing only fields the frontend needs (place_id, name, geometry, rating).
    """
    
    print(f"Received request: query='{route_query.query}'")
    print(f"Route keys: {list(route_query.route.keys())}")

    if not GOOGLE_API_KEY:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not configured in environment")
    
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured in environment")

    if genai is None or googlemaps is None:
        raise HTTPException(
            status_code=500,
            detail="Required Google SDKs not installed. Did you install requirements.txt?",
        )

    # --- Step 1: Convert semantic query to text search keywords using Gemini Pro ---
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        gemini = genai.GenerativeModel("gemini-pro")

        prompt = (
            "You are a geospatial search assistant in a travel planning application.\n"
            f"A user asked: \"{route_query.query}\".\n"
            "Extract concise keywords suitable for a Google Places text search and, if possible, a Google Places 'type' value.\n"
            "Respond ONLY with JSON in the format: {\n"
            "  \"search_query\": \"<keywords>\",\n"
            "  \"place_type\": \"<place type or empty string>\"\n"
            "}"
        )

        ai_response = gemini.generate_content(prompt)
        ai_text = ai_response.text.strip().replace("```json", "").replace("```", "")
        print(f"Gemini response: {ai_text}")
        ai_params = json.loads(ai_text)
    except Exception as exc:
        print(f"Gemini error: {exc}")
        raise HTTPException(status_code=500, detail=f"Gemini parsing error: {exc}")

    search_query = ai_params.get("search_query")
    place_type = ai_params.get("place_type") or None

    # --- Step 2: Determine search location based on query constraints ---
    try:
        # Parse the route to get start, end, and midpoint
        if "routes" in route_query.route and len(route_query.route["routes"]) > 0:
            route = route_query.route["routes"][0]
            
            if "legs" in route and len(route["legs"]) > 0:
                leg = route["legs"][0]
                start_lat = leg["start_location"]["lat"]
                start_lng = leg["start_location"]["lng"]
                end_lat = leg["end_location"]["lat"]
                end_lng = leg["end_location"]["lng"]
                midpoint_lat = (start_lat + end_lat) / 2
                midpoint_lng = (start_lng + end_lng) / 2
                
                # Determine search location based on query intent
                search_location = determine_search_location(
                    route_query.query, 
                    (start_lat, start_lng), 
                    (end_lat, end_lng), 
                    (midpoint_lat, midpoint_lng)
                )
                
                print(f"Using search location: {search_location}")
            else:
                raise KeyError("No legs found in route")
        else:
            raise KeyError("No routes found in route object")
            
    except (KeyError, IndexError, TypeError) as e:
        print(f"Route parsing error: {e}")
        print(f"Route structure: {route_query.route}")
        raise HTTPException(status_code=400, detail=f"Invalid route object supplied: {e}")

    try:
        maps_client = googlemaps.Client(key=GOOGLE_API_KEY)
        places_result = maps_client.places(
            query=search_query,
            location=search_location,
            type=place_type,
            radius=10000  # 10km radius
        )
        print(f"Places API returned {len(places_result.get('results', []))} results")
    except Exception as exc:
        print(f"Places API error: {exc}")
        raise HTTPException(status_code=502, detail=f"Google Places API error: {exc}")

    # --- Step 3: Enhanced response with detailed place info ---
    candidates: List[Dict[str, Any]] = []
    
    # Get more places initially, then let Gemini pick the best ones
    all_places = sorted(
        places_result.get("results", []), 
        key=lambda x: x.get("rating", 0), 
        reverse=True
    )[:10]  # Get top 10 by rating for Gemini to analyze
    
    # Get detailed info for all candidate places
    for place in all_places:
        place_id = place.get("place_id")
        
        # Get detailed place information
        try:
            place_details = maps_client.place(
                place_id=place_id,
                fields=[
                    'place_id', 'name', 'geometry', 'rating', 'user_ratings_total',
                    'price_level', 'opening_hours', 'photos', 'formatted_address',
                    'formatted_phone_number', 'website', 'types'
                ]
            )
            
            detailed_place = place_details.get('result', {})
            
            # Get photo URL if available
            photo_url = None
            if detailed_place.get('photos'):
                photo_reference = detailed_place['photos'][0].get('photo_reference')
                if photo_reference:
                    photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={photo_reference}&key={GOOGLE_API_KEY}"
            
            # Format opening hours
            opening_hours = None
            if detailed_place.get('opening_hours'):
                opening_hours = detailed_place['opening_hours'].get('weekday_text', [])
            
            candidates.append({
                "place_id": place_id,
                "name": detailed_place.get("name"),
                "geometry": detailed_place.get("geometry"),
                "rating": detailed_place.get("rating"),
                "user_ratings_total": detailed_place.get("user_ratings_total"),
                "price_level": detailed_place.get("price_level"),  # 0-4 scale
                "formatted_address": detailed_place.get("formatted_address"),
                "phone": detailed_place.get("formatted_phone_number"),
                "website": detailed_place.get("website"),
                "photo_url": photo_url,
                "opening_hours": opening_hours,
                "types": detailed_place.get("types", [])
            })
            
        except Exception as detail_exc:
            print(f"Error getting place details for {place_id}: {detail_exc}")
            # Fallback to basic info
            candidates.append({
                "place_id": place_id,
                "name": place.get("name"),
                "geometry": place.get("geometry"),
                "rating": place.get("rating"),
                "formatted_address": place.get("formatted_address", "Address not available")
            })

    # --- Step 4: Use Gemini to get intelligent recommendations ---
    gemini_recommendations = get_gemini_recommendations(candidates, route_query.query)
    
    # Extract recommended places
    recommended_places = []
    for rec in gemini_recommendations.get("recommendations", []):
        place_index = rec.get("place_index")
        reason = rec.get("reason")
        
        if place_index < len(candidates):
            place = candidates[place_index].copy()
            place["recommendation_reason"] = reason
            recommended_places.append(place)
    
    # Return structured response with all places and recommendations
    response = {
        "query": route_query.query,
        "search_location_type": "destination" if search_location == (end_lat, end_lng) else "start" if search_location == (start_lat, start_lng) else "midpoint",
        "all_places": candidates,
        "recommended_places": recommended_places,
        "total_found": len(candidates)
    }

    print(f"Returning {len(candidates)} total places with {len(recommended_places)} recommendations")
    return response 