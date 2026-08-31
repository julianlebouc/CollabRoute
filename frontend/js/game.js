/**
 * game.js — État et logique pure du jeu CollabRoute.
 *
 * Responsabilités :
 *  - Stocker l'état de la partie (artistes, chemin, distance)
 *  - Calculer le score et le multiplicateur d'obscurité
 *  - Méthodes pures : pas de DOM, pas d'appels réseau
 *
 * Scoring :
 *  - Score = distance × multiplicateur − coups en trop − coût des indices
 *  - Multiplicateur = issu de la moyenne des followers des artistes devinés (hors source),
 *    mappée linéairement depuis [minFollowers, maxFollowers] → [5.0, 1.0]
 *    • 5.0 pour un artiste au niveau minimum du dataset
 *    • 1.0 pour l'artiste le plus populaire du dataset
 *  - Indices 1–2 = −1 pt chacun ; indice 3 (révélation) = −2 pt
 *  - Les coûts d'indices s'accumulent sur toute la partie
 *  - Pas de plancher : le score peut être négatif
 *
 * Dépendances : HintsModule (pour getCost() du tour en cours)
 * Expose un objet global `Game`.
 */

const Game = {
    // ── État de la partie ─────────────────────────────────────────────────────

    state: {
        sourceArtist: null,  // { id: string, name: string, followers: number }
        targetArtist: null,  // { id: string, name: string, followers: number }
        currentArtist: null,  // { id: string, name: string, followers: number }
        path: [],    // [{ id, name, followers }, ...] — historique des coups
        distance: 0,     // longueur du chemin optimal INITIAL (ne change pas, utilisé pour le score)
        currentDistance: 0,  // distance BFS restante depuis la position courante jusqu'à la cible
        maxFollowers: 0,     // valeur maximum dans le dataset (borne haute)
        minFollowers: 0,     // valeur minimum dans le dataset (borne basse)
        totalHintCost: 0,     // coût cumulé des indices sur TOUTE la partie
    },

    // ── Initialisation / Reset ────────────────────────────────────────────────

    /**
     * Initialise l'état pour une nouvelle partie.
     * @param {{ source, target, distance, max_followers }} data — réponse de Api.startGame
     */
    init(data) {
        this.state.sourceArtist = data.source;
        this.state.targetArtist = data.target;
        this.state.currentArtist = data.source;
        this.state.distance = data.distance;
        this.state.currentDistance = data.distance;  // starts equal to initial distance
        this.state.maxFollowers = data.max_followers || 0;
        this.state.minFollowers = data.min_followers || 0;
        this.state.path = [data.source];
        this.state.totalHintCost = 0;
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
            currentDistance: 0,
            maxFollowers: 0,
            minFollowers: 0,
            totalHintCost: 0,
        };
    },

    // ── Mécanique de jeu ──────────────────────────────────────────────────────

    /**
     * Enregistre un coup correct : avance vers l'artiste suivant.
     * @param {{ id: string, name: string, followers: number }} artist
     */
    advanceTo(artist) {
        this.state.path.push(artist);
        this.state.currentArtist = artist;
    },

    /**
     * Met à jour la distance BFS restante depuis la position courante.
     * Appelé par app.js après chaque coup correct, depuis la réponse de l'API.
     * @param {number} d
     */
    setCurrentDistance(d) {
        this.state.currentDistance = d;
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
     * Archive le coût d'indices du tour courant dans totalHintCost,
     * AVANT d'appeler HintsModule.reset().
     * Doit être appelé par app.js lors de chaque bonne réponse.
     */
    commitHintCost() {
        if (typeof HintsModule !== 'undefined') {
            this.state.totalHintCost += HintsModule.getCost();
        }
    },

    /**
     * Retourne le coût total des indices sur toute la partie
     * (tours archivés + tour en cours).
     * @returns {number}
     */
    getTotalHintCost() {
        const currentTurnCost = (typeof HintsModule !== 'undefined') ? HintsModule.getCost() : 0;
        return this.state.totalHintCost + currentTurnCost;
    },

    /**
     * Calcule le multiplicateur d'obscurité à partir des artistes devinés
     * par le joueur (tous sauf la source, qui est choisie par le système).
     *
     * Algorithme :
     *   1. Calcule la moyenne des followers des artistes devinés
     *   2. Mappe en ESPACE LOGARITHMIQUE depuis [minFollowers, maxFollowers]
     *      vers [5.0, 1.0]  (courbe qui monte vite pour les artistes connus)
     *
     *   t          = log(avg+1 − log(min+1)) / (log(max+1) − log(min+1))
     *   multiplier = 5.0 − t × 4.0
     *
     *   → 2 M followers sur 50 M max ≈ ×2.2 (au lieu de ×4.8 en linéaire)
     *   → artiste vraiment obscur             ≈ ×4.5
     *
     * @returns {number} Arrondi à 2 décimales
     */
    computeObscurityMultiplier() {
        const guessed = this.state.path.slice(1); // exclut la source
        if (!guessed.length) return 1.0;

        const minF = this.state.minFollowers;
        const maxF = this.state.maxFollowers;

        // Pas de plage valide → multiplicateur neutre
        if (maxF <= minF) return 1.0;

        // Moyenne des followers des artistes devinés
        const avgFollowers = guessed.reduce((sum, a) => {
            const f = (a.followers != null) ? a.followers : maxF;
            return sum + f;
        }, 0) / guessed.length;

        // Interpolation logarithmique : compresse le haut, étire le bas
        const logMin = Math.log(minF + 1);
        const logMax = Math.log(maxF + 1);
        const logAvg = Math.log(avgFollowers + 1);
        const t = Math.min(1, Math.max(0, (logAvg - logMin) / (logMax - logMin)));

        const multiplier = 5.0 - t * 4.0; // [5.0 … 1.0]

        return Math.round(multiplier * 100) / 100;
    },

    /**
     * Calcule le score courant :
     *  score = distance × multiplicateur − coups_en_trop − hintCost
     * @returns {number}
     */
    computeScore() {
        const S = this.state.distance || 0;
        const moves = Math.max(0, this.state.path.length - 1);
        const extraMoves = Math.max(0, moves - S);
        const multiplier = this.computeObscurityMultiplier();
        return S * multiplier - extraMoves - this.getTotalHintCost();
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
