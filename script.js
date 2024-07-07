document.addEventListener('DOMContentLoaded', async () => {
  // FIXME: This needs to move out of here!
  const apiKey = 'c9dd4a7f-e0a3-4054-97ee-01640ecc27ac';

  // Cache common elements
  const loadingScreen = document.getElementById('loading-screen');
  const mainContent = document.getElementById('main-content');
  const playAudioButton = document.getElementById('play-audio');
  const userInput = document.getElementById('user-input');
  const submitButton = document.getElementById('submit');
  const showAnswerButton = document.getElementById('show-answer');
  const feedback = document.getElementById('feedback');
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
    const levels = Array.from({length: userLevel}, (_, i) => i + 1).join(',');
    console.log(`User level: ${userLevel}`);

    const knownWords = await fetchKnownWords(apiKey);
    const allVocabWords = await fetchCachedVocabWords(apiKey, levels);
    const filteredWords = allVocabWords.filter(word => knownWords.includes(word.id));

    // Hide the loading screen and show the main content
    loadingScreen.style.display = 'none';
    mainContent.style.display = 'block';

    submitButton.addEventListener(
        'click', () => checkAnswer(filteredWords, apiKey));
    showAnswerButton.addEventListener('click', showAnswer);
    nextWordButton.addEventListener('click', () => {
      fetchWord(filteredWords, apiKey);
      userInput.value = '';
      feedback.style.display = 'none';
      showAnswerButton.style.display = 'none';
      wordContainer.style.display = 'none';
      exampleSentence.style.display = 'none';
      submitButton.style.display = 'inline-block';
    });

    document.addEventListener('keydown', handleEnterKey);

    fetchWord(filteredWords, apiKey);
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

  // Get all known words we can display
  async function fetchKnownWords(apiKey) {
    const cacheKey = 'wanikani_knownwords_cache';
    const cacheExpiryKey = 'wanikani_knownwords_cache_expiry';
    const cacheExpiryTime =
        1 * 24 * 60 * 60 * 1000;  // 1 day in milliseconds

    const cachedData = localStorage.getItem(cacheKey);
    const cacheExpiry = localStorage.getItem(cacheExpiryKey);

    if (cachedData && cacheExpiry && new Date().getTime() < cacheExpiry) {
      console.log(`Known words cache hit.`);
      const data = JSON.parse(cachedData)
      return data.data.map(assignment => assignment.data.subject_id);
    }

    const response = await fetch(
        'https://api.wanikani.com/v2/assignments?srs_stages=1,2,3,4,5,6,7,8,9,10',
        {headers: {'Authorization': `Bearer ${apiKey}`}});
    const data = await response.json();

    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(
        cacheExpiryKey, new Date().getTime() + cacheExpiryTime);

    return data.data.map(assignment => assignment.data.subject_id);
  }

  // Get all of our cached word data
  async function fetchCachedVocabWords(apiKey, levels) {
    const cacheKey = 'wanikani_vocab_cache';
    const cacheExpiryKey = 'wanikani_vocab_cache_expiry';
    const cacheExpiryTime =
        30 * 24 * 60 * 60 * 1000;  // 30 days in milliseconds

    const cachedData = localStorage.getItem(cacheKey);
    const cacheExpiry = localStorage.getItem(cacheExpiryKey);

    if (cachedData && cacheExpiry && new Date().getTime() < cacheExpiry) {
      console.log(`Vocab words cache hit.`);
      return JSON.parse(cachedData);
    }

    const vocabWords = await fetchAllVocabWords(apiKey, levels);
    localStorage.setItem(cacheKey, JSON.stringify(vocabWords));
    localStorage.setItem(
        cacheExpiryKey, new Date().getTime() + cacheExpiryTime);

    return vocabWords;
  }

  // Get all valid vocab words for our level
  async function fetchAllVocabWords(apiKey, levels) {
    let nextUrl = `https://api.wanikani.com/v2/subjects?types=vocabulary&levels=${levels}`;
    const vocabWords = [];

    while (nextUrl) {
      const response = await fetch(
          nextUrl, {headers: {'Authorization': `Bearer ${apiKey}`}});
      const data = await response.json();
      vocabWords.push(...data.data);
      nextUrl = data.pages.next_url;
    }
    return vocabWords;
  }

  // Get a single new word
  async function fetchWord(filteredWords, apiKey) {
    if (filteredWords.length === 0) {
      alert('No vocabulary words with audio found.');
      return;
    }

    const randomWord =
        filteredWords[Math.floor(Math.random() * filteredWords.length)];
    const response = await fetch(
        `https://api.wanikani.com/v2/subjects/${randomWord.id}`,
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

      // Show a random example sentence
      const exampleSentences = wordData.data.context_sentences;
      const randomSentence =
          exampleSentences[Math.floor(Math.random() * exampleSentences.length)];
      exampleSentence.textContent = randomSentence.ja;
      exampleSentence.style.display = 'block';
    } else {
      alert('No audio available for this word.');
    }

    nextWordButton.style.display = 'none';
    exampleSentencesContainer.style.display = 'none';
    feedback.style.display = 'none';
    showAnswerButton.style.display = 'none';
    wordContainer.style.display = 'none';
    submitButton.style.display = 'inline-block';
  }

  // Play the audio for the word
  function playAudio(audioUrl) {
    const audio = new Audio(audioUrl);
    audio.play();
    userInput.focus();
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
      feedback.textContent = 'Correct!';
      feedback.style.color = 'green';
      feedback.style.display = 'block';
      showExampleSentences(false);
    } else {
      feedback.textContent = 'Incorrect!';
      feedback.style.color = 'red';
      feedback.style.display = 'block';
      showAnswer();
    }

    submitButton.style.display = 'none';
  }

  // Show the example sentences
  function showExampleSentences(showMeaning) {
    const exampleSentences = JSON.parse(fetchWords.dataset.exampleSentences);
    const meaning = fetchWords.dataset.meaning;

    exampleSentencesContainer.innerHTML = showMeaning ?
        `<div class="meaning">${meaning}</div><h3>Example Sentences:</h3>` :
        '<h3>Example Sentences:</h3>';
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
  }
});