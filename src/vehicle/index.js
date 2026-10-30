// Vehicles: the taxi (exterior, interior, controls, glass, mirrors, physics) and the
// intro motorcycle (contract: docs/ARCHITECTURE.md "vehicle").
//
// Internals:
//   TaxiBody.js       lofted body shell (lower body sections + greenhouse loops), window cut-outs
//   TaxiModel.js      exterior assembly: doors, trunk, bumpers, lights, wipers, roof sign, wheels
//   TaxiInterior.js   dashboard, gauges, meter, radio, wheel, pedals, seats, amulets, door cards
//   VehicleTextures.js taxi paint atlas + gauges / meter / radio / signs / stickers / photo
//   Glass.js          refraction glass, rain, wipers, condensation, marks, gaze-gated reflections
//   Mirrors.js        portal-camera planar mirrors (rearview + convex side mirrors)
//   CarPhysics.js     RWD sedan physics, road corridor, suspension
//   Lights.js         headlight spot + beams, tail/brake/indicators, dome, dash glow
//   TaxiControls.js   setControl, interactables, hotkeys, control animation, displays
//   Taxi.js           the Taxi class (assembly + update + pre-render)
//   Motorcycle.js     intro step-through motorbike
export { Taxi, TAXI_ANCHORS, STATIONS } from './Taxi.js';
export { Motorcycle } from './Motorcycle.js';
export { CAR, torqueAt } from './CarPhysics.js';
