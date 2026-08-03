# RouteWise Compass

RouteWise Compass is a vacation-planning web application that helps users:

- select an origin and destination from all 50 U.S. states;
- compare driving, flying, train, bus, and bicycle options;
- view estimated travel time, distance, and cost before opening a provider;
- see a route preview on a 50-state U.S. map;
- explore hotels, attractions, and vacation ideas;
- open transportation and booking links with available trip information carried forward;
- save trips, maintain favorites, and use a travel checklist.

## Important pricing notice

RouteWise displays **estimates** before a user opens a provider. Final fares, tolls, taxes, fees, schedules, availability, and booking terms are controlled by the external provider and may change. When a Google Maps API key is configured, RouteWise can request supported route, traffic, toll, hotel, and attraction data. Without a key, the application remains usable through clearly labeled fallback estimates.

## Requirements

- Node.js 18 or newer. Node.js 20 LTS is recommended.
- npm, which is installed with Node.js.
- A modern browser such as Chrome, Edge, Firefox, or Safari.
- Internet access for external booking links and optional Google data.

Check the installed versions:

```bash
node --version
npm --version
```

## Download from GitHub

1. Open the RouteWise repository.
2. Select **Code**.
3. Select **Download ZIP**.
4. Extract the downloaded ZIP.
5. Open a terminal in the extracted project folder—the folder that contains `package.json`.

Alternatively, clone the repository:

```bash
git clone YOUR_REPOSITORY_URL
cd RouteWise-Compass
```

## First-time setup

Install the project metadata and create a local environment file.

### macOS or Linux

```bash
npm install
cp .env.example .env
```

### Windows PowerShell

```powershell
npm install
Copy-Item .env.example .env
```

### Windows Command Prompt

```bat
npm install
copy .env.example .env
```

A Google Maps key is optional. Leave `GOOGLE_MAPS_API_KEY` blank to use local demo estimates.

## Verify the downloaded project

Run:

```bash
npm run verify
```

A successful check ends with:

```text
RouteWise verification completed successfully.
```

Run the automated server smoke test:

```bash
npm test
```

A successful test ends with:

```text
RouteWise smoke test completed successfully.
```

## Start RouteWise

Run:

```bash
npm start
```

The terminal should display:

```text
RouteWise running at http://localhost:3000
```

Open this address in a browser:

```text
http://localhost:3000
```

Do not open `public/index.html` directly for the technical demonstration. Starting the Node server ensures that all application features use the intended runtime.

## Optional Google Maps configuration

To enable supported Google Routes and Google Places requests:

1. Copy `.env.example` to `.env`.
2. Add an authorized server key:

```text
GOOGLE_MAPS_API_KEY=your_key_here
```

The following values control the driving-cost estimate:

```text
DEFAULT_VEHICLE_MPG=28
GAS_PRICE_PER_GALLON=3.60
```

Never commit `.env` or a real API key to GitHub. The project `.gitignore` excludes `.env`.

## Basic demonstration test

Use this fixed test case for a consistent walkthrough:

```text
Origin: Philadelphia, Pennsylvania
Destination: Miami, Florida
Start date: August 20, 2026
End date: August 25, 2026
Travelers: 2
```

Then confirm the following:

1. Select the origin state and city.
2. Select the destination state and city.
3. Select the start date, end date, and number of travelers.
4. Select **Plan My Trip**.
5. Confirm that transportation cards display time and cost information.
6. Confirm that the route map updates.
7. Confirm that hotel and attraction content appears.
8. Open **Explore** and **Bookings**.
9. Open a transportation link and verify that available route information is carried to the provider.
10. Save a trip and confirm that it appears under **My Trips**.
11. Open **Checklist** and **Favorites**.

## Project structure

```text
RouteWise-Compass/
├── public/
│   ├── assets/              Vacation images and 50-state map
│   ├── app.js               Browser logic and UI rendering
│   ├── cities-data.js       U.S. state and city data
│   ├── index.html           Application page structure
│   └── styles.css           Layout and responsive styling
├── data/
│   ├── .gitkeep
│   └── store.example.json   Empty data-store template
├── scripts/
│   ├── smoke-test.js        Starts and checks the local server
│   └── verify-project.js    Validates files, JSON, JS, and assets
├── .env.example             Safe configuration template
├── .gitignore               Excludes keys and runtime data
├── .nvmrc                   Recommended Node major version
├── package.json             Project commands and Node requirement
├── package-lock.json        Reproducible npm metadata
├── server.js                HTTP server, APIs, storage, and calculations
├── START_ROUTEWISE.command  macOS convenience launcher
└── START_ROUTEWISE_WINDOWS.bat Windows convenience launcher
```

The application creates `data/store.json` locally when needed. That runtime file is ignored by GitHub so user accounts and saved content are not accidentally committed.

## Troubleshooting

### `node` or `npm` is not recognized

Install Node.js 18 or newer, close the terminal, reopen it, and run:

```bash
node --version
npm --version
```

### Port 3000 is already being used

#### macOS or Linux

```bash
PORT=3001 npm start
```

#### Windows PowerShell

```powershell
$env:PORT=3001
npm start
```

#### Windows Command Prompt

```bat
set PORT=3001
npm start
```

Then open `http://localhost:3001`.

### Google data does not appear

The app still works with fallback estimates. For Google data, confirm that:

- `.env` exists in the project root;
- `GOOGLE_MAPS_API_KEY` is not blank;
- the required Google services and billing are enabled for the key;
- the key restrictions permit the server request.

### External provider page changes the search

External providers control their URLs, inventory, and booking interface. RouteWise sends the available origin, destination, date, and traveler details where the provider supports those parameters. Users should verify every field before purchasing.

## Stop the server

Return to the terminal and press:

```text
Ctrl + C
```

## Technical walkthrough

A recording checklist is included in [`TECHNICAL_WALKTHROUGH.md`](TECHNICAL_WALKTHROUGH.md).

## Final release validation

The final capstone build includes a verification script and an automated smoke test. From the repository root, run:

```bash
npm install
npm run verify
npm test
npm start
```

A successful verification confirms the required files, JavaScript syntax, valid JSON, all 50 states, city coverage for every state, and referenced images. A successful smoke test confirms server startup, the homepage, configuration, five-mode trip planning, provider links, account registration and login, saved trips, and favorites.

The final interface screenshot, architecture diagram, project schedule summary, and release notes are available in the [`docs/`](docs/) folder.

> RouteWise displays planning estimates. External providers control current fares, schedules, taxes, fees, accepted URL parameters, and checkout behavior. Verify all information on the provider page before purchase.
