/**
 * app.js — Point d'entrée et orchestrateur de CollabRoute.
 *
 * Responsabilités :
 *  - Initialisation de l'application (pays, events, modules)
 *  - Gestion des écrans (setup / jeu)
 *  - Listeners du formulaire de configuration et des sliders
 *  - Autocomplétion de la recherche (debounce + dropdown)
 *  - Gestion du flux de jeu : soumission guess → correct/incorrect → victoire
 *  - Rendu DOM du chemin (timeline) et du score
 *
 * Dépendances (chargées avant dans HTML) : Api, Game, HintsModule
 */

// ── Références DOM — Configuration ────────────────────────────────────────────

const screens = {
    setup: document.getElementById('setup-screen'),
    game:  document.getElementById('game-screen'),
};

const setupForm    = document.getElementById('setup-form');
const countrySelect = document.getElementById('country');
const popSlider    = document.getElementById('min-popularity');
const popValue     = document.getElementById('pop-value');
const minRangeSlider = document.getElementById('min-range');
const minRangeValue  = document.getElementById('min-range-value');
const maxRangeSlider = document.getElementById('max-range');
const maxRangeValue  = document.getElementById('max-range-value');
const startBtn     = document.getElementById('start-btn');
const setupError   = document.getElementById('setup-error');

// ── Références DOM — Jeu ──────────────────────────────────────────────────────

const targetArtistName   = document.getElementById('target-artist-name');
const shortestRouteEl    = document.getElementById('shortest-route-length');
const scoreValueEl       = document.getElementById('score-value');
const pathContainer      = document.getElementById('path-container');
const searchInput        = document.getElementById('artist-search');
const searchResults      = document.getElementById('search-results');
const guessFeedback      = document.getElementById('guess-feedback');
const resetBtn           = document.getElementById('reset-btn');
const victoryModal       = document.getElementById('victory-modal');
const finalScoreEl       = document.getElementById('final-score');
const playAgainBtn       = document.getElementById('play-again-btn');

// ── Accesseurs exposés pour hints.js ──────────────────────────────────────────
// hints.js ne connaît pas Game directement → passage via window

window._getCurrentArtistId = () => Game.state.currentArtist?.id ?? null;
window._getTargetArtistId  = () => Game.state.targetArtist?.id  ?? null;
window._onScoreUpdate      = () => _updateScore();

// ── Initialisation ────────────────────────────────────────────────────────────

async function init() {
    await _loadCountries();
    _setupFormListeners();
    _setupGameListeners();
    HintsModule.init(_handleAutoGuess);
}

async function _loadCountries() {
    try {
        const countries = await Api.getCountries();
        countries.forEach(code => {
            const opt = document.createElement('option');
            opt.value       = code;
            opt.textContent = code.toUpperCase();
            countrySelect.appendChild(opt);
        });
    } catch (err) {
        console.error("Erreur chargement pays:", err);
    }
}

// ── Écouteurs — Formulaire de configuration ────────────────────────────────────

function _setupFormListeners() {
    popSlider.addEventListener('input', (e) => {
        popValue.textContent = e.target.value;
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
    const loader  = startBtn.querySelector('.loader');
    btnText.classList.add('hidden');
    loader.classList.remove('hidden');
    startBtn.disabled = true;

    const fd = new FormData(setupForm);
    try {
        const data = await Api.startGame({
            country:        fd.get('country'),
            min_popularity: parseInt(fd.get('min_popularity')),
            min_range:      parseInt(fd.get('min_range')),
            max_range:      parseInt(fd.get('max_range')),
        });

        Game.init(data);
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
    targetArtistName.textContent = Game.state.targetArtist.name;
    shortestRouteEl.textContent  = `${Game.state.distance} Featuring(s)`;
    searchInput.value            = '';
    searchInput.disabled         = false;
    guessFeedback.textContent    = '';
    guessFeedback.className      = 'feedback-msg';
    victoryModal.classList.add('hidden');
    HintsModule.reset();
    _renderPath();
    searchInput.focus();
}

// ── Rendu ──────────────────────────────────────────────────────────────────────

function _renderPath() {
    pathContainer.innerHTML = '';
    const { path } = Game.state;

    path.forEach((artist, i) => {
        const node = document.createElement('div');
        node.className = `path-node ${i === path.length - 1 ? 'current' : ''}`;
        node.innerHTML = `
            <div class="node-dot">${i + 1}</div>
            <div class="node-name">${artist.name}</div>
        `;
        pathContainer.appendChild(node);
    });

    _updateScore();
}

function _updateScore() {
    if (scoreValueEl) {
        scoreValueEl.textContent = Game.formatScore(Game.computeScore());
        // Animation flash subtile
        scoreValueEl.classList.remove('score-flash');
        // Force reflow pour relancer l'animation si elle est déjà active
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
    searchInput.value    = artist.name;
    searchInput.disabled = true;

    try {
        const data = await Api.checkGuess(Game.state.currentArtist.id, artist.id);
        if (data.is_linked) {
            _onCorrectGuess(artist);
        } else {
            _onIncorrectGuess();
        }
    } catch (err) {
        _showFeedback("Erreur réseau.", 'error');
        searchInput.disabled = false;
    }
}

/** Callback déclenché par HintsModule au niveau 4 (révélation automatique). */
function _handleAutoGuess(artist) {
    _handleGuess(artist);
}

function _onCorrectGuess(artist) {
    _showFeedback("Excellente déduction !", 'success');
    Game.advanceTo(artist);
    _renderPath();

    setTimeout(() => {
        searchInput.value    = '';
        searchInput.disabled = false;
        _clearFeedback();

        if (Game.isVictory(artist.id)) {
            _showVictory();
        } else {
            // Archive le coût d'indices du tour avant de réinitialiser
            Game.commitHintCost();
            HintsModule.reset();
            searchInput.focus();
        }
    }, 1000);
}

function _onIncorrectGuess() {
    _showFeedback("Mauvaise piste ! Réessayez.", 'error');
    setTimeout(() => {
        searchInput.value    = '';
        searchInput.disabled = false;
        _clearFeedback();
        searchInput.focus();
    }, 1500);
}

// ── Victoire ───────────────────────────────────────────────────────────────────

function _showVictory() {
    victoryModal.classList.remove('hidden');
    const score      = Game.computeScore();
    const distance   = Game.state.distance;
    const moves      = Game.state.path.length - 1;
    const extraMoves = Math.max(0, moves - distance);
    const hintCost   = Game.getTotalHintCost();

    if (finalScoreEl) {
        const rows = [
            { label: 'Chemin le plus court', value: `${distance}` },
            { label: `Indices`, value: hintCost > 0 ? `−${Game.formatScore(hintCost)}` : '0', dim: hintCost === 0 },
            { label: 'Coups en trop', value: extraMoves > 0 ? `−${extraMoves}` : '0', dim: extraMoves === 0 },
        ];

        const rowsHtml = rows.map(r => `
            <div class="receipt-row${r.dim ? ' receipt-row--dim' : ''}">
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

function _showFeedback(msg, type) {
    guessFeedback.textContent = msg;
    guessFeedback.className   = `feedback-msg ${type}`;
}

function _clearFeedback() {
    guessFeedback.textContent = '';
    guessFeedback.className   = 'feedback-msg';
}

// ── Démarrage ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
