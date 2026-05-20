# C++ Drive Practice IDE

A small browser-based C++ practice workspace with:

- Folder and file creation
- A C++ editor
- Run current `.cpp` file
- Run the whole project by compiling every `.cpp` file together
- Local browser autosave
- Optional Google Drive sync using the user's own Google account

The project does not store code on a central server. The browser keeps a local draft in `localStorage`, and Drive sync stores one JSON project file named `cpp-practice-ide-project.json` in the signed-in user's Google Drive.

## Run locally

```bash
npm start
```

Open:

```text
http://localhost:3000
```

The runner expects `g++` to be installed and available on `PATH`.

## Google Drive setup

Normal users do not need to paste OAuth IDs or API keys into the app. The app owner configures Google once on the server, then users only click **Sign in with Google**.

Drive sync needs one Google Cloud OAuth web client:

1. Open Google Cloud Console.
2. Create or select a project.
3. Enable the Google Drive API.
4. Create an OAuth Client ID for a Web application.
5. Add `http://localhost:3000` to Authorized JavaScript origins.
6. Start the server with that client ID.

PowerShell:

```powershell
$env:GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
npm start
```

Command Prompt:

```bat
set GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
npm start
```

The app requests `https://www.googleapis.com/auth/drive.file`, which lets it create and edit files that this app creates or that the user explicitly opens with it.

If `GOOGLE_CLIENT_ID` is missing, the IDE still works locally but Drive buttons stay disabled.

## Hosting online

For an online version, deploy this Node app to a host that can run `node server.js`, then set:

```text
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

In Google Cloud Console, add your live site to the OAuth client:

```text
https://your-domain.com
```

Users then open your link, click **Sign in with Google**, and their project is saved to their own Drive account. The **Remember this device** checkbox stores only a local preference and tries a silent Google sign-in next time. Google may still ask the user to confirm again if their browser session expired or third-party sign-in is blocked.

### Public compiler safety

Be careful before letting anyone on the internet run C++ on your server. Native C++ programs can consume CPU, memory, disk, or try to access the host machine. For a public platform, use one of these approaches:

- Run each compile/execution inside a locked-down container or sandbox with strict CPU, memory, file, and network limits.
- Use a browser-based WebAssembly C++ compiler so code runs on the user's own device.
- Keep the hosted app for editing and Drive sync, and make running code available only in a trusted local/self-hosted runner.

## Important limitation

The privacy-first storage model works across devices through Google Drive. The current compiler endpoint runs `g++` on the machine hosting the app, so public hosting needs sandboxing before it should run untrusted code.

## Deploy to Netlify

This repo includes `netlify.toml`, so Netlify can host the web app directly from the `public` folder and serve small API functions from `netlify/functions`.

### Auto-deploy from GitHub

1. Push this project to a GitHub repository.
2. Open Netlify and choose **Add new site -> Import an existing project**.
3. Select the GitHub repo.
4. Use these build settings:

```text
Build command: npm run build
Publish directory: public
Functions directory: netlify/functions
```

5. Add this environment variable in Netlify:

```text
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

6. Deploy the site.

After this, Netlify automatically deploys whenever you push to the connected production branch, usually `main`.

Typical Git commands:

```bash
git add .
git commit -m "Initial C++ practice IDE"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

For future updates:

```bash
git add .
git commit -m "Describe your change"
git push
```

That `git push` triggers a new Netlify deployment automatically.

### Manual deploy

You can drag the `public` folder into Netlify for a quick static preview, but Google sign-in config and API functions are best handled through the GitHub-connected deploy.

### Google setup for Netlify

After Netlify gives you a URL, add that exact origin to your Google OAuth Web Client:

```text
https://your-site-name.netlify.app
```

Keep this local origin too if you still test locally:

```text
http://localhost:3000
```

### C++ runner on Netlify

The Netlify deployment uses a browser-based WebAssembly C++ runner. On first run, the user's browser downloads the compiler runtime, so the first compile can be slow. After that, browser caching helps.

The runner is designed for practice exercises and common standard-library programs. Very large projects, OS-specific APIs, networking, threads, and native system calls may not work like a desktop `g++` environment.

The included Netlify `/api/run` function is only a fallback message. Normal online execution happens in the browser through `public/browser-runner.js`.
