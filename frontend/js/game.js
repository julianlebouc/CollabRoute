/**
 * game.js — État et logique pure du jeu CollabRoute.
 *
 * Responsabilités :
 *  - Stocker l'état de la partie (artistes, chemin, distance)
 *  - Calculer le score (coups effectués + coût des indices)
 *  - Méthodes pures : pas de DOM, pas d'appels réseau
 *
 * Scoring :
 *  - Score de base = distance (nombre de coups optimaux)
 *  - Chaque coup au-delà du chemin optimal = −1 pt
 *  - Indices 1–2 = −0.5 pt chacun ; indice 3 (révélation) = −1 pt
 *  - Les coûts d'indices s'accumulent sur toute la partie
 *  - Pas de plancher : le score peut être négatif
 *
 * Dépendances : HintsModule (pour getCost() du tour en cours)
 * Expose un objet global `Game`.
 */

const Game = {
    // ── État de la partie ─────────────────────────────────────────────────────

    state: {
        sourceArtist:   null,  // { id: string, name: string }
        targetArtist:   null,  // { id: string, name: string }
        currentArtist:  null,  // { id: string, name: string }
        path:           [],    // [{ id, name }, ...] — historique des coups
        distance:       0,     // longueur du chemin optimal (nombre de coups min)
        totalHintCost:  0,     // coût cumulé des indices sur TOUTE la partie
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
        this.state.totalHintCost = 0;
    },

    /**
     * Réinitialise complètement l'état (retour au menu).
     */
    reset() {
        this.state = {
            sourceArtist:  null,
            targetArtist:  null,
            currentArtist: null,
            path:          [],
            distance:      0,
            totalHintCost: 0,
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
     * Calcule le score courant :
     *  score = distance − max(0, moves − distance) − totalHintCost
     * @returns {number}
     */
    computeScore() {
        const S     = this.state.distance || 0;
        const moves = Math.max(0, this.state.path.length - 1);
        const raw   = S - Math.max(0, moves - S);
        return raw - this.getTotalHintCost();
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
