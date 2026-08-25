"""
main.py — Point d'entrée de l'application FastAPI CollabRoute.

Responsabilités :
  - Créer l'app FastAPI et configurer les middlewares
  - Initialiser tous les services au démarrage (graphe, jeu, indices)
  - Servir le frontend statique
"""
import logging
import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import router
from backend.services.graph_service import GraphService
from backend.services.game_service import GameService
from backend.services.hint_service import HintService

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(name)s - %(message)s',
)
logger = logging.getLogger(__name__)

app = FastAPI(title="CollabRoute API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.on_event("startup")
def startup_event():
    """Initialise tous les services au démarrage du serveur."""
    logger.info("Initializing services...")

    nodes_path = os.path.join("data", "nodes.csv")
    edges_path = os.path.join("data", "edges.csv")

    graph_service = GraphService(nodes_path=nodes_path, edges_path=edges_path)
    app.state.graph_service = graph_service
    app.state.game_service = GameService(graph_service)
    app.state.hint_service = HintService(graph_service)

    logger.info("All services initialized successfully.")


# Le frontend est servi en dernier pour ne pas écraser les routes API
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
