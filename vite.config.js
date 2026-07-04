import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';

export default defineConfig({
  server: {
    watch: {
      // the Wikipedia pipeline writes data files while the app runs —
      // don't full-reload the page (and eject the visitor) on every write.
      ignored: ['**/public/data/**'],
    },
  },
  plugins: [
    {
      // watch-ignoring public/data also stops Vite registering NEW files
      // there, so serve /data/* straight from disk on every request.
      name: 'serve-data-live',
      configureServer(server) {
        server.middlewares.use('/data', async (req, res, next) => {
          const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([/\\])+/, '');
          if (rel.includes('..')) return next();
          try {
            const buf = await readFile(join(import.meta.dirname, 'public/data', rel));
            res.setHeader('Content-Type', 'application/json');
            res.end(buf);
          } catch {
            next();
          }
        });
      },
    },
  ],
});
