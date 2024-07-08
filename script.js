document.addEventListener('DOMContentLoaded', async () => {
  // FIXME: This needs to move out of here!
  const apiKey = 'c9dd4a7f-e0a3-4054-97ee-01640ecc27ac';

  // Temp clear out
  
  // localStorage.removeItem('wanikani_knownwords_cache');

  var consecutiveCorrect = 0;
  var firstPlay = true;
  var queriedWords = [];

  // Check for cached queries
  const cacheKey = 'wklisten_answered_cache';
  const cacheExpiryKey = 'wklisten_answered_cache_expiry';
  const cacheExpiryTime = 3 * 24 * 60 * 60 * 1000;  // 3 days in milliseconds

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
  const showAnswerButton = document.getElementById('show-answer');
  const wordContainer = document.getElementById('word-container');
  const exampleSentence = document.getElementById('example-sentence');
  const exampleSentencesContainer = document.getElementById('example-sentences');
  const nextWordButton = document.getElementById('next-word');
  const fetchWords = document.getElementById('fetch-words');

  // Set focus to the input box when the page loads
  userInput.focus();

  // Show the loading screen
  loadingScreen.style.display = 'block';
  mainContent.style.display = 'none';

  try {
    // Figure out what level we are and combine it all together
    const userLevel = await fetchUserLevel(apiKey);
    console.log(`User level: ${userLevel}`);

    const knownWords = await fetchKnownWords(apiKey);
    console.log(`Known: ${knownWords.length}`);

    // Hide the loading screen and show the main content
    loadingScreen.style.display = 'none';
    mainContent.style.display = 'block';

    showExampleButton.addEventListener('click', () => {
      exampleSentence.style.display = 'block';
      showExampleButton.style.display = 'none';
    });

    submitButton.addEventListener(
        'click', () => checkAnswer(knownWords, apiKey));
    showAnswerButton.addEventListener('click', showAnswer);
    nextWordButton.addEventListener('click', () => {
      userInput.value = '';
      userInput.classList.remove('input-correct', 'input-incorrect');
      userInput.disabled = false;
      userInput.focus();

      // Hide everything
      showExampleButton.style.display = 'block';
      showAnswerButton.style.display = 'none';
      nextWordButton.style.display = 'none';
      wordContainer.style.display = 'none';
      exampleSentence.style.display = 'none';
      exampleSentencesContainer.style.display = 'none';
      submitButton.style.display = 'inline-block';
      
      // Do this last as it's blocking
      fetchWord(knownWords, apiKey);
    });

    document.addEventListener('keydown', handleEnterKey);

    fetchWord(knownWords, apiKey);
  } catch (error) {
    console.error(error);
    alert('Failed to load vocabulary words.');
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
    const cacheKey = 'wanikani_queried_cache';
    const cacheExpiryKey = 'wanikani_queried_cache_expiry';
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
      // console.log(data);
      knownWords.push(...data.data);
      nextUrl = data.pages.next_url;
    }
    // console.log(knownWords);
    return knownWords;
  }

  // Get all known words we can display
  async function fetchKnownWords(apiKey) {
    const cacheKey = 'wanikani_knownwords_cache';
    const cacheExpiryKey = 'wanikani_knownwords_cache_expiry';
    const cacheExpiryTime =
        1 * 24 * 60 * 60 * 1000;  // 1 day in milliseconds

    // Check for cache hit
    const cachedData = localStorage.getItem(cacheKey);
    const cacheExpiry = localStorage.getItem(cacheExpiryKey);
    if (cachedData && cacheExpiry && new Date().getTime() < cacheExpiry) {
      console.log(`Known words cache hit.`);
      const data = JSON.parse(cachedData)
      return data.map(assignment => assignment.data.subject_id);
    }

    // Get all of our known words (dealing with pagination)
    const data = await fetchAllKnownWords(apiKey);
    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(
        cacheExpiryKey, new Date().getTime() + cacheExpiryTime);

    return data.map(assignment => assignment.data.subject_id);
  }

  // // Get all of our cached word data
  // async function fetchCachedVocabWords(apiKey, levels) {
  //   const cacheKey = 'wanikani_vocab_cache';
  //   const cacheExpiryKey = 'wanikani_vocab_cache_expiry';
  //   const cacheExpiryTime =
  //       30 * 24 * 60 * 60 * 1000;  // 30 days in milliseconds

  //   const cachedData = localStorage.getItem(cacheKey);
  //   const cacheExpiry = localStorage.getItem(cacheExpiryKey);

  //   if (cachedData && cacheExpiry && new Date().getTime() < cacheExpiry) {
  //     console.log(`Vocab words cache hit.`);
  //     return JSON.parse(cachedData);
  //   }

  //   const vocabWords = await fetchAllVocabWords(apiKey, levels);
  //   localStorage.setItem(cacheKey, JSON.stringify(vocabWords));
  //   localStorage.setItem(
  //       cacheExpiryKey, new Date().getTime() + cacheExpiryTime);

  //   return vocabWords;
  // }

  // // Get all valid vocab words for our level
  // async function fetchAllVocabWords(apiKey, levels) {
  //   let nextUrl = `https://api.wanikani.com/v2/subjects?types=vocabulary`;
  //   const vocabWords = [];

  //   while (nextUrl) {
  //     const response = await fetch(
  //         nextUrl, {headers: {'Authorization': `Bearer ${apiKey}`}});
  //     const data = await response.json();
  //     vocabWords.push(...data.data);
  //     nextUrl = data.pages.next_url;
  //   }
  //   return vocabWords;
  // }

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
    // console.log(wordData);
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

      // Show a random example sentence
      const exampleSentences = wordData.data.context_sentences;
      const randomSentence =
          exampleSentences[Math.floor(Math.random() * exampleSentences.length)];
      exampleSentence.textContent = randomSentence.ja;
      // exampleSentence.style.display = 'block';
    } else {
      alert('No audio available for this word.');
    }

    // Save that we've queried this word
    queriedWords.push(randomWord);
    updateQueriedCache();

    nextWordButton.style.display = 'none';
    exampleSentencesContainer.style.display = 'none';
    showAnswerButton.style.display = 'none';
    wordContainer.style.display = 'none';
    submitButton.style.display = 'inline-block';
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

      showExampleSentences(false);
    } else {
      playAudio("incorrect.mp3");
      userInput.classList.add('input-incorrect');
      consecutiveCorrect = 0;
      showAnswer();
    }

    submitButton.style.display = 'none';
    userInput.blur();
    userInput.disabled = true;
  }

  // Show the example sentences
  function showExampleSentences(showMeaning) {
    const exampleSentences = JSON.parse(fetchWords.dataset.exampleSentences);
    const meaning = fetchWords.dataset.meaning;

    exampleSentencesContainer.innerHTML = showMeaning ?
        `<div class="meaning">${meaning}</div><h3>Example Sentences:</h3>` :
        '<h3>Example Sentences:</h3>';
    // FIXME: Pick a random one that's not the current helper
    exampleSentences.forEach(sentence => {
      const sentenceDiv = document.createElement('div');
      sentenceDiv.textContent = `${sentence.ja} - ${sentence.en}`;
      exampleSentencesContainer.appendChild(sentenceDiv);
    });
    exampleSentencesContainer.style.display = 'block';
    nextWordButton.style.display = 'block';
  }

  // Show the answer
  function showAnswer() {
    showExampleSentences(true);
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
});