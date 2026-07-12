import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	optimizeDeps: {
		// epub.js is CJS with CJS deps — pre-bundle so the first reader mount
		// in dev doesn't trigger a mid-mount optimize reload.
		include: ['epubjs']
	},
	server: {
		fs: {
			// cyphertap resolves through the node_modules symlink, but Vite
			// serves dynamically-imported files (e.g. its vendored negentropy
			// module) by real path — which lives in the submodule dir.
			allow: ['cyphertap']
		}
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode everywhere (cyphertap included — it's fully runes),
				// except third-party libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Static SPA build for GitHub Pages: the app is fully client-side
			// (ssr=false), so we prerender the empty shell as index.html and use
			// 404.html as the SPA fallback (how Pages routes unknown paths).
			adapter: adapter({ fallback: '404.html' }),
			paths: {
				// Set by the Pages deploy workflow, e.g. /vibereader
				base: (process.env.BASE_PATH as `/${string}` | undefined) || ''
			}
		})
	]
});
