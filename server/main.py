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


class VoiceQuery(BaseModel):
    """Expected payload for parsing voice commands."""
    command: str


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
        gemini = genai.GenerativeModel("gemini-1.5-pro")
        
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


@app.post("/api/parse-voice-query")
def parse_voice_query(voice_query: VoiceQuery):
    """
    Parses a natural language voice command into origin, destination, and a semantic query using Google Gemini.
    Enhanced to handle vague prompts by using Google Maps API for intelligent guessing.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured in environment")
    
    if not GOOGLE_API_KEY:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not configured in environment")
    
    if genai is None or googlemaps is None:
         raise HTTPException(
            status_code=500,
            detail="Google SDKs not installed. Did you install requirements.txt?",
        )

    try:
        genai.configure(api_key=GEMINI_API_KEY)
        gemini = genai.GenerativeModel("gemini-1.5-pro")
        maps_client = googlemaps.Client(key=GOOGLE_API_KEY)
        
        # First, try to parse the command normally
        system_prompt = """You are a highly intelligent travel assistant. Your task is to parse a user's voice command into a structured JSON object. The command will contain a travel route and a search query.

You must identify three key pieces of information:
1.  `origin`: The starting point of the journey.
2.  `destination`: The final destination of the journey.
3.  `semanticQuery`: What the user wants to find or do along the way.

**Rules:**
- Your response MUST be a valid JSON object and nothing else.
- If any of the three fields are not present in the user's command, you MUST return an empty string `""` for that field.
- Do not add any extra explanations, markdown formatting, or text outside of the JSON object.
- If the command is vague (like "the other one", "another place", etc.), mark it as vague.
- If any location contains relative terms like "next to", "near", "a ", "an ", mark it as needing resolution.

**Example 1:**
User command: "I want to go from 8875 Costa Verde Boulevard to the Price Center in San Diego and I want pizza on the way"
Your response:
{
  "origin": "8875 Costa Verde Boulevard",
  "destination": "the Price Center in San Diego",
  "semanticQuery": "pizza on the way",
  "isVague": false
}

**Example 2:**
User command: "I'm in McDonalds and want to go to the other one"
Your response:
{
  "origin": "McDonalds",
  "destination": "the other one",
  "semanticQuery": "",
  "isVague": true,
  "vagueContext": "McDonalds"
}

**Example 3:**
User command: "I'm at a McDonald's next to UTC in La Jolla San Diego and want to go to the other one"
Your response:
{
  "origin": "a McDonald's next to UTC in La Jolla San Diego",
  "destination": "the other one",
  "semanticQuery": "",
  "isVague": true,
  "vagueContext": "McDonald's"
}

**Example 4:**
User command: "find coffee shops nearby"
Your response:
{
  "origin": "",
  "destination": "",
  "semanticQuery": "find coffee shops nearby",
  "isVague": false
}
"""
        
        full_prompt = f"{system_prompt}\n\nUser command to parse:\n\"{voice_query.command}\""
        
        ai_response = gemini.generate_content(
            full_prompt,
            generation_config=genai.types.GenerationConfig(
                # Enforce JSON output
                response_mime_type="application/json",
            )
        )
        
        response_text = ai_response.text
        print(f"Gemini parsing response: {response_text}")
        
        parsed_response = json.loads(response_text)
        
        # Always try to resolve locations, not just when marked as vague
        print("Checking for locations that need resolution...")
        resolved_response = resolve_vague_command(parsed_response, voice_query.command, maps_client, gemini)
        return resolved_response

    except Exception as e:
        print(f"Error during Gemini parsing: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to parse voice command with Gemini: {e}")


def resolve_vague_command(parsed_response: dict, original_command: str, maps_client, gemini):
    """
    Resolves vague commands like "the other one" by using Google Maps API to find nearby places.
    Now handles both vague origins and destinations.
    """
    try:
        origin = parsed_response.get("origin", "")
        destination = parsed_response.get("destination", "")
        vague_context = parsed_response.get("vagueContext", "")
        
        resolved_origin = origin
        resolved_destination = destination
        resolution_methods = []
        
        # Handle vague origin
        if origin and (is_vague_location(origin) or should_resolve_location(origin)):
            print(f"Resolving origin: {origin}")
            resolved_origin = resolve_vague_location(origin, maps_client, gemini, "origin")
            if resolved_origin != origin:
                resolution_methods.append("origin_resolution")
        
        # Handle vague destination
        if destination and (is_vague_location(destination) or should_resolve_location(destination)):
            print(f"Resolving destination: {destination}")
            resolved_destination = resolve_vague_location(destination, maps_client, gemini, "destination", resolved_origin)
            if resolved_destination != destination:
                resolution_methods.append("destination_resolution")
        
        # If we have a vague destination and some context, try to find nearby places
        if destination and vague_context and not is_vague_location(destination):
            # Search for places similar to the context near the origin
            if resolved_origin:
                # Try to geocode the origin first
                try:
                    geocode_result = maps_client.geocode(resolved_origin)
                    if geocode_result:
                        origin_location = geocode_result[0]['geometry']['location']
                        
                        # Search for similar places near the origin
                        search_query = f"{vague_context} near {resolved_origin}"
                        places_result = maps_client.places(
                            query=search_query,
                            location=origin_location,
                            radius=5000  # 5km radius
                        )
                        
                        if places_result.get('results'):
                            # Filter out the current location and get the next best match
                            current_place = None
                            other_places = []
                            
                            for place in places_result['results']:
                                place_name = place.get('name', '').lower()
                                if vague_context.lower() in place_name:
                                    if not current_place:
                                        current_place = place
                                    else:
                                        other_places.append(place)
                            
                            # If we found other similar places, use the best one
                            if other_places:
                                best_place = max(other_places, key=lambda x: x.get('rating', 0))
                                resolved_destination = best_place.get('formatted_address', best_place.get('name', ''))
                                resolution_methods.append("nearby_search")
                
                except Exception as e:
                    print(f"Error resolving vague command with geocoding: {e}")
        
        # If we couldn't resolve it with geocoding, try a broader search
        if vague_context and not is_vague_location(destination):
            # Use Gemini to generate a better search query
            resolution_prompt = f"""
            The user said: "{original_command}"
            
            The context is: {vague_context}
            
            Generate a specific search query to find what the user is looking for.
            For example, if they said "the other McDonalds", search for "McDonalds restaurant".
            If they said "another coffee shop", search for "coffee shop".
            
            Respond with JSON:
            {{
                "search_query": "specific search terms",
                "explanation": "brief explanation of what we're searching for"
            }}
            """
            
            try:
                ai_response = gemini.generate_content(resolution_prompt)
                ai_text = ai_response.text.strip().replace("```json", "").replace("```", "")
                resolution_params = json.loads(ai_text)
                
                search_query = resolution_params.get("search_query", vague_context)
                
                # Do a broader search
                places_result = maps_client.places(
                    query=search_query,
                    radius=10000  # 10km radius
                )
                
                if places_result.get('results'):
                    # Get the best rated place
                    best_place = max(places_result['results'], key=lambda x: x.get('rating', 0))
                    resolved_destination = best_place.get('formatted_address', best_place.get('name', ''))
                    resolution_methods.append("broad_search")
            
            except Exception as e:
                print(f"Error with AI resolution: {e}")
        
        # Return resolved response if any resolution occurred
        if resolution_methods:
            return {
                "origin": resolved_origin,
                "destination": resolved_destination,
                "semanticQuery": parsed_response.get("semanticQuery", ""),
                "resolved": True,
                "resolution_methods": resolution_methods,
                "original_origin": origin if origin != resolved_origin else None,
                "original_destination": destination if destination != resolved_destination else None
            }
        
        # If all else fails, return the original parsed response
        return parsed_response
        
    except Exception as e:
        print(f"Error resolving vague command: {e}")
        return parsed_response


def is_vague_location(location: str) -> bool:
    """
    Determines if a location string is vague and needs resolution.
    """
    vague_indicators = [
        "here", "there", "this place", "that place", "nearby", "around here",
        "somewhere", "anywhere", "the mall", "the store", "the restaurant",
        "my location", "current location", "where I am", "where I'm at",
        "a ", "an ", "the other", "another", "different", "next to", "near",
        "close to", "across from", "behind", "in front of"
    ]
    
    location_lower = location.lower()
    
    # Check for vague indicators
    for indicator in vague_indicators:
        if indicator in location_lower:
            return True
    
    # Check for very short or generic terms
    if len(location.strip()) < 5:
        return True
    
    # Check for common vague patterns
    vague_patterns = [
        r"^[a-z]+\s+(place|location|area|spot)$",
        r"^(the|a|an)\s+[a-z]+$",
        r"^[a-z]+\s+(nearby|around|close)$",
        r".*\s+(next to|near|close to|across from|behind|in front of)\s+.*",
        r"^[a-z]+\s+[a-z]+\s+(in|at|near)\s+.*"
    ]
    
    import re
    for pattern in vague_patterns:
        if re.match(pattern, location_lower):
            return True
    
    return False


def should_resolve_location(location: str) -> bool:
    """
    Determines if a location should be resolved, even if not strictly vague.
    This catches cases like "a McDonald's next to UTC" that need geocoding.
    """
    location_lower = location.lower()
    
    # Check if it contains relative positioning terms
    relative_terms = [
        "next to", "near", "close to", "across from", "behind", 
        "in front of", "beside", "adjacent to", "a ", "an "
    ]
    
    for term in relative_terms:
        if term in location_lower:
            return True
    
    # Check if it's a business name with location context
    business_patterns = [
        r"^[a-z]+\s+(in|at|near)\s+.*",
        r".*\s+(in|at|near)\s+[a-z]+\s+[a-z]+.*"
    ]
    
    import re
    for pattern in business_patterns:
        if re.match(pattern, location_lower):
            return True
    
    return False


def resolve_vague_location(location: str, maps_client, gemini, location_type: str, reference_location: str = None) -> str:
    """
    Resolves a vague location to a specific address using Google Maps API.
    
    Args:
        location: The vague location string
        maps_client: Google Maps client
        gemini: Gemini AI client
        location_type: "origin" or "destination"
        reference_location: Optional reference location for context
    """
    try:
        # First, try to geocode the location directly
        try:
            geocode_result = maps_client.geocode(location)
            if geocode_result:
                resolved_location = geocode_result[0]['formatted_address']
                print(f"Direct geocoding resolved '{location}' to '{resolved_location}'")
                return resolved_location
        except Exception as e:
            print(f"Direct geocoding failed for '{location}': {e}")
        
        # Use Gemini to generate a better search query for the location
        context_prompt = ""
        if reference_location:
            context_prompt = f" The user is currently at or near: {reference_location}"
        
        resolution_prompt = f"""
        The user mentioned a {location_type}: "{location}"{context_prompt}
        
        Generate a specific search query to find this location. Be smart about extracting the key business name and location.
        Examples:
        - "a McDonald's next to UTC in La Jolla San Diego" → "McDonald's UTC La Jolla San Diego"
        - "I'm at the mall" → "shopping mall"
        - "I'm near Starbucks" → "Starbucks coffee shop"
        - "I'm at the restaurant" → "restaurant"
        - "I'm here" → "current location" (if no context)
        - "the McDonald's next to the gas station" → "McDonald's gas station"
        
        Respond with JSON:
        {{
            "search_query": "specific search terms",
            "location_type": "business|landmark|area|current_location",
            "explanation": "brief explanation"
        }}
        """
        
        ai_response = gemini.generate_content(resolution_prompt)
        ai_text = ai_response.text.strip().replace("```json", "").replace("```", "")
        resolution_params = json.loads(ai_text)
        
        search_query = resolution_params.get("search_query", location)
        location_type_ai = resolution_params.get("location_type", "business")
        
        # If it's "current_location", we might need to handle this differently
        if location_type_ai == "current_location":
            # For now, return a generic "Current Location" - in a real app, you'd get GPS
            return "Current Location"
        
        # Search for the location
        search_params = {
            "query": search_query,
            "radius": 10000  # 10km radius
        }
        
        # If we have a reference location, bias the search towards it
        if reference_location:
            try:
                geocode_result = maps_client.geocode(reference_location)
                if geocode_result:
                    reference_coords = geocode_result[0]['geometry']['location']
                    search_params["location"] = reference_coords
                    search_params["radius"] = 5000  # Smaller radius when we have context
            except Exception as e:
                print(f"Error geocoding reference location: {e}")
        
        places_result = maps_client.places(**search_params)
        
        if places_result.get('results'):
            # Get the best rated place
            best_place = max(places_result['results'], key=lambda x: x.get('rating', 0))
            resolved_location = best_place.get('formatted_address', best_place.get('name', ''))
            
            print(f"Places API resolved '{location}' to '{resolved_location}' using search: '{search_query}'")
            return resolved_location
        
        # If no results, try a broader search with just the business name
        if " " in search_query:
            # Extract just the business name (first word or two)
            words = search_query.split()
            if len(words) >= 2:
                business_name = " ".join(words[:2])  # Take first two words
                print(f"Trying broader search with business name: '{business_name}'")
                
                broader_result = maps_client.places(
                    query=business_name,
                    radius=15000  # Larger radius
                )
                
                if broader_result.get('results'):
                    best_place = max(broader_result['results'], key=lambda x: x.get('rating', 0))
                    resolved_location = best_place.get('formatted_address', best_place.get('name', ''))
                    print(f"Broader search resolved '{location}' to '{resolved_location}'")
                    return resolved_location
        
        # If all else fails, return the original location
        return location
        
    except Exception as e:
        print(f"Error resolving location '{location}': {e}")
        return location


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
        print(f"here0")
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not configured in environment")
    
    if not GEMINI_API_KEY:
        print(f"here1")
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured in environment")

    if genai is None or googlemaps is None:
        print(f"here2")
        raise HTTPException(
            status_code=500,
            detail="Required Google SDKs not installed. Did you install requirements.txt?",
        )

    # --- Step 1: Convert semantic query to text search keywords using Gemini Pro ---
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        gemini = genai.GenerativeModel("gemini-1.5-pro")

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
        print(f"Gemini response: {ai_params}")
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
            
    except Exception as e:
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