from pydantic import BaseModel, Field
from typing import Optional


class GameStartRequest(BaseModel):
    """Paramètres d'initialisation d'une nouvelle partie."""
    country: Optional[str] = Field(default=None, description="Code pays pour filtrer, ou 'any'")
    min_followers: int = Field(default=100_000, ge=0, description="Nombre minimum de followers Deezer")
    min_range: int = Field(default=1, ge=1, le=10, description="Nombre minimum de liens (coups)")
    max_range: int = Field(default=10, ge=1, le=10, description="Nombre maximum de liens (coups)")


class GuessRequest(BaseModel):
    """Données envoyées quand le joueur propose un artiste."""
    current_artist_id: str = Field(..., description="ID Deezer de l'artiste actuel dans le chemin")
    guessed_artist_id: str = Field(..., description="ID Deezer de l'artiste proposé")


class HintRequest(BaseModel):
    """Données envoyées pour demander un indice."""
    current_artist_id: str = Field(..., description="ID Deezer de l'artiste actuel dans le chemin")
    target_artist_id: str = Field(..., description="ID Deezer de l'artiste cible à atteindre")
    hint_level: int = Field(..., ge=1, le=3, description="Niveau d'indice : 1=chars masqués, 2=initiales, 3=révéler")
