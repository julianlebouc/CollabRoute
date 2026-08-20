import logging
import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from backend.api.routes import router
from backend.services.graph_service import GraphService

# Configuration des logs standards
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="CollabRoute API")

# Ajout du middleware CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ajout des routes de l'API
app.include_router(router)

@app.on_event("startup")
def startup_event():
    """Initialise les ressources globales, au démarrage on charge le graphe."""
    logger.info("Initializing GraphService...")
    # Les chemins sont relatifs au dossier depuis lequel le serveur est lancé
    nodes_path = os.path.join("data", "nodes.csv")
    edges_path = os.path.join("data", "edges.csv")
    
    # On stocke le service dans app.state pour l'injection de dépendances
    app.state.graph_service = GraphService(nodes_path=nodes_path, edges_path=edges_path)
    logger.info("GraphService initialized successfully.")

# On sert les fichiers statiques (le frontend) à la fin pour éviter que ça bloque les routes de l'API
# Ça monte le dossier 'frontend' sur la racine du site
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
