from pydantic import BaseModel, Field
from typing import Optional

class GameStartRequest(BaseModel):
    """Modèle des données envoyées pour démarrer une partie."""
    country: Optional[str] = Field(default=None, description="Code pays pour filtrer, ou 'any'")
    min_popularity: int = Field(default=0, ge=0, le=100, description="Score de popularité minimum (0-100)")
    min_range: int = Field(default=1, ge=1, le=10, description="Nombre minimum d'artistes intermédiaires")
    max_range: int = Field(default=10, ge=1, le=10, description="Nombre maximum d'artistes intermédiaires")

class GuessRequest(BaseModel):
    """Modèle des données envoyées quand le joueur devine un artiste."""
    current_artist_id: str = Field(..., description="ID Spotify de l'artiste actuel dans le chemin")
    guessed_artist_id: str = Field(..., description="ID Spotify de l'artiste deviné (le featuring potentiel)")
