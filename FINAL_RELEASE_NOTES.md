# RouteWise Compass — Final Capstone Release

## Release scope

This repository contains the final RouteWise Compass capstone build. The application supports:

- origin and destination selection across all 50 U.S. states;
- state-filtered city lists;
- start date, end date, and traveler count;
- drive, flight, train, bus, and bicycle comparisons;
- visible planning estimates for time, distance, and cost;
- a dynamic 50-state route visualization;
- Explore and Bookings destination pages;
- My Trips, Favorites, and Checklist functions;
- local accounts and saved-content demonstration;
- provider links created from the current trip fields where supported;
- local fallback behavior when optional external services are unavailable.

## Accuracy boundary

RouteWise is a decision-support prototype. Displayed fares and other travel prices are planning estimates unless a value is returned by an authorized external service. External providers control current inventory, schedules, taxes, fees, accepted URL parameters, and checkout behavior. Users must verify every field and final price on the provider page before purchasing.

## Final validation

The final repository was tested from a clean extraction using:

```bash
npm install
npm run verify
npm test
npm start
```

The verification script checks required files, JavaScript syntax, JSON, all 50 state entries, city data for every state, and referenced assets. The smoke test checks server startup, the homepage, configuration, trip planning with five transportation options, provider links, registration and login, saved trips, and favorites.

## Demonstration trip

The documented repeatable test scenario is:

- Philadelphia, Pennsylvania
- Miami, Florida
- August 20–25, 2026
- Two travelers

Live external values may change. The application workflow, displayed result categories, local estimates, and automated tests are reproducible.
