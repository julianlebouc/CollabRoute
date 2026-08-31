"""
routes.py — Endpoints de l'API CollabRoute.

Chaque route délègue à un service spécialisé injecté via Depends.
Aucune logique métier ici : ce fichier ne fait qu'orchestrer.
"""
import logging
from fastapi import APIRouter, HTTPException, Depends

from backend.models.schemas import GameStartRequest, GuessRequest, HintRequest
from backend.services.graph_service import GraphService
from backend.services.game_service import GameService
from backend.services.hint_service import HintService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


# ── Dépendances ───────────────────────────────────────────────────────────────

def _get_graph_service() -> GraphService:
    from backend.main import app
    return app.state.graph_service


def _get_game_service() -> GameService:
    from backend.main import app
    return app.state.game_service


def _get_hint_service() -> HintService:
    from backend.main import app
    return app.state.hint_service


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/countries")
def get_countries(
    gs: GraphService = Depends(_get_graph_service),
):
    """Renvoie la liste des pays disponibles pour le filtrage, dérivée du graphe en mémoire."""
    return gs.get_countries()


@router.post("/game/start")
def start_game(
    req: GameStartRequest,
    game_svc: GameService = Depends(_get_game_service),
):
    """Génère une nouvelle route et renvoie l'artiste de départ et la cible."""
    result = game_svc.find_route(
        min_followers=req.min_followers,
        country=req.country,
        min_range=req.min_range,
        max_range=req.max_range,
    )
    if not result:
        raise HTTPException(
            status_code=400,
            detail="Impossible de trouver une paire d'artistes. Essayez d'élargir les critères.",
        )

    source_id, target_id, dist, _ = result
    gs = game_svc.gs
    source = gs.get_artist(source_id)
    target = gs.get_artist(target_id)
    return {
        "source": {
            "id": source_id,
            "name": source.get('name', '?'),
            "followers": source.get('followers', 0),
        },
        "target": {
            "id": target_id,
            "name": target.get('name', '?'),
            "followers": target.get('followers', 0),
        },
        "distance": dist,
        "max_followers": gs.max_followers,
        "min_followers": gs.min_followers,
    }


@router.get("/search")
def search_artists(
    q: str,
    gs: GraphService = Depends(_get_graph_service),
):
    """Autocomplétion : retourne les artistes dont le nom contient la requête."""
    return gs.search_artists(q)


@router.post("/game/guess")
def check_guess(
    req: GuessRequest,
    gs: GraphService = Depends(_get_graph_service),
):
    """Vérifie si l'artiste proposé a bien collaboré avec l'artiste actuel."""
    if not gs.get_artist(req.current_artist_id) or not gs.get_artist(req.guessed_artist_id):
        raise HTTPException(status_code=404, detail="Artiste introuvable.")

    is_linked = gs.is_linked(req.current_artist_id, req.guessed_artist_id)
    guessed = gs.get_artist(req.guessed_artist_id)
    return {
        "is_linked": is_linked,
        "guessed_artist": {
            "id":       req.guessed_artist_id,
            "name":     guessed.get("name", "?"),
            "followers": guessed.get("followers", 0),
        },
    }


@router.post("/game/hint")
def get_hint(
    req: HintRequest,
    hint_svc: HintService = Depends(_get_hint_service),
):
    """
    Retourne un indice calculé depuis l'artiste actuel vers la cible.
    Niveaux : 1=chars masqués, 2=initiales masquées, 3=nom complet+id (révélation).
    Les niveaux 1-2 ne révèlent jamais le nom réel de l'artiste.
    """
    if not hint_svc.gs.get_artist(req.current_artist_id):
        raise HTTPException(status_code=404, detail="Artiste actuel introuvable.")
    if not hint_svc.gs.get_artist(req.target_artist_id):
        raise HTTPException(status_code=404, detail="Artiste cible introuvable.")

    return hint_svc.get_hint(
        current_id=req.current_artist_id,
        target_id=req.target_artist_id,
        hint_level=req.hint_level,
    )


@router.get("/game/neighbors")
def get_neighbors(
    artist_id: str,
    gs: GraphService = Depends(_get_graph_service),
):
    """
    Retourne les voisins directs d'un artiste (collaborateurs),
    triés par followers décroissants, limités à 20.
    Utilisé en mode Easy pour afficher les collaborateurs cliquables.
    """
    if not gs.get_artist(artist_id):
        raise HTTPException(status_code=404, detail="Artiste introuvable.")
    return gs.get_neighbors(artist_id)


@router.get("/game/distance")
def get_distance(
    from_id: str,
    to_id: str,
    gs: GraphService = Depends(_get_graph_service),
):
    """
    Retourne la distance BFS (chemin le plus court) entre deux artistes.
    Utilisé en modes Easy et Normal pour afficher la distance restante.
    """
    if not gs.get_artist(from_id):
        raise HTTPException(status_code=404, detail="Artiste de départ introuvable.")
    if not gs.get_artist(to_id):
        raise HTTPException(status_code=404, detail="Artiste cible introuvable.")
    dist = gs.get_distance(from_id, to_id)
    return {"distance": dist}
