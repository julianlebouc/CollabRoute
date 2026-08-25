/**
 * game.js — État et logique pure du jeu CollabRoute.
 *
 * Responsabilités :
 *  - Stocker l'état de la partie (artistes, chemin, distance)
 *  - Calculer le score (coups effectués + coût des indices)
 *  - Méthodes pures : pas de DOM, pas d'appels réseau
 *
 * Dépendances : HintsModule (pour getCost dans computeScore)
 * Expose un objet global `Game`.
 */

const Game = {
    // ── État de la partie ─────────────────────────────────────────────────────

    state: {
        sourceArtist: null,   // { id: string, name: string }
        targetArtist: null,   // { id: string, name: string }
        currentArtist: null,  // { id: string, name: string }
        path: [],             // [{ id, name }, ...] — historique des coups
        distance: 0,          // longueur du chemin optimal (nombre de coups min)
    },

    // ── Initialisation / Reset ────────────────────────────────────────────────

    /**
     * Initialise l'état pour une nouvelle partie.
     * @param {{ source, target, distance }} data — réponse de Api.startGame
     */
    init(data) {
        this.state.sourceArtist  = data.source;
        this.state.targetArtist  = data.target;
        this.state.currentArtist = data.source;
        this.state.distance      = data.distance;
        this.state.path          = [data.source];
    },

    /**
     * Réinitialise complètement l'état (retour au menu).
     */
    reset() {
        this.state = {
            sourceArtist: null,
            targetArtist: null,
            currentArtist: null,
            path: [],
            distance: 0,
        };
    },

    // ── Mécanique de jeu ──────────────────────────────────────────────────────

    /**
     * Enregistre un coup correct : avance vers l'artiste suivant.
     * @param {{ id: string, name: string }} artist
     */
    advanceTo(artist) {
        this.state.path.push(artist);
        this.state.currentArtist = artist;
    },

    /**
     * Indique si l'artiste donné est bien la cible finale.
     * @param {string} artistId
     * @returns {boolean}
     */
    isVictory(artistId) {
        return artistId === this.state.targetArtist?.id;
    },

    // ── Scoring ───────────────────────────────────────────────────────────────

    /**
     * Calcule le score courant :
     *  - Score de base = distance (coups optimaux)
     *  - Chaque coup au-delà de distance = -1 point
     *  - Coût cumulé des indices utilisés déduit
     *  - Minimum 0
     * @returns {number}
     */
    computeScore() {
        const S     = this.state.distance || 0;
        const moves = Math.max(0, this.state.path.length - 1);
        const hintCost = (typeof HintsModule !== 'undefined') ? HintsModule.getCost() : 0;
        const raw   = (moves <= S) ? S : S - (moves - S);
        return Math.max(0, raw - hintCost);
    },

    /**
     * Formate un score numérique pour l'affichage (supprime le .0 superflu).
     * @param {number} score
     * @returns {string}
     */
    formatScore(score) {
        return Number.isInteger(score) ? String(score) : score.toFixed(1);
    },
};
