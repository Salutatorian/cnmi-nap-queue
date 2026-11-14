# CNMI NAP Digital Queue

A local demonstration of a waiting-room queue for the Commonwealth of the Northern Mariana Islands Nutrition Assistance Program. It replaces a clipboard sign-in for a demo. It is not an official government system, and it is not approved for real client information.

Visitors are recorded by name, caseworker, and reason only. The app does not ask for a date of birth or a case number.

## What runs where

One Windows computer runs the server, the database, the touchscreen check-in page, and the waiting-room television. Caseworkers open the same site from their own computers on the office network. After installation, the app does not need the internet.

- Visitor check-in: large touchscreen at `/kiosk`
- Waiting-room TV: fullscreen page at `/tv`
- Caseworkers and the receptionist: `/staff/login`
- Supervisor tools: Administration, after signing in
- SQLite database: `data/nap.sqlite`
- Daily text logs, generated from the database: `data/logs`

Signing in does not mark someone Available. A dropped browser connection does not mark someone Offline. Each caseworker has one active call. Done does not call the next person.

Times are stored in UTC and shown in Pacific/Saipan (Chamorro Standard Time, UTC+10).

## Requirements

- Windows 10 or 11
- Internet the first time, so the app can finish setup
- No paid services, cloud accounts, or subscriptions

The first double-click downloads Node.js 24 if that PC does not already have it. After that, the queue runs with no internet.

## Put it on the office computer

Yes. The main computer is the server. It keeps the database, runs the check-in screen, and sends the waiting room to the hanging TV over HDMI. Caseworker computers do not download anything and do not run the queue. They only open a web page.

On GitHub, use **Code**, then **Download ZIP**. Unzip it on the main computer. Plug HDMI into the TV and, in Windows, choose **Extend these displays**. Double-click **Start Queue.cmd**.

That file sets the app up the first time, starts the server, and opens the waiting room on the HDMI screen. Leave the server window open. On the TV, click **Enable audio** once. Windows may ask once for permission so other office computers can connect. Choose Yes.

On the main computer, visitor check-in is http://127.0.0.1:8787/kiosk.

On a caseworker computer, open the Office address printed in the server window and add `/staff/login`. Example: `http://192.168.1.20:8787/staff/login`.

The ZIP does not include visitor records. The first start creates a new database on that computer, with the fictional demonstration accounts. Names entered there stay in that computer’s `data` folder.

Alt+F4 on the TV window closes the waiting room. Closing the server window stops the queue for everyone.

## Install

Open PowerShell in this folder:

```powershell
cd "C:\Users\JW\Desktop\projects\nap queue"
npm install
npm run build
npm run seed
```

Or run `scripts\install.ps1`, which does the same steps and skips seeding when the database already exists.

`npm run seed` loads fictional staff and 20 fictional visits. If accounts already exist, it leaves the database alone. To start over, stop the server, delete `data\nap.sqlite`, and run `npm run seed` again.

## Start

Double-click `Start Queue.cmd` in the project folder. That is the normal way to run it on the office computer.

From a terminal, the same thing is:

```powershell
npm start
```

Or:

```powershell
scripts\start.ps1
```

The server listens on port 8787 and on all network interfaces of this computer, so other office PCs can connect. Do not forward this port to the internet.

Open these pages on the server computer:

- Check-in: http://localhost:8787/kiosk
- Television: http://localhost:8787/tv
- Staff: http://localhost:8787/staff/login

From another computer on the same network, use the Office address printed in the server window, for example `http://192.168.1.20:8787/staff/login`.

While developing the screens, you can run `npm run dev` instead. The client is then at http://127.0.0.1:5173 and the API stays on port 8787. The demonstration should use `npm start` after `npm run build`.

## Demonstration accounts

These people are fictional. Every account uses the same demonstration password:

`NapDemo!2026`

The password is also written to `data\demo-credentials.txt`. On the server computer, the sign-in page can show it. A supervisor can hide that hint under Administration, Settings. Turn the hint off before any real use, and do not keep this password.

## Admin logins

An admin login is a staff account with the role Supervisor. The demonstration admin is `patricia.sannicolas`.

To give someone else an admin login:

1. Sign in as a supervisor at http://localhost:8787/staff/login.
2. Open Administration, then Staff.
3. Add an account. Set the full name, a username such as `alex.cruz`, a password of at least 10 characters, and the role **Supervisor (admin)**.
4. Tell that person the username and password. They sign in on any office computer at the same site. Administration appears in their menu.

The same form creates caseworkers and the receptionist. Choose Caseworker or Receptionist instead of Supervisor. New accounts start as Offline. A caseworker sets Available on their own queue page when they are ready for visitors.

Use Reset password on that person’s row to replace a forgotten password. That signs them out of other computers. Disable an account when someone should no longer sign in. Keep at least one working supervisor account.

| Username | Role | Name | Starting availability |
| --- | --- | --- | --- |
| maria.reyes | Caseworker | Maria Reyes | Available |
| david.santos | Caseworker | David Santos | Available |
| anna.cruz | Caseworker | Anna Cruz | Available |
| luis.cabrera | Caseworker | Luis Cabrera | Available |
| grace.mendiola | Caseworker | Grace Mendiola | On Break |
| peter.ada | Caseworker | Peter Ada | Available |
| elena.guerrero | Caseworker | Elena Guerrero | Busy |
| mark.camacho | Caseworker | Mark Camacho | Available |
| sofia.delacruz | Caseworker | Sofia Dela Cruz | Offline |
| daniel.pangelinan | Caseworker | Daniel Pangelinan | Available |
| patricia.sannicolas | Supervisor | Patricia San Nicolas | Offline |
| linda.tenorio | Receptionist | Linda Tenorio | Offline |

Only caseworkers marked Available appear on the public check-in screen. Grace, Elena, and Sofia are hidden there until they change their own status. Linda can still check a visitor in for them; that override is written to the activity log.

The seeded visits are also fictional. They give the caseworkers a queue, some missed names, and a completed history for today.

## Walk through the demo

1. On the kiosk, enter a name, choose an available caseworker, choose a reason, and press Check in.
2. Sign in as that caseworker. The visitor is in My queue. Signing in did not change availability.
3. Press Call. The waiting-room TV shows the visitor immediately and plays a ping.
4. Press Done. The name leaves the TV. The next waiting visitor is not called automatically.
5. Open History. The completed visit is still there. Download the daily log, or open `data\logs\<Caseworker_Name>\<date>.txt`.

To show ten calls at once, sign in as several caseworkers, or use Administration, and call one waiting visitor for each. Every name should appear on the TV together. Each call gets its own ping, played one after another.

On the TV, press Enable audio once. Browsers will not play sound until someone does that. Ping volume is set by a supervisor under Administration, Settings.

## Screens on this computer

Put the check-in browser on the touchscreen and the television page on the HDMI display.

Microsoft Edge kiosk on the touchscreen:

```powershell
start msedge --kiosk http://localhost:8787/kiosk --edge-kiosk-type=fullscreen
```

With the server already running, `scripts\open-tv.ps1` opens http://127.0.0.1:8787/tv on the HDMI display. If Windows only sees one screen, plug in the TV, choose Extend these displays, and run the script again. Press Enable audio once on the TV.

The kiosk page has no link to staff tools. The staff pages still exist at `/staff/login` and require a password. For a front-desk PC, use Edge kiosk mode or Windows assigned access so visitors cannot leave the check-in page.

## Daily logs

Logs are text files produced from SQLite. They are not the record of truth. Each completed, missed, waiting, or cancelled visit for that Saipan date is included.

```text
data\logs\Maria_Reyes\2026-10-30.txt
data\logs\David_Santos\2026-10-30.txt
```

Caseworkers download their own log from History. Supervisors export every caseworker log from Administration, Reports. The `data` folder is not served as a website.

Done does not delete the visit. A supervisor can cancel a mistaken check-in; the row remains with status Cancelled.

## Backups and recovery

The server copies the database into `data\backups` when it starts and again every six hours. Fourteen backups are kept.

To restore:

1. Stop the server.
2. Copy the chosen `data\backups\nap-*.sqlite` file over `data\nap.sqlite`.
3. Delete `data\nap.sqlite-wal` and `data\nap.sqlite-shm` if those files exist.
4. Start the server again.

The queue that was saved in that backup comes back. Visits entered after the backup do not.

If the server or the network is down, use the clipboard procedure at http://localhost:8787/paper (print it before you need it). When the system returns, a receptionist can enter those names on the staff check-in page.

## Start when the computer signs in

`scripts\install-startup.ps1` puts a startup command in the current user's Startup folder. The queue starts after that user signs in. For a front-desk PC, turn on Windows automatic sign-in for the office account, then run the script. A console window stays open so staff can see that the queue is running.

This is not a Windows service. Closing that window stops the queue.

## Office network and HTTPS

Allow inbound TCP 8787 on the Private firewall profile only if other PCs must connect. Do not allow it on a Public network, and do not publish the port. From an Administrator PowerShell window:

```powershell
scripts\allow-office-network.ps1
```

The demo speaks plain HTTP on the local network. For HTTPS, create a certificate and start the server with both files set:

```powershell
$env:HTTPS_CERT = "C:\path\to\cert.pem"
$env:HTTPS_KEY = "C:\path\to\key.pem"
npm start
```

Each office browser has to trust that certificate. Set `TRUST_PROXY=1` only if a local proxy terminates TLS in front of this app.

Other settings:

- `PORT` defaults to 8787
- `HOST` defaults to `0.0.0.0`
- `DATA_DIR` overrides the `data` folder

## Tighten the data folder

`scripts\restrict-data-permissions.ps1` limits `data` to the current Windows user and SYSTEM. Run it only on the server computer, after you are sure no other account needs the files. It can lock out other users, including other administrators, until permissions are restored.

## Tests

```powershell
npm test
```

The tests cover check-in, call, the television announcement, Done, history, the daily log, ten simultaneous calls, duplicates, availability, reassignment, rate limiting, backup, and restart.

## Project layout

```text
client/     React, TypeScript, Tailwind
server/     Express, Socket.IO, SQLite, Argon2id
data/       Database, logs, backups, demo credentials
Start Queue.cmd    Double-click this on the main computer
scripts/            Setup used by that double-click: install, HDMI waiting room, office firewall
```

The server uses Node's built-in SQLite so the office PC does not need a native build toolchain. Passwords are hashed with Argon2id. Sessions live in SQLite. Staff actions need the session cookie and a CSRF token. Public check-in is limited to name, caseworker, and reason, and it only accepts caseworkers marked Available.

## Before any real office use

This prototype is for a demonstration with fictional names. A production deployment still needs a security review, a privacy review, an approved retention schedule, and accounts issued only to authorized staff. Remove the demonstration accounts, turn off the sign-in hint, choose new passwords, restrict the data folder, and decide how long visitor names may be kept. Do not put this server on the public internet.
