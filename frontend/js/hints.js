/**
 * hints.js — Module de gestion des indices.
 *
 * Responsabilités :
 *  - Maintenir l'état des indices (niveau suivant disponible, coût cumulé)
 *  - Rendre les boutons d'indices dynamiquement (séquentiels, grisés si non disponibles)
 *  - Appeler Api.getHint() et afficher la réponse
 *  - Déclencher un auto-guess via callback pour le niveau 3 (révélation)
 *  - Exposer getCost() pour que Game.computeScore() puisse déduire les pénalités
 *
 * Dépendances : Api (api.js)
 * Expose un objet global `HintsModule`.
 */

// Définition des 3 indices dans leur ordre séquentiel
const HINT_DEFINITIONS = [
    { level: 1, label: 'Nombre de caractères', cost: 0.5 },
    { level: 2, label: 'Initiales',            cost: 0.5 },
    { level: 3, label: 'Révéler',              cost: 1.0 },
];

// État interne du module
let _hintState = {
    nextLevel: 1,       // prochain niveau déverrouillable (1 à 3, puis 4 = tous utilisés)
    totalCost: 0,       // coût cumulé des indices utilisés ce tour
    isLoading: false,   // verrou anti-double-clic
};

// Callback déclenché par le niveau 4 (auto-guess)
let _onRevealCallback = null;

// ── API publique ───────────────────────────────────────────────────────────────

const HintsModule = {
    /**
     * Initialise le module avec le callback d'auto-guess (niveau 4).
     * Doit être appelé une fois au démarrage de l'app.
     * @param {function({ id: string, name: string }): void} onReveal
     */
    init(onReveal) {
        _onRevealCallback = onReveal;
        _renderButtons();
    },

    /**
     * Réinitialise les indices pour un nouveau tour (après chaque guess valide).
     */
    reset() {
        _hintState = { nextLevel: 1, totalCost: 0, isLoading: false };
        _renderButtons();
        _clearDisplay();
    },

    /**
     * Retourne le coût total cumulé des indices utilisés ce tour.
     * @returns {number}
     */
    getCost() {
        return _hintState.totalCost;
    },
};

// ── Logique interne ────────────────────────────────────────────────────────────

/**
 * Déclenche une demande d'indice pour le niveau donné.
 * Vérifie que c'est bien le niveau attendu avant d'appeler l'API.
 */
async function _requestHint(level) {
    if (_hintState.isLoading || level !== _hintState.nextLevel) return;

    const currentId = window._getCurrentArtistId?.();
    const targetId  = window._getTargetArtistId?.();
    if (!currentId || !targetId) return;

    _hintState.isLoading = true;
    _setLoadingState(level);

    try {
        const data = await Api.getHint(currentId, targetId, level);
        _applyHintResponse(data);
    } catch (err) {
        _showError(err.message);
    } finally {
        _hintState.isLoading = false;
        _renderButtons();
    }
}

/**
 * Applique la réponse du serveur : met à jour l'état et l'affichage.
 */
function _applyHintResponse(data) {
    const { hint, hint_level, hint_cost } = data;

    _hintState.totalCost += hint_cost;
    _hintState.nextLevel  = hint_level + 1;

    // Mise à jour en temps réel du score affiché
    window._onScoreUpdate?.();

    if (hint_level === 3 && data.best_neighbor_id) {
        _showHint(hint_level, hint, true);
        // Délai court pour que l'affichage soit visible avant l'auto-guess
        setTimeout(() => {
            _onRevealCallback?.({ id: data.best_neighbor_id, name: hint });
        }, 800);
    } else {
        _showHint(hint_level, hint, false);
    }
}

// ── Rendu DOM ──────────────────────────────────────────────────────────────────

function _renderButtons() {
    const container = document.getElementById('hint-buttons');
    if (!container) return;

    container.innerHTML = '';

    HINT_DEFINITIONS.forEach(({ level, label }) => {
        const btn = document.createElement('button');
        btn.id        = `hint-btn-${level}`;
        btn.className = 'hint-btn';
        btn.textContent = label;
        btn.setAttribute('aria-label', `Indice niveau ${level} : ${label}`);

        const isUsed      = level < _hintState.nextLevel;
        const isAvailable = level === _hintState.nextLevel && !_hintState.isLoading;
        const isLocked    = level > _hintState.nextLevel || _hintState.isLoading;

        if (isUsed) {
            btn.classList.add('hint-btn--used');
            btn.disabled = true;
        } else if (isAvailable) {
            btn.classList.add('hint-btn--available');
            btn.addEventListener('click', () => _requestHint(level));
        } else {
            btn.classList.add('hint-btn--locked');
            btn.disabled = true;
        }

        container.appendChild(btn);
    });
}

function _setLoadingState(activeLevel) {
    const btn = document.getElementById(`hint-btn-${activeLevel}`);
    if (btn) {
        btn.disabled = true;
        btn.classList.remove('hint-btn--available');
        btn.classList.add('hint-btn--loading');
    }
}

function _showHint(level, text, isReveal) {
    const display = document.getElementById('hint-display');
    if (!display) return;
    const label = HINT_DEFINITIONS.find(h => h.level === level)?.label || '';
    display.innerHTML = `
        <span class="hint-display__label">${_escape(label)} :</span>
        <span class="hint-display__value ${isReveal ? 'hint-display__value--reveal' : ''}">${_escape(text)}</span>
    `;
    display.classList.remove('hidden');
}

function _showError(message) {
    const display = document.getElementById('hint-display');
    if (!display) return;
    display.innerHTML = `<span class="hint-display__error">${_escape(message)}</span>`;
    display.classList.remove('hidden');
}

function _clearDisplay() {
    const display = document.getElementById('hint-display');
    if (!display) return;
    display.innerHTML = '';
    display.classList.add('hidden');
}

function _escape(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
