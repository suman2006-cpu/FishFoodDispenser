# ESP32 firmware integration — do this after inspecting the current sketch

The frontend expects the ESP32 to write the following paths for device ID `feeder-01`:

- `devices/feeder-01/telemetry/latest`: latest readings and local display/device status
- `devices/feeder-01/presence/lastSeen`: Firebase server timestamp (milliseconds since Unix epoch) updated after a successful cloud check-in
- `devices/feeder-01/commands/requests/<commandId>`: commands the owner website has queued; the ESP32 reads and validates these
- `devices/feeder-01/commands/latestResult`: most recent command acknowledgement (the website listens here)
- `devices/feeder-01/commands/results/<commandId>`: durable per-command result used to prevent reprocessing after reconnection/reboot
- `devices/feeder-01/history/readings/<pushId>`: optional periodic history samples (the website uses these for trend charts)
- `devices/feeder-01/history/feedingEvents/<pushId>`: completed/failed feeding event log

## Required telemetry fields

```json
{
  "temperatureC": 27.4,
  "ph": 7.05,
  "foodWeightG": 182.6,
  "rtcTime": "2026-10-21 09:30:00",
  "feederState": "idle",
  "displayMessage": "Welcome to Food Dispenser",
  "updatedAt": 1792555800000
}
```

Numbers above are examples only. Use actual validated readings from the existing sketch. `updatedAt` and `presence/lastSeen` should use Firebase server timestamps, not the RTC, because the device RTC can drift or be incorrect. The `rtcTime` field is the formatted clock value provided by the RTC module.

## Authentication and library

Use the current `FirebaseClient` Arduino library from the Arduino Library Manager (`FirebaseClient`, by Mobizt), Wi-Fi, and the ESP32 board package. Use a dedicated Firebase Authentication email/password account for the device, separate from the dashboard owner. Keep the device password out of GitHub and outside the React frontend.

Library/docs: https://github.com/mobizt/FirebaseClient

Authentication setup must be tested against the exact installed library version before merging it into the existing sketch. The library APIs differ from the older, now-deprecated `Firebase-ESP32` package. Do not copy deprecated examples blindly.

## Command handling safety requirements

1. Process only supported actions (initially `DISPENSE`).
2. Validate the command ID and maintain a processed-command ID so reconnects/re-reading do not execute the same request twice.
3. Reject commands when already dispensing, a sensor/calibration fault is active, or the physical dispensing limit would be exceeded.
4. Preserve the existing local physical dispense button and LCD/OLED behavior.
5. Write an acknowledgement to both `commands/latestResult` and `commands/results/<commandId>` containing at least `commandId`, `status`, `message`, and `completedAt` (server timestamp where possible).
6. Write a feeding event to `history/feedingEvents/<pushId>` when the operation finishes or fails.
7. If Wi-Fi/cloud service is down, local operations should continue if the existing firmware permits; remote commands cannot arrive until connectivity is restored.

## Why this isn't a ready-to-flash .ino yet

The existing sketch's pin mappings, temperature sensor model, pH calibration formula, RTC library, load-cell scale factor, display type, and dispenser driver are not known yet. Replacing these with guessed code could break the hardware. The next integration step is to review the actual existing `.ino` and merge this cloud adapter around its real sensor and dispenser functions.
