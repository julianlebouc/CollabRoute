"""
hint_service.py — Calcul et formatage des indices.

Responsabilités :
  - Trouver le meilleur voisin (le plus proche de la cible depuis l'artiste actuel)
    via un seul BFS depuis la cible (efficace sur grand graphe)
  - Formater l'indice selon le niveau (1=genres, 2=chars masqués, 3=initiales, 4=révéler)
  - Garantir qu'aucune info permettant de tricher n'est exposée pour les niveaux 1-3
"""
import logging
from typing import Optional

import networkx as nx

from backend.services.graph_service import GraphService

logger = logging.getLogger(__name__)

# Coût en points déduit du score par niveau d'indice utilisé
HINT_COSTS = {1: 0.5, 2: 0.5, 3: 0.5, 4: 1.0}


class HintService:
    """Calcule les indices pour aider le joueur à trouver le prochain artiste."""

    def __init__(self, graph_service: GraphService):
        self.gs = graph_service

    # ── Méthodes privées ─────────────────────────────────────────────────────

    def _find_best_neighbor(self, current_id: str, target_id: str) -> Optional[str]:
        """
        Retourne l'ID du voisin direct de current_id le plus proche de target_id.

        Stratégie : un seul BFS depuis target_id (efficace vs. un BFS par voisin).
        """
        G = self.gs.G
        if current_id not in G or target_id not in G:
            return None

        neighbors = list(G.neighbors(current_id))
        if not neighbors:
            return None

        # Cas trivial : la cible est un voisin direct
        if target_id in neighbors:
            return target_id

        # BFS unique depuis la cible → distances vers tous les nœuds accessibles
        try:
            distances = nx.single_source_shortest_path_length(G, target_id, cutoff=20)
        except Exception:
            return None

        best = min(neighbors, key=lambda n: distances.get(n, float('inf')))
        return best if distances.get(best, float('inf')) < float('inf') else None

    def _format_genres(self, genres: list) -> str:
        """['nordic house', 'russelater'] → 'Nordic House, Russelater'"""
        return ", ".join(g.title() for g in genres) if genres else "Inconnu"

    def _mask_chars(self, name: str) -> str:
        """'Daft Punk' → '**** ****'"""
        return "".join("*" if c != " " else " " for c in name)

    def _mask_initials(self, name: str) -> str:
        """'Daft Punk' → 'D*** P***'"""
        result = []
        first_of_word = True
        for ch in name:
            if ch == " ":
                result.append(" ")
                first_of_word = True
            elif first_of_word:
                result.append(ch)
                first_of_word = False
            else:
                result.append("*")
        return "".join(result)

    # ── API publique ──────────────────────────────────────────────────────────

    def get_hint(self, current_id: str, target_id: str, hint_level: int) -> dict:
        """
        Calcule et retourne un indice structuré.

        Niveaux :
          1 — Genres musicaux (Title Case)
          2 — Nombre de caractères masqué (**** ****)
          3 — Initiales masquées (D*** P***)
          4 — Nom complet + ID (pour auto-guess côté client)

        Les niveaux 1-3 ne révèlent jamais le nom réel de l'artiste.
        """
        neighbor_id = self._find_best_neighbor(current_id, target_id)

        if neighbor_id is None:
            return {
                "hint": "Aucun chemin trouvé depuis cet artiste.",
                "hint_level": hint_level,
                "hint_cost": HINT_COSTS.get(hint_level, 0.5),
            }

        artist = self.gs.get_artist(neighbor_id)
        name = artist.get('name', 'Artiste inconnu')

        if hint_level == 1:
            hint_text = self._format_genres(artist.get('genres', []))
        elif hint_level == 2:
            hint_text = self._mask_chars(name)
        elif hint_level == 3:
            hint_text = self._mask_initials(name)
        elif hint_level == 4:
            # Niveau 4 : révélation complète — le client déclenche un auto-guess
            return {
                "hint": name,
                "hint_level": 4,
                "hint_cost": HINT_COSTS[4],
                "best_neighbor_id": neighbor_id,
            }
        else:
            hint_text = "Niveau d'indice invalide."

        return {
            "hint": hint_text,
            "hint_level": hint_level,
            "hint_cost": HINT_COSTS.get(hint_level, 0.5),
        }
