/**
 * api.js — Couche d'accès à l'API CollabRoute.
 *
 * Toutes les requêtes HTTP passent par ce fichier.
 * Aucun état, aucune manipulation DOM ici.
 * Expose un objet global `Api`.
 */

const API_BASE = '/api';

/**
 * Wrapper fetch avec gestion unifiée des erreurs.
 * @param {string} endpoint - ex: '/countries'
 * @param {RequestInit} options
 * @returns {Promise<any>}
 */
async function _apiFetch(endpoint, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new Error(data.detail || `Erreur serveur (${res.status})`);
    }
    return data;
}

const Api = {
    /**
     * Récupère la liste des pays disponibles.
     * @returns {Promise<string[]>}
     */
    getCountries() {
        return _apiFetch('/countries');
    },

    /**
     * Démarre une nouvelle partie avec les paramètres donnés.
     * @param {{ country: string, min_followers: number, min_range: number, max_range: number }} params
     * @returns {Promise<{ source, target, distance }>}
     */
    startGame(params) {
        return _apiFetch('/game/start', {
            method: 'POST',
            body: JSON.stringify(params),
        });
    },

    /**
     * Recherche des artistes pour l'autocomplétion.
     * @param {string} query
     * @returns {Promise<{ id, name, followers }[]>}
     */
    searchArtists(query) {
        return _apiFetch(`/search?q=${encodeURIComponent(query)}`);
    },

    /**
     * Valide si deux artistes ont collaboré.
     * @param {string} currentArtistId
     * @param {string} guessedArtistId
     * @returns {Promise<{ is_linked: boolean, guessed_artist: { id, name } }>}
     */
    checkGuess(currentArtistId, guessedArtistId) {
        return _apiFetch('/game/guess', {
            method: 'POST',
            body: JSON.stringify({
                current_artist_id: currentArtistId,
                guessed_artist_id: guessedArtistId,
            }),
        });
    },

    /**
     * Demande un indice calculé côté serveur.
     * @param {string} currentArtistId
     * @param {string} targetArtistId
     * @param {1|2|3|4} hintLevel
     * @returns {Promise<{ hint: string, hint_level: number, hint_cost: number, best_neighbor_id?: string }>}
     */
    getHint(currentArtistId, targetArtistId, hintLevel) {
        return _apiFetch('/game/hint', {
            method: 'POST',
            body: JSON.stringify({
                current_artist_id: currentArtistId,
                target_artist_id: targetArtistId,
                hint_level: hintLevel,
            }),
        });
    },
};
