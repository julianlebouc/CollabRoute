"""
graph_service.py — Chargement du graphe et requêtes de base.

Responsabilités :
  - Lire les CSV (nodes, edges) et construire le graphe NetworkX en mémoire
  - Exposer des requêtes atomiques : get_artist, is_linked, search_artists
  - Ne contient PAS de logique de jeu ni de calcul d'indices
"""
import ast
import logging
import re
from typing import Dict, List, Optional, Set

import networkx as nx
import pandas as pd

logger = logging.getLogger(__name__)


class GraphService:
    """Gère le graphe des artistes : chargement, indexation et requêtes de base."""

    def __init__(self, nodes_path: str, edges_path: str):
        self.G: nx.Graph = nx.Graph()
        self.nodes_data: Dict[str, dict] = {}
        self.artists_list: List[dict] = []
        self._load(nodes_path, edges_path)

    # ── Chargement ────────────────────────────────────────────────────────────

    def _extract_countries(self, hits_str) -> Set[str]:
        """Parse la chaîne chart_hits pour extraire les codes pays."""
        if pd.isna(hits_str):
            return set()
        try:
            hits = ast.literal_eval(hits_str)
            countries = set()
            if isinstance(hits, list):
                for h in hits:
                    m = re.match(r'^([a-z]+)\s*\(', str(h))
                    if m:
                        countries.add(m.group(1))
            return countries
        except (ValueError, SyntaxError):
            return set()

    def _parse_genres(self, genres_raw) -> List[str]:
        """Parse la colonne genres en liste de strings propres."""
        try:
            if pd.isna(genres_raw):
                return []
        except (TypeError, ValueError):
            pass
        try:
            parsed = ast.literal_eval(str(genres_raw))
            if isinstance(parsed, list):
                return [str(g).strip() for g in parsed if g]
        except (ValueError, SyntaxError):
            pass
        return []

    def _load(self, nodes_path: str, edges_path: str):
        """Charge les CSV dans le graphe NetworkX et les structures en mémoire."""
        logger.info("Loading nodes CSV...")
        nodes_df = pd.read_csv(nodes_path)
        nodes_df['hit_countries'] = nodes_df['chart_hits'].apply(self._extract_countries)

        has_genres = 'genres' in nodes_df.columns
        nodes_to_add = []

        for _, row in nodes_df.iterrows():
            pop = float(row['popularity']) if pd.notna(row['popularity']) else 0.0
            attr = {
                'name': row['name'],
                'popularity': pop,
                'hit_countries': row['hit_countries'],
                'genres': self._parse_genres(row['genres']) if has_genres else [],
            }
            nodes_to_add.append((row['spotify_id'], attr))
            self.nodes_data[row['spotify_id']] = attr

            if pd.notna(row['name']):
                self.artists_list.append({
                    'id': row['spotify_id'],
                    'name': str(row['name']),
                    'popularity': pop,
                })

        self.G.add_nodes_from(nodes_to_add)

        logger.info("Loading edges CSV...")
        edges_df = pd.read_csv(edges_path)
        self.G.add_edges_from(zip(edges_df['id_0'], edges_df['id_1']))

        self.artists_list.sort(key=lambda x: x['popularity'], reverse=True)
        logger.info(f"Graph ready: {self.G.number_of_nodes()} nodes, {self.G.number_of_edges()} edges")

    # ── Requêtes publiques ────────────────────────────────────────────────────

    def get_artist(self, artist_id: str) -> dict:
        """Retourne les données d'un artiste par son ID."""
        return self.nodes_data.get(artist_id, {})

    def is_linked(self, id1: str, id2: str) -> bool:
        """Vérifie qu'il existe une arête directe entre deux artistes."""
        return id1 in self.G and id2 in self.G and self.G.has_edge(id1, id2)

    def search_artists(self, query: str, limit: int = 10) -> List[dict]:
        """Recherche des artistes par nom (insensible à la casse)."""
        if not query:
            return []
        q = query.lower()
        return [a for a in self.artists_list if q in a['name'].lower()][:limit]
