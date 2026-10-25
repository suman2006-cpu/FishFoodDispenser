# FinPilot — Smart Fish Feeding Dispenser Dashboard

A React + Vite dashboard for an ESP32 fish feeder using Firebase Realtime Database. It includes owner sign-in, temperature, RTC time and load-cell food weight readings, device heartbeat status, the reported LCD/OLED message, manual dispense requests, scheduled dispense requests, command acknowledgements and recent feeding-event history. No pH sensor is assumed.

**Important:** This is the prepared web/cloud scaffold. It is not connected to your real hardware until you configure Firebase and integrate the cloud adapter into your existing ESP32 sketch. No demo readings are shown as real data.

## Architecture

- ESP32: reads existing sensors and drives the dispenser/local display.
- Firebase Realtime Database: stores telemetry, heartbeat, commands and history.
- Firebase Authentication: signs in the dashboard owner and the ESP32 as separate users.
- React + Vite + Firebase Web SDK: live dashboard and remote command request.
- Vercel: public static-site hosting.

Firebase data listeners update the website when the database changes. The ESP32 must be powered and connected to internet for new readings and remote commands. A public website URL does not make the physical device reachable when its power/Wi-Fi is off.

## A. Prepare the website locally

1. Install a current Node.js LTS release compatible with the current Vite release. Vite's current guide lists the supported Node versions: https://vite.dev/guide/.
2. Extract this folder, open a terminal inside `smart-fish-feeder`, and run:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env.local`.
4. Leave the site unconfigured for now, or fill in the web app settings after completing Firebase setup below.
5. Run the local site:

   ```bash
   npm run dev
   ```

6. Open the URL printed in the terminal, usually `http://localhost:5173`.

The initial screen guides you to Firebase setup until a complete configuration is present.

## B. Create Firebase project

1. Go to https://console.firebase.google.com/ and create a project.
2. In Project settings, add a Web app. Copy its `apiKey`, `authDomain`, `projectId`, and `appId` into `.env.local` using the `VITE_FIREBASE_*` names.
3. Enable **Build → Authentication → Sign-in method → Email/Password**.
4. Create an owner user in Authentication → Users. Keep its password private.
5. Create a separate device user for the ESP32 in Authentication → Users. The ESP32 will use this account to authenticate; do not share the owner's credentials with the device.
6. Create **Build → Realtime Database** in locked mode. Copy the displayed database URL into `VITE_FIREBASE_DATABASE_URL`.
7. In Authentication → Users, copy the owner's UID and the device user's UID. Open `firebase/database.rules.json`; replace all instances of `OWNER_UID` and `DEVICE_UID` with the exact UID strings. Publish these rules in the Realtime Database Rules tab. If you change `feeder-01`, also update the rule path and `VITE_DEVICE_ID`.
8. Restart the Vite server after changing `.env.local` because Vite reads environment variables at start.

The `VITE_FIREBASE_*` web app configuration values are client config, not server secrets. Security must come from Authentication and rules. Never place a service-account private key, database admin credential, or privileged secret in `.env.local` or in the React code.

## C. Database schema expected by the dashboard and firmware

All paths below are relative to the database root:

```text
devices/feeder-01/telemetry/latest
  temperatureC: number
  foodWeightG: number
  rtcTime: string
  feederState: "idle" | "dispensing" | "error" | ...
  displayMessage: string
  updatedAt: Firebase server timestamp (milliseconds)

devices/feeder-01/presence/lastSeen
  Firebase server timestamp (milliseconds)

devices/feeder-01/commands/requests/<commandId>
  commandId: string
  action: "DISPENSE"
  status: "pending"
  requestedAt: Firebase server timestamp
  requestedBy: owner UID

devices/feeder-01/commands/latestResult
  commandId: string
  status: string
  message: string
  completedAt: Firebase server timestamp (milliseconds)

devices/feeder-01/commands/results/<commandId>
  same acknowledgement structure (durable, used for duplicate protection)

devices/feeder-01/schedules/requests/<scheduleId>
  scheduleId, action: "DISPENSE", status: "pending", scheduledAt: Unix epoch milliseconds,
  targetWeightG, createdAt, createdBy

devices/feeder-01/history/readings/<pushId>
  temperatureC, foodWeightG, recordedAt (Firebase server timestamp)
devices/feeder-01/history/feedingEvents/<pushId>
  status, source, foodWeightG, completedAt (Firebase server timestamp)
```

`rtcTime` is the device's RTC reading; `updatedAt` / `lastSeen` should reflect server time so an incorrect RTC does not make an offline device appear online. The dashboard uses a 30-second default timeout, editable with `VITE_OFFLINE_TIMEOUT_MS`.

Scheduled feeds are written to `schedules/requests` with a Unix timestamp and requested gram amount. The ESP32 must poll, validate, and execute those requests using the existing calibrated dispenser logic; it must refuse to dispense when a fresh hopper reading is 10 g or less. There is no `.ino` in this project, so physical scheduling and dose accuracy require completing the firmware integration described in `firmware/INTEGRATION_PLAN.md`.

## D. Link real ESP32 readings

Read `firmware/INTEGRATION_PLAN.md` before editing the Arduino sketch. Install the current `FirebaseClient` library from Arduino Library Manager. First preserve a known-good copy of your sketch. Then merge the Firebase connection around the existing sensor reads, display updates and dispenser logic. Do not replace unknown sensor functions with guessed pin mappings or calibration constants.

First milestone: write one **real** temperature reading to `devices/feeder-01/telemetry/latest/temperatureC` using authenticated device access, confirm it in Firebase, then connect the full telemetry object. Once all telemetry is working, add the heartbeat and command polling/acknowledgement.

The ESP32 should publish `presence/lastSeen` with a Firebase server timestamp (server timestamp sentinel), not its RTC time. Keep local button/display behavior non-blocking where possible so internet failures do not unnecessarily stop the local dispenser.

### Safe remote command notes

The website writes a request under `commands/requests/<uniqueCommandId>`. The device should read command requests, allow only `DISPENSE`, validate its state and hardware safety limits, check for a prior `commands/results/<commandId>` result, execute at most once, and publish the acknowledgement to both `commands/results/<commandId>` and `commands/latestResult`. Never make the database public or allow unauthenticated writes to enable remote control.

## E. Deploy to Vercel

1. Push the project folder to a new GitHub repository. Do not commit `.env.local` or credentials.
2. In Vercel, import the repository.
3. Add the same `VITE_FIREBASE_*`, `VITE_DEVICE_ID`, and `VITE_OFFLINE_TIMEOUT_MS` environment variables to Vercel's project settings.
4. Deploy. Vercel should detect Vite; build command is `npm run build`, output directory is `dist`.
5. Test the deployed URL from a phone using a different network. Sign-in and Firebase rules still protect the live readings and control path.

## Security notes

- Publish the UID-specific rules in `firebase/database.rules.json` only after replacing the UID placeholders.
- Do not use public read/write rules or Firebase test mode for the final project.
- Store separate owner and device accounts. Never embed owner credentials or privileged service-account credentials into the frontend.
- The dashboard can request a dispensing operation, but the ESP32 must validate commands locally. Browser-side disabling of a button is not a physical safety control.
- Firebase client API configuration is visible to browsers by design; rules and authenticated identities protect data.

## Known intentional gap

The website starter is ready, but the ESP32 firmware adapter still needs to be merged with your existing `.ino`. We need the actual board pins, sensor models/libraries, pH calibration, load-cell scale factor, display type and dispenser control logic so that we do not damage the behavior that already works. The exact Arduino `FirebaseClient` API/authentication setup also needs to be matched to the library version installed in Arduino IDE.
