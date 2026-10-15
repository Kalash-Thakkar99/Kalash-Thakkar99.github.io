# Publish this site on GitHub Pages

This package is ready for a static GitHub Pages deployment.

## First-time publishing

1. Create a public GitHub repository named exactly:
   `YOUR-GITHUB-USERNAME.github.io`

2. Upload the **contents** of this folder to the repository root.
   `index.html` should be visible at the top level of the repository.

3. In the repository, open:
   **Settings → Pages**

4. Under **Build and deployment**, choose:
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/(root)**

5. Save. GitHub will publish the site at:
   `https://YOUR-GITHUB-USERNAME.github.io/`

The included `.nojekyll` file tells GitHub Pages to serve this as a plain static site.

## Activate the contact form

The contact form uses FormSubmit because GitHub Pages cannot run a server-side form backend.

After the site is public:
1. Open your live website.
2. Submit one test message through the contact form.
3. FormSubmit will send an activation email to `kalash.here21@gmail.com`.
4. Open that email and confirm the form.
5. Submit another test message to verify delivery.

Until activation, FormSubmit sends activation emails rather than normal form delivery.

## Updating small things later

### Easiest method: GitHub website
For a small text edit:
1. Open the relevant file in your repository.
2. Click the pencil/Edit button.
3. Make the change.
4. Click **Commit changes**.

GitHub Pages republishes automatically.

### Better long-term method: Git
After cloning the repository on your Mac:

```bash
git add .
git commit -m "Update research website"
git push
```

GitHub Pages republishes after the push.

## Files worth knowing

- `index.html` — homepage
- `styles.css` — visual styling
- `script.js` — animations and interactions
- `cv.html` — web CV
- `assets/Kalash_CV.pdf` — downloadable CV PDF
- `project-ksz.html` — kSZ project
- `project-cosmic-web.html` — Cosmic Web project
- `research-notes.html` — notes index
- `note-ksz.html` — first working note
- `404.html` — custom GitHub Pages error page
- `og-card.jpg` — social sharing preview
- `site.webmanifest` — app/site metadata

## After you know the final GitHub Pages URL

A later polish can add:
- canonical URLs
- `og:url`
- an absolute Open Graph image URL
- `sitemap.xml`

Those are URL-dependent, so they are best added after the GitHub username/live URL is known.
