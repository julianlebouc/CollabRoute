import pandas as pd
import networkx as nx
import ast
import random
import re
import logging
from typing import Set, Tuple, List, Optional, Dict

logger = logging.getLogger(__name__)

class GraphService:
    """Service qui gère le chargement du graphe et la logique de recherche de chemin."""
    
    def __init__(self, nodes_path: str, edges_path: str):
        self.nodes_path = nodes_path
        self.edges_path = edges_path
        self.G = nx.Graph()
        self.nodes_data: Dict[str, dict] = {}
        self.artists_list: List[dict] = []
        self._load_data()

    def _extract_countries(self, hits_str: str) -> Set[str]:
        """Parse la chaîne chart_hits de manière sécurisée pour récupérer les codes pays."""
        if pd.isna(hits_str):
            return set()
        try:
            hits_list = ast.literal_eval(hits_str)
            countries = set()
            if isinstance(hits_list, list):
                for hit in hits_list:
                    match = re.match(r'^([a-z]+)\s*\(', str(hit))
                    if match:
                        countries.add(match.group(1))
            return countries
        except (ValueError, SyntaxError):
            return set()

    def _load_data(self):
        """Charge les données des CSV dans le graphe NetworkX et en mémoire."""
        logger.info("Loading nodes...")
        try:
            nodes_df = pd.read_csv(self.nodes_path)
        except Exception as e:
            logger.error(f"Failed to read nodes: {e}")
            raise
            
        nodes_df['hit_countries'] = nodes_df['chart_hits'].apply(self._extract_countries)
        
        logger.info("Building graph nodes...")
        nodes_to_add = []
        for _, row in nodes_df.iterrows():
            pop = row['popularity']
            if pd.isna(pop): pop = 0
            
            node_attr = {
                'name': row['name'],
                'popularity': float(pop) if not pd.isna(pop) else 0.0,
                'hit_countries': row['hit_countries'],
            }
            nodes_to_add.append((row['spotify_id'], node_attr))
            self.nodes_data[row['spotify_id']] = node_attr
            
            if pd.notna(row['name']):
                self.artists_list.append({
                    'id': row['spotify_id'],
                    'name': str(row['name']),
                    'popularity': float(pop)
                })
                
        self.G.add_nodes_from(nodes_to_add)
        
        logger.info("Loading edges...")
        try:
            edges_df = pd.read_csv(self.edges_path)
            edges = list(zip(edges_df['id_0'], edges_df['id_1']))
            self.G.add_edges_from(edges)
        except Exception as e:
            logger.error(f"Failed to load edges: {e}")
            raise
        
        # On trie pour avoir les résultats de recherche les plus pertinents en premier
        self.artists_list.sort(key=lambda x: x['popularity'], reverse=True)
        logger.info(f"Graph ready. Nodes: {self.G.number_of_nodes()}, Edges: {self.G.number_of_edges()}")

    def find_route(self, min_popularity: int, country: Optional[str], min_range: int, max_range: int) -> Optional[Tuple[str, str, int, List[str]]]:
        """Trouve une route valide qui correspond à tous les critères."""
        min_dist = min_range + 1
        max_dist = max_range + 1
        target_countries = set([country.lower()]) if country and country != "any" else set()
        
        # Filtrage des candidats potentiels
        candidate_nodes = set()
        for node, data in self.G.nodes(data=True):
            popularity = data.get('popularity', 0)
            hit_countries = data.get('hit_countries', set())
            
            if popularity >= min_popularity and (not target_countries or bool(target_countries & hit_countries)):
                candidate_nodes.add(node)
                
        if len(candidate_nodes) < 2:
            return None
            
        candidate_list = list(candidate_nodes)
        random.shuffle(candidate_list)
        
        attempts = min(100, len(candidate_list))
        for i in range(attempts):
            source = candidate_list[i]
            # On utilise un BFS (parcours en largeur) limité pour ne pas parcourir tout le graphe
            paths = nx.single_source_shortest_path(self.G, source, cutoff=max_dist)
            
            valid_targets = []
            for target, path in paths.items():
                dist = len(path) - 1
                if target != source and min_dist <= dist <= max_dist and target in candidate_nodes:
                    valid_targets.append((target, dist, path))
                    
            if valid_targets:
                chosen_target, chosen_dist, chosen_path = random.choice(valid_targets)
                return source, chosen_target, chosen_dist, chosen_path
                
        return None

    def search_artists(self, query: str, limit: int = 10) -> List[dict]:
        """Recherche des artistes par nom."""
        if not query:
            return []
        q_lower = query.lower()
        results = []
        for artist in self.artists_list:
            if q_lower in artist['name'].lower():
                results.append(artist)
                if len(results) >= limit:
                    break
        return results

    def is_linked(self, id1: str, id2: str) -> bool:
        """Vérifie s'il y a un lien (une arête) entre deux nœuds."""
        if id1 not in self.G or id2 not in self.G:
            return False
        return self.G.has_edge(id1, id2)
        
    def get_artist(self, artist_id: str) -> dict:
        """Récupère les données d'un artiste grâce à son ID."""
        return self.nodes_data.get(artist_id, {})
