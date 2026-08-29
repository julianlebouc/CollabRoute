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
    return {
        "source": {"id": source_id, "name": gs.get_artist(source_id).get('name', '?')},
        "target": {"id": target_id, "name": gs.get_artist(target_id).get('name', '?')},
        "distance": dist,
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
    return {
        "is_linked": is_linked,
        "guessed_artist": {
            "id": req.guessed_artist_id,
            "name": gs.get_artist(req.guessed_artist_id).get("name", "?"),
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
