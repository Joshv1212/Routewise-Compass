const state = {
  config:null,
  plan:null,
  selectedMode:null,
  user:JSON.parse(localStorage.getItem("routewise_user") || "null")
};

const LOCAL_KEYS = {
  trips: "routewise_local_trips",
  favorites: "routewise_local_favorites",
  users: "routewise_local_users"
};
state.serverAvailable = false;
let routeMap = null;
let routeMapLayer = null;
let routeMarkers = [];

function localRead(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function localWrite(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function fallbackMiles(a,b){
  const R=3958.8,rad=d=>d*Math.PI/180;
  const dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng);
  const x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
function routeSlug(value){
  return String(value||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/&/g,"and").replace(/[’']/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}
function currentTripLinks(input){
  const e=encodeURIComponent;
  const origin=`${input.origin.city}, ${input.origin.state}`;
  const destination=`${input.destination.city}, ${input.destination.state}`;
  const travelers=Math.max(1,Math.min(6,Number(input.travelers)||1));
  const start=input.startDate||"0000-00-00";
  const end=input.endDate||start;
  const originCoords=`${Number(input.origin.lat).toFixed(6)},${Number(input.origin.lng).toFixed(6)}`;
  const destinationCoords=`${Number(input.destination.lat).toFixed(6)},${Number(input.destination.lng).toFixed(6)}`;
  const mapBase=`https://www.google.com/maps/dir/?api=1&origin=${e(originCoords)}&destination=${e(destinationCoords)}`;
  const fromState=routeSlug(input.origin.state);
  const toState=routeSlug(input.destination.state);
  const fromCity=routeSlug(input.origin.city);
  const toCity=routeSlug(input.destination.city);
  const expediaFlight=`https://www.expedia.com/go/flight/search/Roundtrip/${e(start)}/${e(end)}?load=1&FromAirport=${e(origin)}&ToAirport=${e(destination)}&FromTime=362&ToTime=362&NumAdult=${travelers}`;
  return {
    drive:`${mapBase}&travelmode=driving`,
    bike:`${mapBase}&travelmode=bicycling`,
    transit:`${mapBase}&travelmode=transit`,
    flights:expediaFlight,
    train:`https://www.wanderu.com/en-us/train/us-${fromState}/${fromCity}/us-${toState}/${toCity}/`,
    bus:`https://www.wanderu.com/en-us/bus/us-${fromState}/${fromCity}/us-${toState}/${toCity}/`,
    hotels:`https://www.google.com/travel/hotels?hl=en&curr=USD&q=${e(`${destination} hotels ${start} to ${end} for ${travelers} travelers`)}`,
    carRental:"https://www.enterprise.com/en/car-rental.html",
    activities:`https://www.google.com/maps/search/?api=1&query=${e(`${destination} attractions`)}`,
    insurance:"https://www.allianztravelinsurance.com/quote"
  };
}
function fallbackLinks(input){
  return currentTripLinks(input);
}

function refreshTripLinkAnchors(scope=document){
  let links;
  try{links=currentTripLinks(input());}catch{return;}
  scope.querySelectorAll("[data-trip-link]").forEach(anchor=>{
    const key=anchor.dataset.tripLink;
    if(links[key])anchor.href=links[key];
    anchor.onclick=()=>{
      const fresh=currentTripLinks(input());
      if(fresh[key])anchor.href=fresh[key];
    };
  });
}

function fallbackPlan(input){
  const d=fallbackMiles(input.origin,input.destination);
  const driveSeconds=d/61*3600;
  const driveNights=Math.max(0,Math.floor(driveSeconds/32400));
  const gasPrice=3.60, mpg=28;
  const fuel=d/mpg*gasPrice;
  const estimatedTolls=d*.035;
  const driveLow=fuel+estimatedTolls;
  const driveHigh=fuel*1.12+estimatedTolls*1.35;
  const bikeSeconds=d/11.5*3600;
  const trainSeconds=d/46*3600;
  const busSeconds=d/43*3600;
  const flightComparisonSeconds=Math.max(2.5*3600,(d/500+2.1)*3600);
  const travelers=Math.max(1,Number(input.travelers)||1);
  const flightComparisonCost=travelers*(d<300?180:d<700?280:d<1400?420:560);
  const flightLow=Math.max(95,flightComparisonCost*.72);
  const flightHigh=Math.max(flightLow+70,flightComparisonCost*1.18);
  const trainLow=travelers*Math.max(55,d*.12);
  const trainHigh=travelers*Math.max(95,d*.22);
  const busLow=travelers*Math.max(35,d*.08);
  const busHigh=travelers*Math.max(70,d*.14);
  const options=[
    {mode:"drive",label:"Drive",icon:"🚗",distanceMiles:d,durationSeconds:driveSeconds,costLow:driveLow,costHigh:driveHigh,estimateLabel:"Estimated total",source:"Fuel and toll estimate shown before booking. Open Google Maps to verify live route and toll details.",transferText:"Fastest driving route",comparisonDurationSeconds:driveSeconds,comparisonCostHigh:driveHigh},
    {mode:"fly",label:"Fly",icon:"✈️",distanceMiles:null,durationSeconds:flightComparisonSeconds,costLow:flightLow,costHigh:flightHigh,estimateLabel:"Estimated round-trip fare",source:"Estimated round-trip airfare for all travelers. Open the prefilled flight results to verify the current purchasable fare and exact itinerary.",transferText:"Estimated airport-to-airport time",comparisonDurationSeconds:flightComparisonSeconds,comparisonCostHigh:flightHigh},
    {mode:"train",label:"Train",icon:"🚆",distanceMiles:d,durationSeconds:trainSeconds,costLow:trainLow,costHigh:trainHigh,estimateLabel:"Estimated total fare",source:"Estimated rail fare for all travelers. Open the prefilled train route to compare current transit options without entering the cities again.",transferText:"Estimated rail travel time",comparisonDurationSeconds:trainSeconds,comparisonCostHigh:trainHigh},
    {mode:"bus",label:"Bus",icon:"🚌",distanceMiles:d,durationSeconds:busSeconds,costLow:busLow,costHigh:busHigh,estimateLabel:"Estimated total fare",source:"Estimated intercity bus fare for all travelers. Open the prefilled bus route to compare current transit options without entering the cities again.",transferText:"Estimated bus travel time",comparisonDurationSeconds:busSeconds,comparisonCostHigh:busHigh},
    {mode:"bike",label:"Bike",icon:"🚲",distanceMiles:d,durationSeconds:bikeSeconds,costLow:0,costHigh:0,estimateLabel:"Ticket fare",source:"Ticket fare is $0. Food, lodging, equipment, and supplies are not included.",transferText:"Estimated bike route",comparisonDurationSeconds:bikeSeconds,comparisonCostHigh:0}
  ];
  const modePriority={drive:84,fly:d>500?90:66,train:d<500?78:62,bus:60,bike:input.travelers===1&&d<150?72:40};
  options.forEach(o=>o.score=modePriority[o.mode]);
  options.sort((a,b)=>b.score-a.score);
  const city=input.destination.city;
  const links=fallbackLinks(input);
  const attractions=[
    {name:`Top attractions in ${city}`,address:`${city}, ${input.destination.state}`,rating:null,userRatingCount:0,googleMapsUri:links.activities,websiteUri:null,photoName:null},
    {name:`${city} downtown`,address:`${city}, ${input.destination.state}`,rating:null,userRatingCount:0,googleMapsUri:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(city+" downtown")}`,websiteUri:null,photoName:null},
    {name:`${city} historic district`,address:`${city}, ${input.destination.state}`,rating:null,userRatingCount:0,googleMapsUri:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(city+" historic district")}`,websiteUri:null,photoName:null}
  ];
  return {
    input,
    best:options[0],
    options,
    route:{distanceMiles:d,durationSeconds:driveSeconds,source:"RouteWise local estimate",tollEstimate:null,tollCurrency:"USD",retrievedAt:new Date().toISOString()},
    links,
    hotels:[],
    attractions,
    generatedAt:new Date().toISOString(),
    sources:{drive:"Local estimate; live Google Maps link provided",flight:"Current data available after opening the prefilled flight search"},
    warnings:["Local mode cannot retrieve live Google data. Start the RouteWise server with a Google Maps API key for traffic-aware distance/time and supported toll estimates."]
  };
}
async function apiFetch(url, options){
  const response = await fetch(url, options);
  if(!response.ok) {
    let message="Request failed.";
    try { message=(await response.json()).error || message; } catch {}
    throw new Error(message);
  }
  state.serverAvailable=true;
  return response;
}

const $ = id => document.getElementById(id);
const moneyRange = (lo,hi) => lo == null ? "Open live fare" : (Number(lo)===0&&Number(hi)===0?"$0 ticket fare":`$${Math.round(lo).toLocaleString()} – $${Math.round(hi).toLocaleString()}`);
const duration = seconds => {
  if (!seconds) return "Open live time";
  const h=Math.floor(seconds/3600), m=Math.round((seconds%3600)/60);
  return h >= 24 ? `${Math.floor(h/24)} days ${h%24} hr` : `${h} hr ${m} min`;
};
const placePhoto = (photoName,fallback) => photoName && location.protocol !== "file:" ? `/api/place-photo?name=${encodeURIComponent(photoName)}` : fallback;

function populateStates(){
  const stateOptions=Object.entries(ROUTEWISE_STATE_NAMES)
    .sort((a,b)=>a[1].localeCompare(b[1]))
    .map(([code,name])=>`<option value="${code}">${name}</option>`)
    .join("");
  $("originState").innerHTML=stateOptions;
  $("destinationState").innerHTML=stateOptions;
  $("originState").value="NY";
  $("destinationState").value="FL";
  populateCitySelect("origin");
  populateCitySelect("destination");
  $("originCity").value="New York";
  $("destinationCity").value="Miami";
}
function populateCitySelect(prefix){
  const stateCode=$(`${prefix}State`).value;
  const cities=ROUTEWISE_CITY_DATA[stateCode] || [];
  $(`${prefix}City`).innerHTML=cities
    .map(([city])=>`<option value="${city.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}">${city.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</option>`)
    .join("");
}
function cityObject(stateCode,city){
  const record=(ROUTEWISE_CITY_DATA[stateCode] || []).find(([name])=>name===city);
  if(!record) throw new Error("Please select a valid city.");
  return {city,state:stateCode,lat:record[1],lng:record[2]};
}
function input(){
  const startDate=$("travelStartDate").value;
  const endDate=$("travelEndDate").value;
  return {
    origin:cityObject($("originState").value,$("originCity").value),
    destination:cityObject($("destinationState").value,$("destinationCity").value),
    date:startDate,
    startDate,
    endDate,
    travelers:Number($("travelers").value || 1),
    preference:state.user?.preference || "balanced"
  };
}
async function planTrip(){
  $("planTripButton").disabled=true;
  $("planTripButton").textContent="Planning...";
  const tripInput=input();
  try{
    let data;
    if(location.protocol === "file:"){
      data=fallbackPlan(tripInput);
    }else{
      try{
        const r=await apiFetch("/api/plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(tripInput)});
        data=await r.json();
      }catch{
        data=fallbackPlan(tripInput);
      }
    }
    state.plan=data;
    state.selectedMode=data.best.mode;
    renderPlan();
  }catch(e){
    console.error(e);
    alert("The trip could not be built. Please refresh and try again.");
  }finally{
    $("planTripButton").disabled=false;
    $("planTripButton").textContent="✦ Plan My Trip";
  }
}
function selected(){
  return state.plan?.options.find(o=>o.mode===state.selectedMode) || state.plan?.best;
}
function renderPlan(){
  const p=state.plan, best=p.best;
  $("dataSourceLabel").textContent=p.warnings.length ? p.warnings[0] : "Driving, cycling, transit, hotels, and attractions backed by Google Maps Platform";
  $("modeCards").innerHTML=p.options.map(o=>`
    <article class="mode-card ${o.mode===state.selectedMode?"selected":""}" data-mode="${o.mode}">
      <div class="mode-top"><span class="mode-icon">${o.icon}</span><strong>${o.label}</strong></div>
      ${o.mode===best.mode?'<span class="recommended">RECOMMENDED</span>':""}
      <div class="time">${o.timeLabel||duration(o.durationSeconds)}</div>
      <div class="meta">${o.distanceMiles?Math.round(o.distanceMiles).toLocaleString()+" miles":o.transferText}</div>
      <hr>
      <div class="price">${o.priceLabel||moneyRange(o.costLow,o.costHigh)}</div>
      <div class="estimate-label">${o.estimateLabel||"Estimated before booking"}</div>
      <div class="source">${o.source}</div>
    </article>`).join("");
  document.querySelectorAll(".mode-card").forEach(card=>card.onclick=()=>{state.selectedMode=card.dataset.mode;renderPlan();});
  renderRoute();
  renderHotels();
  renderAttractions();
  renderBookings();
  renderChecklist();
}
function renderRoute(){
  const p=state.plan, o=selected();
  const distanceValue=o.distanceMiles??p.route?.distanceMiles;
  $("routeMiles").textContent=distanceValue?`${Math.round(distanceValue).toLocaleString()} miles`:"Open live route";
  $("routeTime").textContent=o.timeLabel||duration(o.durationSeconds);
  $("routeCost").textContent=o.priceLabel||moneyRange(o.costLow,o.costHigh);
  $("routeSource").textContent=p.route?.source?.includes("Google")?"Google Maps":"Route estimate";
  const modeLink={drive:p.links.drive,fly:p.links.flights,train:p.links.train,bus:p.links.bus,bike:p.links.bike}[o.mode]||p.links.drive;
  $("fullRouteLink").href=modeLink;
  $("fullRouteLink").dataset.tripLink={drive:"drive",fly:"flights",train:"train",bus:"bus",bike:"bike"}[o.mode]||"drive";
  refreshTripLinkAnchors($("fullRouteLink").parentElement);
  $("fullRouteLink").textContent={drive:"Open Live Route in Google Maps ↗",fly:"Open Prefilled Flight Results ↗",train:"Open Prefilled Train Route ↗",bus:"Open Prefilled Bus Route ↗",bike:"Open Bike Route in Google Maps ↗"}[o.mode]||"Open Live Details ↗";
  updateTripMap(p.input.origin,p.input.destination,o.encodedPolyline||p.route?.encodedPolyline||null);
}
function decodePolyline(encoded){
  if(!encoded)return null;
  const points=[];
  let index=0,lat=0,lng=0;
  while(index<encoded.length){
    let result=0,shift=0,b;
    do{b=encoded.charCodeAt(index++)-63;result|=(b&0x1f)<<shift;shift+=5;}while(b>=0x20);
    lat+=(result&1)?~(result>>1):(result>>1);
    result=0;shift=0;
    do{b=encoded.charCodeAt(index++)-63;result|=(b&0x1f)<<shift;shift+=5;}while(b>=0x20);
    lng+=(result&1)?~(result>>1):(result>>1);
    points.push([lat/1e5,lng/1e5]);
  }
  return points;
}
function projectUsPoint(lat,lng){
  // The main map uses the contiguous U.S.; Alaska and Hawaii use inset boxes.
  if(lat>=50 && lng<=-130){
    return {
      x:Math.max(3,Math.min(28,3+((lng+170)/40)*25)),
      y:Math.max(78,Math.min(97,78+((72-lat)/21)*19)),
      region:"AK"
    };
  }
  if(lat<=23.5 && lng<=-154){
    return {
      x:Math.max(31,Math.min(49,31+((lng+161.2)/6.9)*18)),
      y:Math.max(82,Math.min(96,82+((22.5-lat)/4)*14)),
      region:"HI"
    };
  }
  return {
    x:Math.max(2,Math.min(98,2+((lng+125)/59)*96)),
    y:Math.max(3,Math.min(80,3+((50-lat)/26)*77)),
    region:"CONUS"
  };
}
function updateTripMap(origin,destination,encodedPolyline=null){
  if(!origin||!destination)return;
  const mapEl=$("map");
  const a=projectUsPoint(origin.lat,origin.lng);
  const b=projectUsPoint(destination.lat,destination.lng);
  const decoded=decodePolyline(encodedPolyline);
  const canUseDetailedPolyline=decoded && decoded.length>2 && a.region==="CONUS" && b.region==="CONUS";
  const rawPoints=canUseDetailedPolyline?decoded:[[origin.lat,origin.lng],[destination.lat,destination.lng]];
  const projected=rawPoints.map(([lat,lng])=>projectUsPoint(lat,lng));
  let routePath="";
  if(projected.length>2){
    routePath=projected.map((pt,index)=>`${index===0?"M":"L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(" ");
  }else{
    const dx=Math.abs(b.x-a.x);
    const curve=Math.min(14,Math.max(5,dx*.12));
    const mx=(a.x+b.x)/2;
    const my=Math.max(5,Math.min(91,(a.y+b.y)/2-curve));
    routePath=`M ${a.x.toFixed(2)} ${a.y.toFixed(2)} Q ${mx.toFixed(2)} ${my.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  }
  const clampLabel=pt=>({x:Math.max(10,Math.min(90,pt.x)),y:Math.max(10,Math.min(92,pt.y))});
  const la=clampLabel(a),lb=clampLabel(b);
  mapEl.innerHTML=`<div class="fallback-map usa-states-map"><img class="usa-states-base" src="assets/usa_50_states_map.png" alt="Map of all 50 United States with state boundaries"><svg class="usa-map-overlay" viewBox="0 0 100 100" preserveAspectRatio="none"><path class="route-glow" d="${routePath}"/><path class="route-line" d="${routePath}"/><circle class="origin-dot" cx="${a.x}" cy="${a.y}" r="2.15"/><circle class="destination-dot" cx="${b.x}" cy="${b.y}" r="2.15"/></svg><div class="fallback-label origin-label" style="left:${la.x}%;top:${la.y}%">${origin.city}, ${origin.state}</div><div class="fallback-label destination-label" style="left:${lb.x}%;top:${lb.y}%">${destination.city}, ${destination.state}</div><div class="map-key"><span><i class="key-origin"></i>Start</span><span><i class="key-destination"></i>Destination</span></div></div>`;
}
function previewInputMap(){
  try{
    const tripInput=input();
    updateTripMap(tripInput.origin,tripInput.destination);
  }catch{}
}
function renderHotels(){
  const p=state.plan, hotels=p.hotels||[];
  const h=hotels[0];
  $("stopCity").textContent=h?h.name:`Hotels in ${p.input.destination.city}`;
  $("stopDetails").textContent=h?h.address:"Open Google Hotels for current availability.";
  $("hotelName").textContent=h?h.name:"Google Hotels";
  $("hotelRating").textContent=h?.rating?`★ ${h.rating} (${h.userRatingCount.toLocaleString()} reviews)`:"Live ratings on provider";
  const hotelRange=h?.priceLevel==="PRICE_LEVEL_EXPENSIVE"?"Est. $240–$420 / night":h?.priceLevel==="PRICE_LEVEL_MODERATE"?"Est. $150–$260 / night":h?.priceLevel==="PRICE_LEVEL_INEXPENSIVE"?"Est. $95–$170 / night":"Est. $130–$260 / night";
  $("hotelPrice").textContent=hotelRange;
  $("hotelDealLink").href=h?.websiteUri||h?.googleMapsUri||p.links.hotels;
  $("hotelImage").src=placePhoto(h?.photoName,"assets/hotel_savannah.jpg");
  $("stopImage").src=placePhoto(h?.photoName,"assets/hotel_savannah.jpg");
}
function renderAttractions(){
  const p=state.plan, attractions=(p.attractions||[]).slice(0,3);
  const fallbacks=[
    {name:`Top attraction in ${p.input.destination.city}`,rating:null,userRatingCount:0,photo:"assets/attraction_park.jpg"},
    {name:`Historic district`,rating:null,userRatingCount:0,photo:"assets/attraction_street.jpg"},
    {name:`Scenic local area`,rating:null,userRatingCount:0,photo:"assets/attraction_historic.jpg"}
  ];
  const items=[...attractions,...fallbacks].slice(0,3);
  $("attractionsTitle").textContent=`Things to Do in ${p.input.destination.city}`;
  $("attractionList").innerHTML=items.map((a,i)=>`
    <div class="attraction">
      <img src="${placePhoto(a.photoName,a.photo||["assets/attraction_park.jpg","assets/attraction_street.jpg","assets/attraction_historic.jpg"][i])}" alt="${a.name}">
      <div><h4>${a.name}</h4><p>${a.rating?`${a.rating} ★ (${a.userRatingCount.toLocaleString()})`:"Open for live details"}</p><a href="${a.websiteUri||a.googleMapsUri||p.links.activities}" target="_blank" rel="noopener">View official page</a></div>
    </div>`).join("");
  $("moreAttractionsLink").href=p.links.activities;
  renderExplore();
}
function renderBookings(){
  const p=state.plan;
  const destination=`${p.input.destination.city}, ${p.input.destination.state}`;
  const selectedHotel=(p.hotels||[])[0];
  const selectedAttraction=(p.attractions||[])[0];
  const hotelLink=selectedHotel?.websiteUri||selectedHotel?.googleMapsUri||p.links.hotels;
  const attractionLink=selectedAttraction?.websiteUri||selectedAttraction?.googleMapsUri||p.links.activities;
  const primaryItems=[
    ["✈️","Flights","Open a flight-results page with your cities, dates, and traveler count already filled in.",p.links.flights,"assets/hero_mountains.jpg","Open Prefilled Flight Search","flights"],
    ["🏨","Selected Stay",selectedHotel?`Open ${selectedHotel.name}'s official or exact place page.`:`Compare current hotel availability in ${destination}.`,hotelLink,"assets/hotel_savannah.jpg",selectedHotel?.websiteUri?"Open Official Hotel Site":"Open Hotel Page",null],
    ["🚆","Train","Open a train route page with your starting city and destination already selected.",p.links.train,"assets/trips_vacation.jpg","Open Prefilled Train Route","train"],
    ["🚌","Bus","Open a bus route page with your starting city and destination already selected.",p.links.bus,"assets/bookings_vacation.jpg","Open Prefilled Bus Route","bus"],
    ["🎟️","Featured Activity",selectedAttraction?`Open ${selectedAttraction.name}'s official or exact Google Maps place page.`:`Open destination attractions for ${destination}.`,attractionLink,"assets/attraction_street.jpg",selectedAttraction?.websiteUri?"Open Official Attraction Site":"Open Attraction Page",null],
    ["🚙","Car Rental","Start a reservation on Enterprise's official booking site.",p.links.carRental,"assets/adventure_card.jpg","Open Enterprise",null],
    ["🛡","Travel Insurance","Open Allianz's official quote and purchase page.",p.links.insurance,"assets/checklist_luggage.jpg","Get Insurance Quote",null]
  ];
  $("bookingLinks").innerHTML=primaryItems.slice(0,5).map(([icon,title,desc,url,,action,linkKey])=>`<div class="booking-option"><span>${icon}</span><h4>${title}</h4><p>${desc}</p><a href="${url}" ${linkKey?`data-trip-link="${linkKey}"`:""} target="_blank" rel="noopener">${action}</a></div>`).join("");
  $("allBookingLinks").innerHTML=primaryItems.map(([icon,title,desc,url,img,action,linkKey])=>`<div class="library-card visual-tile"><img src="${img}" alt="${title}"><div><h3>${icon} ${title}</h3><p>${desc}</p><a href="${url}" ${linkKey?`data-trip-link="${linkKey}"`:""} target="_blank" rel="noopener">${action}</a></div></div>`).join("");
  refreshTripLinkAnchors();

  const hotelItems=(p.hotels&&p.hotels.length?p.hotels.slice(0,3):[]).map(h=>({
    name:h.name,
    desc:h.address||`Popular stay in ${destination}`,
    meta:h.rating?`★ ${h.rating} • ${h.userRatingCount?.toLocaleString?.()||0} reviews`:'Open the official or exact place page for live details',
    link:h.websiteUri||h.googleMapsUri||p.links.hotels,
    action:h.websiteUri?"Open Official Site":"Open Exact Place Page",
    img:placePhoto(h.photoName,'assets/hotel_savannah.jpg')
  }));
  const fallbacks=[
    {name:`Hotels in ${p.input.destination.city}`,desc:`Compare current availability for ${destination}.`,meta:'Google Hotels results for the selected destination and dates',link:p.links.hotels,action:'Open Google Hotels',img:'assets/bookings_vacation.jpg'},
    {name:`Car rental in ${p.input.destination.city}`,desc:'Start a reservation on the official Enterprise website.',meta:'Official provider booking page',link:p.links.carRental,action:'Open Enterprise',img:'assets/adventure_card.jpg'},
    {name:`Travel protection`,desc:'Compare and purchase travel insurance from the official provider.',meta:'Official Allianz quote page',link:p.links.insurance,action:'Open Quote Page',img:'assets/checklist_luggage.jpg'}
  ];
  const stayItems=[...hotelItems,...fallbacks].slice(0,3);
  $("bookingStayGrid").innerHTML=stayItems.map(item=>`<div class="library-card visual-tile stay-card"><img src="${item.img}" alt="${item.name}"><div><h3>${item.name}</h3><p>${item.desc}</p><p>${item.meta}</p><a href="${item.link}" target="_blank" rel="noopener">${item.action}</a></div></div>`).join('');

  const assistItems=[
    ['Verify live transportation','Google Maps can provide route distance/time and supported toll estimates. Ticket fares must be confirmed with the provider.','assets/hero_mountains.jpg'],
    ['Use official checkout pages','Hotel and attraction cards use the official website when Google Places supplies one; otherwise they use the exact Google Maps place page.','assets/hotel_savannah.jpg'],
    ['Choose a flight before checkout','The prefilled flight page displays live offers, then continues to checkout after you select an itinerary.','assets/attraction_historic.jpg'],
    ['Review final totals','Prices can change until the provider confirms the purchase. Review taxes, fees, baggage, cancellation, and refund terms.','assets/checklist_luggage.jpg']
  ];
  $("bookingAssistGrid").innerHTML=assistItems.map(([title,text,img],idx)=>`<div class="assist-card"><img src="${img}" alt="${title}"><div><b>${idx+1}. ${title}</b><p>${text}</p></div></div>`).join('');
}
function checklistItems(){
  const mode=state.selectedMode||"drive";
  const base=[
    ["🎫","Book transportation","Open and confirm the selected live provider page."],
    ["🏨","Reserve lodging","Confirm the hotel and cancellation terms."],
    ["🎟️","Book activities","Save official tickets or confirmations."],
    ["🎒","Pack essentials","ID, medication, charger, weather gear."]
  ];
  const extra={
    drive:[["⛽","Vehicle ready","Check fuel, tires, tolls, and rest stops."]],
    fly:[["🛄","Flight ready","Check baggage, airport arrival, and transfer."]],
    train:[["🚆","Rail ready","Confirm station, platform, and transfer details."]],
    bus:[["🚌","Bus ready","Confirm boarding location and last-mile transit."]],
    bike:[["🚲","Bike ready","Check lights, tools, route, and overnight stops."]]
  };
  return [...base,...(extra[mode]||[])];
}
function renderChecklist(){
  const items=checklistItems();
  $("miniChecklist").innerHTML=items.slice(0,4).map((x,i)=>`<div class="mini-check ${i===3?"pending":""}"><span>✓</span>${x[1]}</div>`).join("");
  $("fullChecklist").innerHTML=items.map(([e,t,d])=>`<label class="check-item"><div class="emoji">${e}</div><div><b>${t}</b><small>${d}</small></div><input type="checkbox"></label>`).join("");
}
function renderExplore(){
  if(!state.plan)return;
  const p=state.plan;
  const attractionItems=(p.attractions||[]).slice(0,6).map((a,i)=>({
    name:a.name,
    desc:a.address || `Popular place in ${p.input.destination.city}`,
    meta:a.rating?`★ ${a.rating} • ${a.userRatingCount.toLocaleString()} reviews`:'Open for live details',
    link:a.websiteUri||a.googleMapsUri||p.links.activities,
    img:placePhoto(a.photoName,["assets/attraction_park.jpg","assets/attraction_street.jpg","assets/attraction_historic.jpg","assets/explore_vacation.jpg","assets/trips_vacation.jpg","assets/bookings_vacation.jpg"][i%6])
  }));
  const fallbackAttractions=[
    {name:`Best beach or waterfront area`,desc:`Relaxing vacation stop near ${p.input.destination.city}`,meta:'Scenic local highlight',link:p.links.activities,img:'assets/explore_vacation.jpg'},
    {name:`Historic district`,desc:`Walkable area with shops, food, and local character.`,meta:'Popular with visitors',link:p.links.activities,img:'assets/attraction_historic.jpg'},
    {name:`Sunset viewpoint`,desc:`Great place to end the day and take photos.`,meta:'Vacation favorite',link:p.links.activities,img:'assets/trips_vacation.jpg'},
    {name:`Signature local attraction`,desc:`A well-known stop worth checking before the trip.`,meta:'Ticketed or official access available',link:p.links.activities,img:'assets/attraction_street.jpg'},
    {name:`Food and culture area`,desc:`Restaurants, cafés, and local energy in one area.`,meta:'Great for a first evening visit',link:p.links.activities,img:'assets/bookings_vacation.jpg'},
    {name:`Family-friendly stop`,desc:`Easy activity option for travelers of different ages.`,meta:'Check hours and tickets',link:p.links.activities,img:'assets/attraction_park.jpg'}
  ];
  const primary=[...attractionItems,...fallbackAttractions].slice(0,6);
  $("exploreGrid").innerHTML=primary.map(item=>`<div class="library-card visual-tile"><img src="${item.img}" alt="${item.name}"><div><h3>${item.name}</h3><p>${item.desc}</p><p>${item.meta}</p><a href="${item.link}" target="_blank" rel="noopener">Open official page</a></div></div>`).join('');
  $("exploreOfficialLink").href=p.links.activities;

  const extraItems=[
    {title:`Top photo spot`,text:`A scenic stop for vacation photos near ${p.input.destination.city}.`,img:'assets/explore_vacation.jpg',link:p.links.activities},
    {title:`Local neighborhood to stroll`,text:`Explore a walkable district with dining and atmosphere.`,img:'assets/attraction_street.jpg',link:p.links.activities},
    {title:`Relaxing park or waterfront`,text:`Good choice for a slower part of the day.`,img:'assets/attraction_park.jpg',link:p.links.activities},
    {title:`Historic landmark`,text:`Learn a little about the place while traveling.`,img:'assets/attraction_historic.jpg',link:p.links.activities},
    {title:`Best evening area`,text:`Night views, lights, and a more energetic vibe.`,img:'assets/trips_vacation.jpg',link:p.links.activities},
    {title:`Vacation-ready hidden gem`,text:`A memorable stop that adds personality to the trip.`,img:'assets/bookings_vacation.jpg',link:p.links.activities}
  ];
  $("exploreExtraGrid").innerHTML=extraItems.map(item=>`<div class="library-card visual-tile"><img src="${item.img}" alt="${item.title}"><div><h3>${item.title}</h3><p>${item.text}</p><a href="${item.link}" target="_blank" rel="noopener">View more</a></div></div>`).join('');
  const photoWall=[
    ['assets/explore_vacation.jpg',`${p.input.destination.city} beach & water views`],
    ['assets/trips_vacation.jpg',`Vacation skyline moments`],
    ['assets/hero_mountains.jpg',`Scenic travel mood`],
    ['assets/bookings_vacation.jpg',`Stay ideas & resort vibes`]
  ];
  $("explorePhotoWall").innerHTML=photoWall.map(([img,title])=>`<div class="photo-tile"><img src="${img}" alt="${title}"><div class="photo-overlay"><strong>${title}</strong></div></div>`).join('');
}
function ensureDestinationPages(){
  if(!state.plan){
    try{
      state.plan=fallbackPlan(input());
      state.selectedMode=state.plan.best.mode;
    }catch(error){
      console.warn("Could not prepare destination pages.",error);
      return;
    }
  }
  renderExplore();
  renderBookings();
}
function switchPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".side-link").forEach(b=>b.classList.remove("active"));
  $(`${page}Page`).classList.add("active");
  document.querySelector(`.side-link[data-page="${page}"]`)?.classList.add("active");
  if(page==="explore" || page==="bookings")ensureDestinationPages();
  if(page==="trips")loadTrips();
  if(page==="favorites")loadFavorites();
}
async function requireUser(){
  if(state.user)return true;
  $("authDialog").showModal();
  return false;
}
async function saveTrip(){
  if(!state.plan)return alert("Plan a trip first.");
  if(!state.user && location.protocol !== "file:"){
    $("authDialog").showModal();
    return;
  }
  if(location.protocol === "file:" || !state.serverAvailable){
    const trips=localRead(LOCAL_KEYS.trips,[]);
    trips.unshift({id:String(Date.now()),createdAt:new Date().toISOString(),plan:state.plan});
    localWrite(LOCAL_KEYS.trips,trips);
    alert("Trip saved locally.");
    loadTrips();
    return;
  }
  try{
    const r=await apiFetch("/api/trips",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:state.user.id,plan:state.plan})});
    if(r.ok){alert("Trip saved.");loadTrips();}
  }catch{
    const trips=localRead(LOCAL_KEYS.trips,[]);
    trips.unshift({id:String(Date.now()),createdAt:new Date().toISOString(),plan:state.plan});
    localWrite(LOCAL_KEYS.trips,trips);
    alert("Server unavailable. Trip saved locally.");
  }
}
async function loadTrips(){
  let trips=[];
  if(location.protocol === "file:" || !state.user){
    trips=localRead(LOCAL_KEYS.trips,[]);
  }else{
    try{
      const r=await apiFetch(`/api/trips/${state.user.id}`);
      trips=await r.json();
    }catch{
      trips=localRead(LOCAL_KEYS.trips,[]);
    }
  }
  $("savedTrips").innerHTML=trips.length?trips.map(t=>`<div class="library-card"><div><h3>${t.plan.input.origin.city} → ${t.plan.input.destination.city}</h3><p>${t.plan.best.label} • ${duration(t.plan.best.durationSeconds)}</p><button data-trip="${t.id}">Open</button> <button data-delete="${t.id}">Delete</button></div></div>`).join(""):`<div class="library-card"><div><h3>No saved trips</h3><p>Plan a trip and save it here.</p></div></div>`;
  document.querySelectorAll("[data-trip]").forEach(b=>b.onclick=()=>{
    const t=trips.find(x=>String(x.id)===String(b.dataset.trip));
    state.plan=t.plan;state.selectedMode=t.plan.best.mode;renderPlan();switchPage("plan");
  });
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{
    if(location.protocol !== "file:" && state.user && state.serverAvailable){
      try{await apiFetch(`/api/trips/${b.dataset.delete}`,{method:"DELETE"});}catch{}
    }
    const local=localRead(LOCAL_KEYS.trips,[]).filter(t=>String(t.id)!==String(b.dataset.delete));
    localWrite(LOCAL_KEYS.trips,local);
    loadTrips();
  });
}
async function loadFavorites(){
  let data=[];
  if(location.protocol === "file:" || !state.user){
    data=localRead(LOCAL_KEYS.favorites,[]);
  }else{
    try{
      const r=await apiFetch(`/api/favorites/${state.user.id}`);
      data=await r.json();
    }catch{
      data=localRead(LOCAL_KEYS.favorites,[]);
    }
  }
  $("favoritesGrid").innerHTML=data.length?data.map(f=>`<div class="library-card"><div><h3>${f.item?.name||"Favorite"}</h3><p>${f.item?.address||""}</p><a href="${f.item?.websiteUri||f.item?.googleMapsUri||"#"}" target="_blank">Open</a></div></div>`).join(""):`<div class="library-card"><div><h3>No favorites yet</h3><p>Favorites can be stored locally or through the backend.</p></div></div>`;
}
async function authenticate(endpoint,body){
  if(location.protocol === "file:" || !state.serverAvailable){
    const users=localRead(LOCAL_KEYS.users,[]);
    if(endpoint.includes("register")){
      if(users.some(u=>u.email===body.email.toLowerCase()))throw new Error("Account already exists.");
      const user={id:String(Date.now()),name:body.name,email:body.email.toLowerCase(),password:body.password};
      users.push(user);localWrite(LOCAL_KEYS.users,users);
      state.user={id:user.id,name:user.name,email:user.email};
    }else{
      const user=users.find(u=>u.email===body.email.toLowerCase()&&u.password===body.password);
      if(!user)throw new Error("Invalid email or password.");
      state.user={id:user.id,name:user.name,email:user.email};
    }
    localStorage.setItem("routewise_user",JSON.stringify(state.user));
    $("authDialog").close();$("authMessage").textContent="";
    return;
  }
  const r=await apiFetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data=await r.json();
  state.user=data.user;localStorage.setItem("routewise_user",JSON.stringify(data.user));$("authDialog").close();$("authMessage").textContent="";
}
function setup(){
  populateStates();
  $("originState").onchange=()=>{populateCitySelect("origin");previewInputMap();state.plan=null;ensureDestinationPages();};
  $("destinationState").onchange=()=>{populateCitySelect("destination");previewInputMap();state.plan=null;ensureDestinationPages();};
  $("originCity").onchange=()=>{previewInputMap();state.plan=null;ensureDestinationPages();};
  $("destinationCity").onchange=()=>{previewInputMap();state.plan=null;ensureDestinationPages();};
  $("planTripButton").onclick=planTrip;
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>switchPage(b.dataset.page));
  $("saveCurrentTrip").onclick=saveTrip;
  $("supportButton").onclick=()=>alert("Use each live provider page to verify current price, availability, and booking terms.");
  $("closeAuth").onclick=()=>$("authDialog").close();
  document.querySelectorAll(".auth-tab").forEach(t=>t.onclick=()=>{document.querySelectorAll(".auth-tab").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".auth-form").forEach(x=>x.classList.remove("active"));t.classList.add("active");$(`${t.dataset.form}Form`).classList.add("active");});
  $("loginForm").onsubmit=async e=>{e.preventDefault();try{await authenticate("/api/auth/login",{email:$("loginEmail").value,password:$("loginPassword").value});}catch(err){$("authMessage").textContent=err.message;}};
  $("registerForm").onsubmit=async e=>{e.preventDefault();try{await authenticate("/api/auth/register",{name:$("registerName").value,email:$("registerEmail").value,password:$("registerPassword").value});}catch(err){$("authMessage").textContent=err.message;}};
}
document.addEventListener("DOMContentLoaded",async()=>{
  state.config={hasGoogleMaps:false};
  if(location.protocol !== "file:"){
    try{
      const r=await fetch("/api/config");
      if(r.ok){
        state.config=await r.json();
        state.serverAvailable=true;
      }
    }catch(e){
      console.warn("Backend unavailable; running in local demo mode.",e);
    }
  }
  setup();
  previewInputMap();
  renderChecklist();
  ensureDestinationPages();
});
