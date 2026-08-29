"""
graph_service.py — Chargement du graphe et requêtes de base.

Responsabilités :
  - Lire les CSV (nodes, edges) et construire le graphe NetworkX en mémoire
  - Exposer des requêtes atomiques : get_artist, is_linked, search_artists
  - Ne contient PAS de logique de jeu ni de calcul d'indices

Format attendu du CSV nodes :
  artist_id, name, followers, link, country
"""
import logging
from typing import Dict, List, Optional

import networkx as nx
import pandas as pd

logger = logging.getLogger(__name__)


class GraphService:
    """Gère le graphe des artistes : chargement, indexation et requêtes de base."""

    def __init__(self, nodes_path: str, edges_path: str):
        self.G: nx.Graph = nx.Graph()
        self.nodes_data: Dict[str, dict] = {}
        self.artists_list: List[dict] = []
        self.max_followers: int = 0
        self.min_followers: int = 0
        self._load(nodes_path, edges_path)

    # ── Chargement ────────────────────────────────────────────────────────────

    def _load(self, nodes_path: str, edges_path: str):
        """Charge les CSV dans le graphe NetworkX et les structures en mémoire."""
        logger.info("Loading nodes CSV...")
        nodes_df = pd.read_csv(nodes_path)

        nodes_to_add = []
        max_followers = 0
        min_followers = None

        for _, row in nodes_df.iterrows():
            artist_id  = str(row['artist_id'])
            followers  = int(row['followers']) if pd.notna(row['followers']) else 0
            country    = str(row['country']).strip().upper() if pd.notna(row['country']) else ''
            max_followers = max(max_followers, followers)
            if followers > 0:
                min_followers = followers if min_followers is None else min(min_followers, followers)

            attr = {
                'name':      str(row['name']),
                'followers': followers,
                'country':   country,
            }
            nodes_to_add.append((artist_id, attr))
            self.nodes_data[artist_id] = attr

            if pd.notna(row['name']):
                self.artists_list.append({
                    'id':        artist_id,
                    'name':      str(row['name']),
                    'followers': followers,
                })

        self.max_followers = max_followers
        self.min_followers = min_followers or 0
        self.G.add_nodes_from(nodes_to_add)

        logger.info("Loading edges CSV...")
        edges_df = pd.read_csv(edges_path)
        self.G.add_edges_from(
            (str(r['id_0']), str(r['id_1'])) for _, r in edges_df.iterrows()
        )

        self.artists_list.sort(key=lambda x: x['followers'], reverse=True)
        logger.info(
            f"Graph ready: {self.G.number_of_nodes()} nodes, "
            f"{self.G.number_of_edges()} edges"
        )

    # ── Requêtes publiques ────────────────────────────────────────────────────

    def get_artist(self, artist_id: str) -> dict:
        """Retourne les données d'un artiste par son ID."""
        return self.nodes_data.get(artist_id, {})

    def get_countries(self) -> List[str]:
        """Retourne la liste triée des codes pays présents dans le graphe."""
        return sorted({
            data['country']
            for data in self.nodes_data.values()
            if data.get('country')
        })

    def is_linked(self, id1: str, id2: str) -> bool:
        """Vérifie qu'il existe une arête directe entre deux artistes."""
        return id1 in self.G and id2 in self.G and self.G.has_edge(id1, id2)

    def search_artists(self, query: str, limit: int = 10) -> List[dict]:
        """Recherche des artistes par nom (insensible à la casse)."""
        if not query:
            return []
        q = query.lower()
        return [a for a in self.artists_list if q in a['name'].lower()][:limit]
