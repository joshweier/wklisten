document.addEventListener('DOMContentLoaded', async () => {

    const cacheKey_API = 'wk_apikey';
    function loadAPIKey() {
        const cachedData = localStorage.getItem(cacheKey_API);
        if (cachedData) {
            return JSON.parse(cachedData)
        }

        return null;
    }

    function saveAPIKey(apiKey) {
        localStorage.setItem(cacheKey_API, JSON.stringify(apiKey));
    }

    // Get the user's present level
    async function fetchUserLevel(apiKey) {
        const response = await fetch(
            'https://api.wanikani.com/v2/user',
            {headers: {'Authorization': `Bearer ${apiKey}`}});

        const data = await response.json();
        // NOTE: We can't allow the user to fetch words from a level higher than allowed
        return Math.min(data.data.subscription.max_level_granted, data.data.level);
    }

    async function updateQueriedCache() {
        const cacheKey = 'wklisten_answered_cache';
        const cacheExpiryKey = 'wklisten_answered_cache_expiry';
        const cacheExpiryTime = 3 * 24 * 60 * 60 * 1000;  // 3 days in milliseconds

        // Check for cache hit
        localStorage.setItem(cacheKey, JSON.stringify(queriedWords));
        localStorage.setItem(
            cacheExpiryKey, new Date().getTime() + cacheExpiryTime);
    }

    async function fetchAllKnownWords(apiKey) {
        let nextUrl = `https://api.wanikani.com/v2/assignments?subject_types=vocabulary&started=true`;
        const knownWords = [];

        while (nextUrl) {
            const response = await fetch(
                nextUrl, {headers: {'Authorization': `Bearer ${apiKey}`}});
            const data = await response.json();
            knownWords.push(...data.data);
            nextUrl = data.pages.next_url;
        }
        return knownWords;
    }

    // Get all known words we can display
    async function fetchKnownWords(apiKey) {
        const cacheKey = 'wklisten_knownwords_cache';
        const cacheExpiryKey = 'wklisten_knownwords_cache_expiry';

        // Check for cache hit
        const cachedData = localStorage.getItem(cacheKey);
        const cacheExpiry = localStorage.getItem(cacheExpiryKey);
        if (cachedData && cacheExpiry && new Date().getTime() < cacheExpiry) {
            return JSON.parse(cachedData)
        }

        // Get all of our known words (dealing with pagination)
        const data = await fetchAllKnownWords(apiKey);
        const words = data.map(assignment => assignment.data.subject_id);

        localStorage.setItem(cacheKey, JSON.stringify(words));
        localStorage.setItem(
            cacheExpiryKey, new Date().getTime() + cacheExpiryTime);

        return words;
    }

    // Get a single new word
    async function fetchWord(filteredWords, apiKey) {
        if (filteredWords.length === 0) {
            alert('No vocabulary words with audio found.');
            return;
        }

        const randomWord =
            filteredWords[Math.floor(Math.random() * filteredWords.length)];

        // Try again if we've already queried this word
        if (queriedWords.includes(randomWord)) {
            fetchWord(filteredWords, apiKey);
            return;
        }

        const response = await fetch(
            `https://api.wanikani.com/v2/subjects/${randomWord}`,
            {headers: {'Authorization': `Bearer ${apiKey}`}});

        const wordData = await response.json();
        const numLines = wordData.data.pronunciation_audios.length;
        const audioUrl = wordData.data.pronunciation_audios[Math.floor(Math.random() * numLines)]?.url;

        if (audioUrl) {
            playAudio(audioUrl);
            playAudioButton.style.display = 'block';
            playAudioButton.onclick = () => playAudio(audioUrl);
            fetchWords.dataset.correctAnswer =
                JSON.stringify(wordData.data.meanings.map(
                    meaning =>
                    meaning.meaning.toLowerCase().replace(/[^a-z0-9]/g, '')));
            fetchWords.dataset.exampleSentences =
                JSON.stringify(wordData.data.context_sentences);
            fetchWords.dataset.meaning =
                wordData.data.meanings.map(meaning => meaning.meaning).join(', ');
            fetchWords.dataset.word = wordData.data.characters;
            fetchWords.dataset.wordId = wordData.id;

            // Show a random example sentence
            const exampleSentences = wordData.data.context_sentences;
            const randomSentence =
                exampleSentences[Math.floor(Math.random() * exampleSentences.length)];
            exampleSentence.textContent = randomSentence.ja;
            // exampleSentence.style.display = 'block';
        } else {
            alert('No audio available for this word.');
        }

        nextWordButton.style.display = 'none';
        exampleSentencesContainer.style.display = 'none';
        wordContainer.style.display = 'none';
        submitButton.style.display = 'inline-block';
    }

    // Given a missed word, track it and display it
    function addMissedWord(word) {
        // Add or increment
        missedWords[word] = (missedWords[word] || 0) + 1;

        // Rebuild the missed words list
        missedWordsContainer.innerHTML = '';
        // Initialize the string to be copied to the clipboard
        let clipboardString = '';

        // Iterate over the incorrectGuesses object
        for (const word in missedWords) {
            if (missedWords.hasOwnProperty(word)) {
                const score = missedWords[word];

                // Create a new div element
                const div = document.createElement('div');
                div.classList.add('missed-word');

                // Assign the appropriate class based on the score
                if (score < 3) {
                    div.classList.add('medium');
                } else {
                    div.classList.add('major');
                }

                // Set the text content of the div to the word
                div.textContent = word;
                clipboardString += word + '\n';

                // Append the div to the container
                missedWordsContainer.appendChild(div);
            }
        }

        navigator.clipboard.writeText(clipboardString);

        // Show it
        missedWordsContainer.style.display = 'flex';
    }

    // Play the audio for the word
    function playAudio(audioUrl) {
        if (firstPlay) {
            firstPlay = false;
            return;
        }
        const audio = new Audio(audioUrl);
        audio.play();
    }

    // Check the anser
    function checkAnswer(filteredWords, apiKey) {
        const userInputValue =
            userInput.value.toLowerCase().replace(/[^a-z0-9]/g, '');

        if (userInputValue === '')
            return;

        const correctAnswers = JSON.parse(fetchWords.dataset.correctAnswer);
        const word = fetchWords.dataset.word;

        wordContainer.textContent = word;
        wordContainer.style.display = 'block';

        if (correctAnswers.includes(userInputValue)) {
            userInput.classList.add('input-correct');
            consecutiveCorrect++;
            const numAnswersPerLevel = 5;
            if (consecutiveCorrect > 0 && consecutiveCorrect % numAnswersPerLevel === 0) {
                playAudio("level-up.wav");
            }
            else {
                playAudio("correct.wav");
            }

            // Save that we've queried this word
            const wordId = parseInt(fetchWords.dataset.wordId);
            queriedWords.push(wordId);
            knownWords = knownWords.filter(id => id !== wordId);

            updateQueriedCache();
        } else {
            playAudio("incorrect.mp3");
            userInput.classList.add('input-incorrect');
            consecutiveCorrect = 0;
            // addMissedWord(fetchWords.dataset.word);
        }

        showExampleSentences(true);
        updateProgress();
        submitButton.style.display = 'none';
        userInput.blur();
        userInput.disabled = true;
    }

    // Show the example sentences
    function showExampleSentences(showMeaning) {
        const exampleSentences = JSON.parse(fetchWords.dataset.exampleSentences);
        const meaning = fetchWords.dataset.meaning;

        exampleSentencesContainer.innerHTML = showMeaning ?
            `<div class="meaning">${
                meaning}</div>` :  
            '';

        const sentence =
            exampleSentences[Math.floor(Math.random() * exampleSentences.length)];

        const sentenceDiv = document.createElement('div');
        sentenceDiv.textContent = `${sentence.ja}`;
        sentenceDiv.classList.add('example-text');
        exampleSentencesContainer.appendChild(sentenceDiv);

        const translationDiv = document.createElement('div');
        translationDiv.textContent = `${sentence.en}`;
        exampleSentencesContainer.appendChild(translationDiv);

        exampleSentencesContainer.style.display = 'block';
        nextWordButton.style.display = 'block';
    }

    function updateProgress()
    {
        const numAnswered = queriedWords.length;
        const numPossible = knownWords.length + numAnswered;
        progess.textContent = `Streak: ${consecutiveCorrect} - (${numAnswered}/${numPossible})`;
    }

    // Handle the enter key
    function handleEnterKey(event) {
        if (event.key === 'Enter') {
            if (nextWordButton.style.display === 'block') {
                nextWordButton.click();
            } else {
                submitButton.click();
            }
        }
        else {
            userInput.focus();
        }
    }

    async function fetchRadicals(apiKey) {
        const allRadicals = {};
        let nextUrl = 'https://api.wanikani.com/v2/subjects?types=radical';

        while (nextUrl) {
            const response = await fetch(
                nextUrl, {headers: {'Authorization': `Bearer ${apiKey}`}});
            const data = await response.json();

            data.data.forEach(item => {
                const meanings =
                    item.data.meanings.filter(meaning => meaning.accepted_answer)
                    .map(meaning => meaning.meaning);
                const characters = item.data.characters ||
                    item.data.character_images
                    ?.find(image => image.content_type === 'image/svg+xml')
                    ?.url;

                if (characters) {
                    meanings.forEach(meaning => {
                        allRadicals[meaning] = characters;
                    });
                }
            });

            nextUrl = data.pages.next_url;
        }

        return allRadicals;
    }

    function formatRadicalsMapToStaticTable(radicalsMap) {
        let formattedTable = 'const radicalsMap = {\n';

            for (const [meaning, character] of Object.entries(radicalsMap)) {
                formattedTable += `  "${meaning}": "${character}",\n`;
            }

            formattedTable += '};\n';
        return formattedTable;
    }

    var consecutiveCorrect = 0;
    var firstPlay = true;
    var queriedWords = [];
    var knownWords = [];
    var missedWords = {};

    // Check for cached queries
    const cacheKey = 'wklisten_answered_cache';
    const cacheExpiryKey = 'wklisten_answered_cache_expiry';
    const cacheExpiryTime = 30 * 24 * 60 * 60 * 1000;  // 3 days in milliseconds

    const cachedData = localStorage.getItem(cacheKey);
    const cacheExpiry = localStorage.getItem(cacheExpiryKey);
    if (cachedData && cacheExpiry && new Date().getTime() < cacheExpiry) {
        queriedWords = JSON.parse(cachedData)
    }

    // Cache common elements
    const loadingScreen = document.getElementById('loading-screen');
    const mainContent = document.getElementById('main-content');
    const playAudioButton = document.getElementById('play-audio');
    const showExampleButton = document.getElementById('show-example');
    const userInput = document.getElementById('user-input');
    const submitButton = document.getElementById('submit');
    const wordContainer = document.getElementById('word-container');
    const exampleSentence = document.getElementById('example-sentence');
    const exampleSentencesContainer = document.getElementById('example-sentences');
    const nextWordButton = document.getElementById('next-word');
    const fetchWords = document.getElementById('fetch-words');
    const progess = document.getElementById('progress');
    const missedWordsContainer = document.getElementById('missed-words');

    // Set focus to the input box when the page loads
    userInput.focus();

    try {

        apiKey = loadAPIKey();
        if (!apiKey) {
            // Show the API key entry screen
            bodyContent.style.display = 'none';
            apiKeyScreen.style.display = 'flex';

            // Check for valid input
            apiKeyInput.addEventListener('input', function() {
                apiKeyButton.disabled = (apiKeyInput.value.trim() === '') ;
            });

            // API key entry
            apiKeyButton.addEventListener('click', () => {
                apiKey = apiKeyInput.value.trim();
                saveAPIKey(apiKey);

                // Reloading the page to cause us to load the API key
                location.reload(true);
            });

            return;
        }

        // NOTE: At this point we have an API key

        loadingScreen.style.display = 'flex';

        // Figure out what level we are and combine it all together
        const userLevel = await fetchUserLevel(apiKey);
        console.log(`User level: ${userLevel}`);

        knownWords = await fetchKnownWords(apiKey);
        console.log(`Known: ${knownWords.length}`);

        // Filter out words that we've already queried (if any)
        knownWords = knownWords.filter(word => !queriedWords.includes(word));
        console.log(`Filtered: ${knownWords.length}`);

        updateProgress();

        // Hide the loading screen and show the main content
        loadingScreen.style.display = 'none';
        mainContent.style.display = 'block';

        showExampleButton.addEventListener('click', () => {
            exampleSentence.style.display = 'block';
            showExampleButton.style.display = 'none';
        });

        // Handle the submit button
        submitButton.addEventListener(
            'click', () => checkAnswer(knownWords, apiKey));

        // Handle the next word button
        nextWordButton.addEventListener('click', () => {
            userInput.value = '';
            userInput.classList.remove('input-correct', 'input-incorrect');
            userInput.disabled = false;
            userInput.focus();

            // Hide everything
            showExampleButton.style.display = 'block';
            nextWordButton.style.display = 'none';
            wordContainer.style.display = 'none';
            exampleSentence.style.display = 'none';
            exampleSentencesContainer.style.display = 'none';
            submitButton.style.display = 'inline-block';

            // Do this last as it's blocking
            fetchWord(knownWords, apiKey);
        });

        // Hook up the enter key
        document.addEventListener('keydown', handleEnterKey);

        fetchWord(knownWords, apiKey);
    } catch (error) {
        console.error(error);
        alert('Failed to load vocabulary words.');
    }

});
