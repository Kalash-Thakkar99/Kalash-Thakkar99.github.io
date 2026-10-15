# Updating the live GitHub Pages site

Live site:
https://kalash-thakkar99.github.io/

Repository:
https://github.com/Kalash-Thakkar99/Kalash-Thakkar99.github.io

## Update through GitHub Desktop

1. Replace the files in your local `Kalash-Thakkar99.github.io` repository folder with the files from this v1.4.2 folder.
2. Open GitHub Desktop.
3. Review the changed files.
4. In **Summary**, enter something like:
   `Update contact form and SEO`
5. Click **Commit to main**.
6. Click **Push origin**.
7. GitHub Pages will redeploy automatically.

## Contact form

The site now uses Web3Forms rather than FormSubmit.

It submits with JavaScript, so visitors stay on the website and see:
- `Sending…`
- a success message, or
- an error message with a direct-email fallback.

The Web3Forms access key is intentionally embedded in the static site. Web3Forms documents access keys as public identifiers intended for browser-side use.

## SEO

This build contains:
- canonical URLs
- `og:url`
- absolute social-card URLs
- `sitemap.xml`
- `robots.txt`

If you later move to a custom domain, these URL-specific files and tags should be updated again.
