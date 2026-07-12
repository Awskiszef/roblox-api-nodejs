require('dotenv').config();
const express = require('express');
const cors = require('cors');
const lyricsFinder = require('lyrics-finder');
const SpotifyWebApi = require('spotify-web-api-node');

const app = express();
app.use(cors()); // Zezwala na odpytywanie z każdego miejsca w internecie
const PORT = process.env.PORT || 3000;

// Konfiguracja API Spotify
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI
});

// Flaga zapobiegająca problemom przy równoległym odświeżaniu z wielu źródeł
let isRefreshing = false;

// ==========================================
// 1. ENDPOINTY DO LOGOWANIA
// ==========================================

// Endpoint początkowy - przenosi na stronę logowania Spotify
app.get('/login', (req, res) => {
  const scopes = ['user-read-currently-playing', 'user-read-playback-state'];
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes, 'random-state-string');
  res.redirect(authorizeURL);
});

// Endpoint odbierający kod od Spotify po zalogowaniu
app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  if (!code) return res.status(400).send('Brak kodu autoryzacyjnego');

  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    const accessToken = data.body['access_token'];
    const refreshToken = data.body['refresh_token'];
    const expiresIn = data.body['expires_in']; // Zazwyczaj 3600 sekund (1h)

    // Ustawiamy tokeny
    spotifyApi.setAccessToken(accessToken);
    spotifyApi.setRefreshToken(refreshToken);

    console.log('\n======================================================');
    console.log('✅ ZALOGOWANO POMYŚLNIE!');
    console.log('Twój Refresh Token to:', refreshToken);
    console.log('Wklej ten token do pliku .env (REFRESH_TOKEN=...).');
    console.log('======================================================\n');

    // Zaplanuj automatyczne odświeżenie w tle
    scheduleTokenRefresh(expiresIn);

    res.send('Zalogowano pomyślnie! Sprawdź konsolę serwera (zobaczysz tam swój Refresh Token). Tę kartę możesz już zamknąć.');
  } catch (err) {
    console.error('Błąd podczas autoryzacji:', err);
    res.status(500).send('Błąd podczas autoryzacji ze Spotify.');
  }
});

// ==========================================
// 2. AUTOMATYCZNE ODŚWIEŻANIE TOKENÓW
// ==========================================

function scheduleTokenRefresh(expiresIn) {
  // Odświeżamy token na 1 minutę (60 sek) przed faktycznym wygaśnięciem
  const refreshTime = (expiresIn - 60) * 1000;

  setTimeout(async () => {
    try {
      isRefreshing = true;
      const data = await spotifyApi.refreshAccessToken();
      spotifyApi.setAccessToken(data.body['access_token']);

      // Czasami Spotify może zwrócić nowy Refresh Token
      if (data.body['refresh_token']) {
        spotifyApi.setRefreshToken(data.body['refresh_token']);
      }

      console.log(`[${new Date().toLocaleTimeString()}] 🔄 Token zaktualizowany w tle.`);
      isRefreshing = false;

      // Zaplanuj kolejne odświeżenie
      scheduleTokenRefresh(data.body['expires_in']);
    } catch (err) {
      console.error('Błąd automatycznego odświeżania tokenu:', err);
      isRefreshing = false;
      // W razie problemów z siecią spróbuj jeszcze raz po 30 sekundach
      setTimeout(() => scheduleTokenRefresh(30 + 60), 30000);
    }
  }, refreshTime);
}

// Obsługa startu serwera po restarcie - wznawianie z .env
if (process.env.REFRESH_TOKEN) {
  console.log('Wykryto REFRESH_TOKEN w .env. Próbuję przywrócić sesję w tle...');
  spotifyApi.setRefreshToken(process.env.REFRESH_TOKEN);
  spotifyApi.refreshAccessToken().then(data => {
    spotifyApi.setAccessToken(data.body['access_token']);
    if (data.body['refresh_token']) spotifyApi.setRefreshToken(data.body['refresh_token']);
    scheduleTokenRefresh(data.body['expires_in']);
    console.log('✅ Sesja Spotify pomyślnie wznowiona bez konieczności ponownego logowania!');
  }).catch(err => {
    console.error('❌ Nie udało się przywrócić sesji z REFRESH_TOKEN. Zaloguj się ręcznie wejdź na /login.');
  });
}

// ==========================================
// 3. ENDPOINT DLA ROBLOX STUDIO
// ==========================================

app.get('/now-playing', async (req, res) => {
  if (!spotifyApi.getAccessToken()) {
    return res.status(401).json({ error: 'Serwer jeszcze nie zalogował się do Spotify. Otwórz /login' });
  }

  // Funkcja pomocnicza odpytująca Spotify
  const fetchCurrentTrack = async () => {
    const currentTrack = await spotifyApi.getMyCurrentPlayingTrack();

    // StatusCode 204 oznacza, że Spotify jest włączone, ale żaden utwór aktualnie nie gra i nie jest zatrzymany.
    if (currentTrack.statusCode === 204 || !currentTrack.body || !currentTrack.body.item) {
      return { isPlaying: false };
    }

    const item = currentTrack.body.item;
    const isPlaying = currentTrack.body.is_playing;

    // Zabezpieczenie np. dla podcastów, które nie mają struktury 'artists' takiej samej jak piosenki
    const artist = item.artists ? item.artists.map(a => a.name).join(', ') : 'Nieznany Artysta';
    const song = item.name;

    if (isPlaying) {
      return { isPlaying: true, artist: artist, song: song };
    } else {
      return { isPlaying: false };
    }
  };

  try {
    const data = await fetchCurrentTrack();
    res.json(data);
  } catch (err) {
    if (err.statusCode === 401 && !isRefreshing) {
      isRefreshing = true;
      try {
        const refreshData = await spotifyApi.refreshAccessToken();
        spotifyApi.setAccessToken(refreshData.body['access_token']);
        isRefreshing = false;

        const retryData = await fetchCurrentTrack();
        return res.json(retryData);
      } catch (refreshErr) {
        isRefreshing = false;
        return res.status(500).json({ error: 'Błąd podczas odświeżania awaryjnego.' });
      }
    }

    console.error('Błąd podczas pobierania muzyki:', err.message);
    res.status(500).json({ error: 'Wewnętrzny błąd serwera przy komunikacji ze Spotify.' });
  }
});

// ==========================================
// 4. ENDPOINT DLA BEAMMP (PTERODACTYL)
// ==========================================

app.get('/beammp-stats', async (req, res) => {
  const apiKey = process.env.PTERODACTYL_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Brak klucza PTERODACTYL_API_KEY w pliku .env' });
  }

  try {
    const response = await fetch('https://panel.atlashc.pl/api/client/servers/49d03b4d/resources', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Błąd Pterodactyl:', errorText);
      // Zwracamy pusty format awaryjny dla Robloxa, żeby nie sypał błędami "nil" w pętli
      return res.json({ status: "offline", cpu: "0", ram: "0", uptime: "0h 0m" });
    }

    const rawData = await response.json();

    // Filtrowanie i wyciąganie potrzebnych danych
    const attrs = rawData.attributes;
    const resStats = attrs.resources;

    // Przeliczanie RAM z bajtów na megabajty
    const ramMB = Math.round(resStats.memory_bytes / 1024 / 1024);

    // Przeliczanie Uptime z milisekund na godziny i minuty
    let uptimeStr = "0h 0m";
    if (resStats.uptime > 0) {
      const hours = Math.floor(resStats.uptime / (1000 * 60 * 60));
      const minutes = Math.floor((resStats.uptime % (1000 * 60 * 60)) / (1000 * 60));
      uptimeStr = `${hours}h ${minutes}m`;
    }

    // Wysyłamy do Robloxa czysty format
    res.json({
      status: attrs.current_state,
      cpu: resStats.cpu_absolute.toFixed(1),
      ram: ramMB,
      uptime: uptimeStr
    });

  } catch (err) {
    console.error('Błąd podczas formatowania danych z Pterodactyl:', err.message);
    res.json({ status: "offline", cpu: "0", ram: "0", uptime: "0h 0m" });
  }
});

// ==========================================
// 5. ENDPOINT DLA TEKSTÓW PIOSENEK (LYRICS)
// ==========================================

app.get('/lyrics', async (req, res) => {
    const artist = req.query.artist;
    const title = req.query.title;
    
    try {
        // lyrics-finder automatycznie szuka tekstu w Google/Genius
        const lyrics = await lyricsFinder(artist, title) || "Brak tekstu dla tej piosenki.";
        res.json({ lyrics: lyrics });
    } catch (err) {
        console.error("Błąd pobierania tekstu:", err);
        res.status(500).json({ error: "Nie udało się pobrać tekstu." });
    }
});

// Start serwera
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n==============================================`);
  console.log(`🚀 Serwer działa lokalnie na porcie: ${PORT}`);
  console.log(`👉 Zaloguj się pierwszy raz tu: http://localhost:${PORT}/login`);
  console.log(`==============================================\n`);
});