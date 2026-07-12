<script lang="ts">
	// cyphertap's theme CSS must be imported explicitly — the library's own
	// side-effect CSS import gets tree-shaken out of consumer production builds.
	import 'cyphertap/styles.css';
	import '../app.css';
	import '../theme.css';
	import { ModeWatcher, mode } from 'mode-watcher';
	import { Toaster } from 'svelte-sonner';

	let { children } = $props();
</script>

<!-- App chrome follows system/user light-dark preference. mode-watcher is
     shared state with cyphertap's widget (same module instance under pnpm),
     so its Dark Mode toggle drives the whole app. -->
<ModeWatcher />
<!-- Toasts are position:fixed, so the body's safe-area padding doesn't reach
     them — offset past the iOS status bar / dynamic island explicitly. -->
<Toaster
	richColors
	position="top-right"
	offset={{ top: 'calc(env(safe-area-inset-top, 0px) + 24px)' }}
	mobileOffset={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
	theme={mode.current === 'dark' ? 'dark' : 'light'}
/>

{@render children()}
