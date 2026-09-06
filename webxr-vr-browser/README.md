# Spatial Reader — a WebXR immersive VR browser

Put on a headset and you're in a small dark room with floating panels of
content you can point at, click, and drag around. Works flat in any browser
too, as a preview / dev mode.

## Known constraint — read this first

**You cannot build a "browse any URL" VR browser from a static site alone.**

- Most sites send `X-Frame-Options: DENY` or a CSP `frame-ancestors` header
  and refuse to be framed at all.
- Even for sites that *do* allow framing, a cross-origin iframe's pixels
  cannot be read onto a WebGL/canvas texture — the browser blocks it as a
  security boundary. That pixel-read is how most "3D browser" demos put a
  web page onto a floating panel, so it's the actual bottleneck, not just
  the framing header.
- CSS3D-positioned real DOM/iframes (the usual workaround for that pixel
  problem in normal 3D scenes) doesn't help either **inside an immersive XR
  session**: the headset only ever displays what's submitted to the XR
  compositor as a WebGL frame, so plain DOM elements are invisible there
  regardless of CSS transforms.
- GitLab Pages only serves static files, so there's no server-side proxy
  available to strip those headers or re-serve pages same-origin.

So this app doesn't fake arbitrary browsing. Instead:

1. Content comes from a small `ContentProvider` layer (`src/content/providers.js`)
   that talks to APIs which actually send CORS headers: the Wikipedia REST
   summary API, the Hacker News API, `cdn.jsdelivr.net` for glTF models, and
   a CORS-friendly sample video bucket. Each provider returns plain data
   (text/list/model-url/video-url), which is drawn onto a panel with the
   Canvas 2D API or loaded as native Three.js content — never an iframe.
2. The curated list lives in `public/sites.json` and is loadable/editable
   without touching the front end.
3. Typing or opening something the app doesn't recognize doesn't crash or
   silently fail — the panel explains it can't be embedded and offers an
   **"Open outside VR"** button, which ends the XR session and opens the URL
   in a normal browser tab.

### Adding real arbitrary-URL support later

The front end never talks to the network directly — every panel calls
`fetchContent(entry)` in `src/content/providers.js`, which dispatches on
`entry.type`. To add a real "any URL" mode:

1. Stand up a small proxy service *outside* GitLab Pages (a Cloudflare
   Worker or tiny Node/Express app) that fetches a page server-side, strips
   framing headers, and either re-serves the HTML same-origin or returns a
   rendered screenshot/text extraction.
2. Add one more entry to the `PROVIDERS` map, e.g. `proxy: fetchViaProxy`,
   that calls that service and returns the same `ContentResult` shape the
   other providers already return.
3. Nothing in `Panel.js`, `input.js`, or `main.js` needs to change — they
   only ever see the normalized result.

## Core features implemented

- Immersive `immersive-vr` WebXR session via a standard **Enter VR** button
  (`navigator.xr.requestSession`, see `src/xr.js`).
- Floating rectangular browser panels rendered as canvas textures
  (`src/panels/Panel.js`), each with a title bar and back / forward / home /
  close controls baked into the same canvas.
- Laser-pointer ray-casting from both VR controllers, with trigger-select
  for clicking nav buttons, list rows, and links (`src/input.js`).
- Grip (squeeze) to grab and drag a panel anywhere in the room.
- Multi-panel workspace — opening something from Home spawns a new panel
  arced out to the side rather than replacing what's already open.
- A simple room: starfield, floor grid, ambient + key light, so panels
  don't float in a void.
- Flat-mode fallback: the identical scene, mouse-orbit camera, and an HTML
  address bar in the top chrome bar, so the whole thing is testable and
  demoable without a headset.

Not implemented (documented gaps, not silent ones): hand-tracking input,
and a raycast-clickable virtual keyboard for freeform URL entry while
in-headset (in VR, navigation is via the Home panel's list and each panel's
own history buttons; freeform typing is available in flat mode's address
bar).

## Project layout

```
index.html              chrome bar (nav form, VR button) + canvas mount
src/
  main.js                glue: scene, panel manager, interaction dispatch
  scene.js               renderer, room, lighting, starfield
  xr.js                  immersive-vr session bootstrap
  input.js               controller ray-casting, grip-drag, mouse fallback
  style.css              flat-mode chrome styling (design tokens)
  panels/Panel.js         the floating panel: canvas texture, history, hit-testing
  content/providers.js    ContentProvider interface + concrete providers
  content/panel-content.js  canvas drawing routines (text/list/nav-bar/errors)
public/sites.json        curated content catalog (edit this to add panels)
.gitlab-ci.yml           GitLab Pages deployment
```

## Running locally

```bash
npm install
npm run dev        # flat preview at http://localhost:5173
npm run build      # outputs to ./dist
npm run preview    # serve the production build locally
```

WebXR requires HTTPS (or `localhost`). To test on a headset over your LAN,
either tunnel `localhost` with a tool like `ngrok`/`cloudflared`, or build
and deploy to GitLab Pages, then open the Pages URL in the Meta Quest
Browser / Chrome on the headset.

## Controls

| Action | VR | Flat mode |
|---|---|---|
| Look around | move your head | drag to orbit |
| Move | walk (room-scale) / teleport not implemented | scroll to zoom |
| Select / click | point + trigger | click |
| Drag a panel | point + grip, then move your hand | — |
| Open a new destination | click a row on the Home panel | type in the address bar, e.g. `wiki:Nebula` |

## Deploying to GitLab Pages

`.gitlab-ci.yml` builds with Vite and publishes the `dist/` output as
`public/`, which GitLab Pages requires. It guesses the base path as
`/<project-name>/`, correct for the default "project site" case
(`https://<namespace>.gitlab.io/<project-name>/`). If this repo *is* your
`<namespace>.gitlab.io` project, or you've attached a custom domain, set a
`VITE_BASE` CI/CD variable to `/` in **Settings → CI/CD → Variables** to
override it.

GitLab Pages serves over HTTPS by default, which is all WebXR needs beyond
what's already configured here.
