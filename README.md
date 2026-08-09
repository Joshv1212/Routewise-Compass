# RouteWise Compass — VS Code Technical Walkthrough

RouteWise Compass is a vacation-planning web application with a browser-based front end and a Node.js back end.

This README is written specifically for the technical-recording requirement. The walkthrough uses Visual Studio Code and focuses only on showing the front-end and back-end source code without using Terminal or typing commands.

## What you need

- A Mac computer
- Visual Studio Code installed
- The RouteWise Compass ZIP downloaded from GitHub

## Open the project in Visual Studio Code

1. Download the RouteWise Compass ZIP from GitHub.
2. Open the Mac **Downloads** folder.
3. Double-click the ZIP to extract it.
4. Open **Visual Studio Code**.
5. Select **File → Open Folder**.
6. Select the extracted `RouteWise-Compass-GitHub-Ready` folder.
7. Select **Open**.
8. If Visual Studio Code asks whether you trust the authors, select **Yes, I trust the authors**.
9. Wait for the project files to finish loading.

## Front-end code to show

Open the `public` folder in the Explorer panel and show these files:

### `public/index.html`

This file contains the visible structure of the application, including:

- navigation;
- origin and destination inputs;
- travel dates and traveler count;
- transportation result areas;
- route map area;
- Explore and Bookings sections;
- My Trips, Checklist, and Favorites sections.

Suggested explanation:

> “The index.html file contains the main structure of the RouteWise interface. It defines the trip-planning form, navigation, transportation results, map area, destination content, saved trips, checklist, and favorites.”

### `public/styles.css`

This file controls:

- page layout;
- typography;
- navigation styling;
- trip-planning cards;
- transportation result cards;
- map and destination sections;
- responsive behavior for different screen sizes.

Suggested explanation:

> “The styles.css file controls the visual design of RouteWise, including the vacation theme, layout, cards, buttons, spacing, and responsive behavior.”

### `public/app.js`

This file controls the browser-side behavior, including:

- reading the user’s trip inputs;
- sending trip information to the back end;
- receiving and displaying transportation results;
- updating the route map;
- page navigation;
- saved trips;
- favorites;
- checklist interactions.

Suggested explanation:

> “The app.js file contains the main front-end logic. It reads the user’s selections, sends the trip request to the server, receives the calculated results, and displays the transportation cards and route information.”

### `public/cities-data.js`

This file stores the state and city data used by the origin and destination dropdowns.

Suggested explanation:

> “The cities-data.js file contains the state and city information used by the dropdown menus. After a user selects a state, the application loads the corresponding cities.”

## Back-end code to show

Open `server.js` from the main project folder.

### `server.js`

This file contains the Node.js back end. It is responsible for:

- serving the front-end files;
- receiving API requests from `app.js`;
- validating trip information;
- calculating transportation estimates;
- returning driving, flying, train, bus, and bicycle options;
- generating external provider links;
- supporting accounts, saved trips, and favorites;
- handling missing or invalid requests.

Suggested explanation:

> “The server.js file is the back end of RouteWise. It receives requests from the front end, validates the trip information, calculates the transportation estimates, generates provider links, and returns the results as JSON.”

Use Visual Studio Code search inside `server.js` to locate and briefly show:

- `/api/health`
- `/api/config`
- `/api/plan`
- account routes
- trip routes
- favorite routes

## Show that Visual Studio Code detects no code problems

1. Select **View → Problems** in Visual Studio Code.
2. The Problems panel opens at the bottom.
3. Show the number of errors and warnings reported by Visual Studio Code.
4. If the panel displays zero problems, keep it visible in the recording.

Suggested explanation:

> “I opened the complete RouteWise front-end and back-end project in Visual Studio Code. The source files loaded successfully, and Visual Studio Code reports no detected code problems.”

## Recommended recording order

1. Start the Zoom recording with webcam and screen sharing enabled.
2. Open GitHub and download the project ZIP.
3. Extract the ZIP.
4. Open the extracted folder in Visual Studio Code.
5. Show the project folder structure.
6. Show `public/index.html`.
7. Show `public/styles.css`.
8. Show `public/app.js`.
9. Show `public/cities-data.js`.
10. Show `server.js`.
11. Open the Visual Studio Code Problems panel.
12. End the recording.

## Project structure

```text
RouteWise-Compass-GitHub-Ready/
├── public/
│   ├── assets/          Images and map assets
│   ├── app.js           Front-end behavior and API requests
│   ├── cities-data.js   State and city data
│   ├── index.html       Front-end page structure
│   └── styles.css       Front-end styling
├── data/                Local demonstration data
├── scripts/             Automated project checks
├── server.js            Node.js back end and API routes
├── package.json         Project configuration
└── README.md            Technical walkthrough instructions
```

## Final statement for the recording

> “This walkthrough showed the RouteWise Compass front-end and back-end source code in Visual Studio Code. The front end is built with HTML, CSS, and JavaScript, while the back end is built with Node.js in server.js. The project files opened successfully, and Visual Studio Code displayed the code without detected problems.”
