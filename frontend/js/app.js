const API_BASE = '/api';

// --- Gestion de l'état ---
let gameState = {
    sourceArtist: null,
    targetArtist: null,
    currentArtist: null,
    path: [],
    distance: 0
};

// --- Éléments du DOM ---
const screens = {
    setup: document.getElementById('setup-screen'),
    game: document.getElementById('game-screen')
};

// Éléments du formulaire de configuration
const setupForm = document.getElementById('setup-form');
const countrySelect = document.getElementById('country');
const popSlider = document.getElementById('min-popularity');
const popValue = document.getElementById('pop-value');
const minRangeSlider = document.getElementById('min-range');
const minRangeValue = document.getElementById('min-range-value');
const maxRangeSlider = document.getElementById('max-range');
const maxRangeValue = document.getElementById('max-range-value');
const startBtn = document.getElementById('start-btn');
const setupError = document.getElementById('setup-error');

// Éléments du jeu
const targetArtistName = document.getElementById('target-artist-name');
const shortestRouteLength = document.getElementById('shortest-route-length');
const pathContainer = document.getElementById('path-container');
const searchInput = document.getElementById('artist-search');
const searchResults = document.getElementById('search-results');
const guessFeedback = document.getElementById('guess-feedback');
const resetBtn = document.getElementById('reset-btn');
const victoryModal = document.getElementById('victory-modal');
const playAgainBtn = document.getElementById('play-again-btn');

// --- Initialisation ---
async function init() {
    await fetchCountries();
    setupEventListeners();
}

/**
 * Récupère les pays disponibles depuis l'API et remplit la liste déroulante.
 */
async function fetchCountries() {
    try {
        const res = await fetch(`${API_BASE}/countries`);
        if (!res.ok) throw new Error("Network response was not ok");
        const countries = await res.json();

        countries.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c.toUpperCase();
            countrySelect.appendChild(opt);
        });
    } catch (err) {
        console.error("Erreur lors du chargement des pays:", err);
    }
}

/**
 * Attache tous les écouteurs d'événements (clics, saisies) du DOM.
 */
function setupEventListeners() {
    // Met à jour la valeur de la popularité dynamiquement
    popSlider.addEventListener('input', (e) => {
        popValue.textContent = e.target.value;
    });

    // Met à jour les valeurs des liens min et max
    minRangeSlider.addEventListener('input', (e) => {
        minRangeValue.textContent = e.target.value;
        if (parseInt(maxRangeSlider.value) < parseInt(e.target.value)) {
            maxRangeSlider.value = e.target.value;
            maxRangeValue.textContent = e.target.value;
        }
    });

    maxRangeSlider.addEventListener('input', (e) => {
        maxRangeValue.textContent = e.target.value;
        if (parseInt(minRangeSlider.value) > parseInt(e.target.value)) {
            minRangeSlider.value = e.target.value;
            minRangeValue.textContent = e.target.value;
        }
    });

    setupForm.addEventListener('submit', handleStartGame);

    // Logique anti-spam (debounce) pour la recherche
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const q = e.target.value.trim();

        if (q.length < 2) {
            hideSearchResults();
            return;
        }

        searchTimeout = setTimeout(() => performSearch(q), 300);
    });

    // Ferme le menu déroulant si on clique en dehors
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            hideSearchResults();
        }
    });

    resetBtn.addEventListener('click', resetGame);
    playAgainBtn.addEventListener('click', resetGame);
}

// --- Déroulement du jeu ---

/**
 * Permet de basculer d'un écran à l'autre (config ou jeu).
 */
function setScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

/**
 * Gère la soumission du formulaire de configuration.
 */
async function handleStartGame(e) {
    e.preventDefault();
    setupError.textContent = '';

    const btnText = startBtn.querySelector('.btn-text');
    const loader = startBtn.querySelector('.loader');

    // État de chargement de l'interface
    btnText.classList.add('hidden');
    loader.classList.remove('hidden');
    startBtn.disabled = true;

    const formData = new FormData(setupForm);
    const reqBody = {
        country: formData.get('country'),
        min_popularity: parseInt(formData.get('min_popularity')),
        min_range: parseInt(formData.get('min_range')),
        max_range: parseInt(formData.get('max_range'))
    };

    try {
        const res = await fetch(`${API_BASE}/game/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody)
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.detail || "Erreur de génération");
        }

        // Initialise l'état du jeu
        gameState.sourceArtist = data.source;
        gameState.targetArtist = data.target;
        gameState.currentArtist = data.source;
        gameState.distance = data.distance;
        gameState.path = [data.source];

        setupGameUI();
        setScreen('game');

    } catch (err) {
        setupError.textContent = err.message;
    } finally {
        // Réinitialise l'état de chargement
        btnText.classList.remove('hidden');
        loader.classList.add('hidden');
        startBtn.disabled = false;
    }
}

/**
 * Prépare l'interface du jeu pour une nouvelle partie.
 */
function setupGameUI() {
    targetArtistName.textContent = gameState.targetArtist.name;
    shortestRouteLength.textContent = gameState.distance - 1 + " Featuring(s)";
    searchInput.value = '';
    guessFeedback.textContent = '';
    guessFeedback.className = 'feedback-msg';
    victoryModal.classList.add('hidden');
    renderPath();
    searchInput.focus();
}

/**
 * Affiche la chronologie des artistes trouvés jusqu'à présent.
 */
function renderPath() {
    pathContainer.innerHTML = '';

    gameState.path.forEach((artist, index) => {
        const node = document.createElement('div');
        node.className = `path-node ${index === gameState.path.length - 1 ? 'current' : ''}`;

        node.innerHTML = `
            <div class="node-dot">${index + 1}</div>
            <div class="node-name">${artist.name}</div>
        `;
        pathContainer.appendChild(node);
    });
}

// --- Recherche et validation ---

function hideSearchResults() {
    searchResults.innerHTML = '';
    searchResults.classList.add('hidden');
}

/**
 * Interroge l'API pour l'autocomplétion des artistes.
 */
async function performSearch(query) {
    try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
        const results = await res.json();

        searchResults.innerHTML = '';

        if (results.length === 0) {
            searchResults.innerHTML = '<li>Aucun artiste trouvé</li>';
        } else {
            results.forEach(artist => {
                const li = document.createElement('li');
                li.textContent = artist.name;
                li.addEventListener('click', () => handleGuess(artist));
                searchResults.appendChild(li);
            });
        }

        searchResults.classList.remove('hidden');
    } catch (err) {
        console.error("Erreur de recherche", err);
    }
}

/**
 * Envoie une tentative à l'API pour vérifier si une collaboration existe.
 */
async function handleGuess(guessedArtist) {
    hideSearchResults();
    searchInput.value = guessedArtist.name;
    searchInput.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/game/guess`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                current_artist_id: gameState.currentArtist.id,
                guessed_artist_id: guessedArtist.id
            })
        });

        const data = await res.json();

        if (data.is_linked) {
            handleCorrectGuess(guessedArtist);
        } else {
            handleIncorrectGuess();
        }
    } catch (err) {
        guessFeedback.textContent = "Erreur de validation réseau.";
        guessFeedback.className = 'feedback-msg error';
        searchInput.disabled = false;
    }
}

function handleCorrectGuess(artist) {
    guessFeedback.textContent = "Excellente déduction !";
    guessFeedback.className = 'feedback-msg success';

    gameState.path.push(artist);
    gameState.currentArtist = artist;
    renderPath();

    setTimeout(() => {
        searchInput.value = '';
        searchInput.disabled = false;
        guessFeedback.textContent = '';

        // Vérifie si on a gagné
        if (artist.id === gameState.targetArtist.id) {
            victoryModal.classList.remove('hidden');
        } else {
            searchInput.focus();
        }
    }, 1000);
}

function handleIncorrectGuess() {
    guessFeedback.textContent = "Mauvaise piste ! Réessayez.";
    guessFeedback.className = 'feedback-msg error';

    setTimeout(() => {
        searchInput.value = '';
        searchInput.disabled = false;
        guessFeedback.textContent = '';
        searchInput.focus();
    }, 1500);
}

/**
 * Réinitialise l'état du jeu et retourne à l'écran de configuration.
 */
function resetGame() {
    gameState = {
        sourceArtist: null,
        targetArtist: null,
        currentArtist: null,
        path: [],
        distance: 0
    };
    setScreen('setup');
}

// Démarre l'application quand la page est chargée
document.addEventListener('DOMContentLoaded', init);
