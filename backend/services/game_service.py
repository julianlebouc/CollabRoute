"""
game_service.py — Logique de recherche de route (BFS).

Responsabilités :
  - Trouver une paire source/cible valide selon les critères de filtrage
  - Utilise le graphe de GraphService pour les parcours BFS
  - Ne contient PAS de logique d'affichage ni de calcul d'indices
"""
import logging
import random
from typing import List, Optional, Tuple

import networkx as nx

from backend.services.graph_service import GraphService

logger = logging.getLogger(__name__)


class GameService:
    """Gère la logique de génération de partie : sélection et validation des routes."""

    def __init__(self, graph_service: GraphService):
        self.gs = graph_service

    def find_route(
        self,
        min_popularity: int,
        country: Optional[str],
        min_range: int,
        max_range: int,
    ) -> Optional[Tuple[str, str, int, List[str]]]:
        """
        Cherche une paire (source, cible) avec un chemin de longueur dans
        [min_range+1, max_range+1], filtrée par popularité et pays.

        Retourne (source_id, target_id, distance, path_ids) ou None.
        """
        G = self.gs.G
        min_dist = min_range + 1
        max_dist = max_range + 1
        target_countries = {country.lower()} if country and country != "any" else set()

        # Filtrage des candidats selon popularité et pays de classement
        candidates = {
            node
            for node, data in G.nodes(data=True)
            if data.get('popularity', 0) >= min_popularity
            and (not target_countries or bool(target_countries & data.get('hit_countries', set())))
        }

        if len(candidates) < 2:
            return None

        candidate_list = list(candidates)
        random.shuffle(candidate_list)

        for source in candidate_list[:min(100, len(candidate_list))]:
            paths = nx.single_source_shortest_path(G, source, cutoff=max_dist)
            valid = [
                (target, len(path) - 1, path)
                for target, path in paths.items()
                if target != source
                and min_dist <= len(path) - 1 <= max_dist
                and target in candidates
            ]
            if valid:
                target_id, dist, path = random.choice(valid)
                path_names = [self.gs.get_artist(n).get('name', '?') for n in path]
                logger.info(f"Route (d={dist}): {' → '.join(path_names)}")
                return source, target_id, dist, path

        return None
