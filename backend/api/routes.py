import json
import logging
from fastapi import APIRouter, HTTPException, Depends
from backend.models.schemas import GameStartRequest, GuessRequest
from backend.services.graph_service import GraphService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# Injection de dépendance pour récupérer graph_service depuis app.state
def get_graph_service():
    from backend.main import app
    return app.state.graph_service

@router.get("/countries")
def get_countries():
    """Renvoie la liste des pays disponibles."""
    try:
        with open('data/countries.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return []

@router.post("/game/start")
def start_game(req: GameStartRequest, graph_service: GraphService = Depends(get_graph_service)):
    """Initialise une nouvelle partie et renvoie l'artiste de départ et la cible."""
    result = graph_service.find_route(
        min_popularity=req.min_popularity,
        country=req.country,
        min_range=req.min_range,
        max_range=req.max_range
    )
    
    if not result:
        raise HTTPException(status_code=400, detail="Impossible de trouver une paire d'artistes avec ces critères. Essayez d'élargir la recherche.")
        
    source, chosen_target, chosen_dist, chosen_path = result
    
    path_names = [graph_service.get_artist(node).get('name', 'Unknown') for node in chosen_path]
    logger.info(f"Generated Route (distance={chosen_dist}): {' -> '.join(path_names)}")
    
    return {
        "source": {"id": source, "name": graph_service.get_artist(source).get('name', 'Unknown')},
        "target": {"id": chosen_target, "name": graph_service.get_artist(chosen_target).get('name', 'Unknown')},
        "distance": chosen_dist
    }

@router.get("/search")
def search_artists(q: str, graph_service: GraphService = Depends(get_graph_service)):
    """Autocomplétion pour la recherche d'artistes."""
    return graph_service.search_artists(q)

@router.post("/game/guess")
def check_guess(req: GuessRequest, graph_service: GraphService = Depends(get_graph_service)):
    """Vérifie si l'artiste deviné a collaboré avec l'artiste actuel."""
    if not graph_service.get_artist(req.current_artist_id) or not graph_service.get_artist(req.guessed_artist_id):
        raise HTTPException(status_code=404, detail="Artiste introuvable.")
        
    is_linked = graph_service.is_linked(req.current_artist_id, req.guessed_artist_id)
    return {
        "is_linked": is_linked,
        "guessed_artist": {
            "id": req.guessed_artist_id,
            "name": graph_service.get_artist(req.guessed_artist_id).get("name", "Unknown")
        }
    }
