/**
 * app.js — Point d'entrée et orchestrateur de CollabRoute.
 *
 * Responsabilités :
 *  - Initialisation de l'application (pays, events, modules)
 *  - Gestion des écrans (setup / jeu)
 *  - Listeners du formulaire de configuration et des sliders
 *  - Sélection du mode de jeu (easy / normal / hard)
 *  - Autocomplétion de la recherche (debounce + dropdown)
 *  - Mode Easy : grille de collaborateurs cliquables
 *  - Gestion du flux de jeu : soumission guess → correct/incorrect → victoire
 *  - Rendu DOM du chemin (timeline avec slots fixes + target ancré)
 *  - Auto-finish : quand le joueur atteint un voisin direct de la cible
 *
 * Dépendances (chargées avant dans HTML) : Api, Game, HintsModule
 */

// ── Références DOM — Configuration ────────────────────────────────────────────

const screens = {
    setup: document.getElementById('setup-screen'),
    game: document.getElementById('game-screen'),
};

const setupForm = document.getElementById('setup-form');
const countrySelect = document.getElementById('country');
const followersSlider = document.getElementById('min-followers');
const followersValue = document.getElementById('followers-value');
const minRangeSlider = document.getElementById('min-range');
const minRangeValue = document.getElementById('min-range-value');
const maxRangeSlider = document.getElementById('max-range');
const maxRangeValue = document.getElementById('max-range-value');
const startBtn = document.getElementById('start-btn');
const setupError = document.getElementById('setup-error');
const difficultyInput = document.getElementById('difficulty-input');
const difficultyCards = document.querySelectorAll('.difficulty-card');

// ── Références DOM — Jeu ──────────────────────────────────────────────────────

const scoreValueEl = document.getElementById('score-value');
const distanceContainer = document.getElementById('distance-container');
const distanceValueEl = document.getElementById('distance-value');
const modeBadgeEl = document.getElementById('mode-badge');
const pathContainer = document.getElementById('path-container');
const searchInput = document.getElementById('artist-search');
const searchResults = document.getElementById('search-results');
const searchWrapperSection = document.getElementById('search-wrapper-section');
const collaboratorsSection = document.getElementById('collaborators-section');
const collaboratorsGrid = document.getElementById('collaborators-grid');
const guessFeedback = document.getElementById('guess-feedback');
const resetBtn = document.getElementById('reset-btn');
const victoryModal = document.getElementById('victory-modal');
const finalScoreEl = document.getElementById('final-score');
const playAgainBtn = document.getElementById('play-again-btn');

// ── État du mode de jeu ───────────────────────────────────────────────────────

/** @type {'easy'|'normal'|'hard'} */
let _difficulty = 'easy';

// ── Accesseurs exposés pour hints.js ──────────────────────────────────────────

window._getCurrentArtistId = () => Game.state.currentArtist?.id ?? null;
window._getTargetArtistId = () => Game.state.targetArtist?.id ?? null;
window._onScoreUpdate = () => _updateScore();

// ── Initialisation ────────────────────────────────────────────────────────────

async function init() {
    await _loadCountries();
    _setupFormListeners();
    _setupDifficultyCards();
    _setupGameListeners();
    HintsModule.init(_handleAutoGuess, _difficulty);
}

async function _loadCountries() {
    try {
        const countries = await Api.getCountries();
        countries.forEach(code => {
            const opt = document.createElement('option');
            opt.value = code;
            opt.textContent = code.toUpperCase();
            countrySelect.appendChild(opt);
        });
    } catch (err) {
        console.error("Erreur chargement pays:", err);
    }
}

// ── Écouteurs — Difficulté ─────────────────────────────────────────────────────

function _setupDifficultyCards() {
    difficultyCards.forEach(card => {
        card.addEventListener('click', () => {
            // Retirer la sélection courante
            difficultyCards.forEach(c => {
                c.classList.remove('difficulty-card--selected');
                c.setAttribute('aria-checked', 'false');
            });
            // Appliquer la nouvelle sélection
            card.classList.add('difficulty-card--selected');
            card.setAttribute('aria-checked', 'true');
            _difficulty = card.dataset.difficulty;
            difficultyInput.value = _difficulty;
        });
    });
}

// ── Écouteurs — Formulaire de configuration ────────────────────────────────────

function _setupFormListeners() {
    followersSlider.addEventListener('input', (e) => {
        followersValue.textContent = _formatFollowers(parseInt(e.target.value));
    });

    minRangeSlider.addEventListener('input', (e) => {
        minRangeValue.textContent = e.target.value;
        if (parseInt(maxRangeSlider.value) < parseInt(e.target.value)) {
            maxRangeSlider.value = maxRangeValue.textContent = e.target.value;
        }
    });

    maxRangeSlider.addEventListener('input', (e) => {
        maxRangeValue.textContent = e.target.value;
        if (parseInt(minRangeSlider.value) > parseInt(e.target.value)) {
            minRangeSlider.value = minRangeValue.textContent = e.target.value;
        }
    });

    setupForm.addEventListener('submit', _handleStartGame);
}

// ── Écouteurs — Jeu ────────────────────────────────────────────────────────────

function _setupGameListeners() {
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const q = e.target.value.trim();
        if (q.length < 2) { _hideDropdown(); return; }
        searchTimeout = setTimeout(() => _performSearch(q), 300);
    });

    // Ferme le dropdown si clic en dehors
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            _hideDropdown();
        }
    });

    resetBtn.addEventListener('click', _resetGame);
    playAgainBtn.addEventListener('click', _resetGame);
}

// ── Navigation ─────────────────────────────────────────────────────────────────

function _setScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

// ── Démarrage de partie ────────────────────────────────────────────────────────

async function _handleStartGame(e) {
    e.preventDefault();
    setupError.textContent = '';

    const btnText = startBtn.querySelector('.btn-text');
    const loader = startBtn.querySelector('.loader');
    btnText.classList.add('hidden');
    loader.classList.remove('hidden');
    startBtn.disabled = true;

    const fd = new FormData(setupForm);
    try {
        const data = await Api.startGame({
            country: fd.get('country'),
            min_followers: parseInt(fd.get('min_followers')),
            min_range: parseInt(fd.get('min_range')),
            max_range: parseInt(fd.get('max_range')),
        });

        // Synchronise la difficulté depuis le champ caché (robustesse)
        _difficulty = fd.get('difficulty') || _difficulty;

        Game.init(data);
        // Ré-initialise HintsModule avec la difficulté choisie
        HintsModule.init(_handleAutoGuess, _difficulty);
        _setupGameUI();
        _setScreen('game');

    } catch (err) {
        setupError.textContent = err.message;
    } finally {
        btnText.classList.remove('hidden');
        loader.classList.add('hidden');
        startBtn.disabled = false;
    }
}

function _setupGameUI() {
    // Badge de mode
    const modeLabels = { easy: 'Facile', normal: 'Normal', hard: 'Difficile' };
    modeBadgeEl.textContent = modeLabels[_difficulty] || _difficulty;

    // La distance est maintenant affichée visuellement dans la timeline du chemin
    distanceContainer.style.display = 'none';

    // Affichage de l'interface de saisie selon le mode
    if (_difficulty === 'easy') {
        searchWrapperSection.classList.add('hidden');
        collaboratorsSection.classList.remove('hidden');
    } else {
        searchWrapperSection.classList.remove('hidden');
        collaboratorsSection.classList.add('hidden');
        searchInput.value = '';
        searchInput.disabled = false;
    }

    guessFeedback.textContent = '';
    guessFeedback.className = 'feedback-msg';
    victoryModal.classList.add('hidden');
    HintsModule.reset();
    _renderPath();

    // If the target is already a direct neighbor at game start, auto-finish immediately
    if (Game.state.distance === 1) {
        setTimeout(() => _autoFinish(), 800);
        return;
    }

    if (_difficulty === 'easy') {
        _loadCollaborators();
    } else {
        searchInput.focus();
    }
}

// ── Mode Easy : collaborateurs ─────────────────────────────────────────────────

async function _loadCollaborators() {
    const currentId = Game.state.currentArtist?.id;
    if (!currentId) return;

    collaboratorsGrid.innerHTML = '<span class="collaborators-loading">Chargement…</span>';

    try {
        const neighbors = await Api.getNeighbors(currentId);
        _renderCollaborators(neighbors);
    } catch (err) {
        collaboratorsGrid.innerHTML = `<span class="collaborators-error">${err.message}</span>`;
    }
}

function _renderCollaborators(neighbors) {
    collaboratorsGrid.innerHTML = '';
    const targetId = Game.state.targetArtist?.id;
    // Exclude target from the grid — the game auto-finishes when it is a direct neighbor
    const visible = neighbors.filter(a => a.id !== targetId);
    if (!visible.length) {
        collaboratorsGrid.innerHTML = '<span class="collaborators-empty">Aucun collaborateur trouvé.</span>';
        return;
    }
    visible.forEach(artist => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'collaborator-card';
        btn.textContent = artist.name;
        btn.addEventListener('click', () => _handleGuess(artist));
        collaboratorsGrid.appendChild(btn);
    });
}

// ── Distance live ──────────────────────────────────────────────────────────────

async function _updateDistance() {
    if (_difficulty === 'hard') return;
    const currentId = Game.state.currentArtist?.id;
    const targetId = Game.state.targetArtist?.id;
    if (!currentId || !targetId) return;

    try {
        const { distance } = await Api.getDistance(currentId, targetId);
        distanceValueEl.textContent = distance != null ? `${distance}` : '?';
    } catch {
        distanceValueEl.textContent = '?';
    }
}

// ── Rendu ──────────────────────────────────────────────────────────────────────

/**
 * Rendu du chemin avec slots calculés dynamiquement.
 *
 * Modes :
 *  - Easy / Normal : totalSlots = path.length + currentDistance
 *    Le nombre de placeholders « … » reflète le BFS restant depuis la position courante.
 *    Il augmente si le joueur prend un détour.
 *  - Hard : pas de placeholders intermédiaires — juste les nœuds visités + la cible.
 *
 * Cas terminal (isFinished) :
 *    La cible est déjà dans path[] (auto-finish) ; on ne rajoute PAS de slot supplémentaire
 *    pour éviter l'affichage en double.
 */
function _renderPath() {
    pathContainer.innerHTML = '';
    const { path, targetArtist, currentDistance } = Game.state;

    // La cible est-elle déjà le dernier élément du chemin ? (après un auto-finish)
    const isFinished = path.length > 0 && path[path.length - 1]?.id === targetArtist?.id;

    let totalSlots;
    if (isFinished) {
        // La cible est dans path[] — le dernier slot est la cible elle-même
        totalSlots = path.length;
    } else if (_difficulty === 'hard') {
        // Hard : pas de placeholders, juste nœuds visités + cible
        totalSlots = path.length + 1;
    } else {
        // Easy / Normal : distance BFS restante = nombre de placeholders
        totalSlots = path.length + (currentDistance || 1);
    }

    for (let i = 0; i < totalSlots; i++) {
        const isLastSlot = i === totalSlots - 1;
        const node = document.createElement('div');

        if (isLastSlot) {
            // Dernier slot : toujours la cible (visitée si isFinished)
            node.className = 'path-node path-node--target';
            node.innerHTML = `
                <div class="node-dot node-dot--target">${totalSlots}</div>
                <div class="node-name">${_escapeHtml(targetArtist?.name || '?')}</div>
            `;
        } else if (i < path.length) {
            // Nœud déjà visité
            const artist = path[i];
            const isCurrent = !isFinished && i === path.length - 1;
            node.className = `path-node${isCurrent ? ' current' : ''}`;
            node.innerHTML = `
                <div class="node-dot">${i + 1}</div>
                <div class="node-name">${_escapeHtml(artist.name)}</div>
            `;
        } else {
            // Slot vide (placeholder — distance restante)
            node.className = 'path-node path-node--placeholder';
            node.innerHTML = `
                <div class="node-dot node-dot--placeholder"></div>
                <div class="node-name node-name--placeholder">…</div>
            `;
        }

        // Ligne verticale entre nœuds (sauf le dernier)
        if (!isLastSlot) node.classList.add('path-node--has-line');

        // Animation slideIn uniquement pour le dernier nœud visité nouvellement ajouté
        if (i === path.length - 1 && path.length > 1 && !isFinished) {
            node.classList.add('path-node--new');
        }

        pathContainer.appendChild(node);
    }

    _updateScore();
}

function _updateScore() {
    if (scoreValueEl) {
        scoreValueEl.textContent = Game.formatScore(Game.computeScore());
        scoreValueEl.classList.remove('score-flash');
        void scoreValueEl.offsetWidth;
        scoreValueEl.classList.add('score-flash');
    }
}

// ── Recherche / Autocomplétion ─────────────────────────────────────────────────

function _hideDropdown() {
    searchResults.innerHTML = '';
    searchResults.classList.add('hidden');
}

async function _performSearch(query) {
    try {
        const results = await Api.searchArtists(query);
        searchResults.innerHTML = '';

        if (results.length === 0) {
            searchResults.innerHTML = '<li>Aucun artiste trouvé</li>';
        } else {
            results.forEach(artist => {
                const li = document.createElement('li');
                li.textContent = artist.name;
                li.addEventListener('click', () => _handleGuess(artist));
                searchResults.appendChild(li);
            });
        }
        searchResults.classList.remove('hidden');
    } catch (err) {
        console.error("Erreur de recherche:", err);
    }
}

// ── Validation des guesses ─────────────────────────────────────────────────────

async function _handleGuess(artist) {
    _hideDropdown();
    if (_difficulty !== 'easy') {
        searchInput.value = artist.name;
        searchInput.disabled = true;
    }
    // Désactiver les collaborateurs pendant la vérification
    if (_difficulty === 'easy') _setCollaboratorsEnabled(false);

    try {
        const data = await Api.checkGuess(Game.state.currentArtist.id, artist.id);
        if (data.is_linked) {
            _onCorrectGuess(artist);
        } else {
            _onIncorrectGuess();
        }
    } catch (err) {
        _showFeedback("Erreur réseau.", 'error');
        if (_difficulty !== 'easy') searchInput.disabled = false;
        if (_difficulty === 'easy') _setCollaboratorsEnabled(true);
    }
}

/** Callback déclenché par HintsModule au niveau 3 (révélation automatique). */
function _handleAutoGuess(artist) {
    _handleGuess(artist);
}

function _setCollaboratorsEnabled(enabled) {
    collaboratorsGrid.querySelectorAll('.collaborator-card').forEach(btn => {
        btn.disabled = !enabled;
    });
}

function _onCorrectGuess(artist) {
    _showFeedback("Excellente déduction !", 'success');
    Game.advanceTo(artist);

    // Pour la victoire immédiate, on rend le chemin tout de suite (pas de fetch distance)
    if (Game.isVictory(artist.id)) {
        _renderPath();
    }

    setTimeout(async () => {
        if (_difficulty !== 'easy') {
            searchInput.value = '';
            searchInput.disabled = false;
        }
        _clearFeedback();

        // Vérifie si la cible est un voisin direct du nœud actuel → auto-finish
        const targetId = Game.state.targetArtist?.id;
        if (Game.isVictory(artist.id)) {
            // L'artiste deviné est la cible elle-même (sécurité)
            _showVictory();
        } else {
            const currentId = Game.state.currentArtist?.id;
            if (currentId && targetId) {
                try {
                    const distData = await Api.getDistance(currentId, targetId);
                    // Met à jour la distance courante pour le rendu des placeholders
                    if (distData.distance != null) {
                        Game.setCurrentDistance(distData.distance);
                    }
                    if (distData.distance === 1) {
                        // La cible est un voisin direct → auto-guess la cible
                        await _autoFinish();
                        return;
                    }
                    // Rendu unique : artiste + placeholders mis à jour en une seule passe
                    _renderPath();
                } catch {
                    // En cas d'erreur réseau, on rend quand même avec l'ancienne distance
                    _renderPath();
                }
            } else {
                _renderPath();
            }
            // Archiver le coût des indices et préparer le tour suivant
            Game.commitHintCost();
            HintsModule.reset();
            if (_difficulty === 'easy') {
                _setCollaboratorsEnabled(true);
                _loadCollaborators();
            } else {
                searchInput.focus();
            }
        }
    }, 1000);
}

/**
 * Auto-finish : avance automatiquement vers la cible quand elle est
 * un voisin direct de l'artiste courant.
 */
async function _autoFinish() {
    const target = Game.state.targetArtist;
    _showFeedback("Arrivée automatique !", 'success');

    // Vérifie le lien et avance
    const data = await Api.checkGuess(Game.state.currentArtist.id, target.id);
    if (data.is_linked) {
        Game.commitHintCost();
        Game.advanceTo(target);
        _renderPath();
        setTimeout(() => {
            _clearFeedback();
            _showVictory();
        }, 800);
    }
}

function _onIncorrectGuess() {
    _showFeedback("Mauvaise piste ! Réessayez.", 'error');
    setTimeout(() => {
        if (_difficulty !== 'easy') {
            searchInput.value = '';
            searchInput.disabled = false;
            searchInput.focus();
        } else {
            _setCollaboratorsEnabled(true);
        }
        _clearFeedback();
    }, 1500);
}

// ── Victoire ───────────────────────────────────────────────────────────────────

function _showVictory() {
    victoryModal.classList.remove('hidden');
    const score = Game.computeScore();
    const distance = Game.state.distance;
    const moves = Game.state.path.length - 1;
    const extraMoves = Math.max(0, moves - distance);
    const hintCost = Game.getTotalHintCost();
    const multiplier = Game.computeObscurityMultiplier();

    if (finalScoreEl) {
        const rows = [
            { label: 'Chemin le plus court', value: `${distance}` },
            { label: 'Multiplicateur obscurité', value: `×${multiplier.toFixed(2)}`, highlight: multiplier > 1.0 },
            { label: 'Indices', value: hintCost > 0 ? `−${Game.formatScore(hintCost)}` : '0', dim: hintCost === 0 },
            { label: 'Coups en trop', value: extraMoves > 0 ? `−${extraMoves}` : '0', dim: extraMoves === 0 },
        ];

        const rowsHtml = rows.map(r => `
            <div class="receipt-row${r.dim ? ' receipt-row--dim' : ''}${r.highlight ? ' receipt-row--highlight' : ''}">
                <span class="receipt-row__label">${r.label}</span>
                <span class="receipt-row__value">${r.value}</span>
            </div>`).join('');

        finalScoreEl.innerHTML = `
            <div class="receipt">
                <div class="receipt-dashes"></div>
                ${rowsHtml}
                <div class="receipt-dashes"></div>
                <div class="receipt-total">
                    <span class="receipt-total__label">Score</span>
                    <span class="receipt-total__value">${Game.formatScore(score)}</span>
                </div>
                <div class="receipt-dashes"></div>
            </div>`;
    }
}

// ── Reset ──────────────────────────────────────────────────────────────────────

function _resetGame() {
    Game.reset();
    HintsModule.reset();
    _setScreen('setup');
}

// ── Utilitaires feedback ───────────────────────────────────────────────────────

/**
 * Formate un nombre de followers en chaîne lisible (ex: 500k, 1.5M).
 * @param {number} n
 * @returns {string}
 */
function _formatFollowers(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    return `${Math.round(n / 1_000)}k`;
}

function _showFeedback(msg, type) {
    guessFeedback.textContent = msg;
    guessFeedback.className = `feedback-msg ${type}`;
}

function _clearFeedback() {
    guessFeedback.textContent = '';
    guessFeedback.className = 'feedback-msg';
}

function _escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Démarrage ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
