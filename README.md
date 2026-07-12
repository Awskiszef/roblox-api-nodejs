# Roblox Proxy API

Prosty backend w Node.js (Express), który służy jako proxy pomiędzy serwerem gry w Roblox Studio a zewnętrznymi API (Spotify oraz Pterodactyl). Pozwala on bezpiecznie odpytywać zewnętrzne serwisy bez konieczności udostępniania tajnych kluczy dostępu w kodzie na Robloxie.

## Funkcje
- **Integracja ze Spotify API:** Pobiera informacje o aktualnie odtwarzanym utworze na koncie użytkownika. Działa bezobsługowo w tle 24/7 dzięki systemowi automatycznego odświeżania tokenów.
- **Integracja z Pterodactyl API:** Pobiera i przetwarza na przyjazny format statystyki wybranego serwera (np. BeamMP) (CPU, RAM, Uptime).
- **Zabezpieczenie przed wygasaniem sesji:** Automatyczne wznawianie pracy i generowanie odświeżonych tokenów po restarcie (przy użyciu pliku `.env`).

## Wymagania
- Node.js (najlepiej wersja 18 lub wyższa z uwagi na natywny `fetch`)
- npm

## Instalacja

1. Pobierz pliki i przejdź do folderu z projektem.
2. Zainstaluj wymagane pakiety:
   ```bash
   npm install
   ```
3. Skonfiguruj środowisko. Utwórz plik `.env` i wypełnij go swoimi danymi.

### Konfiguracja `.env`

Wymagane klucze w pliku to:
```env
PORT=3000

# Dane aplikacji Spotify (z Developer Dashboard)
CLIENT_ID=twoj_client_id
CLIENT_SECRET=twoj_client_secret
REDIRECT_URI=http://127.0.0.1:3000/callback

# Wygeneruje się po pierwszym logowaniu i pozwoli na działanie w tle
REFRESH_TOKEN=

# Klucz API (Client API Key) z panelu Pterodactyl
PTERODACTYL_API_KEY=twoj_klucz_pterodactyl
```

## Pierwsze Uruchomienie (Autoryzacja Spotify)

1. Uruchom serwer poleceniem:
   ```bash
   npm start
   ```
2. Wejdź w przeglądarce na komputerze z serwerem na adres: [http://127.0.0.1:3000/login](http://127.0.0.1:3000/login).
3. Po autoryzacji konta serwer wyświetli Ci w terminalu Twój **Refresh Token**. 
4. Skopiuj ten token, wyłącz serwer (`Ctrl+C`), wklej go do pliku `.env` i uruchom serwer ponownie. Od teraz skrypt będzie samodzielnie odświeżać dostęp do Spotify!

## Dostępne Endpointy dla Roblox Studio

Te adresy odpytujesz wewnątrz skryptów na Robloxie za pomocą `HttpService:GetAsync("http://TWOJE_IP:3000/endpoint")`.

### 1. `GET /now-playing`
Zwraca informacje o aktualnie odtwarzanym utworze na Spotify.
**Przykładowa odpowiedź (gdy gra muzyka):**
```json
{
  "isPlaying": true,
  "artist": "Awski",
  "song": "Tytuł Utworu"
}
```
**Przykładowa odpowiedź (gdy nic nie gra):**
```json
{
  "isPlaying": false
}
```

### 2. `GET /beammp-stats`
Zwraca uproszczone, gotowe do wyświetlenia np. na tablicy w grze statystyki z serwera na Pterodactylu.
**Przykładowa odpowiedź:**
```json
{
  "status": "running",
  "cpu": "12.5",
  "ram": 1024,
  "uptime": "2h 15m"
}
```

### 3. `GET /lyrics`
Zwraca tekst wybranej piosenki wyszukany w internecie (Google/Genius).
**Przykład wywołania:**
`GET /lyrics?artist=Awski&title=Tytuł`
**Przykładowa odpowiedź:**
```json
{
  "lyrics": "Tutaj znajduje się pełen tekst piosenki..."
}
```
W przypadku braku tekstu w bazie, API zwróci informację: `"Brak tekstu dla tej piosenki."`

## Bezpieczeństwo
Plik `.env` został dodany do ignorowanych w `.gitignore`. Przechowuje on Twoje poufne klucze - uważaj, aby nikomu ich nie udostępniać i nie commitować tego pliku.
