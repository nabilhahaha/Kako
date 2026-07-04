// SalesBook lives inside a repo whose root has a Vite/Tailwind postcss.config.js
// (ESM) that Next.js cannot parse. PostCSS config resolution walks up parent
// directories, so this file pins the config locally. It replicates Next.js's
// default PostCSS behavior exactly (https://nextjs.org/docs/pages/building-your-application/configuring/post-css).
module.exports = {
  plugins: [
    'postcss-flexbugs-fixes',
    [
      'postcss-preset-env',
      {
        autoprefixer: { flexbox: 'no-2009' },
        stage: 3,
        features: { 'custom-properties': false },
      },
    ],
  ],
};
